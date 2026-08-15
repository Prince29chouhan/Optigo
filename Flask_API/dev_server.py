"""Development server with an in-memory database — no MongoDB install needed.

    python dev_server.py

Starts the full API on http://localhost:5000 backed by mongomock and seeded
with a company, an admin login, depots, vehicles and orders so every screen has
something to show. Data lives in memory only: restarting resets it.

Use `python app.py` with MONGO_URI set for a real database.
"""
import logging
import os

import mongomock

import db as database

# The database has to be swapped before app.py imports anything that touches it.
_memory_db = mongomock.MongoClient().optigo_dev
database.get_db = lambda: _memory_db
database.ensure_indexes = lambda: None
database.ping = lambda: True

from models import normalize_location, normalize_order, normalize_vehicle  # noqa: E402
from security import hash_password  # noqa: E402

log = logging.getLogger('optigo.dev')

COMPANY = 'OptiGo Demo Logistics'
ADMIN = {'email': 'admin@optigo.local', 'password': 'Password123'}
DRIVER = {'email': 'driver@optigo.local', 'password': 'Password123'}

DEPOTS = [
    {'name': 'Leeds NDC', 'city': 'Leeds', 'lat': 53.8008, 'lon': -1.5491, 'capacity': 120,
     'type': 'depot', 'service_minutes': 20},
    {'name': 'Manchester RDC', 'city': 'Manchester', 'lat': 53.4808, 'lon': -2.2426, 'capacity': 90,
     'type': 'warehouse', 'service_minutes': 15},
    {'name': 'Birmingham Hub', 'city': 'Birmingham', 'lat': 52.4862, 'lon': -1.8904, 'capacity': 150,
     'type': 'depot', 'service_minutes': 15},
    {'name': 'Woodall Services', 'city': 'Sheffield', 'lat': 53.3251, 'lon': -1.3170,
     'type': 'rest', 'service_minutes': 45, 'notes': 'Driver break facility'},
]

VEHICLES = [
    {'name': 'Truck 01', 'registration': 'YZ24 ABC', 'type': 'rigid_18t', 'driver_name': 'Sam Patel'},
    {'name': 'Truck 02', 'registration': 'YZ24 DEF', 'type': 'rigid_7_5t', 'driver_name': 'Ana Silva'},
    {'name': 'Fridge 01', 'registration': 'YZ24 GHI', 'type': 'refrigerated', 'driver_name': 'Tom Reid'},
    {'name': 'EV Van 01', 'registration': 'EV24 JKL', 'type': 'ev_van', 'driver_name': 'Priya Shah'},
]

ORDERS = [
    {
        'reference': 'ORD-1001', 'customer_name': 'Northern Foods', 'priority': 2,
        'pickup': {'lat': 53.8008, 'lon': -1.5491, 'name': 'Leeds NDC',
                   'window_start': '08:00', 'window_end': '12:00', 'service_minutes': 20},
        'dropoff': {'lat': 53.4808, 'lon': -2.2426, 'name': 'Manchester RDC',
                    'window_start': '12:00', 'window_end': '17:00'},
        'packages': [{'description': 'Chilled pallets', 'package_type': 'pallet', 'quantity': 4,
                      'weight_kg': 250, 'length_cm': 120, 'width_cm': 100, 'height_cm': 150,
                      'temperature_controlled': True, 'temp_max_c': 4, 'value_gbp': 1800}],
    },
    {
        'reference': 'ORD-1002', 'customer_name': 'Peak Retail', 'priority': 3,
        'pickup': {'lat': 52.4862, 'lon': -1.8904, 'name': 'Birmingham Hub', 'service_minutes': 15},
        'dropoff': {'lat': 52.9548, 'lon': -1.1581, 'name': 'Nottingham store'},
        'packages': [{'description': 'Mixed cages', 'package_type': 'roll_cage', 'quantity': 6,
                      'weight_kg': 120, 'length_cm': 80, 'width_cm': 70, 'height_cm': 180}],
    },
    {
        'reference': 'ORD-1003', 'customer_name': 'York Interiors', 'priority': 1,
        'dropoff': {'lat': 53.9600, 'lon': -1.0873, 'name': 'York showroom',
                    'window_start': '09:00', 'window_end': '11:00'},
        'packages': [{'description': 'Flat-pack furniture (loaded at depot)', 'package_type': 'crate',
                      'quantity': 3, 'weight_kg': 90, 'length_cm': 200, 'width_cm': 60, 'height_cm': 40,
                      'fragile': True}],
    },
    {
        'reference': 'ORD-1004', 'customer_name': 'Coastal Supplies', 'priority': 4,
        'pickup': {'lat': 53.4084, 'lon': -2.9916, 'name': 'Liverpool docks', 'service_minutes': 30},
        'dropoff': {'lat': 53.8008, 'lon': -1.5491, 'name': 'Leeds NDC'},
        'packages': [{'description': 'Container spares', 'package_type': 'parcel', 'quantity': 12,
                      'weight_kg': 15}],
    },
]


def seed():
    db = database.get_db()
    db.companies.insert_one({'name': COMPANY, 'total_emission': 0, 'drivers': [],
                             'created_at': database.utcnow()})

    for account, role, name in ((ADMIN, 'admin', 'Demo Admin'), (DRIVER, 'driver', 'Demo Driver')):
        db.users.insert_one({
            'email': account['email'], 'password': hash_password(account['password']),
            'full_name': name, 'company_name': COMPANY, 'user_type': role,
            'created_at': database.utcnow(), 'updated_at': database.utcnow(),
        })

    depot_ids = {}
    for depot in DEPOTS:
        doc = normalize_location(depot, COMPANY)
        depot_ids[depot['name']] = str(db.depots.insert_one(doc).inserted_id)

    for index, vehicle in enumerate(VEHICLES):
        base = DEPOTS[index % 3]['name']
        doc = normalize_vehicle({**vehicle, 'start_location_id': depot_ids[base]}, COMPANY)
        db.vehicles.insert_one(doc)

    for order in ORDERS:
        db.orders.insert_one(normalize_order(order, COMPANY))

    return depot_ids


if __name__ == '__main__':
    logging.basicConfig(level='INFO', format='%(levelname)s %(name)s: %(message)s')
    seed()

    import app as app_module  # imported after the database swap

    port = int(os.environ.get('PORT', 5000))
    print('\n' + '=' * 68)
    print('  OptiGo development server — in-memory database (data resets on exit)')
    print('=' * 68)
    print(f'  API      : http://localhost:{port}')
    print(f'  Health   : http://localhost:{port}/health')
    print(f'  API docs : http://localhost:{port}/api/v1')
    print(f"  Admin    : {ADMIN['email']} / {ADMIN['password']}")
    print(f"  Driver   : {DRIVER['email']} / {DRIVER['password']}")
    print(f'  Seeded   : {len(DEPOTS)} locations · {len(VEHICLES)} vehicles · {len(ORDERS)} orders')
    print('=' * 68 + '\n')
    app_module.app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
