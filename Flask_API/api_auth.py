"""Registration, login and account endpoints."""
import logging

from flask import Blueprint, g

from db import get_db, serialize, utcnow, with_retry
from security import (auth_required, create_token, current_user_public, hash_password,
                      normalize_email, password_problems, verify_password)
from web import ValidationError, error, json_body, ok, require

log = logging.getLogger('optigo.auth')

auth_bp = Blueprint('auth', __name__)


def ensure_company(name):
    db = get_db()
    with_retry(lambda: db.companies.update_one(
        {'name': name},
        {'$setOnInsert': {'name': name, 'total_emission': 0, 'drivers': [], 'created_at': utcnow()}},
        upsert=True,
    ))


@auth_bp.route('/register', methods=['POST'])
def register():
    data = json_body()
    email = normalize_email(data.get('email'))
    password = data.get('password') or ''
    full_name = (data.get('fullName') or data.get('full_name') or '').strip()
    company_name = (data.get('companyName') or data.get('company_name') or '').strip()
    user_type = (data.get('userType') or data.get('user_type') or 'driver').lower()

    if not email or '@' not in email:
        raise ValidationError('A valid email address is required', 'email')
    require({'password': password, 'fullName': full_name, 'companyName': company_name},
            'password', 'fullName', 'companyName')
    problems = password_problems(password)
    if problems:
        raise ValidationError('Password must contain ' + ', '.join(problems), 'password')
    if user_type not in ('driver', 'admin', 'planner'):
        raise ValidationError('userType must be driver, planner or admin', 'userType')

    db = get_db()
    if with_retry(lambda: db.users.find_one({'email': email})):
        return error('An account with this email already exists', 409)

    ensure_company(company_name)
    user = {
        'email': email,
        'password': hash_password(password),
        'full_name': full_name,
        'company_name': company_name,
        'user_type': user_type,
        'phone': (data.get('phone') or '').strip(),
        'created_at': utcnow(),
        'updated_at': utcnow(),
    }
    try:
        user_id = with_retry(lambda: db.users.insert_one(user)).inserted_id
    except Exception as exc:  # duplicate key race
        log.warning('Registration insert failed: %s', exc)
        return error('An account with this email already exists', 409)

    if user_type == 'driver':
        with_retry(lambda: db.companies.update_one(
            {'name': company_name}, {'$addToSet': {'drivers': str(user_id)}}))

    return ok({'message': 'User created', 'user_id': str(user_id)}, 201)


@auth_bp.route('/login', methods=['POST'])
def login():
    """Authenticate and issue a JWT.

    Every failure path returns a specific status code — previously a missing
    body, an unknown field or a legacy account without a password hash produced
    an unhandled exception, which is what users saw as an intermittent
    "server error" on the login screen.
    """
    data = json_body()
    email = normalize_email(data.get('email'))
    password = data.get('password') or ''
    if not email or not password:
        return error('Email and password are required', 400)

    db = get_db()
    user = with_retry(lambda: db.users.find_one({'email': email}))
    if not user:
        # Accounts created before email normalisation may be stored mixed-case.
        user = with_retry(lambda: db.users.find_one(
            {'email': {'$regex': f'^{_escape_regex(email)}$', '$options': 'i'}}))

    if not user or not verify_password(password, user.get('password')):
        return error('Invalid email or password', 401)

    with_retry(lambda: db.users.update_one({'_id': user['_id']}, {'$set': {'last_login_at': utcnow()}}))
    ensure_company(user.get('company_name') or 'Unassigned')

    return ok({
        'token': create_token(user),
        'role': user.get('user_type', 'driver'),
        'fullName': user.get('full_name'),
        'companyName': user.get('company_name'),
        'email': user.get('email'),
        'userId': str(user['_id']),
        'expiresInHours': None,
    })


def _escape_regex(text):
    return ''.join('\\' + c if c in '.^$*+?()[]{}|\\' else c for c in text)


@auth_bp.route('/auth/me', methods=['GET'])
@auth_required()
def me():
    return ok({'user': current_user_public(), 'company': g.company, 'role': g.role})


@auth_bp.route('/auth/profile', methods=['PATCH', 'PUT'])
@auth_required()
def update_profile():
    data = json_body()
    updates = {}
    if 'fullName' in data or 'full_name' in data:
        name = (data.get('fullName') or data.get('full_name') or '').strip()
        if not name:
            raise ValidationError('Name cannot be empty', 'fullName')
        updates['full_name'] = name
    if 'phone' in data:
        updates['phone'] = (data.get('phone') or '').strip()
    if 'email' in data:
        email = normalize_email(data.get('email'))
        if not email or '@' not in email:
            raise ValidationError('A valid email address is required', 'email')
        existing = with_retry(lambda: get_db().users.find_one({'email': email}))
        if existing and str(existing['_id']) != str(g.user['_id']):
            return error('That email is already used by another account', 409)
        updates['email'] = email

    if not updates:
        return error('Nothing to update', 400)
    updates['updated_at'] = utcnow()
    with_retry(lambda: get_db().users.update_one({'_id': g.user['_id']}, {'$set': updates}))
    user = with_retry(lambda: get_db().users.find_one({'_id': g.user['_id']}))
    data = serialize(user)
    return ok({'message': 'Profile updated', 'user': {
        'id': data['id'], 'email': data.get('email'), 'fullName': data.get('full_name'),
        'role': data.get('user_type'), 'companyName': data.get('company_name'),
        'phone': data.get('phone'),
    }})


@auth_bp.route('/auth/change-password', methods=['POST'])
@auth_required()
def change_password():
    data = json_body()
    current = data.get('currentPassword') or data.get('current_password') or ''
    new_password = data.get('newPassword') or data.get('new_password') or ''

    if not verify_password(current, g.user.get('password')):
        return error('Your current password is incorrect', 401)
    problems = password_problems(new_password)
    if problems:
        raise ValidationError('New password must contain ' + ', '.join(problems), 'newPassword')
    if current == new_password:
        raise ValidationError('The new password must be different', 'newPassword')

    with_retry(lambda: get_db().users.update_one(
        {'_id': g.user['_id']},
        {'$set': {'password': hash_password(new_password), 'password_changed_at': utcnow()}}))
    return ok({'message': 'Password updated'})


@auth_bp.route('/drivers', methods=['GET'])
@auth_required()
def get_drivers():
    docs = with_retry(lambda: list(get_db().users.find(
        {'company_name': g.company, 'user_type': {'$in': ['driver', 'planner']}}).sort('full_name', 1)))
    return ok(serialize(docs))
