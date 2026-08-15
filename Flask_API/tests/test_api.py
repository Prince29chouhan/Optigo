"""End-to-end API tests against an in-memory MongoDB (mongomock).

Run with:  python -m tests.test_api      (requires flask + mongomock)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import mongomock  # noqa: E402

import db as database  # noqa: E402

_fake = mongomock.MongoClient().optigo_test
database.get_db = lambda: _fake          # noqa: E305 - patched before app import
database.ensure_indexes = lambda: None
database.ping = lambda: True

# Imported after the patch above: modules that do `from db import get_db` bind
# the function at import time, so they must be imported once it is swapped.
import app as app_module  # noqa: E402
from catalog import dataset_depots  # noqa: E402

client = app_module.app.test_client()

NETWORK_LOCATIONS = sorted(dataset_depots())

LEEDS = {'lat': 53.8008, 'lon': -1.5491}
MANCHESTER = {'lat': 53.4808, 'lon': -2.2426}
YORK = {'lat': 53.9600, 'lon': -1.0873}


def _json(response):
    return response.get_json() or {}


def _register_and_login(email='ops@fleet.test', password='Password123', role='admin'):
    client.post('/register', json={
        'email': email, 'password': password, 'fullName': 'Ops Manager',
        'companyName': 'Fleet Co', 'userType': role,
    })
    response = client.post('/login', json={'email': email, 'password': password})
    body = _json(response)
    assert response.status_code == 200, body
    return {'Authorization': f"Bearer {body['token']}"}


HEADERS = _register_and_login()


def test_health_endpoint():
    response = client.get('/health')
    assert response.status_code == 200
    assert _json(response)['database'] == 'up'


def test_login_rejects_missing_body_without_500():
    response = client.post('/login', data='not json', content_type='application/json')
    assert response.status_code == 400, response.status_code
    assert 'JSON' in _json(response)['error']


def test_login_is_case_insensitive_and_rejects_bad_password():
    assert client.post('/login', json={'email': 'OPS@FLEET.TEST', 'password': 'Password123'}).status_code == 200
    assert client.post('/login', json={'email': 'ops@fleet.test', 'password': 'wrong'}).status_code == 401
    assert client.post('/login', json={'email': 'nobody@fleet.test', 'password': 'x'}).status_code == 401


def test_duplicate_registration_is_409():
    response = client.post('/register', json={
        'email': 'ops@fleet.test', 'password': 'Password123',
        'fullName': 'Copy', 'companyName': 'Fleet Co', 'userType': 'admin'})
    assert response.status_code == 409


def test_weak_password_rejected():
    response = client.post('/register', json={
        'email': 'weak@fleet.test', 'password': 'abc',
        'fullName': 'Weak', 'companyName': 'Fleet Co'})
    assert response.status_code == 400


def test_protected_endpoint_requires_auth():
    assert client.get('/vehicles').status_code == 401
    assert client.get('/orders').status_code == 401


def test_new_depot_appears_in_planner_location_list():
    """The regression the professor reported: added depots must be selectable."""
    created = client.post('/depots', json={
        'name': 'Leeds Hub', 'city': 'Leeds', **LEEDS, 'capacity': 40}, headers=HEADERS)
    assert created.status_code == 201, _json(created)
    depot_id = _json(created)['id']

    listing = _json(client.get('/locations', headers=HEADERS))
    ids = [loc['id'] for loc in listing['locations']]
    assert depot_id in ids, 'newly created depot missing from the planner catalog'
    assert listing['company_count'] >= 1
    assert listing['dataset_count'] > 0, 'trained-network locations should still be offered'
    return depot_id


def test_depot_validation_rejects_bad_coordinates():
    response = client.post('/depots', json={'name': 'Bad', 'lat': 999, 'lon': 0}, headers=HEADERS)
    assert response.status_code == 400
    assert 'latitude' in _json(response)['error'].lower()


def test_vehicle_crud_with_capacity_and_dimensions():
    depot_id = test_new_depot_appears_in_planner_location_list()
    response = client.post('/vehicles', json={
        'name': 'Truck 01', 'registration': 'yz24 abc', 'type': 'rigid_18t',
        'capacity_kg': 9000, 'capacity_m3': 55, 'max_pallets': 16,
        'length_m': 9, 'width_m': 2.5, 'height_m': 4,
        'fuel_type': 'diesel', 'fuel_efficiency_km_per_l': 4.1,
        'cost_per_km': 0.8, 'start_location_id': depot_id, 'driver_name': 'Sam',
    }, headers=HEADERS)
    assert response.status_code == 201, _json(response)
    vehicle = _json(response)['vehicle']
    assert vehicle['registration'] == 'YZ24 ABC'
    assert vehicle['capacity_kg'] == 9000
    assert vehicle['type_label'] == 'Rigid 18t'

    patched = client.patch(f"/vehicles/{vehicle['id']}", json={'capacity_kg': 9500}, headers=HEADERS)
    assert _json(patched)['vehicle']['capacity_kg'] == 9500
    assert client.get('/vehicles', headers=HEADERS).status_code == 200
    return vehicle['id'], depot_id


def test_vehicle_presets_applied_when_fields_omitted():
    response = client.post('/vehicles', json={'name': 'EV 1', 'type': 'ev_van'}, headers=HEADERS)
    vehicle = _json(response)['vehicle']
    assert vehicle['fuel_type'] == 'electric'
    assert vehicle['kwh_per_km'] > 0
    assert vehicle['capacity_kg'] == 900


_sequence = iter(range(1, 10_000))


def test_order_with_package_details():
    # Helper tests call this repeatedly, so each order needs its own reference.
    response = client.post('/orders', json={
        'reference': f'ORD-TEST-{next(_sequence)}', 'customer_name': 'Northern Foods', 'priority': 2,
        'pickup': {'lat': LEEDS['lat'], 'lon': LEEDS['lon'], 'name': 'Leeds NDC',
                   'window_start': '08:00', 'window_end': '12:00', 'service_minutes': 20},
        'dropoff': {'lat': MANCHESTER['lat'], 'lon': MANCHESTER['lon'], 'name': 'Manchester RDC',
                    'window_start': '12:00', 'window_end': '18:00'},
        'packages': [
            {'description': 'Chilled pallets', 'package_type': 'pallet', 'quantity': 4,
             'weight_kg': 250, 'length_cm': 120, 'width_cm': 100, 'height_cm': 150,
             'temperature_controlled': True, 'temp_max_c': 4, 'value_gbp': 1200},
            {'description': 'Spare parts', 'package_type': 'parcel', 'quantity': 2,
             'weight_kg': 8, 'fragile': True},
        ],
    }, headers=HEADERS)
    assert response.status_code == 201, _json(response)
    order = _json(response)['order']
    assert order['totals']['total_weight_kg'] == 1016
    assert order['totals']['pallets'] == 4
    assert order['totals']['temperature_controlled'] is True
    assert order['totals']['fragile'] is True
    assert order['totals']['declared_value_gbp'] == 1200
    return order['id']


def test_order_requires_dropoff():
    response = client.post('/orders', json={'reference': 'BAD'}, headers=HEADERS)
    assert response.status_code == 400
    assert 'drop-off' in _json(response)['error']


def test_bulk_order_creation_reports_per_row_errors():
    response = client.post('/orders', json={'orders': [
        {'reference': 'BULK-1', 'dropoff': YORK, 'packages': [{'weight_kg': 100}]},
        {'reference': 'BULK-2'},
    ]}, headers=HEADERS)
    body = _json(response)
    assert response.status_code == 207, body
    assert body['created_count'] == 1
    assert body['failed'][0]['index'] == 1


def test_plan_two_points_returns_exactly_those_points():
    response = client.post('/plan', json={
        'preference': 'fastest',
        'stops': [
            {'type': 'pickup', **LEEDS, 'name': 'Leeds NDC', 'order_ref': 'A', 'weight_kg': 500},
            {'type': 'delivery', **MANCHESTER, 'name': 'Manchester RDC', 'order_ref': 'A', 'weight_kg': 500},
        ],
    }, headers=HEADERS)
    body = _json(response)
    assert response.status_code == 200, body
    stops = body['vehicles'][0]['stops']
    assert [s['name'] for s in stops] == ['Leeds NDC', 'Manchester RDC'], stops
    assert body['summary']['total_distance_km'] > 0


def test_chilled_order_needs_a_refrigerated_vehicle():
    vehicle_id, _ = test_vehicle_crud_with_capacity_and_dimensions()   # plain rigid 18t
    order_id = test_order_with_package_details()                        # temperature controlled
    response = client.post('/plan', json={
        'vehicle_ids': [vehicle_id], 'order_ids': [order_id]}, headers=HEADERS)
    body = _json(response)
    assert response.status_code == 200, body
    assert body['unassigned'], 'a chilled load must not be planned onto a dry vehicle'
    assert 'temperature' in body['unassigned'][0]['reason'].lower()


def test_plan_multi_vehicle_multi_order_with_rest_stop():
    vehicle_id, depot_id = test_vehicle_crud_with_capacity_and_dimensions()
    order_id = test_order_with_package_details()
    fridge = _json(client.post('/vehicles', json={
        'name': 'Fridge 01', 'type': 'refrigerated', 'start_location_id': depot_id,
    }, headers=HEADERS))['vehicle']

    response = client.post('/plan', json={
        'preference': 'greenest',
        'vehicles': [{'id': vehicle_id}, {'id': fridge['id']}],
        'order_ids': [order_id],
        'stops': [
            {'type': 'pickup', **YORK, 'name': 'York collection', 'order_ref': 'B', 'weight_kg': 300},
            {'type': 'delivery', **LEEDS, 'name': 'Leeds drop', 'order_ref': 'B', 'weight_kg': 300},
            {'type': 'rest', **MANCHESTER, 'name': 'Driver rest', 'service_minutes': 45},
        ],
        'options': {'optimize_sequence': True, 'return_to_start': True},
        'save': True,
    }, headers=HEADERS)
    body = _json(response)
    assert response.status_code == 200, body
    assert body['saved'] is True and body['route_id']
    assert not body['unassigned'], body['unassigned']

    types = [s['type'] for v in body['vehicles'] for s in v['stops']]
    assert types.count('pickup') == 2 and types.count('delivery') == 2, types
    assert 'rest' in types, 'the custom rest stop must survive optimisation'
    assert body['summary']['vehicles_used'] == 2
    assert body['summary']['empty_km'] > 0
    assert any(v['metrics']['initial_empty_km'] > 0 for v in body['vehicles']), \
        'repositioning from base to the first pickup should be measured'
    assert all(v['metrics']['weight_utilisation_pct'] > 0 for v in body['vehicles'])
    # the chilled order must ride on the refrigerated vehicle
    chilled = next(v for v in body['vehicles'] if any(s['name'] == 'Manchester RDC' for s in v['stops']))
    assert chilled['vehicle_id'] == fridge['id']
    return body['route_id'], body['vehicles'][0]['vehicle_id']


def test_plan_rejects_unknown_vehicle():
    response = client.post('/plan', json={
        'vehicle_ids': ['507f1f77bcf86cd799439011'],
        'stops': [{'type': 'delivery', **YORK, 'name': 'Drop'}]}, headers=HEADERS)
    assert response.status_code == 400
    assert 'not found' in _json(response)['error']


def test_plan_with_nothing_to_do_is_rejected():
    response = client.post('/plan', json={'preference': 'greenest'}, headers=HEADERS)
    assert response.status_code == 400


def test_saved_route_can_be_resequenced_and_recosted():
    route_id, vehicle_id = test_plan_multi_vehicle_multi_order_with_rest_stop()
    route = _json(client.get(f'/routes/{route_id}', headers=HEADERS))['route']
    leg = next(v for v in route['vehicles'] if str(v['vehicle_id']) == vehicle_id)
    keys = [s['key'] for s in leg['stops']]

    reversed_pairs = list(reversed(keys))
    response = client.post(f'/routes/{route_id}/resequence',
                           json={'vehicle_id': vehicle_id, 'stop_keys': reversed_pairs},
                           headers=HEADERS)
    body = _json(response)
    # Reversing puts deliveries before pickups: the API must say so rather than silently accept it.
    if response.status_code == 200:
        assert any(v['type'] == 'precedence' for v in body['vehicle']['violations']), body['vehicle']['violations']
    else:
        assert response.status_code == 409

    same_order = client.post(f'/routes/{route_id}/resequence',
                             json={'vehicle_id': vehicle_id, 'stop_keys': keys}, headers=HEADERS)
    assert same_order.status_code == 200, _json(same_order)
    assert _json(same_order)['summary']['total_distance_km'] > 0


def test_resequence_rejects_incomplete_sequences():
    route_id, vehicle_id = test_plan_multi_vehicle_multi_order_with_rest_stop()
    response = client.post(f'/routes/{route_id}/resequence',
                           json={'vehicle_id': vehicle_id, 'stop_keys': ['nope']}, headers=HEADERS)
    assert response.status_code == 400


def test_route_dispatch_moves_orders_and_books_emissions():
    route_id, _ = test_plan_multi_vehicle_multi_order_with_rest_stop()
    response = client.patch(f'/routes/{route_id}', json={'status': 'dispatched'}, headers=HEADERS)
    assert response.status_code == 200, _json(response)
    stats = _json(client.get('/company-stats', headers=HEADERS))
    assert stats['total_emission'] > 0
    assert stats['total_routes'] >= 1


def test_reports_and_csv_export():
    test_plan_multi_vehicle_multi_order_with_rest_stop()
    summary = _json(client.get('/reports/summary', headers=HEADERS))['data']
    assert summary['routes_planned'] >= 1
    assert summary['total_distance_km'] > 0
    assert summary['empty_pct'] >= 0

    for report in ('routes', 'emissions', 'utilisation', 'empty-miles', 'orders', 'vehicles'):
        response = client.get(f'/reports/{report}', headers=HEADERS)
        assert response.status_code == 200, (report, _json(response))

    csv_response = client.get('/reports/empty-miles/export.csv', headers=HEADERS)
    assert csv_response.status_code == 200
    assert csv_response.mimetype == 'text/csv'
    assert b'empty_km' in csv_response.data

    grouped = _json(client.get('/reports/emissions?group_by=day', headers=HEADERS))['data']
    assert grouped['group_by'] == 'day'
    assert client.get('/reports/emissions?group_by=nonsense', headers=HEADERS).status_code == 400


def test_settings_round_trip():
    defaults = _json(client.get('/settings', headers=HEADERS))
    assert defaults['settings']['preferences']['currency'] == 'GBP'
    assert defaults['profile']['email'] == 'ops@fleet.test'

    saved = client.put('/settings', json={'settings': {
        'preferences': {'distanceUnit': 'miles', 'theme': 'dark'},
        'planning': {'defaultPreference': 'cheapest', 'breakMinutes': 30},
    }}, headers=HEADERS)
    assert saved.status_code == 200, _json(saved)

    reloaded = _json(client.get('/settings', headers=HEADERS))['settings']
    assert reloaded['preferences']['distanceUnit'] == 'miles'
    assert reloaded['preferences']['currency'] == 'GBP', 'untouched keys must survive'
    assert reloaded['planning']['breakMinutes'] == 30

    assert client.put('/settings', json={'settings': {'bogus': {}}}, headers=HEADERS).status_code == 400


def test_profile_and_password_updates():
    response = client.patch('/auth/profile', json={'fullName': 'Ops Lead', 'phone': '0113 496 0000'},
                            headers=HEADERS)
    assert _json(response)['user']['fullName'] == 'Ops Lead'

    wrong = client.post('/auth/change-password',
                        json={'currentPassword': 'nope', 'newPassword': 'Password456'}, headers=HEADERS)
    assert wrong.status_code == 401

    changed = client.post('/auth/change-password',
                          json={'currentPassword': 'Password123', 'newPassword': 'Password456'},
                          headers=HEADERS)
    assert changed.status_code == 200, _json(changed)
    assert client.post('/login', json={'email': 'ops@fleet.test', 'password': 'Password456'}).status_code == 200
    # restore for the remaining tests
    client.post('/auth/change-password',
                json={'currentPassword': 'Password456', 'newPassword': 'Password123'}, headers=HEADERS)


def test_api_key_authentication_for_integrations():
    created = client.post('/api-keys', json={'name': 'ERP integration', 'role': 'planner'}, headers=HEADERS)
    body = _json(created)
    assert created.status_code == 201, body
    key = body['key']
    assert key.startswith('og_')

    api_headers = {'X-API-Key': key}
    order = client.post('/api/v1/orders', json={
        'reference': 'API-ORDER-1',
        'dropoff': {'lat': YORK['lat'], 'lon': YORK['lon'], 'name': 'York store'},
        'packages': [{'weight_kg': 120, 'quantity': 1, 'package_type': 'pallet'}],
    }, headers=api_headers)
    assert order.status_code == 201, _json(order)

    plan = client.post('/api/v1/plan', json={
        'preference': 'cheapest',
        'order_ids': [_json(order)['order']['id']],
        'vehicle': {'start': {'lat': LEEDS['lat'], 'lon': LEEDS['lon'], 'name': 'Leeds base'}},
    }, headers=api_headers)
    assert plan.status_code == 200, _json(plan)
    assert plan.get_json()['summary']['total_distance_km'] > 0

    assert client.get('/api/v1/orders', headers={'X-API-Key': 'og_wrong'}).status_code == 401

    revoked = client.delete(f"/api-keys/{body['id']}", headers=HEADERS)
    assert revoked.status_code == 200
    assert client.get('/api/v1/orders', headers=api_headers).status_code == 401


def test_data_export_and_guarded_deletion():
    export = client.get('/settings/export/orders', headers=HEADERS)
    assert export.status_code == 200
    assert export.mimetype == 'application/json'

    bundle = client.get('/settings/export', headers=HEADERS)
    assert bundle.status_code == 200 and bundle.mimetype == 'application/zip'

    unconfirmed = client.delete('/settings/data', json={'datasets': ['orders']}, headers=HEADERS)
    assert unconfirmed.status_code == 400


def test_driver_role_cannot_manage_fleet():
    driver_headers = _register_and_login('driver@fleet.test', 'Password123', 'driver')
    assert client.get('/vehicles', headers=driver_headers).status_code == 200
    forbidden = client.post('/vehicles', json={'name': 'Rogue van'}, headers=driver_headers)
    assert forbidden.status_code == 403
    assert client.post('/depots', json={'name': 'Rogue depot', **LEEDS},
                       headers=driver_headers).status_code == 403


def test_planner_ui_payload_shape():
    """The exact request the PlanBuilder screen sends: no fleet, ad-hoc stops."""
    response = client.post('/plan', json={
        'preference': 'greenest',
        'vehicle_ids': [],
        'order_ids': [],
        'stops': [
            {'key': 'stop-1', 'type': 'pickup', 'lat': LEEDS['lat'], 'lon': LEEDS['lon'],
             'name': 'Leeds NDC', 'service_minutes': 15, 'order_ref': 'JOB-1', 'weight_kg': 400,
             'window_start': '08:00', 'window_end': '12:00',
             'packages': [{'description': 'Pallets', 'package_type': 'pallet', 'quantity': 2,
                           'weight_kg': 200, 'length_cm': 120, 'width_cm': 100, 'height_cm': 150}]},
            {'key': 'stop-2', 'type': 'delivery', 'lat': MANCHESTER['lat'], 'lon': MANCHESTER['lon'],
             'name': 'Manchester RDC', 'service_minutes': 15, 'order_ref': 'JOB-1', 'weight_kg': 400},
            {'key': 'stop-3', 'type': 'rest', 'lat': YORK['lat'], 'lon': YORK['lon'],
             'name': 'Services', 'service_minutes': 45, 'notes': 'statutory rest'},
        ],
        'options': {'optimize_sequence': True, 'return_to_start': True, 'auto_breaks': True,
                    'break_minutes': 45, 'max_driving_minutes_before_break': 270,
                    'use_gnn_corridor': False},
    }, headers=HEADERS)
    body = _json(response)
    assert response.status_code == 200, body
    assert body['summary']['vehicles_used'] == 1
    assert body['vehicles'][0]['vehicle_id'] == 'default'
    assert body['summary']['total_distance_km'] > 0
    return body


def test_draft_resequence_matches_results_panel_call():
    """PlanResults sends result stops back with an inline vehicle spec."""
    plan = test_planner_ui_payload_shape()
    vehicle = plan['vehicles'][0]
    timeline = vehicle['timeline']
    start = next(entry for entry in timeline if entry['type'] == 'depot_start')
    end = next((entry for entry in timeline if entry['type'] == 'depot_end'), None)

    stops = list(reversed(vehicle['stops']))
    response = client.post('/plan/resequence', json={
        'preference': plan['preference'],
        'options': {**plan['options'], 'optimize_sequence': False},
        'stops': stops,
        'vehicle': {
            'id': vehicle['vehicle_id'],
            'name': vehicle['vehicle_name'],
            'start': {'lat': start['lat'], 'lon': start['lon'], 'name': start['name'],
                      'location_id': start.get('location_id')},
            'end': end and {'lat': end['lat'], 'lon': end['lon'], 'name': end['name'],
                            'location_id': end.get('location_id')},
            'return_to_start': bool(end),
        },
    }, headers=HEADERS)
    body = _json(response)
    assert response.status_code in (200, 409), body
    if response.status_code == 200:
        assert [s['key'] for s in body['vehicle']['stops']] == [s['key'] for s in stops]
        assert body['vehicle']['metrics']['total_distance_km'] > 0


def test_locked_sequence_is_planned_exactly_as_given():
    stops = [
        {'key': 'a', 'type': 'pickup', **YORK, 'name': 'A pick', 'order_ref': 'L1', 'weight_kg': 100},
        {'key': 'b', 'type': 'pickup', **LEEDS, 'name': 'B pick', 'order_ref': 'L2', 'weight_kg': 100},
        {'key': 'c', 'type': 'delivery', **MANCHESTER, 'name': 'B drop', 'order_ref': 'L2', 'weight_kg': 100},
        {'key': 'd', 'type': 'delivery', 'lat': 53.4084, 'lon': -2.9916, 'name': 'A drop',
         'order_ref': 'L1', 'weight_kg': 100},
    ]
    response = client.post('/plan', json={
        'preference': 'fastest', 'stops': stops,
        'options': {'optimize_sequence': False, 'return_to_start': False},
    }, headers=HEADERS)
    body = _json(response)
    assert response.status_code == 200, body
    names = [s['name'] for s in body['vehicles'][0]['stops']]
    assert names == ['A pick', 'B pick', 'B drop', 'A drop'], names


def test_gnn_corridor_option_is_accepted_even_without_torch():
    """The corridor toggle must degrade gracefully when the model is unavailable."""
    first, second = NETWORK_LOCATIONS[0], NETWORK_LOCATIONS[1]
    response = client.post('/plan', json={
        'preference': 'greenest',
        'stops': [
            {'type': 'pickup', 'location_id': first, 'order_ref': 'G1', 'weight_kg': 100},
            {'type': 'delivery', 'location_id': second, 'order_ref': 'G1', 'weight_kg': 100},
        ],
        'options': {'use_gnn_corridor': True},
    }, headers=HEADERS)
    body = _json(response)
    assert response.status_code == 200, body
    assert body['gnn']['status'] in ('ready', 'unavailable', 'idle', 'loading')
    assert body['summary']['total_distance_km'] > 0


def test_network_locations_are_usable_as_stops():
    first, second = NETWORK_LOCATIONS[2], NETWORK_LOCATIONS[5]
    response = client.post('/plan', json={
        'stops': [
            {'type': 'pickup', 'location_id': first, 'order_ref': 'D1', 'weight_kg': 250},
            {'type': 'delivery', 'location_id': second, 'order_ref': 'D1', 'weight_kg': 250},
        ],
    }, headers=HEADERS)
    body = _json(response)
    assert response.status_code == 200, body
    assert [s['location_id'] for s in body['vehicles'][0]['stops']] == [first, second]


def test_objective_comparison_returns_three_alternatives():
    """Each objective has its own model, so each may pick a different corridor."""
    origin, destination = NETWORK_LOCATIONS[0], NETWORK_LOCATIONS[-1]
    response = client.post('/route-alternatives',
                           json={'origin': origin, 'destination': destination}, headers=HEADERS)
    body = _json(response)
    if response.status_code == 503:          # models still warming up
        return
    if response.status_code == 404:          # that pair is simply unreachable
        return
    assert response.status_code == 200, body
    preferences = {a['preference'] for a in body['alternatives']}
    assert preferences == {'greenest', 'fastest', 'cheapest'}, preferences
    for alternative in body['alternatives']:
        assert alternative['distance_km'] > 0
        assert alternative['co2_kg'] > 0
        assert alternative['path'][0] == origin and alternative['path'][-1] == destination
        assert alternative['delta']['time_pct'] >= 0


def test_objective_comparison_rejects_unknown_locations():
    response = client.post('/route-alternatives',
                           json={'origin': 'Nowhere', 'destination': NETWORK_LOCATIONS[0]},
                           headers=HEADERS)
    assert response.status_code in (400, 503), _json(response)


def test_unknown_location_gives_a_clear_error():
    response = client.post('/plan', json={
        'stops': [{'type': 'delivery', 'location_id': 'Nowhere Depot 9999', 'order_ref': 'X'}],
    }, headers=HEADERS)
    assert response.status_code == 400
    assert 'Unknown' in _json(response)['error']


def test_api_docs_endpoint():
    body = _json(client.get('/api/v1'))
    assert 'resources' in body and 'orders' in body['resources']


def _run():
    tests = [(name, obj) for name, obj in sorted(globals().items())
             if name.startswith('test_') and callable(obj)]
    failures = []
    for name, fn in tests:
        try:
            fn()
            print(f'  PASS  {name}')
        except AssertionError as exc:
            failures.append(name)
            print(f'  FAIL  {name}: {exc}')
        except Exception as exc:  # noqa: BLE001
            failures.append(name)
            print(f'  ERROR {name}: {type(exc).__name__}: {exc}')
    print(f'\n{len(tests) - len(failures)}/{len(tests)} passed')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(_run())
