"""Reporting API — operational, emissions, utilisation and empty-running reports.

All reports are computed from saved routes and orders, scoped to the caller's
company, and every one of them can be downloaded as CSV.
"""
from collections import defaultdict

from flask import Blueprint, g, request

from db import get_db, serialize, utcnow, with_retry
from geo import km_to_miles
from security import auth_required
from web import csv_response, error, json_body, ok, parse_date

reports_bp = Blueprint('reports', __name__)

REPORTS = ('summary', 'routes', 'emissions', 'utilisation', 'empty-miles', 'orders', 'vehicles')


def _period():
    date_from = parse_date(request.args.get('from'), 'from')
    date_to = parse_date(request.args.get('to'), 'to')
    if date_to:
        date_to = date_to.replace(hour=23, minute=59, second=59)
    return date_from, date_to


def _route_query():
    date_from, date_to = _period()
    query = {'company': g.company}
    if request.args.get('status'):
        query['status'] = {'$in': [s.strip() for s in request.args['status'].split(',')]}
    window = {}
    if date_from:
        window['$gte'] = date_from
    if date_to:
        window['$lte'] = date_to
    if window:
        query['created_at'] = window
    return query


def _routes():
    return with_retry(lambda: list(get_db().routes.find(_route_query()).sort('created_at', -1)))


def _metric(vehicle, field, default=0.0):
    return float((vehicle.get('metrics') or {}).get(field, default) or 0.0)


# --------------------------------------------------------------------------
# Reports
# --------------------------------------------------------------------------

def build_summary():
    routes = _routes()
    db = get_db()
    totals = defaultdict(float)
    vehicles_seen = set()

    for route in routes:
        for vehicle in route.get('vehicles', []):
            vehicles_seen.add(str(vehicle.get('vehicle_id')))
            totals['distance_km'] += _metric(vehicle, 'total_distance_km')
            totals['empty_km'] += _metric(vehicle, 'empty_km')
            totals['loaded_km'] += _metric(vehicle, 'loaded_km')
            totals['co2_kg'] += _metric(vehicle, 'co2_kg')
            totals['fuel'] += _metric(vehicle, 'estimated_fuel_l')
            totals['cost_gbp'] += _metric(vehicle, 'estimated_cost_gbp')
            totals['driving_minutes'] += _metric(vehicle, 'driving_minutes')
            totals['service_minutes'] += _metric(vehicle, 'service_minutes')
            totals['stops'] += _metric(vehicle, 'total_stops')
            totals['weight_util'] += _metric(vehicle, 'weight_utilisation_pct')
            totals['volume_util'] += _metric(vehicle, 'volume_utilisation_pct')
            totals['legs'] += 1

    order_counts = {}
    for status in ('new', 'planned', 'dispatched', 'in_transit', 'delivered', 'cancelled'):
        order_counts[status] = with_retry(
            lambda s=status: db.orders.count_documents({'company': g.company, 'status': s}))

    legs = totals['legs'] or 1
    distance = totals['distance_km']
    delivered = order_counts.get('delivered', 0)
    return {
        'period': {'from': request.args.get('from'), 'to': request.args.get('to')},
        'routes_planned': len(routes),
        'vehicles_used': len(vehicles_seen),
        'total_stops': int(totals['stops']),
        'total_distance_km': round(distance, 1),
        'total_distance_miles': round(km_to_miles(distance), 1),
        'loaded_km': round(totals['loaded_km'], 1),
        'empty_km': round(totals['empty_km'], 1),
        'empty_miles': round(km_to_miles(totals['empty_km']), 1),
        'empty_pct': round((totals['empty_km'] / distance * 100) if distance else 0, 1),
        'co2_kg': round(totals['co2_kg'], 1),
        'co2_per_km': round(totals['co2_kg'] / distance, 3) if distance else 0,
        'fuel_l': round(totals['fuel'], 1),
        'cost_gbp': round(totals['cost_gbp'], 2),
        'cost_per_km': round(totals['cost_gbp'] / distance, 2) if distance else 0,
        'cost_per_stop': round(totals['cost_gbp'] / totals['stops'], 2) if totals['stops'] else 0,
        'driving_hours': round(totals['driving_minutes'] / 60, 1),
        'service_hours': round(totals['service_minutes'] / 60, 1),
        'avg_weight_utilisation_pct': round(totals['weight_util'] / legs, 1),
        'avg_volume_utilisation_pct': round(totals['volume_util'] / legs, 1),
        'orders': order_counts,
        'orders_total': sum(order_counts.values()),
        'orders_delivered': delivered,
        'generated_at': utcnow().isoformat() + 'Z',
    }


def build_routes_report():
    rows = []
    for route in serialize(_routes()):
        summary = route.get('summary') or {}
        rows.append({
            'route_id': route['id'],
            'name': route.get('name'),
            'status': route.get('status'),
            'preference': route.get('preference'),
            'created_at': route.get('created_at'),
            'created_by': route.get('created_by_name'),
            'vehicles': len(route.get('vehicles', [])),
            'orders': len(route.get('order_ids', [])),
            'stops': summary.get('total_stops', 0),
            'distance_km': summary.get('total_distance_km', 0),
            'empty_km': summary.get('empty_km', 0),
            'empty_pct': summary.get('empty_pct', 0),
            'co2_kg': summary.get('co2_kg', 0),
            'cost_gbp': summary.get('estimated_cost_gbp', 0),
            'driving_minutes': summary.get('driving_minutes', 0),
        })
    return {'routes': rows, 'count': len(rows)}


def build_emissions_report():
    group_by = (request.args.get('group_by') or 'vehicle').lower()
    if group_by not in ('vehicle', 'route', 'day', 'preference'):
        return None, 'group_by must be vehicle, route, day or preference'

    buckets = defaultdict(lambda: {'co2_kg': 0.0, 'distance_km': 0.0, 'fuel': 0.0,
                                   'cost_gbp': 0.0, 'routes': 0})
    for route in _routes():
        created = route.get('created_at')
        for vehicle in route.get('vehicles', []):
            if group_by == 'vehicle':
                key = vehicle.get('vehicle_name') or vehicle.get('vehicle_id') or 'Unassigned'
            elif group_by == 'route':
                key = route.get('name') or str(route.get('_id'))
            elif group_by == 'preference':
                key = route.get('preference', 'greenest')
            else:
                key = created.strftime('%Y-%m-%d') if created else 'unknown'
            bucket = buckets[key]
            bucket['co2_kg'] += _metric(vehicle, 'co2_kg')
            bucket['distance_km'] += _metric(vehicle, 'total_distance_km')
            bucket['fuel'] += _metric(vehicle, 'estimated_fuel_l')
            bucket['cost_gbp'] += _metric(vehicle, 'estimated_cost_gbp')
            bucket['routes'] += 1

    rows = []
    for key, values in sorted(buckets.items(), key=lambda kv: -kv[1]['co2_kg']):
        distance = values['distance_km']
        rows.append({
            'group': key,
            'co2_kg': round(values['co2_kg'], 2),
            'distance_km': round(distance, 1),
            'fuel_l': round(values['fuel'], 1),
            'cost_gbp': round(values['cost_gbp'], 2),
            'routes': values['routes'],
            'g_co2_per_km': round((values['co2_kg'] * 1000 / distance) if distance else 0, 1),
        })
    total_co2 = round(sum(r['co2_kg'] for r in rows), 2)
    return {'group_by': group_by, 'rows': rows, 'total_co2_kg': total_co2,
            'trees_equivalent': round(total_co2 / 21.0, 1)}, None


def build_utilisation_report():
    buckets = defaultdict(lambda: {'routes': 0, 'weight': 0.0, 'volume': 0.0, 'distance': 0.0,
                                   'stops': 0.0, 'capacity_kg': 0.0, 'peak_kg': 0.0,
                                   'driving': 0.0, 'type': ''})
    for route in _routes():
        for vehicle in route.get('vehicles', []):
            key = vehicle.get('vehicle_name') or vehicle.get('vehicle_id') or 'Unassigned'
            bucket = buckets[key]
            bucket['routes'] += 1
            bucket['type'] = vehicle.get('vehicle_type', '')
            bucket['weight'] += _metric(vehicle, 'weight_utilisation_pct')
            bucket['volume'] += _metric(vehicle, 'volume_utilisation_pct')
            bucket['distance'] += _metric(vehicle, 'total_distance_km')
            bucket['stops'] += _metric(vehicle, 'total_stops')
            bucket['capacity_kg'] = max(bucket['capacity_kg'], _metric(vehicle, 'capacity_kg'))
            bucket['peak_kg'] = max(bucket['peak_kg'], _metric(vehicle, 'peak_load_kg'))
            bucket['driving'] += _metric(vehicle, 'driving_minutes')

    rows = []
    for key, values in sorted(buckets.items(), key=lambda kv: -kv[1]['distance']):
        runs = values['routes'] or 1
        rows.append({
            'vehicle': key,
            'type': values['type'],
            'routes': values['routes'],
            'avg_weight_utilisation_pct': round(values['weight'] / runs, 1),
            'avg_volume_utilisation_pct': round(values['volume'] / runs, 1),
            'capacity_kg': round(values['capacity_kg'], 1),
            'peak_load_kg': round(values['peak_kg'], 1),
            'distance_km': round(values['distance'], 1),
            'stops': int(values['stops']),
            'driving_hours': round(values['driving'] / 60, 1),
            'km_per_stop': round(values['distance'] / values['stops'], 1) if values['stops'] else 0,
        })
    return {'rows': rows, 'count': len(rows)}


def build_empty_miles_report():
    rows = []
    totals = {'empty_km': 0.0, 'distance_km': 0.0, 'initial_empty_km': 0.0}
    for route in serialize(_routes()):
        for vehicle in route.get('vehicles', []):
            metrics = vehicle.get('metrics') or {}
            distance = float(metrics.get('total_distance_km') or 0)
            empty = float(metrics.get('empty_km') or 0)
            initial = float(metrics.get('initial_empty_km') or 0)
            totals['empty_km'] += empty
            totals['distance_km'] += distance
            totals['initial_empty_km'] += initial
            rows.append({
                'route': route.get('name'),
                'route_id': route['id'],
                'date': route.get('created_at'),
                'vehicle': vehicle.get('vehicle_name'),
                'distance_km': round(distance, 1),
                'loaded_km': round(float(metrics.get('loaded_km') or 0), 1),
                'empty_km': round(empty, 1),
                'empty_miles': round(km_to_miles(empty), 1),
                'empty_pct': round((empty / distance * 100) if distance else 0, 1),
                'repositioning_km': round(initial, 1),
                'repositioning_miles': round(km_to_miles(initial), 1),
                'empty_cost_gbp': round(
                    (empty / distance) * float(metrics.get('estimated_cost_gbp') or 0), 2) if distance else 0,
                'empty_co2_kg': round(
                    (empty / distance) * float(metrics.get('co2_kg') or 0), 2) if distance else 0,
            })
    distance = totals['distance_km']
    return {
        'rows': rows,
        'total_empty_km': round(totals['empty_km'], 1),
        'total_empty_miles': round(km_to_miles(totals['empty_km']), 1),
        'total_distance_km': round(distance, 1),
        'empty_pct': round((totals['empty_km'] / distance * 100) if distance else 0, 1),
        'repositioning_km': round(totals['initial_empty_km'], 1),
        'wasted_cost_gbp': round(sum(r['empty_cost_gbp'] for r in rows), 2),
        'wasted_co2_kg': round(sum(r['empty_co2_kg'] for r in rows), 2),
    }


def build_orders_report():
    date_from, date_to = _period()
    query = {'company': g.company}
    window = {}
    if date_from:
        window['$gte'] = date_from
    if date_to:
        window['$lte'] = date_to
    if window:
        query['created_at'] = window

    docs = serialize(with_retry(lambda: list(get_db().orders.find(query).sort('created_at', -1))))
    by_status = defaultdict(int)
    weight = volume = packages = 0.0
    rows = []
    for doc in docs:
        totals = doc.get('totals') or {}
        by_status[doc.get('status', 'new')] += 1
        weight += float(totals.get('total_weight_kg') or 0)
        volume += float(totals.get('total_volume_m3') or 0)
        packages += float(totals.get('package_count') or 0)
        rows.append({
            'reference': doc.get('reference'),
            'status': doc.get('status'),
            'customer': doc.get('customer_name'),
            'pickup': (doc.get('pickup') or {}).get('name', 'Depot load'),
            'dropoff': (doc.get('dropoff') or {}).get('name'),
            'packages': totals.get('package_count', 0),
            'weight_kg': totals.get('total_weight_kg', 0),
            'volume_m3': totals.get('total_volume_m3', 0),
            'pallets': totals.get('pallets', 0),
            'created_at': doc.get('created_at'),
            'route_id': doc.get('route_id'),
        })
    return {
        'rows': rows, 'count': len(rows), 'by_status': dict(by_status),
        'total_weight_kg': round(weight, 1), 'total_volume_m3': round(volume, 2),
        'total_packages': int(packages),
    }


def build_vehicles_report():
    docs = serialize(with_retry(lambda: list(get_db().vehicles.find({'company': g.company}).sort('name', 1))))
    rows = [{
        'name': doc.get('name'),
        'registration': doc.get('registration'),
        'type': doc.get('type_label') or doc.get('type'),
        'capacity_kg': doc.get('capacity_kg'),
        'capacity_m3': doc.get('capacity_m3'),
        'max_pallets': doc.get('max_pallets'),
        'fuel_type': doc.get('fuel_type'),
        'efficiency': doc.get('fuel_efficiency_km_per_l') or doc.get('kwh_per_km'),
        'cost_per_km': doc.get('cost_per_km'),
        'status': doc.get('status'),
        'driver': doc.get('driver_name'),
    } for doc in docs]
    return {'rows': rows, 'count': len(rows)}


BUILDERS = {
    'summary': lambda: (build_summary(), None),
    'routes': lambda: (build_routes_report(), None),
    'emissions': build_emissions_report,
    'utilisation': lambda: (build_utilisation_report(), None),
    'empty-miles': lambda: (build_empty_miles_report(), None),
    'orders': lambda: (build_orders_report(), None),
    'vehicles': lambda: (build_vehicles_report(), None),
}


@reports_bp.route('/reports', methods=['GET'])
@auth_required()
def list_reports():
    return ok({'reports': [
        {'id': 'summary', 'name': 'Operations summary',
         'description': 'Distance, cost, CO₂, utilisation and order counts for the period'},
        {'id': 'routes', 'name': 'Route log', 'description': 'Every planned route with its key metrics'},
        {'id': 'emissions', 'name': 'Emissions', 'description': 'CO₂ grouped by vehicle, route, day or objective'},
        {'id': 'utilisation', 'name': 'Fleet utilisation', 'description': 'Capacity used per vehicle'},
        {'id': 'empty-miles', 'name': 'Empty running', 'description': 'Unloaded distance, cost and CO₂'},
        {'id': 'orders', 'name': 'Orders', 'description': 'Order volumes, weights and status mix'},
        {'id': 'vehicles', 'name': 'Fleet register', 'description': 'Vehicle specifications and costs'},
    ]})


@reports_bp.route('/reports/<report_id>', methods=['GET'])
@auth_required()
def get_report(report_id):
    builder = BUILDERS.get(report_id)
    if not builder:
        return error(f"Unknown report '{report_id}'. Available: {', '.join(REPORTS)}", 404)
    data, failure = builder()
    if failure:
        return error(failure, 400)
    return ok({'report': report_id, 'data': data})


@reports_bp.route('/reports/<report_id>/export.csv', methods=['GET'])
@auth_required()
def export_report(report_id):
    builder = BUILDERS.get(report_id)
    if not builder:
        return error(f"Unknown report '{report_id}'", 404)
    data, failure = builder()
    if failure:
        return error(failure, 400)

    if report_id == 'summary':
        header = ['metric', 'value']
        rows = [[key, value] for key, value in data.items() if not isinstance(value, dict)]
        rows.extend([[f'orders_{k}', v] for k, v in (data.get('orders') or {}).items()])
    else:
        records = data.get('rows') or data.get('routes') or []
        if not records:
            header, rows = ['message'], [['No data for the selected period']]
        else:
            header = list(records[0].keys())
            rows = [[record.get(key, '') for key in header] for record in records]
    return csv_response(f'optigo-{report_id}.csv', header, rows)


# --------------------------------------------------------------------------
# Legacy dashboard endpoints
# --------------------------------------------------------------------------

@reports_bp.route('/company-stats', methods=['GET'])
@auth_required()
def company_stats():
    db = get_db()
    company = with_retry(lambda: db.companies.find_one({'name': g.company})) or {}
    routes = with_retry(lambda: list(db.routes.find({'company': g.company})))

    planned_co2 = sum(float((r.get('summary') or {}).get('co2_kg') or 0) for r in routes)
    distance = sum(float((r.get('summary') or {}).get('total_distance_km') or 0) for r in routes)
    empty = sum(float((r.get('summary') or {}).get('empty_km') or 0) for r in routes)
    return ok({
        'company_name': g.company,
        'total_emission': round(company.get('total_emission', 0) or planned_co2, 2),
        'planned_emission': round(planned_co2, 2),
        'num_depots': with_retry(lambda: db.depots.count_documents({'company': g.company})),
        'num_drivers': with_retry(lambda: db.users.count_documents(
            {'company_name': g.company, 'user_type': 'driver'})),
        'num_vehicles': with_retry(lambda: db.vehicles.count_documents({'company': g.company})),
        'num_orders': with_retry(lambda: db.orders.count_documents({'company': g.company})),
        'total_routes': len(routes),
        'total_distance_km': round(distance, 1),
        'empty_km': round(empty, 1),
        'empty_pct': round((empty / distance * 100) if distance else 0, 1),
    })


@reports_bp.route('/add-emission', methods=['POST'])
@auth_required()
def add_emission():
    emission = (json_body() or {}).get('emission', 0)
    try:
        emission = float(emission)
    except (TypeError, ValueError):
        return error('Emission must be a number', 400)
    with_retry(lambda: get_db().companies.update_one(
        {'name': g.company}, {'$inc': {'total_emission': emission}}, upsert=True))
    return ok({'message': 'Emission updated'})
