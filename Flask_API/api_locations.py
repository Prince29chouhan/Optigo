"""Depots and locations.

`/depots` keeps its original contract so the existing UI keeps working, and
`/locations` adds the merged catalog (company records + GNN dataset depots) that
the planner needs — this is what makes a newly created depot immediately
selectable when planning a route.
"""
from flask import Blueprint, g, request

from catalog import all_locations, company_locations, dataset_depots
from db import get_db, serialize, to_object_id, with_retry
from models import normalize_location
from security import auth_required
from web import as_bool, error, json_body, ok

locations_bp = Blueprint('locations', __name__)

MANAGER_ROLES = ('admin', 'planner')


@locations_bp.route('/depots', methods=['GET'])
@auth_required()
def list_depots():
    return ok(company_locations(g.company, include_inactive=as_bool(request.args.get('include_archived'))))


@locations_bp.route('/locations', methods=['GET'])
@auth_required()
def list_locations():
    include_dataset = as_bool(request.args.get('include_dataset', '1'), True)
    wanted_type = (request.args.get('type') or '').lower()
    locations = all_locations(g.company, include_dataset=include_dataset)
    if wanted_type:
        locations = [loc for loc in locations if (loc.get('type') or 'depot') == wanted_type]
    return ok({
        'locations': locations,
        'company_count': sum(1 for loc in locations if loc.get('source') == 'company'),
        'dataset_count': sum(1 for loc in locations if loc.get('source') == 'dataset'),
    })


@locations_bp.route('/depots', methods=['POST'])
@locations_bp.route('/locations', methods=['POST'])
@auth_required(roles=MANAGER_ROLES)
def create_depot():
    payload = json_body()
    doc = normalize_location(payload, g.company)
    doc['created_by'] = str(g.user.get('_id'))
    result = with_retry(lambda: get_db().depots.insert_one(doc))
    saved = with_retry(lambda: get_db().depots.find_one({'_id': result.inserted_id}))
    return ok(serialize(saved), 201)


@locations_bp.route('/depots/<depot_id>', methods=['GET'])
@locations_bp.route('/locations/<depot_id>', methods=['GET'])
@auth_required()
def get_depot(depot_id):
    dataset = dataset_depots().get(depot_id)
    if dataset:
        return ok(dataset)
    oid = to_object_id(depot_id)
    doc = with_retry(lambda: get_db().depots.find_one({'_id': oid, 'company': g.company})) if oid else None
    if not doc:
        return error('Depot not found', 404)
    return ok(serialize(doc))


@locations_bp.route('/depots/<depot_id>', methods=['PUT', 'PATCH'])
@locations_bp.route('/locations/<depot_id>', methods=['PUT', 'PATCH'])
@auth_required(roles=MANAGER_ROLES)
def update_depot(depot_id):
    oid = to_object_id(depot_id)
    if not oid:
        return error('Invalid depot id', 400)
    existing = with_retry(lambda: get_db().depots.find_one({'_id': oid, 'company': g.company}))
    if not existing:
        return error('Depot not found', 404)

    payload = json_body()
    doc = normalize_location(payload, g.company, existing=existing)
    doc.pop('_id', None)
    with_retry(lambda: get_db().depots.update_one({'_id': oid}, {'$set': doc}))
    saved = with_retry(lambda: get_db().depots.find_one({'_id': oid}))
    return ok(serialize(saved))


@locations_bp.route('/depots/<depot_id>', methods=['DELETE'])
@locations_bp.route('/locations/<depot_id>', methods=['DELETE'])
@auth_required(roles=MANAGER_ROLES)
def delete_depot(depot_id):
    oid = to_object_id(depot_id)
    if not oid:
        return error('Invalid depot id', 400)

    db = get_db()
    in_use = with_retry(lambda: db.vehicles.count_documents(
        {'company': g.company, '$or': [{'start_location_id': depot_id}, {'end_location_id': depot_id}]}))
    if in_use:
        return error(f'{in_use} vehicle(s) still start or finish at this depot — '
                     f'reassign them before deleting it', 409)

    result = with_retry(lambda: db.depots.delete_one({'_id': oid, 'company': g.company}))
    if not result.deleted_count:
        return error('Depot not found', 404)
    return ok({'message': 'Depot deleted'})


@locations_bp.route('/depots/import', methods=['POST'])
@auth_required(roles=MANAGER_ROLES)
def import_dataset_depots():
    """Copy GNN dataset depots into the company catalog so they can be edited."""
    payload = json_body(required=False)
    wanted = payload.get('depot_ids') or list(dataset_depots().keys())
    db = get_db()
    created, skipped = 0, 0
    for depot_id in wanted:
        source = dataset_depots().get(depot_id)
        if not source:
            skipped += 1
            continue
        exists = with_retry(lambda: db.depots.find_one(
            {'company': g.company, 'dataset_id': depot_id}))
        if exists:
            skipped += 1
            continue
        doc = normalize_location({
            'name': source['name'], 'lat': source['lat'], 'lon': source['lon'],
            'type': 'depot', 'notes': 'Imported from the GNN dataset',
        }, g.company)
        doc['dataset_id'] = depot_id
        doc['created_by'] = str(g.user.get('_id'))
        with_retry(lambda: db.depots.insert_one(doc))
        created += 1
    return ok({'message': f'Imported {created} depot(s)', 'created': created, 'skipped': skipped})
