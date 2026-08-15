"""Central configuration for the OptiGo API.

Every tunable lives here so deployment (Railway / Docker / local) only has to
set environment variables.
"""
import os


def _int(name, default):
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


def _float(name, default):
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return default


class Config:
    # --- Database -------------------------------------------------------
    MONGO_URI = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/logistics_db')
    MONGO_DB_NAME = os.environ.get('MONGO_DB_NAME')  # optional override
    MONGO_TIMEOUT_MS = _int('MONGO_TIMEOUT_MS', 8000)

    # --- Auth -----------------------------------------------------------
    # README historically documented JWT_SECRET while the code used SECRET_KEY;
    # accept either so a deployment configured with one keeps working.
    SECRET_KEY = (
        os.environ.get('SECRET_KEY')
        or os.environ.get('JWT_SECRET')
        or 'optigo-dev-secret-change-in-production'
    )
    TOKEN_TTL_HOURS = _int('TOKEN_TTL_HOURS', 12)
    BCRYPT_ROUNDS = _int('BCRYPT_ROUNDS', 12)

    # --- Models ---------------------------------------------------------
    # Models load in a background thread at boot so the first plan is not slow,
    # while the web worker stays responsive throughout (a blocking load at
    # import time was a cause of intermittent 502s on login). Set to '0' to
    # defer loading until the first request that needs it.
    EAGER_MODEL_LOAD = os.environ.get('EAGER_MODEL_LOAD', '1') == '1'

    # --- Routing / cost model ------------------------------------------
    # Straight-line distance is multiplied by this to approximate road km.
    ROAD_FACTOR = _float('ROAD_FACTOR', 1.28)
    DEFAULT_SPEED_KMH = _float('DEFAULT_SPEED_KMH', 62.0)
    DIESEL_PRICE_GBP = _float('DIESEL_PRICE_GBP', 1.55)
    PETROL_PRICE_GBP = _float('PETROL_PRICE_GBP', 1.48)
    ELECTRICITY_PRICE_GBP_KWH = _float('ELECTRICITY_PRICE_GBP_KWH', 0.28)
    CO2_KG_PER_LITRE_DIESEL = _float('CO2_KG_PER_LITRE_DIESEL', 2.68)
    CO2_KG_PER_LITRE_PETROL = _float('CO2_KG_PER_LITRE_PETROL', 2.31)
    CO2_KG_PER_KWH = _float('CO2_KG_PER_KWH', 0.207)  # UK grid average
    DRIVER_COST_PER_HOUR_GBP = _float('DRIVER_COST_PER_HOUR_GBP', 16.5)

    # --- Driver hours (GB domestic / EU rules, used for auto breaks) -----
    MAX_DRIVING_MINUTES_BEFORE_BREAK = _int('MAX_DRIVING_MINUTES_BEFORE_BREAK', 270)
    DEFAULT_BREAK_MINUTES = _int('DEFAULT_BREAK_MINUTES', 45)
    MAX_SHIFT_MINUTES = _int('MAX_SHIFT_MINUTES', 780)  # 13h

    # --- Misc -----------------------------------------------------------
    MAX_PLAN_STOPS = _int('MAX_PLAN_STOPS', 400)
    # Wall-clock ceiling for the optimiser so a big plan can never
    # outlive the web request that asked for it.
    PLAN_TIME_BUDGET_SECONDS = _float('PLAN_TIME_BUDGET_SECONDS', 6.0)
    # Optional road-shape lookup for legs that have no precomputed geometry
    # (arbitrary customer addresses). Set to '' to disable all outbound calls;
    # point it at your own OSRM for production use.
    ROAD_GEOMETRY_URL = os.environ.get('ROAD_GEOMETRY_URL', 'https://router.project-osrm.org')
    ROAD_GEOMETRY_MAX_LEGS = _int('ROAD_GEOMETRY_MAX_LEGS', 24)

    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')
    PORT = _int('PORT', 5000)


# Vehicle presets used when a vehicle record does not specify its own figures.
VEHICLE_TYPE_PRESETS = {
    'van': {
        'label': 'Panel van (3.5t)',
        'capacity_kg': 1200, 'capacity_m3': 11.0, 'max_pallets': 4,
        'length_m': 5.9, 'width_m': 2.0, 'height_m': 2.5,
        'fuel_type': 'diesel', 'fuel_efficiency_km_per_l': 9.5,
        'avg_speed_kmh': 68, 'cost_per_km': 0.42,
    },
    'luton': {
        'label': 'Luton box van (3.5t)',
        'capacity_kg': 1000, 'capacity_m3': 20.0, 'max_pallets': 6,
        'length_m': 6.5, 'width_m': 2.1, 'height_m': 3.0,
        'fuel_type': 'diesel', 'fuel_efficiency_km_per_l': 8.0,
        'avg_speed_kmh': 64, 'cost_per_km': 0.48,
    },
    'rigid_7_5t': {
        'label': 'Rigid 7.5t',
        'capacity_kg': 3000, 'capacity_m3': 39.0, 'max_pallets': 10,
        'length_m': 7.5, 'width_m': 2.4, 'height_m': 3.4,
        'fuel_type': 'diesel', 'fuel_efficiency_km_per_l': 5.5,
        'avg_speed_kmh': 60, 'cost_per_km': 0.62,
    },
    'rigid_18t': {
        'label': 'Rigid 18t',
        'capacity_kg': 9500, 'capacity_m3': 60.0, 'max_pallets': 16,
        'length_m': 9.0, 'width_m': 2.5, 'height_m': 4.0,
        'fuel_type': 'diesel', 'fuel_efficiency_km_per_l': 4.2,
        'avg_speed_kmh': 58, 'cost_per_km': 0.78,
    },
    'artic_44t': {
        'label': 'Articulated 44t',
        'capacity_kg': 26000, 'capacity_m3': 90.0, 'max_pallets': 26,
        'length_m': 16.5, 'width_m': 2.55, 'height_m': 4.2,
        'fuel_type': 'diesel', 'fuel_efficiency_km_per_l': 3.4,
        'avg_speed_kmh': 56, 'cost_per_km': 0.95,
    },
    'ev_van': {
        'label': 'Electric van',
        'capacity_kg': 900, 'capacity_m3': 10.0, 'max_pallets': 3,
        'length_m': 5.5, 'width_m': 2.0, 'height_m': 2.5,
        'fuel_type': 'electric', 'kwh_per_km': 0.28,
        'avg_speed_kmh': 66, 'cost_per_km': 0.18,
    },
    'ev_rigid': {
        'label': 'Electric rigid',
        'capacity_kg': 6000, 'capacity_m3': 45.0, 'max_pallets': 12,
        'length_m': 8.5, 'width_m': 2.5, 'height_m': 3.6,
        'fuel_type': 'electric', 'kwh_per_km': 0.95,
        'avg_speed_kmh': 58, 'cost_per_km': 0.35,
    },
    'refrigerated': {
        'label': 'Refrigerated rigid',
        'capacity_kg': 8000, 'capacity_m3': 50.0, 'max_pallets': 14,
        'length_m': 9.0, 'width_m': 2.5, 'height_m': 3.9,
        'fuel_type': 'diesel', 'fuel_efficiency_km_per_l': 3.8,
        'avg_speed_kmh': 57, 'cost_per_km': 0.88,
        'temperature_controlled': True,
    },
}

# Fuel/energy characteristics used by the cost + emission model.
FUEL_PROFILES = {
    'diesel': {
        'price_per_unit': Config.DIESEL_PRICE_GBP,
        'co2_per_unit': Config.CO2_KG_PER_LITRE_DIESEL,
        'unit': 'L',
    },
    'petrol': {
        'price_per_unit': Config.PETROL_PRICE_GBP,
        'co2_per_unit': Config.CO2_KG_PER_LITRE_PETROL,
        'unit': 'L',
    },
    'hybrid': {
        'price_per_unit': Config.DIESEL_PRICE_GBP,
        'co2_per_unit': Config.CO2_KG_PER_LITRE_DIESEL * 0.75,
        'unit': 'L',
    },
    'electric': {
        'price_per_unit': Config.ELECTRICITY_PRICE_GBP_KWH,
        'co2_per_unit': Config.CO2_KG_PER_KWH,
        'unit': 'kWh',
    },
}

STOP_TYPES = (
    'pickup', 'delivery', 'depot_start', 'depot_end',
    'rest', 'break', 'fuel', 'custom',
)

PACKAGE_TYPES = (
    'parcel', 'pallet', 'crate', 'roll_cage', 'bulk', 'container', 'other',
)
