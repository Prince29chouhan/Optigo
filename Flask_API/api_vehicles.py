"""Fleet API — vehicle records with capacity, dimensions, type and cost data."""
from flask import Blueprint, g, request

from config import VEHICLE_TYPE_PRESETS
from db import get_db, serialize, to_object_id, with_retry
from models import normalize_vehicle
from security import auth_required
from web import as_bool, error, json_body, ok, pagination

vehicles_bp = Blueprint('vehicles', __name__)

MANAGER_ROLES = ('admin', 'planner')


@vehicles_bp.route('/vehicle-types', methods=['GET'])
@auth_required()
def vehicle_types():
    return ok({'types': [{'value': key, **preset} for key, preset in VEHICLE_TYPE_PRESETS.items()]})


@vehicles_bp.route('/vehicles', methods=['GET'])
@auth_required()
def list_vehicles():
    limit, skip = pagination()
    query = {'company': g.company}
    if not as_bool(request.args.get('include_inactive')):
        query['status'] = {'$ne': 'retired'}
    if request.args.get('type'):
        query['type'] = request.args['type']

    db = get_db()
    docs = with_retry(lambda: list(db.vehicles.find(query).sort('name', 1).skip(skip).limit(limit)))
    total = with_retry(lambda: db.vehicles.count_documents(query))
    return ok({'vehicles': serialize(docs), 'total': total, 'limit': limit, 'offset': skip})


@vehicles_bp.route('/vehicles', methods=['POST'])
@auth_required(roles=MANAGER_ROLES)
def create_vehicle():
    doc = normalize_vehicle(json_body(), g.company)
    doc['created_by'] = str(g.user.get('_id'))
    result = with_retry(lambda: get_db().vehicles.insert_one(doc))
    saved = with_retry(lambda: get_db().vehicles.find_one({'_id': result.inserted_id}))
    return ok({'vehicle': serialize(saved)}, 201)


@vehicles_bp.route('/vehicles/<vehicle_id>', methods=['GET'])
@auth_required()
def get_vehicle(vehicle_id):
    oid = to_object_id(vehicle_id)
    doc = with_retry(lambda: get_db().vehicles.find_one({'_id': oid, 'company': g.company})) if oid else None
    if not doc:
        return error('Vehicle not found', 404)
    return ok({'vehicle': serialize(doc)})


@vehicles_bp.route('/vehicles/<vehicle_id>', methods=['PUT', 'PATCH'])
@auth_required(roles=MANAGER_ROLES)
def update_vehicle(vehicle_id):
    oid = to_object_id(vehicle_id)
    if not oid:
        return error('Invalid vehicle id', 400)
    existing = with_retry(lambda: get_db().vehicles.find_one({'_id': oid, 'company': g.company}))
    if not existing:
        return error('Vehicle not found', 404)

    doc = normalize_vehicle(json_body(), g.company, existing=existing)
    doc.pop('_id', None)
    with_retry(lambda: get_db().vehicles.update_one({'_id': oid}, {'$set': doc}))
    saved = with_retry(lambda: get_db().vehicles.find_one({'_id': oid}))
    return ok({'vehicle': serialize(saved)})


@vehicles_bp.route('/vehicles/<vehicle_id>', methods=['DELETE'])
@auth_required(roles=MANAGER_ROLES)
def delete_vehicle(vehicle_id):
    oid = to_object_id(vehicle_id)
    if not oid:
        return error('Invalid vehicle id', 400)
    db = get_db()
    planned = with_retry(lambda: db.routes.count_documents(
        {'company': g.company, 'status': {'$in': ['planned', 'dispatched', 'in_progress']},
         'vehicle_ids': vehicle_id}))
    if planned and not as_bool(request.args.get('force')):
        return error(f'This vehicle is on {planned} active route(s). '
                     f'Retire it instead, or pass ?force=1 to delete anyway.', 409)

    result = with_retry(lambda: db.vehicles.delete_one({'_id': oid, 'company': g.company}))
    if not result.deleted_count:
        return error('Vehicle not found', 404)
    return ok({'message': 'Vehicle deleted'})
