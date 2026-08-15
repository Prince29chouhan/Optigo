"""Dataset schema — the only place that knows your CSV's column names.

Swapping the synthetic dataset for a real one is a *configuration* change:
write a JSON file describing which columns hold which quantity and pass it with
`--schema my_fleet.json`. No pipeline code changes.

    python -m gnn.dataset --csv data/telematics_2026.csv --schema schemas/telematics.json

Two ingestion modes:

* ``allocate`` (default) — each row is a whole journey (origin → waypoints →
  destination) with journey-level totals. Totals are split across the legs by
  great-circle distance share, then averaged over every traversal of that leg.
  This is what the synthetic dataset needs.
* ``direct`` — each row is already a single leg with its own measured cost, time
  and emissions (typical of real telematics or TMS leg tables). No allocation is
  applied; observations of the same leg are averaged.

`direct` is strictly better when you have it: allocation is an assumption,
measurement is not.
"""
import json

DEFAULT_SCHEMA = {
    'mode': 'allocate',

    # --- identity and geography -----------------------------------------
    'origin_name': 'origin_name',
    'origin_lat': 'origin_latitude',
    'origin_lon': 'origin_longitude',
    'destination_name': 'destination_name',
    'destination_lat': 'destination_latitude',
    'destination_lon': 'destination_longitude',
    'waypoints_json': 'waypoints_json',      # optional; JSON list of {name, lat, lon}
    'distance_km': 'distance_km',

    # --- what the models predict (one column per objective) --------------
    'targets': {
        'cheapest': 'total_cost_gbp',
        'fastest': 'total_time_hours',
        'greenest': 'co2_emissions_kg',
    },
    'target_units': {'cheapest': 'GBP', 'fastest': 'hours', 'greenest': 'kg CO2'},

    # --- inputs: numeric context known before departure ------------------
    # Never list a column that is part of, or derived from, a target: doing so
    # is how the original pipeline ended up "predicting" cost from cost.
    'context': [
        'avg_speed_kmh', 'traffic_delay_minutes', 'weather_delay_minutes',
        'vehicle_max_weight_kg', 'vehicle_length_m', 'vehicle_width_m', 'vehicle_height_m',
        'cargo_volume_m3', 'cargo_weight_kg', 'load_factor', 'breaks_required',
    ],

    # --- inputs: yes/no columns turned into per-edge shares ---------------
    'flags': {
        'peak_season': 'is_peak_season',
        'weekend': 'is_weekend',
        'compliant': 'route_compliant',
    },

    # --- inputs: weather ---------------------------------------------------
    'weather_condition': 'weather_condition',
    'adverse_weather': ['rain', 'heavy_rain', 'snow', 'fog', 'ice', 'storm', 'wind'],
}

# Columns that must never be used as inputs for a given objective because they
# are the target itself or a component of it. Extend this when you bring your
# own dataset — the builder refuses to run if a context column appears here.
FORBIDDEN_CONTEXT = {
    'total_cost_gbp', 'fuel_cost_gbp', 'driver_cost_gbp', 'vehicle_cost_gbp',
    'insurance_cost_gbp', 'maintenance_cost_gbp', 'caz_cost_gbp', 'toll_cost_gbp',
    'hgv_levy_gbp', 'lez_cost_gbp', 'cost_per_km_gbp',
    'co2_emissions_kg', 'nox_emissions_g', 'pm_emissions_g', 'emissions_per_km_kg',
    'fuel_consumption_liters', 'fuel_efficiency_actual_kmpl', 'efficiency_score',
    'total_time_hours', 'estimated_driving_time_hours',
}


class SchemaError(ValueError):
    """The schema does not match the dataset, or would leak a target."""


def load(path=None):
    """Load a schema JSON, filling anything omitted from the defaults."""
    if not path:
        return dict(DEFAULT_SCHEMA)
    with open(path, encoding='utf-8') as handle:
        override = json.load(handle)
    schema = dict(DEFAULT_SCHEMA)
    schema.update(override)
    for key in ('targets', 'flags', 'target_units'):
        if key in override:
            merged = dict(DEFAULT_SCHEMA[key])
            merged.update(override[key])
            schema[key] = merged
    return schema


def validate(schema, columns):
    """Check the schema against the dataset's actual columns."""
    columns = set(columns)
    required = [schema['origin_name'], schema['destination_name']]
    missing = [name for name in required if name not in columns]
    if missing:
        raise SchemaError(f"Dataset is missing required column(s): {', '.join(missing)}")

    if schema['mode'] not in ('allocate', 'direct'):
        raise SchemaError("mode must be 'allocate' or 'direct'")

    for objective, column in schema['targets'].items():
        if column not in columns:
            raise SchemaError(f"Target column '{column}' for objective '{objective}' is not in the dataset")

    leaking = [c for c in schema['context'] if c in FORBIDDEN_CONTEXT]
    if leaking:
        raise SchemaError(
            f"These context columns are targets or target components and would leak: {', '.join(leaking)}")

    present = [c for c in schema['context'] if c in columns]
    dropped = [c for c in schema['context'] if c not in columns]
    return present, dropped
