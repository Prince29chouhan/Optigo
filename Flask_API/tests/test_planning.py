"""Tests for the planning engine (pure Python — run with `python -m tests.test_planning`)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from geo import haversine_km, summarize_packages  # noqa: E402
from vrp import (  # noqa: E402
    DistanceProvider, Job, PlanOptions, Stop, Vehicle, evaluate_route,
    hhmm_to_minutes, minutes_to_hhmm, plan, plan_fixed_sequence,
)

LEEDS = (53.8008, -1.5491)
MANCHESTER = (53.4808, -2.2426)
LIVERPOOL = (53.4084, -2.9916)
YORK = (53.9600, -1.0873)
SHEFFIELD = (53.3811, -1.4701)


def make_vehicle(vid='v1', capacity_kg=2000, capacity_m3=20, start=LEEDS, **kwargs):
    return Vehicle(
        id=vid, name=f'Truck {vid}',
        start=Stop(key=f'{vid}-start', type='depot_start', name='Leeds Depot',
                   lat=start[0], lon=start[1], location_id='depot-leeds'),
        capacity_kg=capacity_kg, capacity_m3=capacity_m3,
        fuel_type='diesel', fuel_efficiency_km_per_l=4.0,
        avg_speed_kmh=60, cost_per_km=0.6, cost_per_hour=16.5,
        **kwargs,
    )


def make_job(order_id, pickup_at, delivery_at, weight=500, volume=4, ref=None, **kwargs):
    pickup = None
    if pickup_at:
        pickup = Stop(key=f'{order_id}-p', type='pickup', name=f'{order_id} pickup',
                      lat=pickup_at[0], lon=pickup_at[1], service_minutes=15,
                      order_id=order_id, order_ref=ref or order_id,
                      weight_kg=weight, volume_m3=volume)
    delivery = Stop(key=f'{order_id}-d', type='delivery', name=f'{order_id} delivery',
                    lat=delivery_at[0], lon=delivery_at[1], service_minutes=15,
                    order_id=order_id, order_ref=ref or order_id,
                    weight_kg=-weight, volume_m3=-volume)
    return Job(order_id=order_id, reference=ref or order_id, pickup=pickup, delivery=delivery,
               weight_kg=weight, volume_m3=volume, **kwargs)


def test_time_helpers():
    assert hhmm_to_minutes('08:30') == 510
    assert hhmm_to_minutes(510) == 510
    assert hhmm_to_minutes('') is None
    assert minutes_to_hhmm(510) == '08:30'
    assert minutes_to_hhmm(1500).startswith('01:00')


def test_single_order_two_points_only():
    """Two selected points must produce exactly those two stops — no invented depots."""
    vehicle = make_vehicle()
    job = make_job('ORD1', MANCHESTER, LIVERPOOL)
    result = plan([vehicle], [job], [], PlanOptions(preference='fastest'))

    assert len(result['vehicles']) == 1
    route = result['vehicles'][0]
    stop_names = [s['name'] for s in route['stops']]
    assert stop_names == ['ORD1 pickup', 'ORD1 delivery'], stop_names
    assert route['metrics']['stop_count'] == 2
    assert not result['unassigned']


def test_empty_miles_measured_from_vehicle_start():
    vehicle = make_vehicle()
    job = make_job('ORD1', MANCHESTER, LIVERPOOL)
    result = plan([vehicle], [job], [], PlanOptions(preference='cheapest'))
    metrics = result['vehicles'][0]['metrics']

    direct = haversine_km(*LEEDS, *MANCHESTER) * 1.28
    assert abs(metrics['initial_empty_km'] - direct) < 1.0, metrics['initial_empty_km']
    # Leeds -> Manchester (empty) and Liverpool -> Leeds (empty after delivery)
    assert metrics['empty_km'] > metrics['initial_empty_km']
    assert metrics['loaded_km'] > 0
    assert metrics['empty_miles'] < metrics['empty_km']
    assert 0 < metrics['empty_pct'] < 100


def test_multi_vehicle_work_is_split_by_geography():
    """Two depots, two clusters of work — the fleet should be used, not one truck."""
    exeter, plymouth = (50.7184, -3.5339), (50.3755, -4.1427)
    vehicles = [make_vehicle('v1', capacity_kg=1000, capacity_m3=10),
                make_vehicle('v2', capacity_kg=1000, capacity_m3=10, start=exeter)]
    jobs = [
        make_job('NORTH-1', YORK, SHEFFIELD, weight=400, volume=4),
        make_job('NORTH-2', LEEDS, MANCHESTER, weight=400, volume=4),
        make_job('SOUTH-1', exeter, plymouth, weight=400, volume=4),
    ]
    result = plan(vehicles, jobs, [], PlanOptions(preference='cheapest'))

    assert not result['unassigned'], result['unassigned']
    assert result['summary']['vehicles_used'] == 2
    by_vehicle = {r['vehicle_id']: {s['order_ref'] for s in r['stops'] if s['order_ref']}
                  for r in result['vehicles']}
    assert 'SOUTH-1' in by_vehicle['v2'], by_vehicle
    assert 'SOUTH-1' not in by_vehicle.get('v1', set())


def test_capacity_respected_across_the_whole_day():
    vehicles = [make_vehicle('v1', capacity_kg=1000, capacity_m3=10)]
    jobs = [
        make_job('A', MANCHESTER, LIVERPOOL, weight=900, volume=8),
        make_job('B', YORK, SHEFFIELD, weight=900, volume=8),
        make_job('C', SHEFFIELD, YORK, weight=800, volume=7),
    ]
    result = plan(vehicles, jobs, [], PlanOptions(preference='greenest'))

    assert not result['unassigned'], result['unassigned']
    for route in result['vehicles']:
        for entry in route['timeline']:
            assert entry['load_kg'] <= 1000 + 1e-6, entry
            assert entry['load_m3'] <= 10 + 1e-6, entry


def test_capacity_overflow_reports_unassigned():
    vehicle = make_vehicle(capacity_kg=500, capacity_m3=5)
    jobs = [make_job('BIG', MANCHESTER, LIVERPOOL, weight=5000, volume=50)]
    result = plan([vehicle], jobs, [], PlanOptions())

    assert result['vehicles'] == []
    assert len(result['unassigned']) == 1
    assert 'capacity' in result['unassigned'][0]['reason'].lower()


def test_pickup_always_before_delivery_after_optimisation():
    vehicle = make_vehicle(capacity_kg=5000, capacity_m3=60)
    jobs = [make_job(f'O{i}', MANCHESTER, LIVERPOOL, weight=200, volume=2) for i in range(4)]
    result = plan([vehicle], jobs, [], PlanOptions(preference='fastest'))
    stops = result['vehicles'][0]['stops']

    seen = set()
    for stop in stops:
        if stop['type'] == 'pickup':
            seen.add(stop['order_id'])
        elif stop['type'] == 'delivery':
            assert stop['order_id'] in seen, f"{stop['order_id']} delivered before pickup"


def test_custom_rest_stop_is_kept_in_the_plan():
    vehicle = make_vehicle()
    rest = Stop(key='rest-1', type='rest', name='Woodall Services',
                lat=53.3400, lon=-1.3200, service_minutes=45, notes='Statutory rest')
    job = make_job('ORD1', MANCHESTER, LIVERPOOL)
    result = plan([vehicle], [job], [rest], PlanOptions(preference='greenest'))

    types = [s['type'] for s in result['vehicles'][0]['stops']]
    assert 'rest' in types
    service = sum(s['service_minutes'] for s in result['vehicles'][0]['stops'])
    assert service >= 45


def test_auto_break_inserted_on_long_driving_day():
    vehicle = make_vehicle(capacity_kg=10000, capacity_m3=90)
    # Lands End -> John o' Groats style long legs force a statutory break.
    job = make_job('LONG', (50.0657, -5.7132), (58.6373, -3.0689), weight=500, volume=5)
    options = PlanOptions(preference='fastest', auto_breaks=True,
                          max_driving_minutes_before_break=270, break_minutes=45)
    result = plan([vehicle], [job], [], options)
    timeline = result['vehicles'][0]['timeline']

    breaks = [t for t in timeline if t['type'] == 'break' and t.get('auto')]
    assert breaks, 'expected an automatic driver break on a very long route'
    assert result['vehicles'][0]['metrics']['break_minutes'] >= 45


def test_locked_sequence_is_respected():
    vehicle = make_vehicle(capacity_kg=5000, capacity_m3=60)
    stops = [
        Stop(key='p1', type='pickup', name='P1', lat=YORK[0], lon=YORK[1],
             order_id='A', order_ref='A', weight_kg=300, volume_m3=3, service_minutes=10),
        Stop(key='p2', type='pickup', name='P2', lat=SHEFFIELD[0], lon=SHEFFIELD[1],
             order_id='B', order_ref='B', weight_kg=300, volume_m3=3, service_minutes=10),
        Stop(key='d2', type='delivery', name='D2', lat=MANCHESTER[0], lon=MANCHESTER[1],
             order_id='B', order_ref='B', weight_kg=-300, volume_m3=-3, service_minutes=10),
        Stop(key='d1', type='delivery', name='D1', lat=LIVERPOOL[0], lon=LIVERPOOL[1],
             order_id='A', order_ref='A', weight_kg=-300, volume_m3=-3, service_minutes=10),
    ]
    result = plan_fixed_sequence(vehicle, stops, PlanOptions(optimize_sequence=False))

    assert result['feasible']
    assert [s['key'] for s in result['stops']] == ['p1', 'p2', 'd2', 'd1']
    assert result['metrics']['peak_load_kg'] == 600


def test_locked_mode_keeps_the_given_order_across_orders():
    vehicle = make_vehicle(capacity_kg=5000, capacity_m3=60)
    jobs = [
        make_job('A', YORK, LIVERPOOL, weight=200, volume=2),
        make_job('B', LEEDS, MANCHESTER, weight=200, volume=2),
    ]
    # Sequence numbers mirror how the API numbers the request payload.
    jobs[0].pickup.sequence, jobs[0].delivery.sequence = 0, 3
    jobs[1].pickup.sequence, jobs[1].delivery.sequence = 1, 2

    result = plan([vehicle], jobs, [], PlanOptions(preference='fastest', optimize_sequence=False))
    keys = [stop['key'] for stop in result['vehicles'][0]['stops']]

    assert keys == ['A-p', 'B-p', 'B-d', 'A-d'], keys


def test_locked_mode_flags_capacity_instead_of_dropping_work():
    vehicle = make_vehicle(capacity_kg=300, capacity_m3=60)
    jobs = [make_job('HEAVY', MANCHESTER, LIVERPOOL, weight=900, volume=2)]
    result = plan([vehicle], jobs, [], PlanOptions(optimize_sequence=False))

    assert result['vehicles'], 'a locked sequence must still be costed'
    violations = result['vehicles'][0]['violations']
    assert any(v['type'] == 'capacity' for v in violations), violations


def test_optimisation_beats_naive_order():
    vehicle = make_vehicle(capacity_kg=5000, capacity_m3=60)
    provider = DistanceProvider()
    naive = [
        Stop(key='p1', type='pickup', name='P1', lat=LIVERPOOL[0], lon=LIVERPOOL[1],
             order_id='A', order_ref='A', weight_kg=200, volume_m3=2),
        Stop(key='d1', type='delivery', name='D1', lat=YORK[0], lon=YORK[1],
             order_id='A', order_ref='A', weight_kg=-200, volume_m3=-2),
        Stop(key='p2', type='pickup', name='P2', lat=MANCHESTER[0], lon=MANCHESTER[1],
             order_id='B', order_ref='B', weight_kg=200, volume_m3=2),
        Stop(key='d2', type='delivery', name='D2', lat=SHEFFIELD[0], lon=SHEFFIELD[1],
             order_id='B', order_ref='B', weight_kg=-200, volume_m3=-2),
    ]
    naive_km = evaluate_route(vehicle, naive, provider, PlanOptions())['metrics']['total_distance_km']

    jobs = [make_job('A', LIVERPOOL, YORK, weight=200, volume=2),
            make_job('B', MANCHESTER, SHEFFIELD, weight=200, volume=2)]
    optimised = plan([vehicle], jobs, [], PlanOptions(preference='fastest'))
    optimised_km = optimised['vehicles'][0]['metrics']['total_distance_km']

    assert optimised_km <= naive_km, (optimised_km, naive_km)


def test_time_window_violation_is_flagged():
    vehicle = make_vehicle()
    job = make_job('ORD1', MANCHESTER, LIVERPOOL)
    job.delivery.window_end = hhmm_to_minutes('08:30')  # impossible
    result = plan([vehicle], [job], [], PlanOptions(preference='fastest'))
    violations = result['vehicles'][0]['violations']

    assert any(v['type'] == 'time_window' for v in violations), violations


def test_delivery_only_order_loads_at_depot():
    vehicle = make_vehicle(capacity_kg=2000, capacity_m3=20)
    job = make_job('DEPOT-LOAD', None, YORK, weight=800, volume=6)
    result = plan([vehicle], [job], [], PlanOptions(preference='cheapest'))
    route = result['vehicles'][0]

    assert route['metrics']['start_load_kg'] == 800
    # Leaving base loaded means the outbound leg is not empty running.
    assert route['legs'][0]['empty'] is False
    assert route['metrics']['initial_empty_km'] == 0


def test_package_summary():
    summary = summarize_packages([
        {'quantity': 2, 'weight_kg': 10, 'length_cm': 100, 'width_cm': 100, 'height_cm': 100,
         'package_type': 'pallet', 'fragile': True, 'value_gbp': 250},
        {'quantity': 1, 'weight_kg': 5, 'volume_m3': 0.5, 'package_type': 'parcel'},
    ])
    assert summary['total_weight_kg'] == 25
    assert summary['total_volume_m3'] == 2.5
    assert summary['pallets'] == 2
    assert summary['fragile'] is True
    assert summary['declared_value_gbp'] == 250


def _run():
    tests = [(name, obj) for name, obj in sorted(globals().items())
             if name.startswith('test_') and callable(obj)]
    failures = []
    for name, fn in tests:
        try:
            fn()
            print(f'  PASS  {name}')
        except AssertionError as exc:
            failures.append((name, exc))
            print(f'  FAIL  {name}: {exc}')
        except Exception as exc:  # noqa: BLE001
            failures.append((name, exc))
            print(f'  ERROR {name}: {type(exc).__name__}: {exc}')
    print(f'\n{len(tests) - len(failures)}/{len(tests)} passed')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(_run())
