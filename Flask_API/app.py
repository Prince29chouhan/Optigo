"""OptiGo API — application factory and wiring.

Run locally with `python app.py`, or in production with
`gunicorn "app:create_app()"`.

Route groups
------------
    /                       service banner
    /health                 liveness + dependency status
    /register, /login       account access
    /auth/*                 profile + password
    /depots, /locations     location catalog (company + GNN dataset)
    /vehicles               fleet register
    /orders                 orders with package detail
    /plan, /routes          planning, saved routes, resequencing
    /reports/*              operational reporting + CSV export
    /settings, /api-keys    user settings and integration keys
    /api/v1/*               the same resources for API-key integrations
"""
import logging
import os
import threading

from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

import db as database
from gnn import service as gnn_service
from api_auth import auth_bp
from api_locations import locations_bp
from api_orders import orders_bp
from api_planning import planning_bp
from api_reports import reports_bp
from api_settings import settings_bp
from api_vehicles import vehicles_bp
from catalog import LocationError
from config import Config
from db import DatabaseUnavailable
from web import ValidationError

logging.basicConfig(
    level=os.environ.get('LOG_LEVEL', 'INFO'),
    format='%(asctime)s %(levelname)s %(name)s: %(message)s',
)
log = logging.getLogger('optigo')

API_VERSION = '2.0'

# Blueprints that are also exposed under /api/v1 for integrations.
PUBLIC_BLUEPRINTS = (
    ('locations', locations_bp),
    ('vehicles', vehicles_bp),
    ('orders', orders_bp),
    ('planning', planning_bp),
    ('reports', reports_bp),
)


def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = Config.SECRET_KEY
    app.config['JSON_SORT_KEYS'] = False

    origins = [o.strip() for o in Config.CORS_ORIGINS.split(',')] if Config.CORS_ORIGINS != '*' else '*'
    CORS(app, resources={r'/*': {'origins': origins}},
         allow_headers=['Content-Type', 'Authorization', 'X-API-Key'],
         methods=['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])

    for blueprint in (auth_bp, locations_bp, vehicles_bp, orders_bp,
                      planning_bp, reports_bp, settings_bp):
        app.register_blueprint(blueprint)
    for name, blueprint in PUBLIC_BLUEPRINTS:
        app.register_blueprint(blueprint, url_prefix='/api/v1', name=f'{name}_v1')

    _register_error_handlers(app)
    _register_meta_routes(app)

    # Index creation and model warm-up must never delay the first request.
    threading.Thread(target=database.ensure_indexes, name='ensure-indexes', daemon=True).start()
    if Config.EAGER_MODEL_LOAD:
        gnn_service.warm_up_async()

    log.info('OptiGo API %s ready', API_VERSION)
    return app


def _register_error_handlers(app):
    @app.errorhandler(ValidationError)
    def _validation(exc):
        payload = {'error': exc.message, 'message': exc.message}
        if exc.field:
            payload['field'] = exc.field
        return jsonify(payload), 400

    @app.errorhandler(LocationError)
    def _location(exc):
        return jsonify({'error': str(exc), 'message': str(exc)}), 400

    @app.errorhandler(DatabaseUnavailable)
    def _database(exc):
        log.error('Database unavailable: %s', exc)
        message = 'The database is temporarily unreachable. Please try again in a moment.'
        return jsonify({'error': message, 'message': message, 'retryable': True}), 503

    @app.errorhandler(HTTPException)
    def _http(exc):
        return jsonify({'error': exc.description, 'message': exc.description}), exc.code

    @app.errorhandler(Exception)
    def _unexpected(exc):
        log.exception('Unhandled error on %s %s', request.method, request.path)
        message = 'Something went wrong on our side. Please try again.'
        return jsonify({'error': message, 'message': message,
                        'detail': str(exc) if app.debug else None}), 500


def _register_meta_routes(app):
    @app.route('/', methods=['GET'])
    def index():
        return jsonify({
            'service': 'OptiGo API',
            'version': API_VERSION,
            'docs': '/api/v1',
            'health': '/health',
        })

    @app.route('/health', methods=['GET'])
    def health():
        db_ok = database.ping()
        payload = {
            'status': 'ok' if db_ok else 'degraded',
            'database': 'up' if db_ok else 'down',
            'gnn': gnn_service.status(),
            'version': API_VERSION,
        }
        return jsonify(payload), 200 if db_ok else 503

    @app.route('/api/v1', methods=['GET'])
    def api_index():
        return jsonify({
            'version': API_VERSION,
            'authentication': {
                'jwt': 'Authorization: Bearer <token from POST /login>',
                'api_key': 'X-API-Key: <key from POST /api-keys>',
            },
            'resources': {
                'locations': {
                    'GET /api/v1/locations': 'List company depots and trained-network locations',
                    'POST /api/v1/locations': 'Create a location',
                    'PATCH /api/v1/locations/<id>': 'Update a location',
                    'DELETE /api/v1/locations/<id>': 'Delete a location',
                },
                'vehicles': {
                    'GET /api/v1/vehicles': 'List fleet',
                    'POST /api/v1/vehicles': 'Create a vehicle (capacity, dimensions, type, costs)',
                    'PATCH /api/v1/vehicles/<id>': 'Update a vehicle',
                },
                'orders': {
                    'GET /api/v1/orders': 'List orders (filter: status, reference, from, to, unplanned)',
                    'POST /api/v1/orders': 'Create one order, or many via {"orders": [...]}',
                    'PATCH /api/v1/orders/<id>': 'Update an order',
                    'POST /api/v1/orders/<id>/status': 'Set order status',
                    'GET /api/v1/orders/export.csv': 'CSV export',
                },
                'planning': {
                    'POST /api/v1/plan': 'Plan routes for vehicles + orders/stops',
                    'POST /api/v1/routes': 'Save a plan',
                    'GET /api/v1/routes': 'List saved routes',
                    'POST /api/v1/routes/<id>/resequence': 'Re-order stops and re-cost',
                    'PATCH /api/v1/routes/<id>': 'Rename or change status (dispatch/complete)',
                },
                'reports': {
                    'GET /api/v1/reports': 'List available reports',
                    'GET /api/v1/reports/<id>': 'summary | routes | emissions | utilisation | empty-miles | orders | vehicles',
                    'GET /api/v1/reports/<id>/export.csv': 'CSV export',
                },
            },
            'example_order': {
                'reference': 'ORD-1001',
                'customer_name': 'Northern Foods',
                'priority': 2,
                'pickup': {'location_id': '<depot id or "Leeds RDC">', 'window_start': '08:00',
                           'window_end': '12:00', 'service_minutes': 20},
                'dropoff': {'lat': 53.4808, 'lon': -2.2426, 'name': 'Manchester RDC',
                            'window_start': '13:00', 'window_end': '17:00'},
                'packages': [{'description': 'Chilled pallets', 'package_type': 'pallet',
                              'quantity': 4, 'weight_kg': 250, 'length_cm': 120, 'width_cm': 100,
                              'height_cm': 150, 'temperature_controlled': True, 'temp_max_c': 4}],
            },
            'example_plan': {
                'preference': 'greenest',
                'vehicle_ids': ['<vehicle id>'],
                'order_ids': ['<order id>'],
                'stops': [{'type': 'rest', 'location_id': 'Wetherby Services', 'service_minutes': 45}],
                'options': {'optimize_sequence': True, 'auto_breaks': True, 'return_to_start': True},
                'save': True,
            },
        })


app = create_app()


if __name__ == '__main__':
    port = int(os.environ.get('PORT', Config.PORT))
    app.run(host='0.0.0.0', port=port, debug=os.environ.get('FLASK_DEBUG') == '1')
