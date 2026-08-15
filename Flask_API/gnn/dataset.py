"""Build the per-edge graph dataset used to train and serve the edge-cost models.

Why this file exists
--------------------
The original pipeline turned every *route* into several identical training rows:
each leg of a journey inherited the whole journey's feature vector **and the
whole journey's total cost/time/CO2 as its label**. Two consequences:

* the targets are not additive — summing a 3-leg path's predictions triple-counts
  the journey, so feeding them to Dijkstra as edge weights is meaningless;
* the feature list contained `total_cost_gbp`, `co2_emissions_kg` and
  `total_time_hours` — the labels themselves — so a model could score well by
  copying an input.

Here each journey's realised cost / time / CO2 is **allocated across its legs by
distance share** and averaged over every traversal of that leg, giving a
per-edge expected cost that *is* additive along a path. Features are restricted
to quantities known before departure (`gnn.schema.FORBIDDEN_CONTEXT` is enforced).

Every column name comes from a swappable schema, so pointing this at a real
dataset is a configuration change:

    python -m gnn.dataset --csv data/real_legs.csv --schema schemas/real.json
"""
import argparse
import json
import math
import os
from collections import defaultdict

import numpy as np
import pandas as pd

from gnn import schema as schema_module

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROOT_DIR = os.path.dirname(BASE_DIR)
ARTIFACT_DIR = os.path.join(BASE_DIR, 'gnn_artifacts')
DEFAULT_CSV = os.path.join(ROOT_DIR, 'uk_logistics_dataset_5000_routes_20250710_124423.csv')

OBJECTIVES = ('cheapest', 'fastest', 'greenest')

GEOMETRY_FEATURES = [
    'segment_km', 'allocated_km', 'delta_lat', 'delta_lon',
    'src_lat', 'src_lon', 'dst_lat', 'dst_lon',
    'log_traversals', 'src_out_degree', 'dst_in_degree',
]
NODE_FEATURE_NAMES = [
    'lat', 'lon', 'out_degree', 'in_degree', 'log_traversals',
    'mean_speed_kmh', 'mean_traffic_delay_min', 'mean_weather_delay_min',
    'mean_load_factor', 'share_peak_season', 'share_weekend', 'is_waypoint_only',
]
EARTH_RADIUS_KM = 6371.0088


def edge_feature_names(context_columns, flag_names):
    return (GEOMETRY_FEATURES
            + [f'mean_{column}' for column in context_columns]
            + [f'share_{flag}' for flag in flag_names]
            + ['share_adverse_weather'])


def _num(value, default=0.0):
    try:
        if value is None or (isinstance(value, float) and math.isnan(value)):
            return default
        result = float(value)
        return default if math.isnan(result) or math.isinf(result) else result
    except (TypeError, ValueError):
        return default


def _yes(value):
    return 1.0 if str(value).strip().lower() in ('yes', 'true', '1', 'y') else 0.0


def _haversine(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return 0.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(min(1.0, a)))


def _waypoints(raw):
    if not isinstance(raw, str) or not raw.strip():
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except json.JSONDecodeError:
        return []


def _chain(row, schema):
    """origin -> waypoints -> destination as [(name, lat, lon), …]."""
    chain = [(str(row[schema['origin_name']]).strip(),
              _num(row.get(schema['origin_lat']), None),
              _num(row.get(schema['origin_lon']), None))]
    if schema['mode'] == 'allocate':
        for point in _waypoints(row.get(schema.get('waypoints_json'))):
            name = str(point.get('name', '')).strip()
            if name:
                chain.append((name, _num(point.get('lat'), None), _num(point.get('lon'), None)))
    chain.append((str(row[schema['destination_name']]).strip(),
                  _num(row.get(schema['destination_lat']), None),
                  _num(row.get(schema['destination_lon']), None)))
    return [link for link in chain if link[0]]


def build(csv_path=DEFAULT_CSV, schema=None):
    """Return `(nodes, edges, meta)` describing the freight graph."""
    schema = schema or schema_module.load()
    frame = pd.read_csv(csv_path)
    frame = frame.replace([np.inf, -np.inf], np.nan)
    frame = frame.dropna(subset=[schema['origin_name'], schema['destination_name']])

    context_columns, dropped = schema_module.validate(schema, frame.columns)
    flag_names = list(schema['flags'].keys())
    adverse = {str(value).lower() for value in schema['adverse_weather']}

    coordinates, roles = {}, defaultdict(set)
    node_stats = defaultdict(lambda: defaultdict(float))
    edge_acc = defaultdict(lambda: defaultdict(float))

    for _, row in frame.iterrows():
        chain = _chain(row, schema)
        if len(chain) < 2:
            continue

        segments = []
        for (name_a, lat_a, lon_a), (name_b, lat_b, lon_b) in zip(chain[:-1], chain[1:]):
            segments.append((name_a, name_b, max(_haversine(lat_a, lon_a, lat_b, lon_b), 1e-6)))
        geometric_total = sum(segment[2] for segment in segments)
        if geometric_total <= 0:
            continue

        for position, (name, lat, lon) in enumerate(chain):
            if lat is not None and lon is not None and name not in coordinates:
                coordinates[name] = (lat, lon)
            roles[name].add('waypoint' if 0 < position < len(chain) - 1 else 'terminal')

        context = {column: _num(row.get(column)) for column in context_columns}
        flags = {name: _yes(row.get(column)) for name, column in schema['flags'].items()}
        weather = 1.0 if str(row.get(schema.get('weather_condition'), '')).strip().lower() in adverse else 0.0
        route_distance = _num(row.get(schema.get('distance_km')), geometric_total)
        totals = {objective: _num(row.get(column)) for objective, column in schema['targets'].items()}

        for source, destination, segment_km in segments:
            # 'direct' rows are already single legs, so the whole measurement belongs to them.
            share = 1.0 if schema['mode'] == 'direct' else segment_km / geometric_total
            edge = edge_acc[(source, destination)]
            edge['traversals'] += 1
            edge['segment_km'] += segment_km
            edge['allocated_km'] += route_distance * share
            for objective, total in totals.items():
                edge[f'target_{objective}'] += total * share
            for column, value in context.items():
                edge[f'mean_{column}'] += value
            for name, value in flags.items():
                edge[f'share_{name}'] += value
            edge['share_adverse_weather'] += weather

            for name in (source, destination):
                stats = node_stats[name]
                stats['traversals'] += 1
                stats['mean_speed_kmh'] += context.get('avg_speed_kmh', 0.0)
                stats['mean_traffic_delay_min'] += context.get('traffic_delay_minutes', 0.0)
                stats['mean_weather_delay_min'] += context.get('weather_delay_minutes', 0.0)
                stats['mean_load_factor'] += context.get('load_factor', 0.0)
                stats['share_peak_season'] += flags.get('peak_season', 0.0)
                stats['share_weekend'] += flags.get('weekend', 0.0)
            node_stats[source]['out_degree'] += 1
            node_stats[destination]['in_degree'] += 1

    names = sorted(set(coordinates) | set(node_stats))
    index_of = {name: position for position, name in enumerate(names)}

    node_rows = []
    for name in names:
        stats = node_stats[name]
        traversals = max(stats['traversals'], 1.0)
        latitude, longitude = coordinates.get(name, (0.0, 0.0))
        node_rows.append({
            'name': name, 'index': index_of[name], 'lat': latitude, 'lon': longitude,
            'out_degree': stats['out_degree'], 'in_degree': stats['in_degree'],
            'log_traversals': math.log1p(stats['traversals']),
            'mean_speed_kmh': stats['mean_speed_kmh'] / traversals,
            'mean_traffic_delay_min': stats['mean_traffic_delay_min'] / traversals,
            'mean_weather_delay_min': stats['mean_weather_delay_min'] / traversals,
            'mean_load_factor': stats['mean_load_factor'] / traversals,
            'share_peak_season': stats['share_peak_season'] / traversals,
            'share_weekend': stats['share_weekend'] / traversals,
            'is_waypoint_only': float(roles[name] == {'waypoint'}),
        })
    nodes = pd.DataFrame(node_rows)

    edge_rows = []
    for (source, destination), values in edge_acc.items():
        if source not in index_of or destination not in index_of:
            continue
        traversals = max(values['traversals'], 1.0)
        src_lat, src_lon = coordinates.get(source, (0.0, 0.0))
        dst_lat, dst_lon = coordinates.get(destination, (0.0, 0.0))
        record = {
            'source': source, 'destination': destination,
            'src_index': index_of[source], 'dst_index': index_of[destination],
            'traversals': traversals,
            'segment_km': values['segment_km'] / traversals,
            'allocated_km': values['allocated_km'] / traversals,
            'delta_lat': abs(dst_lat - src_lat), 'delta_lon': abs(dst_lon - src_lon),
            'src_lat': src_lat, 'src_lon': src_lon, 'dst_lat': dst_lat, 'dst_lon': dst_lon,
            'log_traversals': math.log1p(traversals),
            'src_out_degree': node_stats[source]['out_degree'],
            'dst_in_degree': node_stats[destination]['in_degree'],
        }
        for column in context_columns:
            record[f'mean_{column}'] = values[f'mean_{column}'] / traversals
        for name in flag_names:
            record[f'share_{name}'] = values[f'share_{name}'] / traversals
        record['share_adverse_weather'] = values['share_adverse_weather'] / traversals
        for objective in schema['targets']:
            # Mean per-traversal share of the journey total: additive along a path.
            record[f'target_{objective}'] = values[f'target_{objective}'] / traversals
        edge_rows.append(record)

    edges = pd.DataFrame(edge_rows)
    target_columns = [f'target_{objective}' for objective in schema['targets']]
    edges = edges[(edges[target_columns] > 0).all(axis=1)].reset_index(drop=True)

    meta = {
        'source_csv': os.path.basename(csv_path),
        'mode': schema['mode'],
        'node_count': int(len(nodes)),
        'edge_count': int(len(edges)),
        'objectives': list(schema['targets'].keys()),
        'node_features': NODE_FEATURE_NAMES,
        'edge_features': edge_feature_names(context_columns, flag_names),
        'context_columns': context_columns,
        'dropped_context_columns': dropped,
        'targets': {objective: f'target_{objective}' for objective in schema['targets']},
        'target_units': schema['target_units'],
        'allocation': ('per-leg measurements used directly' if schema['mode'] == 'direct'
                       else 'journey totals split across legs by great-circle distance share, '
                            'then averaged over traversals'),
    }
    return nodes, edges, meta


def save(nodes, edges, meta, artifact_dir=ARTIFACT_DIR):
    os.makedirs(artifact_dir, exist_ok=True)
    nodes.to_csv(os.path.join(artifact_dir, 'nodes.csv'), index=False)
    edges.to_csv(os.path.join(artifact_dir, 'edges.csv'), index=False)
    with open(os.path.join(artifact_dir, 'graph_meta.json'), 'w', encoding='utf-8') as handle:
        json.dump(meta, handle, indent=2)
    return meta


def load(artifact_dir=ARTIFACT_DIR):
    """Load the built graph. Raises FileNotFoundError when it has not been built."""
    nodes = pd.read_csv(os.path.join(artifact_dir, 'nodes.csv'))
    edges = pd.read_csv(os.path.join(artifact_dir, 'edges.csv'))
    with open(os.path.join(artifact_dir, 'graph_meta.json'), encoding='utf-8') as handle:
        meta = json.load(handle)
    return nodes, edges, meta


def matrices(nodes, edges, meta):
    """(node_features, edge_features, edge_index) as float32 / int64 arrays."""
    node_matrix = nodes[meta['node_features']].to_numpy(dtype=np.float32)
    edge_matrix = edges[meta['edge_features']].to_numpy(dtype=np.float32)
    edge_index = edges[['src_index', 'dst_index']].to_numpy(dtype=np.int64).T
    return node_matrix, edge_matrix, edge_index


def main():
    parser = argparse.ArgumentParser(description='Build the freight graph dataset')
    parser.add_argument('--csv', default=DEFAULT_CSV)
    parser.add_argument('--schema', default=None, help='JSON schema mapping your columns')
    args = parser.parse_args()

    nodes, edges, meta = build(args.csv, schema_module.load(args.schema))
    save(nodes, edges, meta)
    print(json.dumps({key: value for key, value in meta.items()
                      if key not in ('node_features', 'edge_features')}, indent=2))
    print(f"\nnodes: {len(nodes)}  edges: {len(edges)}  "
          f"edge features: {len(meta['edge_features'])}")
    if meta['dropped_context_columns']:
        print(f"  note: context columns absent from this dataset were skipped: "
              f"{', '.join(meta['dropped_context_columns'])}")
    for objective in meta['objectives']:
        column = edges[f'target_{objective}']
        print(f"  target_{objective:9s} mean {column.mean():10.3f}  "
              f"min {column.min():8.3f}  max {column.max():10.3f}  "
              f"[{meta['target_units'].get(objective, '')}]")


if __name__ == '__main__':
    main()
