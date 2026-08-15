"""Serving layer for the edge-cost models.

Contract with training
----------------------
Everything inference needs comes from `gnn_artifacts/manifest.json`, which
training writes: weights, architecture config, feature order, scaler parameters
and the target transform. Inference never rebuilds features by hand, never
re-derives a normalisation, and never guesses an architecture — the three
mistakes that made the previous deployment's predictions meaningless.

Behaviour
---------
* Models load lazily in a background thread; the API stays responsive while
  PyTorch initialises, and `status()` reports progress.
* Predictions are cached per objective — one forward pass per objective per
  process, not one per request.
* Output is a **cost in real units** (GBP / hours / kg CO2) that is additive
  along a path, so it can be used directly as a Dijkstra edge weight.
* If PyTorch or the artefacts are missing the service reports `unavailable` and
  the planner falls back to geometric distances. It never silently serves
  numbers it cannot stand behind.
"""
import logging
import os
import threading

from config import Config

log = logging.getLogger('optigo.gnn')

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTIFACT_DIR = os.path.join(BASE_DIR, 'gnn_artifacts')
MANIFEST_PATH = os.path.join(ARTIFACT_DIR, 'manifest.json')

_lock = threading.Lock()
_state = {
    'status': 'idle',       # idle | loading | ready | unavailable
    'error': None,
    'manifest': None,
    'nodes': None,
    'edges': None,
    'meta': None,
    'costs': {},            # objective -> np.ndarray aligned with the edge table
    'graphs': {},           # objective -> networkx.DiGraph
    'index': None,          # (source, destination) -> row position
}


def status():
    manifest = _state.get('manifest') or {}
    objectives = manifest.get('objectives', {})
    return {
        'status': _state['status'],
        'error': _state['error'],
        'preferences': sorted(objectives.keys()),
        'graph': manifest.get('graph'),
        'metrics': {name: entry.get('metrics', {}).get('test', {})
                    for name, entry in objectives.items()},
        'target_units': manifest.get('target_units'),
    }


def available():
    return _state['status'] == 'ready'


def warm_up_async():
    if _state['status'] in ('loading', 'ready'):
        return
    threading.Thread(target=_load, name='gnn-warmup', daemon=True).start()


def ensure_loaded():
    """Load on demand; True when inference is possible."""
    if _state['status'] == 'ready':
        return True
    if _state['status'] == 'unavailable':
        return False
    _load()
    return _state['status'] == 'ready'


def _load():
    with _lock:
        if _state['status'] in ('ready', 'unavailable'):
            return
        _state['status'] = 'loading'
        try:
            import json

            import numpy as np  # noqa: PLC0415
            import torch  # noqa: PLC0415

            from gnn import dataset as ds  # noqa: PLC0415
            from gnn.model import build_from_config, to_cost  # noqa: PLC0415

            if not os.path.exists(MANIFEST_PATH):
                raise FileNotFoundError(
                    'gnn_artifacts/manifest.json not found — run `python -m gnn.train` to build it')
            with open(MANIFEST_PATH, encoding='utf-8') as handle:
                manifest = json.load(handle)

            nodes, edges, meta = ds.load(ARTIFACT_DIR)
            node_matrix, edge_matrix, edge_index = ds.matrices(nodes, edges, meta)
            edge_index_t = torch.tensor(edge_index, dtype=torch.long)

            costs = {}
            for objective, entry in manifest['objectives'].items():
                edge_params = entry['edge_scaler_params']
                node_params = entry['node_scaler_params']
                x = torch.tensor(
                    (node_matrix - np.array(node_params['mean'], dtype=np.float32))
                    / np.array(node_params['scale'], dtype=np.float32), dtype=torch.float)
                edge_attr = torch.tensor(
                    (edge_matrix - np.array(edge_params['mean'], dtype=np.float32))
                    / np.array(edge_params['scale'], dtype=np.float32), dtype=torch.float)

                model = build_from_config(entry['config'])
                model.load_state_dict(
                    torch.load(os.path.join(ARTIFACT_DIR, entry['weights']), map_location='cpu'))
                model.eval()
                with torch.no_grad():
                    raw = model(x, edge_index_t, edge_attr)
                costs[objective] = to_cost(raw, entry['target_mean'], entry['target_std']).numpy()

            _state.update({
                'manifest': manifest, 'nodes': nodes, 'edges': edges, 'meta': meta,
                'costs': costs, 'graphs': {}, 'status': 'ready', 'error': None,
                'index': {(row.source, row.destination): position
                          for position, row in enumerate(edges.itertuples(index=False))},
            })
            log.info('GNN edge-cost models ready (%s) over %s nodes / %s edges',
                     ', '.join(sorted(costs)), meta['node_count'], meta['edge_count'])
        except Exception as exc:  # noqa: BLE001 - degrade instead of breaking the API
            _state['status'] = 'unavailable'
            _state['error'] = str(exc)
            log.warning('GNN unavailable, planner will use geometric distances: %s', exc)


# --------------------------------------------------------------------------
# Graph queries
# --------------------------------------------------------------------------

def network_locations():
    """The named locations the model knows, for the planner's location catalog."""
    if not ensure_loaded():
        return {}
    nodes = _state['nodes']
    return {
        row.name: {
            'id': row.name, 'name': row.name,
            'lat': float(row.lat), 'lon': float(row.lon),
            'type': 'depot', 'source': 'dataset', 'city': '',
            'capacity': 0, 'in_gnn_network': True,
        }
        for row in nodes.itertuples(index=False)
        if abs(float(row.lat)) > 1e-9 or abs(float(row.lon)) > 1e-9
    }


def _graph(objective):
    """Directed graph weighted by predicted cost for this objective (cached)."""
    if objective in _state['graphs']:
        return _state['graphs'][objective]
    if not ensure_loaded():
        return None
    with _lock:
        if objective in _state['graphs']:
            return _state['graphs'][objective]
        import networkx as nx  # noqa: PLC0415

        costs = _state['costs'].get(objective)
        if costs is None:
            return None
        edges = _state['edges']
        graph = nx.DiGraph()
        for position, row in enumerate(edges.itertuples(index=False)):
            # `segment_km` is a great-circle hop. Reporting that as the leg
            # distance understated corridor routes by ~28% against the rest of
            # the planner, which inflates straight lines by ROAD_FACTOR. Use the
            # measured road distance where we have it, the same approximation as
            # everywhere else when we do not.
            shape = edge_geometry(row.source, row.destination)
            road_km = (shape or {}).get('road_km')
            distance = float(road_km) if road_km else float(row.segment_km) * Config.ROAD_FACTOR
            graph.add_edge(row.source, row.destination,
                           weight=float(costs[position]),
                           distance=distance,
                           straight_km=float(row.segment_km),
                           measured=bool(road_km),
                           hours=float(row.target_fastest),
                           cost=float(row.target_cheapest),
                           co2=float(row.target_greenest))
        _state['graphs'][objective] = graph
        return graph


def edge_geometry(source, destination):
    """Encoded road polyline for one network edge, when it has been precomputed."""
    from gnn import geometry  # noqa: PLC0415 - optional artefact

    return geometry.for_edge(source, destination)


def corridor(origin, destination, preference='greenest'):
    """Least-cost path between two network locations under a learned objective.

    Returns predicted objective cost plus the physical distance and duration of
    the chosen path, or None when either endpoint is outside the trained graph.
    """
    if origin == destination:
        return {'path': [origin], 'distance_km': 0.0, 'minutes': 0.0,
                'predicted_cost': 0.0, 'unit': ''}
    graph = _graph(preference)
    if graph is None or origin not in graph or destination not in graph:
        return None
    try:
        import networkx as nx  # noqa: PLC0415
        path = nx.dijkstra_path(graph, origin, destination, weight='weight')
    except Exception:  # noqa: BLE001 - unreachable pair
        return None

    locations = network_locations()
    distance = minutes = predicted = road_km = 0.0
    shapes = []
    for u, v in zip(path[:-1], path[1:]):
        edge = graph[u][v]
        distance += edge['distance']
        minutes += edge['hours'] * 60.0
        predicted += edge['weight']

        # One entry per hop, always. A hop whose road shape has not been
        # precomputed carries its endpoints instead of a polyline, so the drawn
        # line stays continuous rather than silently skipping a segment.
        shape = edge_geometry(u, v)
        entry = {
            'from': u, 'to': v,
            'from_lat': locations.get(u, {}).get('lat'),
            'from_lon': locations.get(u, {}).get('lon'),
            'to_lat': locations.get(v, {}).get('lat'),
            'to_lon': locations.get(v, {}).get('lon'),
            'polyline': shape['polyline'] if shape else None,
            'road_km': shape['road_km'] if shape else None,
        }
        shapes.append(entry)
        if shape:
            road_km += shape['road_km']

    units = (_state['manifest'] or {}).get('target_units', {})
    return {'path': path, 'distance_km': distance, 'minutes': minutes,
            'predicted_cost': predicted, 'unit': units.get(preference, ''),
            'shapes': shapes, 'road_km': road_km or None}


def corridor_provider(preference):
    """Adapter for `vrp.DistanceProvider(corridor_fn=…)`.

    Applies only when both stops are network locations; via-points are returned
    separately so the UI can draw the corridor without pretending the planner
    invented extra stops.
    """
    locations = network_locations()

    def provider(a, b):
        origin, destination = getattr(a, 'location_id', None), getattr(b, 'location_id', None)
        if origin not in locations or destination not in locations:
            return None
        result = corridor(origin, destination, preference)
        if not result or not result['minutes']:
            return None
        via = [{'depot': name, 'lat': locations[name]['lat'], 'lon': locations[name]['lon']}
               for name in result['path'][1:-1]]
        # Road shapes let the map draw the actual road instead of a straight line.
        return result['distance_km'], result['minutes'], via, result.get('shapes', [])

    return provider


def legacy_best_route(start, end, preference='greenest'):
    """Backwards-compatible /best-route payload, now on learned edge costs."""
    if not ensure_loaded():
        return None, 'Route model is still starting up, please retry in a moment'
    locations = network_locations()
    if start not in locations or end not in locations:
        return None, 'Location is not part of the trained network'

    result = corridor(start, end, preference)
    if not result:
        return None, 'No route found between these locations'

    graph = _graph(preference)
    path = result['path']
    cost = co2 = 0.0
    for u, v in zip(path[:-1], path[1:]):
        cost += graph[u][v]['cost']
        co2 += graph[u][v]['co2']

    return {
        'route': [{'depot': name, 'lat': locations[name]['lat'], 'lon': locations[name]['lon']}
                  for name in path],
        'preference': preference,
        'total_distance_km': round(result['distance_km'], 1),
        'estimated_time_min': round(result['minutes']),
        'estimated_cost_gbp': round(cost, 2),
        'co2_kg': round(co2, 1),
        'predicted_objective_cost': round(result['predicted_cost'], 3),
        'objective_unit': result['unit'],
        'shapes': result.get('shapes', []),
        'road_distance_km': round(result['road_km'], 1) if result.get('road_km') else None,
        'model': 'gnn-edge-cost',
    }, None
