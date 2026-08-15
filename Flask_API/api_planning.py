"""Route planning API.

`POST /plan` is the one entry point the UI and integrations use. It accepts any
mix of saved orders, inline orders and ad-hoc stops (including rest/break/fuel
stops), assigns them across the selected vehicles and returns fully costed
itineraries — with empty running measured separately.

`POST /routes/<id>/resequence` re-costs a hand-ordered sequence, which is what
the planner screen's move-up/move-down controls call.
"""
import logging

from flask import Blueprint, g, request

from gnn import service as gnn_service
from config import Config
from db import get_db, serialize, to_object_id, utcnow, with_retry
from models import ROUTE_STATUSES, job_from_order, normalize_order, pair_ad_hoc_stops, stop_from_payload, vehicle_from_doc
from security import auth_required
from vrp import DistanceProvider, PlanOptions, Vehicle, plan, plan_fixed_sequence, stop_from_dict
from web import ValidationError, as_bool, as_int, error, json_body, ok, pagination

log = logging.getLogger('optigo.planning')

planning_bp = Blueprint('planning', __name__)

MANAGER_ROLES = ('admin', 'planner')


# --------------------------------------------------------------------------
# Request -> planner input
# --------------------------------------------------------------------------

def _options_from(payload):
    raw = payload.get('options') or {}
    preference = (payload.get('preference') or raw.get('preference') or 'greenest').lower()
    if preference not in ('greenest', 'fastest', 'cheapest'):
        raise ValidationError('preference must be greenest, fastest or cheapest', 'preference')
    return PlanOptions(
        preference=preference,
        optimize_sequence=as_bool(raw.get('optimize_sequence', True), True),
        return_to_start=as_bool(raw.get('return_to_start', True), True),
        auto_breaks=as_bool(raw.get('auto_breaks', True), True),
        max_driving_minutes_before_break=as_int(
            raw.get('max_driving_minutes_before_break'), 'max_driving_minutes_before_break',
            default=Config.MAX_DRIVING_MINUTES_BEFORE_BREAK, minimum=60, maximum=720),
        break_minutes=as_int(raw.get('break_minutes'), 'break_minutes',
                             default=Config.DEFAULT_BREAK_MINUTES, minimum=0, maximum=240),
        enforce_capacity=as_bool(raw.get('enforce_capacity', True), True),
        enforce_shift=as_bool(raw.get('enforce_shift', False), False),
    )


def _load_vehicles(payload, fallback_stop):
    """Resolve the vehicles to plan with, falling back to a sensible default."""
    db = get_db()
    specs = payload.get('vehicles') or []
    if payload.get('vehicle_ids'):
        specs = list(specs) + [{'id': vid} for vid in payload['vehicle_ids']]

    vehicles = []
    for spec in specs:
        if isinstance(spec, str):
            spec = {'id': spec}
        if not isinstance(spec, dict):
            raise ValidationError('Each vehicle must be an id or an object', 'vehicles')

        vehicle_id = spec.get('id') or spec.get('vehicle_id')
        oid = to_object_id(vehicle_id) if vehicle_id else None
        if oid:
            # A real fleet record: use its capacities, costs and depots.
            doc = with_retry(lambda: db.vehicles.find_one({'_id': oid, 'company': g.company}))
            if not doc:
                raise ValidationError(f'Vehicle {vehicle_id} not found', 'vehicles')
            doc = serialize(doc)
        else:
            # An ad-hoc vehicle defined inline (planning without a saved fleet).
            doc = dict(spec)
            doc.setdefault('name', spec.get('name') or 'Planning vehicle')
        overrides = {k: v for k, v in spec.items() if k not in ('id', 'vehicle_id')}
        overrides['id'] = str(vehicle_id) if vehicle_id else (spec.get('key') or f'adhoc-{len(vehicles) + 1}')
        if not doc.get('start_location_id') and not overrides.get('start'):
            overrides['start'] = _fallback_start(fallback_stop)
        vehicles.append(vehicle_from_doc(doc, g.company, overrides))

    if vehicles:
        return vehicles

    # No fleet selected: plan with a single default vehicle so the simple
    # "A to B" case still works without creating fleet records first.
    default_spec = payload.get('vehicle') or {}
    doc = {
        'name': default_spec.get('name', 'Default vehicle'),
        'type': default_spec.get('type', 'rigid_7_5t'),
        'capacity_kg': default_spec.get('capacity_kg', 3000),
        'capacity_m3': default_spec.get('capacity_m3', 39),
        'fuel_type': default_spec.get('fuel_type', 'diesel'),
        'fuel_efficiency_km_per_l': default_spec.get('fuel_efficiency_km_per_l', 5.5),
        'avg_speed_kmh': default_spec.get('avg_speed_kmh', Config.DEFAULT_SPEED_KMH),
        'cost_per_km': default_spec.get('cost_per_km', 0.62),
        'return_to_start': default_spec.get('return_to_start', False),
    }
    overrides = {'id': 'default', 'start': default_spec.get('start') or _fallback_start(fallback_stop),
                 'return_to_start': doc['return_to_start']}
    if default_spec.get('end'):
        overrides['end'] = default_spec['end']
    return [vehicle_from_doc(doc, g.company, overrides)]


def _fallback_start(stop):
    if stop is None:
        raise ValidationError('Add at least one stop or order before planning', 'stops')
    return {'lat': stop.lat, 'lon': stop.lon, 'name': f'Start · {stop.name}',
            'location_id': stop.location_id}


def _load_jobs_and_stops(payload):
    """Collect jobs (orders) and loose stops from every accepted input shape."""
    db = get_db()
    jobs, extras = [], []
    # Sequence numbers keep the caller's ordering intact when the plan is locked
    # (orders first, then ad-hoc stops, in the order they were sent).
    sequence = 0

    for order_id in payload.get('order_ids') or []:
        oid = to_object_id(order_id)
        doc = with_retry(lambda: db.orders.find_one({'_id': oid, 'company': g.company})) if oid else None
        if not doc:
            doc = with_retry(lambda: db.orders.find_one({'reference': order_id, 'company': g.company}))
        if not doc:
            raise ValidationError(f'Order {order_id} not found', 'order_ids')
        jobs.append(job_from_order(serialize(doc), sequence))
        sequence += 2

    for index, inline in enumerate(payload.get('orders') or []):
        if not isinstance(inline, dict):
            raise ValidationError('Each inline order must be an object', 'orders')
        normalized = normalize_order(inline, g.company, created_by=str(g.user.get('_id')))
        normalized['id'] = inline.get('id') or f'inline-{index + 1}'
        jobs.append(job_from_order(normalized, sequence))
        sequence += 2

    stops = [stop_from_payload(s, g.company, sequence + i)
             for i, s in enumerate(payload.get('stops') or [])]
    paired_jobs, loose = pair_ad_hoc_stops(stops)
    jobs.extend(paired_jobs)
    extras.extend(loose)

    if len(jobs) * 2 + len(extras) > Config.MAX_PLAN_STOPS:
        raise ValidationError(f'Plan exceeds the {Config.MAX_PLAN_STOPS}-stop limit', 'stops')
    return jobs, extras


def _first_stop(jobs, extras):
    for job in jobs:
        for stop in job.stops:
            return stop
    return extras[0] if extras else None


def _provider(payload, options):
    # On by default: routing between trained-network locations should use the
    # learned costs without the caller having to ask for it. Integrations can
    # still opt out with {"options": {"use_gnn_corridor": false}}.
    use_corridor = as_bool((payload.get('options') or {}).get('use_gnn_corridor', True), True)
    corridor_fn = None
    if use_corridor and gnn_service.ensure_loaded():
        corridor_fn = gnn_service.corridor_provider(options.preference)
    return DistanceProvider(options.road_factor, corridor_fn=corridor_fn)


# --------------------------------------------------------------------------
# Planning
# --------------------------------------------------------------------------

@planning_bp.route('/plan', methods=['POST'])
@planning_bp.route('/routes/plan', methods=['POST'])
@auth_required()
def create_plan():
    payload = json_body()
    options = _options_from(payload)
    jobs, extras = _load_jobs_and_stops(payload)
    if not jobs and not extras:
        raise ValidationError('Nothing to plan — add stops or select orders', 'stops')

    vehicles = _load_vehicles(payload, _first_stop(jobs, extras))
    result = plan(vehicles, jobs, extras, options, provider=_provider(payload, options))
    result['preference'] = options.preference
    result['options'] = {
        'optimize_sequence': options.optimize_sequence,
        'return_to_start': options.return_to_start,
        'auto_breaks': options.auto_breaks,
        'break_minutes': options.break_minutes,
        'max_driving_minutes_before_break': options.max_driving_minutes_before_break,
        'use_gnn_corridor': as_bool((payload.get('options') or {}).get('use_gnn_corridor', True), True),
        'enforce_capacity': options.enforce_capacity,
    }
    result['gnn'] = gnn_service.status()

    if as_bool(payload.get('save')):
        saved = _persist_route(payload.get('name'), result, options)
        result['route_id'] = saved['id']
        result['saved'] = True
    return ok(result)


@planning_bp.route('/best-route', methods=['POST'])
def best_route():
    """Legacy depot-to-depot endpoint kept for backwards compatibility."""
    payload = json_body()
    start = payload.get('start')
    end = payload.get('end')
    preference = (payload.get('preference') or 'greenest').lower()
    if not start or not end:
        return error('start and end depots are required', 400)
    if start == end:
        return error('Start and end depots must be different', 400)
    if preference not in ('greenest', 'fastest', 'cheapest'):
        preference = 'greenest'

    if not gnn_service.ensure_loaded():
        return error('Route model is still starting up, please retry in a moment', 503,
                     detail=gnn_service.status())
    result, failure = gnn_service.legacy_best_route(start, end, preference)
    if failure:
        return error(failure, 404)
    return ok(result)


@planning_bp.route('/geometry', methods=['POST'])
@auth_required()
def leg_geometry():
    """Road shapes for legs that have no precomputed geometry.

    The planner returns immediately with straight-line legs; the map calls this
    afterwards and upgrades them to road-following lines as they arrive
    (progressive enhancement — the plan is never blocked on an external router).
    Results are cached on disk, so the same corridor is fetched once ever.

    Disabled by setting ROAD_GEOMETRY_URL='' — the app then stays fully offline.
    """
    from gnn import geometry  # noqa: PLC0415 - optional artefact module

    payload = json_body()
    legs = payload.get('legs')
    if not isinstance(legs, list) or not legs:
        raise ValidationError('legs must be a non-empty array of {from:[lat,lon], to:[lat,lon]}', 'legs')
    if len(legs) > Config.ROAD_GEOMETRY_MAX_LEGS:
        legs = legs[:Config.ROAD_GEOMETRY_MAX_LEGS]

    if not Config.ROAD_GEOMETRY_URL:
        return ok({'enabled': False, 'shapes': [None] * len(legs)})

    shapes = []
    for leg in legs:
        try:
            source, destination = leg['from'], leg['to']
            shape = geometry.for_coordinates(float(source[0]), float(source[1]),
                                             float(destination[0]), float(destination[1]),
                                             Config.ROAD_GEOMETRY_URL)
        except (KeyError, TypeError, ValueError, IndexError):
            shape = None
        shapes.append(shape)

    return ok({'enabled': True, 'shapes': shapes,
               'resolved': sum(1 for shape in shapes if shape)})


@planning_bp.route('/route-alternatives', methods=['POST'])
@auth_required()
def route_alternatives():
    """Compare the three learned objectives for one origin-destination pair.

    Each objective has its own trained cost model, so each can prefer a
    different corridor. Returning all three side by side (with the road geometry
    for drawing) lets a planner see the trade-off — the greenest route is often
    not the fastest — rather than being handed a single opaque answer.
    """
    payload = json_body()
    origin = (payload.get('origin') or payload.get('start') or '').strip()
    destination = (payload.get('destination') or payload.get('end') or '').strip()
    if not origin or not destination:
        raise ValidationError('origin and destination are required', 'origin')
    if origin == destination:
        raise ValidationError('origin and destination must differ', 'destination')

    if not gnn_service.ensure_loaded():
        return error('Route model is still starting up, please retry in a moment', 503,
                     detail=gnn_service.status())

    locations = gnn_service.network_locations()
    for name in (origin, destination):
        if name not in locations:
            return error(f"'{name}' is not part of the trained network — "
                         f'objective comparison is only available between network locations', 400)

    alternatives = []
    for preference in ('greenest', 'fastest', 'cheapest'):
        payload_route, failure = gnn_service.legacy_best_route(origin, destination, preference)
        if failure or not payload_route:
            continue
        alternatives.append({
            'preference': preference,
            'path': [stop['depot'] for stop in payload_route['route']],
            'route': payload_route['route'],
            'distance_km': payload_route['total_distance_km'],
            'road_distance_km': payload_route.get('road_distance_km'),
            'estimated_time_min': payload_route['estimated_time_min'],
            'estimated_cost_gbp': payload_route['estimated_cost_gbp'],
            'co2_kg': payload_route['co2_kg'],
            'predicted_objective_cost': payload_route['predicted_objective_cost'],
            'objective_unit': payload_route['objective_unit'],
            'shapes': payload_route.get('shapes', []),
        })

    if not alternatives:
        return error('No route found between these locations', 404)

    # Relative trade-offs make the comparison readable at a glance.
    best_time = min(a['estimated_time_min'] for a in alternatives)
    best_cost = min(a['estimated_cost_gbp'] for a in alternatives)
    best_co2 = min(a['co2_kg'] for a in alternatives)
    for alternative in alternatives:
        alternative['delta'] = {
            'time_pct': round((alternative['estimated_time_min'] - best_time) / best_time * 100, 1)
            if best_time else 0,
            'cost_pct': round((alternative['estimated_cost_gbp'] - best_cost) / best_cost * 100, 1)
            if best_cost else 0,
            'co2_pct': round((alternative['co2_kg'] - best_co2) / best_co2 * 100, 1)
            if best_co2 else 0,
        }
        alternative['identical_to_fastest'] = (
            alternative['path'] == next(a['path'] for a in alternatives if a['preference'] == 'fastest')
        )

    return ok({'origin': origin, 'destination': destination,
               'alternatives': alternatives, 'gnn': gnn_service.status()})


# --------------------------------------------------------------------------
# Saved routes
# --------------------------------------------------------------------------

def _persist_route(name, result, options, status='planned'):
    db = get_db()
    order_ids = sorted({s['order_id'] for v in result['vehicles'] for s in v['stops']
                        if s.get('order_id') and not str(s['order_id']).startswith('inline-')})
    doc = {
        'company': g.company,
        'name': name or f"Plan {utcnow().strftime('%d %b %H:%M')}",
        'status': status,
        'preference': options.preference,
        'vehicles': result['vehicles'],
        'unassigned': result['unassigned'],
        'summary': result['summary'],
        'vehicle_ids': [v['vehicle_id'] for v in result['vehicles']],
        'order_ids': order_ids,
        'options': result.get('options', {}),
        'created_at': utcnow(),
        'updated_at': utcnow(),
        'created_by': str(g.user.get('_id')),
        'created_by_name': g.user.get('full_name'),
    }
    inserted = with_retry(lambda: db.routes.insert_one(doc))
    if order_ids:
        with_retry(lambda: db.orders.update_many(
            {'company': g.company, '_id': {'$in': [to_object_id(o) for o in order_ids if to_object_id(o)]}},
            {'$set': {'route_id': str(inserted.inserted_id), 'status': 'planned', 'updated_at': utcnow()}}))
    saved = with_retry(lambda: db.routes.find_one({'_id': inserted.inserted_id}))
    return serialize(saved)


@planning_bp.route('/routes', methods=['POST'])
@auth_required()
def save_route():
    payload = json_body()
    result = payload.get('plan') or payload.get('result')
    if not result or not isinstance(result, dict) or 'vehicles' not in result:
        raise ValidationError('Provide the plan result to save under "plan"', 'plan')
    options = _options_from({'preference': result.get('preference', 'greenest'),
                             'options': result.get('options', {})})
    status = (payload.get('status') or 'planned').lower()
    if status not in ROUTE_STATUSES:
        raise ValidationError(f"status must be one of: {', '.join(ROUTE_STATUSES)}", 'status')
    saved = _persist_route(payload.get('name'), result, options, status=status)
    return ok({'route': saved}, 201)


@planning_bp.route('/routes', methods=['GET'])
@auth_required()
def list_routes():
    limit, skip = pagination()
    query = {'company': g.company}
    if request.args.get('status'):
        query['status'] = {'$in': [s.strip() for s in request.args['status'].split(',')]}
    db = get_db()
    docs = with_retry(lambda: list(db.routes.find(query).sort('created_at', -1).skip(skip).limit(limit)))
    total = with_retry(lambda: db.routes.count_documents(query))

    summaries = []
    for doc in serialize(docs):
        summaries.append({
            'id': doc['id'], 'name': doc.get('name'), 'status': doc.get('status'),
            'preference': doc.get('preference'), 'created_at': doc.get('created_at'),
            'created_by_name': doc.get('created_by_name'),
            'summary': doc.get('summary', {}),
            'vehicle_count': len(doc.get('vehicles', [])),
            'order_count': len(doc.get('order_ids', [])),
        })
    return ok({'routes': summaries, 'total': total, 'limit': limit, 'offset': skip})


@planning_bp.route('/routes/<route_id>', methods=['GET'])
@auth_required()
def get_route(route_id):
    doc = _find_route(route_id)
    if not doc:
        return error('Route not found', 404)
    return ok({'route': serialize(doc)})


@planning_bp.route('/routes/<route_id>', methods=['PATCH'])
@auth_required()
def update_route(route_id):
    doc = _find_route(route_id)
    if not doc:
        return error('Route not found', 404)
    payload = json_body()
    updates = {'updated_at': utcnow()}
    if 'name' in payload:
        updates['name'] = (payload['name'] or '').strip() or doc.get('name')
    if 'status' in payload:
        status = (payload['status'] or '').lower()
        if status not in ROUTE_STATUSES:
            raise ValidationError(f"status must be one of: {', '.join(ROUTE_STATUSES)}", 'status')
        updates['status'] = status
        if status == 'dispatched':
            _apply_dispatch(doc)
        if status == 'completed':
            updates['completed_at'] = utcnow()
    with_retry(lambda: get_db().routes.update_one({'_id': doc['_id']}, {'$set': updates}))
    return ok({'route': serialize(with_retry(lambda: get_db().routes.find_one({'_id': doc['_id']})))})


def _apply_dispatch(route_doc):
    """Move orders to in-transit and book the planned CO2 against the company."""
    db = get_db()
    order_ids = [to_object_id(o) for o in route_doc.get('order_ids', []) if to_object_id(o)]
    if order_ids:
        with_retry(lambda: db.orders.update_many(
            {'_id': {'$in': order_ids}, 'company': g.company},
            {'$set': {'status': 'in_transit', 'updated_at': utcnow()}}))
    co2 = float((route_doc.get('summary') or {}).get('co2_kg') or 0)
    if co2 and not route_doc.get('emission_booked'):
        with_retry(lambda: db.companies.update_one({'name': g.company}, {'$inc': {'total_emission': co2}}))
        with_retry(lambda: db.routes.update_one({'_id': route_doc['_id']},
                                                {'$set': {'emission_booked': True}}))


@planning_bp.route('/routes/<route_id>', methods=['DELETE'])
@auth_required()
def delete_route(route_id):
    doc = _find_route(route_id)
    if not doc:
        return error('Route not found', 404)
    db = get_db()
    order_ids = [to_object_id(o) for o in doc.get('order_ids', []) if to_object_id(o)]
    if order_ids:
        with_retry(lambda: db.orders.update_many(
            {'_id': {'$in': order_ids}, 'company': g.company, 'status': 'planned'},
            {'$set': {'route_id': None, 'status': 'new', 'updated_at': utcnow()}}))
    with_retry(lambda: db.routes.delete_one({'_id': doc['_id']}))
    return ok({'message': 'Route deleted'})


@planning_bp.route('/routes/<route_id>/resequence', methods=['POST'])
@auth_required()
def resequence_route(route_id):
    """Re-cost a manually ordered stop sequence for one vehicle on a saved route."""
    doc = _find_route(route_id)
    if not doc:
        return error('Route not found', 404)

    payload = json_body()
    vehicle_id = str(payload.get('vehicle_id') or '')
    stop_keys = payload.get('stop_keys') or payload.get('sequence')
    if not vehicle_id or not isinstance(stop_keys, list) or not stop_keys:
        raise ValidationError('vehicle_id and an ordered stop_keys array are required', 'stop_keys')

    route = serialize(doc)
    target = next((v for v in route['vehicles'] if str(v['vehicle_id']) == vehicle_id), None)
    if not target:
        return error(f'Vehicle {vehicle_id} is not part of this route', 404)

    stops_by_key = {s['key']: s for s in target['stops']}
    unknown = [k for k in stop_keys if k not in stops_by_key]
    if unknown:
        raise ValidationError(f"Unknown stop(s) in the new sequence: {', '.join(unknown)}", 'stop_keys')
    if len(stop_keys) != len(stops_by_key):
        raise ValidationError('The new sequence must contain every stop exactly once', 'stop_keys')

    ordered = [stop_from_dict(stops_by_key[key]) for key in stop_keys]
    vehicle = _vehicle_for_saved_route(target)
    options = _options_from({'preference': route.get('preference', 'greenest'),
                             'options': {**route.get('options', {}), 'optimize_sequence': False}})
    result = plan_fixed_sequence(vehicle, ordered, options)
    if not result.get('feasible'):
        return error(result.get('reason', 'That sequence is not feasible'), 409)

    route['vehicles'] = [result if str(v['vehicle_id']) == vehicle_id else v for v in route['vehicles']]
    summary = _resummarise(route['vehicles'], route.get('unassigned', []))
    with_retry(lambda: get_db().routes.update_one(
        {'_id': doc['_id']},
        {'$set': {'vehicles': route['vehicles'], 'summary': summary,
                  'updated_at': utcnow(), 'manually_sequenced': True}}))
    return ok({'vehicle': result, 'summary': summary, 'route_id': route['id']})


@planning_bp.route('/plan/resequence', methods=['POST'])
@auth_required()
def resequence_draft():
    """Re-cost a hand-ordered sequence that has not been saved yet."""
    payload = json_body()
    stops_payload = payload.get('stops')
    if not isinstance(stops_payload, list) or not stops_payload:
        raise ValidationError('stops must be a non-empty ordered array', 'stops')

    options = _options_from({**payload, 'options': {**(payload.get('options') or {}),
                                                   'optimize_sequence': False}})
    stops = [stop_from_dict(s) if s.get('key') and 'weight_kg' in s else stop_from_payload(s, g.company, i)
             for i, s in enumerate(stops_payload)]
    vehicle_spec = payload.get('vehicle') or {}
    vehicles = _load_vehicles({'vehicles': [vehicle_spec] if vehicle_spec else []}, stops[0])
    result = plan_fixed_sequence(vehicles[0], stops, options, provider=_provider(payload, options))
    if not result.get('feasible'):
        return error(result.get('reason', 'That sequence is not feasible'), 409)
    return ok({'vehicle': result, 'preference': options.preference})


def _vehicle_for_saved_route(saved_vehicle) -> Vehicle:
    """Rebuild the planner Vehicle from a stored route leg."""
    db = get_db()
    oid = to_object_id(saved_vehicle.get('vehicle_id'))
    doc = with_retry(lambda: db.vehicles.find_one({'_id': oid, 'company': g.company})) if oid else None
    doc = serialize(doc) if doc else {
        'name': saved_vehicle.get('vehicle_name', 'Vehicle'),
        'type': saved_vehicle.get('vehicle_type', 'rigid_7_5t'),
    }
    timeline = saved_vehicle.get('timeline') or []
    start_entry = next((t for t in timeline if t['type'] == 'depot_start'), None)
    end_entry = next((t for t in timeline if t['type'] == 'depot_end'), None)
    overrides = {'id': saved_vehicle.get('vehicle_id')}
    if start_entry:
        overrides['start'] = {'lat': start_entry['lat'], 'lon': start_entry['lon'],
                              'name': start_entry['name'], 'location_id': start_entry.get('location_id')}
    if end_entry:
        overrides['end'] = {'lat': end_entry['lat'], 'lon': end_entry['lon'],
                            'name': end_entry['name'], 'location_id': end_entry.get('location_id')}
    metrics = saved_vehicle.get('metrics') or {}
    if metrics.get('start_time'):
        overrides['shift_start'] = metrics['start_time']
    overrides['return_to_start'] = bool(end_entry)
    return vehicle_from_doc(doc, g.company, overrides)


def _resummarise(vehicle_results, unassigned):
    def total(field):
        return round(sum(v['metrics'].get(field, 0) for v in vehicle_results), 2)

    distance = total('total_distance_km')
    empty = total('empty_km')
    return {
        'vehicles_used': len(vehicle_results),
        'orders_unassigned': len(unassigned),
        'total_stops': sum(v['metrics'].get('total_stops', 0) for v in vehicle_results),
        'total_distance_km': distance,
        'total_distance_miles': total('total_distance_miles'),
        'empty_km': empty,
        'empty_miles': total('empty_miles'),
        'loaded_km': total('loaded_km'),
        'empty_pct': round((empty / distance * 100) if distance else 0, 1),
        'total_minutes': round(sum(v['metrics'].get('total_minutes', 0) for v in vehicle_results)),
        'driving_minutes': round(sum(v['metrics'].get('driving_minutes', 0) for v in vehicle_results)),
        'co2_kg': total('co2_kg'),
        'estimated_fuel_l': total('estimated_fuel_l'),
        'estimated_cost_gbp': total('estimated_cost_gbp'),
        'violations': sum(len(v.get('violations', [])) for v in vehicle_results),
        'avg_weight_utilisation_pct': round(
            sum(v['metrics'].get('weight_utilisation_pct', 0) for v in vehicle_results) /
            len(vehicle_results), 1) if vehicle_results else 0,
        'avg_volume_utilisation_pct': round(
            sum(v['metrics'].get('volume_utilisation_pct', 0) for v in vehicle_results) /
            len(vehicle_results), 1) if vehicle_results else 0,
    }


def _find_route(route_id):
    oid = to_object_id(route_id)
    if not oid:
        return None
    return with_retry(lambda: get_db().routes.find_one({'_id': oid, 'company': g.company}))
