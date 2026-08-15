"""Orders API — full package detail, pickup/drop-off blocks and status flow.

Available both to the app (JWT) and to integrations (X-API-Key) via the
/api/v1 alias registered in app.py.
"""
from flask import Blueprint, g, request

from db import get_db, serialize, to_object_id, utcnow, with_retry
from models import ORDER_STATUSES, normalize_order
from security import auth_required
from web import ValidationError, as_bool, csv_response, error, json_body, ok, pagination, parse_date

orders_bp = Blueprint('orders', __name__)


def _query_from_request():
    query = {'company': g.company}
    status = request.args.get('status')
    if status:
        statuses = [s.strip().lower() for s in status.split(',') if s.strip()]
        invalid = [s for s in statuses if s not in ORDER_STATUSES]
        if invalid:
            raise ValidationError(f"Unknown status: {', '.join(invalid)}", 'status')
        query['status'] = {'$in': statuses}
    if request.args.get('reference'):
        query['reference'] = request.args['reference']
    if request.args.get('customer'):
        query['customer_name'] = {'$regex': request.args['customer'], '$options': 'i'}
    if request.args.get('unplanned') and as_bool(request.args.get('unplanned')):
        query['route_id'] = None
    date_from = parse_date(request.args.get('from'), 'from')
    date_to = parse_date(request.args.get('to'), 'to')
    if date_from or date_to:
        created = {}
        if date_from:
            created['$gte'] = date_from
        if date_to:
            created['$lte'] = date_to
        query['created_at'] = created
    return query


@orders_bp.route('/orders', methods=['GET'])
@auth_required()
def list_orders():
    limit, skip = pagination()
    query = _query_from_request()
    db = get_db()
    docs = with_retry(lambda: list(db.orders.find(query).sort('created_at', -1).skip(skip).limit(limit)))
    total = with_retry(lambda: db.orders.count_documents(query))
    return ok({'orders': serialize(docs), 'total': total, 'limit': limit, 'offset': skip})


@orders_bp.route('/orders/export.csv', methods=['GET'])
@auth_required()
def export_orders():
    query = _query_from_request()
    docs = with_retry(lambda: list(get_db().orders.find(query).sort('created_at', -1)))
    header = ['reference', 'status', 'priority', 'customer', 'pickup', 'pickup_lat', 'pickup_lon',
              'dropoff', 'dropoff_lat', 'dropoff_lon', 'packages', 'weight_kg', 'volume_m3',
              'pallets', 'created_at']

    def rows():
        for doc in docs:
            pickup = doc.get('pickup') or {}
            dropoff = doc.get('dropoff') or {}
            totals = doc.get('totals') or {}
            yield [
                doc.get('reference'), doc.get('status'), doc.get('priority'),
                doc.get('customer_name'),
                pickup.get('name', ''), pickup.get('lat', ''), pickup.get('lon', ''),
                dropoff.get('name', ''), dropoff.get('lat', ''), dropoff.get('lon', ''),
                totals.get('package_count', 0), totals.get('total_weight_kg', 0),
                totals.get('total_volume_m3', 0), totals.get('pallets', 0),
                doc.get('created_at').isoformat() if doc.get('created_at') else '',
            ]
    return csv_response('orders.csv', header, rows())


@orders_bp.route('/orders/<order_id>', methods=['GET'])
@auth_required()
def get_order(order_id):
    doc = _find_order(order_id)
    if not doc:
        return error('Order not found', 404)
    return ok({'order': serialize(doc)})


@orders_bp.route('/orders', methods=['POST'])
@auth_required()
def create_order():
    payload = json_body()
    if isinstance(payload.get('orders'), list):
        return _bulk_create(payload['orders'])

    doc = normalize_order(payload, g.company, created_by=str(g.user.get('_id')))
    if with_retry(lambda: get_db().orders.find_one({'company': g.company, 'reference': doc['reference']})):
        return error(f"An order with reference {doc['reference']} already exists", 409)
    result = with_retry(lambda: get_db().orders.insert_one(doc))
    saved = with_retry(lambda: get_db().orders.find_one({'_id': result.inserted_id}))
    return ok({'order': serialize(saved)}, 201)


def _bulk_create(items):
    created, failed = [], []
    for index, item in enumerate(items):
        try:
            doc = normalize_order(item, g.company, created_by=str(g.user.get('_id')))
            result = with_retry(lambda: get_db().orders.insert_one(doc))
            created.append(str(result.inserted_id))
        except ValidationError as exc:
            failed.append({'index': index, 'error': exc.message, 'field': exc.field})
    status = 201 if created and not failed else (207 if created else 400)
    return ok({'created': created, 'created_count': len(created), 'failed': failed}, status)


@orders_bp.route('/orders/<order_id>', methods=['PUT', 'PATCH'])
@auth_required()
def update_order(order_id):
    existing = _find_order(order_id)
    if not existing:
        return error('Order not found', 404)
    if existing.get('status') in ('delivered', 'cancelled') and not as_bool(request.args.get('force')):
        return error(f"Order is {existing['status']} and can no longer be edited", 409)

    doc = normalize_order(json_body(), g.company, existing=existing)
    doc.pop('_id', None)
    with_retry(lambda: get_db().orders.update_one({'_id': existing['_id']}, {'$set': doc}))
    saved = with_retry(lambda: get_db().orders.find_one({'_id': existing['_id']}))
    return ok({'order': serialize(saved)})


@orders_bp.route('/orders/<order_id>/status', methods=['POST', 'PATCH'])
@auth_required()
def set_order_status(order_id):
    existing = _find_order(order_id)
    if not existing:
        return error('Order not found', 404)
    status = (json_body().get('status') or '').lower()
    if status not in ORDER_STATUSES:
        raise ValidationError(f"status must be one of: {', '.join(ORDER_STATUSES)}", 'status')

    updates = {'status': status, 'updated_at': utcnow()}
    if status == 'delivered':
        updates['delivered_at'] = utcnow()
    with_retry(lambda: get_db().orders.update_one({'_id': existing['_id']}, {'$set': updates}))
    return ok({'message': f'Order marked {status}', 'status': status})


@orders_bp.route('/orders/<order_id>', methods=['DELETE'])
@auth_required()
def delete_order(order_id):
    existing = _find_order(order_id)
    if not existing:
        return error('Order not found', 404)
    if existing.get('route_id') and not as_bool(request.args.get('force')):
        return error('This order is on a planned route — remove it from the route first '
                     'or pass ?force=1', 409)
    with_retry(lambda: get_db().orders.delete_one({'_id': existing['_id']}))
    return ok({'message': 'Order deleted'})


def _find_order(order_id):
    db = get_db()
    oid = to_object_id(order_id)
    if oid:
        doc = with_retry(lambda: db.orders.find_one({'_id': oid, 'company': g.company}))
        if doc:
            return doc
    return with_retry(lambda: db.orders.find_one({'reference': order_id, 'company': g.company}))
