"""Settings API — user preferences, notifications, API keys and data tools.

The Settings screen used to be a mock-up: most sections were commented out and
"Save" only wrote to localStorage. Every switch on that page now maps to a field
persisted here and read back by the app.
"""
import io
import json
import zipfile

from flask import Blueprint, Response, g

from db import get_db, serialize, to_object_id, utcnow, with_retry
from security import auth_required, generate_api_key
from web import ValidationError, error, json_body, ok

settings_bp = Blueprint('settings', __name__)

DEFAULT_SETTINGS = {
    'preferences': {
        'theme': 'light',
        'language': 'en',
        'timezone': 'Europe/London',
        'dateFormat': 'DD/MM/YYYY',
        'distanceUnit': 'km',
        'fuelUnit': 'liters',
        'currency': 'GBP',
    },
    'planning': {
        'defaultPreference': 'greenest',
        'optimizeSequence': True,
        'returnToStart': True,
        'autoBreaks': True,
        'breakMinutes': 45,
        'maxDrivingMinutesBeforeBreak': 270,
        'defaultServiceMinutes': 15,
        'useGnnCorridor': False,
        'defaultVehicleType': 'rigid_7_5t',
    },
    'notifications': {
        'email': {'routeUpdates': True, 'fuelAlerts': True, 'maintenanceReminders': True,
                  'performanceReports': False, 'systemUpdates': True},
        'push': {'routeDeviations': True, 'emergencyAlerts': True, 'deliveryUpdates': True,
                 'trafficAlerts': False},
        'sms': {'criticalAlerts': False, 'deliveryConfirmations': False},
    },
    'security': {
        'twoFactorAuth': False,
        'sessionTimeoutMinutes': 720,
        'loginNotifications': True,
    },
    'data': {
        'routeRetention': '1year',
        'autoBackup': True,
    },
}

SECTIONS = tuple(DEFAULT_SETTINGS.keys())


def _merge(base, override):
    """Deep-merge stored settings over the defaults so new keys appear automatically."""
    merged = {}
    for key, value in base.items():
        if isinstance(value, dict):
            merged[key] = _merge(value, (override or {}).get(key) or {})
        else:
            merged[key] = (override or {}).get(key, value)
    for key, value in (override or {}).items():
        merged.setdefault(key, value)
    return merged


def _load_settings(user_id):
    doc = with_retry(lambda: get_db().user_settings.find_one({'user_id': str(user_id)})) or {}
    return _merge(DEFAULT_SETTINGS, doc.get('settings') or {})


@settings_bp.route('/settings', methods=['GET'])
@auth_required()
def get_settings():
    db = get_db()
    company = with_retry(lambda: db.companies.find_one({'name': g.company})) or {}
    user = serialize(g.user)
    return ok({
        'settings': _load_settings(g.user['_id']),
        'profile': {
            'id': user.get('id'),
            'fullName': user.get('full_name', ''),
            'email': user.get('email', ''),
            'phone': user.get('phone', ''),
            'role': user.get('user_type', 'driver'),
            'companyName': user.get('company_name', ''),
            'createdAt': user.get('created_at'),
            'lastLoginAt': user.get('last_login_at'),
            'employeeId': (user.get('id') or '')[-8:].upper(),
        },
        'company': {
            'name': g.company,
            'createdAt': serialize(company).get('created_at') if company else None,
            'totalEmission': company.get('total_emission', 0),
        },
        'usage': _usage_counts(),
    })


def _usage_counts():
    db = get_db()
    return {
        'depots': with_retry(lambda: db.depots.count_documents({'company': g.company})),
        'vehicles': with_retry(lambda: db.vehicles.count_documents({'company': g.company})),
        'orders': with_retry(lambda: db.orders.count_documents({'company': g.company})),
        'routes': with_retry(lambda: db.routes.count_documents({'company': g.company})),
        'users': with_retry(lambda: db.users.count_documents({'company_name': g.company})),
    }


@settings_bp.route('/settings', methods=['PUT', 'PATCH'])
@auth_required()
def update_settings():
    payload = json_body()
    incoming = payload.get('settings', payload)
    unknown = [key for key in incoming if key not in SECTIONS]
    if unknown:
        raise ValidationError(f"Unknown settings section(s): {', '.join(unknown)}", 'settings')

    current = _load_settings(g.user['_id'])
    merged = _merge(current, incoming)
    with_retry(lambda: get_db().user_settings.update_one(
        {'user_id': str(g.user['_id'])},
        {'$set': {'settings': merged, 'company': g.company, 'updated_at': utcnow()},
         '$setOnInsert': {'created_at': utcnow()}},
        upsert=True))
    return ok({'message': 'Settings saved', 'settings': merged})


@settings_bp.route('/settings/reset', methods=['POST'])
@auth_required()
def reset_settings():
    with_retry(lambda: get_db().user_settings.update_one(
        {'user_id': str(g.user['_id'])},
        {'$set': {'settings': DEFAULT_SETTINGS, 'updated_at': utcnow()}}, upsert=True))
    return ok({'message': 'Settings reset to defaults', 'settings': DEFAULT_SETTINGS})


# --------------------------------------------------------------------------
# API keys
# --------------------------------------------------------------------------

@settings_bp.route('/api-keys', methods=['GET'])
@auth_required(roles=('admin', 'planner'))
def list_api_keys():
    docs = with_retry(lambda: list(get_db().api_keys.find({'company': g.company}).sort('created_at', -1)))
    keys = []
    for doc in serialize(docs):
        doc.pop('key_hash', None)
        keys.append(doc)
    return ok({'keys': keys})


@settings_bp.route('/api-keys', methods=['POST'])
@auth_required(roles=('admin', 'planner'))
def create_api_key():
    payload = json_body(required=False)
    name = (payload.get('name') or 'Integration key').strip()
    role = (payload.get('role') or 'planner').lower()
    if role not in ('planner', 'admin', 'driver'):
        raise ValidationError('role must be driver, planner or admin', 'role')

    key, key_hash, last4 = generate_api_key()
    doc = {
        'name': name, 'company': g.company, 'role': role,
        'key_hash': key_hash, 'last4': last4,
        'created_at': utcnow(), 'created_by': str(g.user['_id']),
        'user_id': str(g.user['_id']), 'revoked': False, 'last_used_at': None,
    }
    result = with_retry(lambda: get_db().api_keys.insert_one(doc))
    return ok({
        'message': 'API key created — copy it now, it will not be shown again',
        'key': key,
        'id': str(result.inserted_id),
        'name': name, 'role': role, 'last4': last4,
    }, 201)


@settings_bp.route('/api-keys/<key_id>', methods=['DELETE'])
@auth_required(roles=('admin', 'planner'))
def revoke_api_key(key_id):
    oid = to_object_id(key_id)
    if not oid:
        return error('Invalid key id', 400)
    result = with_retry(lambda: get_db().api_keys.update_one(
        {'_id': oid, 'company': g.company},
        {'$set': {'revoked': True, 'revoked_at': utcnow()}}))
    if not result.matched_count:
        return error('API key not found', 404)
    return ok({'message': 'API key revoked'})


# --------------------------------------------------------------------------
# Data export / deletion
# --------------------------------------------------------------------------

EXPORTABLE = {
    'depots': lambda db, company: db.depots.find({'company': company}),
    'vehicles': lambda db, company: db.vehicles.find({'company': company}),
    'orders': lambda db, company: db.orders.find({'company': company}),
    'routes': lambda db, company: db.routes.find({'company': company}),
    'users': lambda db, company: db.users.find({'company_name': company}, {'password': 0}),
}


@settings_bp.route('/settings/export', methods=['GET'])
@settings_bp.route('/settings/export/<dataset>', methods=['GET'])
@auth_required()
def export_data(dataset='all'):
    """Download company data as JSON (single dataset) or a ZIP of every dataset."""
    db = get_db()
    if dataset != 'all':
        source = EXPORTABLE.get(dataset)
        if not source:
            return error(f"Unknown dataset. Available: {', '.join(EXPORTABLE)} or 'all'", 404)
        payload = serialize(list(source(db, g.company)))
        return Response(
            json.dumps({'dataset': dataset, 'exported_at': utcnow().isoformat() + 'Z',
                        'company': g.company, 'records': payload}, indent=2),
            mimetype='application/json',
            headers={'Content-Disposition': f'attachment; filename="optigo-{dataset}.json"'})

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, source in EXPORTABLE.items():
            records = serialize(list(source(db, g.company)))
            archive.writestr(f'{name}.json', json.dumps(records, indent=2))
        archive.writestr('export-info.json', json.dumps({
            'company': g.company, 'exported_at': utcnow().isoformat() + 'Z',
            'exported_by': g.user.get('email'), 'counts': _usage_counts(),
        }, indent=2))
    buffer.seek(0)
    return Response(buffer.getvalue(), mimetype='application/zip',
                    headers={'Content-Disposition': 'attachment; filename="optigo-export.zip"'})


@settings_bp.route('/settings/data', methods=['DELETE'])
@auth_required(roles=('admin',))
def delete_company_data():
    """Destructive: wipes operational data after an explicit typed confirmation."""
    payload = json_body()
    if (payload.get('confirm') or '').strip().upper() != 'DELETE':
        return error('Type DELETE in the confirm field to confirm this action', 400)

    datasets = payload.get('datasets') or ['orders', 'routes']
    invalid = [d for d in datasets if d not in ('orders', 'routes', 'depots', 'vehicles')]
    if invalid:
        raise ValidationError(f"Cannot delete: {', '.join(invalid)}", 'datasets')

    db = get_db()
    deleted = {}
    for dataset in datasets:
        result = with_retry(lambda d=dataset: getattr(db, d).delete_many({'company': g.company}))
        deleted[dataset] = result.deleted_count
    return ok({'message': 'Data deleted', 'deleted': deleted})
