"""Authentication, authorisation and API-key handling."""
import datetime
import functools
import hashlib
import logging
import secrets

import bcrypt
import jwt
from flask import g, jsonify, request

from config import Config
from db import DatabaseUnavailable, get_db, serialize, to_object_id, utcnow, with_retry

log = logging.getLogger('optigo.security')

API_KEY_PREFIX = 'og'


# --------------------------------------------------------------------------
# Passwords
# --------------------------------------------------------------------------

def hash_password(password):
    """Hash a plaintext password (bcrypt, 72-byte safe)."""
    raw = (password or '').encode('utf-8')[:72]
    return bcrypt.hashpw(raw, bcrypt.gensalt(rounds=Config.BCRYPT_ROUNDS)).decode('utf-8')


def verify_password(password, hashed):
    """Constant-time password check that never raises on malformed input.

    Old accounts may have been written by flask-bcrypt (same $2b$ format) or,
    in a handful of legacy cases, with no password field at all — previously
    that produced an unhandled exception and a 500 on /login.
    """
    if not password or not hashed:
        return False
    try:
        raw = password.encode('utf-8')[:72]
        stored = hashed.encode('utf-8') if isinstance(hashed, str) else hashed
        return bcrypt.checkpw(raw, stored)
    except (ValueError, TypeError) as exc:
        log.warning('Password verification failed for a malformed hash: %s', exc)
        return False


def normalize_email(email):
    return (email or '').strip().lower()


def password_problems(password):
    """Return a list of human-readable password policy violations."""
    problems = []
    if not password or len(password) < 8:
        problems.append('at least 8 characters')
    if password and not any(c.isalpha() for c in password):
        problems.append('at least one letter')
    if password and not any(c.isdigit() for c in password):
        problems.append('at least one number')
    return problems


# --------------------------------------------------------------------------
# JWT
# --------------------------------------------------------------------------

def create_token(user):
    now = datetime.datetime.utcnow()
    payload = {
        'user_id': str(user['_id']),
        'role': user.get('user_type', 'driver'),
        'company': user.get('company_name'),
        'iat': now,
        'exp': now + datetime.timedelta(hours=Config.TOKEN_TTL_HOURS),
    }
    token = jwt.encode(payload, Config.SECRET_KEY, algorithm='HS256')
    # PyJWT < 2 returned bytes
    return token.decode('utf-8') if isinstance(token, bytes) else token


def decode_token(token):
    return jwt.decode(token, Config.SECRET_KEY, algorithms=['HS256'])


# --------------------------------------------------------------------------
# API keys  (for the public /api/v1 surface)
# --------------------------------------------------------------------------

def generate_api_key():
    """Return (plaintext_key, key_hash, last4). The plaintext is shown once."""
    secret = secrets.token_hex(24)
    key = f'{API_KEY_PREFIX}_{secret}'
    return key, hash_api_key(key), key[-4:]


def hash_api_key(key):
    return hashlib.sha256((key or '').encode('utf-8')).hexdigest()


def _user_from_api_key(key):
    key_hash = hash_api_key(key)
    db = get_db()
    record = with_retry(lambda: db.api_keys.find_one({'key_hash': key_hash, 'revoked': {'$ne': True}}))
    if not record:
        return None
    user = None
    if record.get('user_id'):
        user = with_retry(lambda: db.users.find_one({'_id': to_object_id(record['user_id'])}))
    with_retry(lambda: db.api_keys.update_one({'_id': record['_id']}, {'$set': {'last_used_at': utcnow()}}))
    return {
        'user': user or {'_id': record['_id'], 'full_name': record.get('name', 'API client'),
                         'email': None, 'company_name': record.get('company'),
                         'user_type': record.get('role', 'admin')},
        'company': record.get('company'),
        'role': record.get('role', 'admin'),
        'auth_type': 'api_key',
        'api_key_id': str(record['_id']),
    }


# --------------------------------------------------------------------------
# Request authentication
# --------------------------------------------------------------------------

def _bearer_token():
    header = request.headers.get('Authorization', '')
    if header.lower().startswith('bearer '):
        return header.split(None, 1)[1].strip()
    return header.strip() or None


def _authenticate():
    """Resolve the caller from an API key or a JWT. Returns (context, error)."""
    api_key = request.headers.get('X-API-Key') or request.args.get('api_key')
    if api_key:
        try:
            context = _user_from_api_key(api_key)
        except DatabaseUnavailable:
            raise
        if not context:
            return None, ('Invalid or revoked API key', 401)
        return context, None

    token = _bearer_token()
    if not token:
        return None, ('Authentication required', 401)
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        return None, ('Session expired — please sign in again', 401)
    except jwt.InvalidTokenError:
        return None, ('Invalid authentication token', 401)

    user = with_retry(lambda: get_db().users.find_one({'_id': to_object_id(payload.get('user_id'))}))
    if not user:
        return None, ('Account no longer exists', 401)
    return {
        'user': user,
        'company': user.get('company_name'),
        'role': user.get('user_type', 'driver'),
        'auth_type': 'jwt',
        'api_key_id': None,
    }, None


def auth_required(roles=None):
    """Decorator: require a signed-in user (JWT) or a valid API key.

    Populates flask.g with `user`, `role`, `company`, `auth_type`.
    """
    allowed = set(roles) if roles else None

    def decorator(view):
        @functools.wraps(view)
        def wrapper(*args, **kwargs):
            try:
                context, error = _authenticate()
            except DatabaseUnavailable:
                return jsonify({'error': 'Service temporarily unavailable',
                                'message': 'The database is not reachable, please retry shortly.'}), 503
            if error:
                message, status = error
                return jsonify({'error': message, 'message': message}), status

            g.user = context['user']
            g.role = context['role']
            g.company = context['company']
            g.auth_type = context['auth_type']
            g.api_key_id = context.get('api_key_id')

            if allowed and g.role not in allowed:
                return jsonify({'error': 'Insufficient permissions',
                                'message': f"This action requires one of: {', '.join(sorted(allowed))}"}), 403
            if not g.company:
                return jsonify({'error': 'Account is not linked to a company'}), 400
            return view(*args, **kwargs)
        return wrapper
    return decorator


def current_user_public():
    user = getattr(g, 'user', None)
    if not user:
        return None
    data = serialize(user)
    return {
        'id': data.get('id'),
        'email': data.get('email'),
        'fullName': data.get('full_name'),
        'role': data.get('user_type', 'driver'),
        'companyName': data.get('company_name'),
        'phone': data.get('phone'),
        'createdAt': data.get('created_at'),
    }
