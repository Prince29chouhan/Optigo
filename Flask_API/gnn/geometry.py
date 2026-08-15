"""Road geometry for the network edges — the shapes the map draws.

The GNN decides *which* locations to route through; it has no idea what the road
between them looks like, because the dataset contains no shape data. This module
fetches the road-following polyline for each edge **once**, offline, and stores
it next to the model artefacts.

    python -m gnn.geometry                       # OSRM public demo (no key)
    python -m gnn.geometry --base-url http://localhost:5000   # self-hosted OSRM

Consequences of precomputing rather than calling a router at request time:

* the deployed app needs no routing API, no key and no internet — a demo works
  on a train;
* rendering is instant and deterministic;
* the road distance returned by the router is stored alongside each edge, giving
  a free sanity check on the synthetic dataset's own distances.

Geometry is kept as an encoded polyline (precision 6) because storing raw
coordinate arrays for ~1,700 edges is an order of magnitude larger. The default
`overview=simplified` keeps the whole network under a megabyte and is visually
identical at the zoom levels long-haul freight routes are viewed at; pass
`--overview full` if you need street-level detail and can afford ~15 MB.
"""
import argparse
import json
import os
import time
import urllib.error
import urllib.request

from gnn import dataset as ds

ARTIFACT_DIR = ds.ARTIFACT_DIR
GEOMETRY_PATH = os.path.join(ARTIFACT_DIR, 'edge_geometry.json')
DEFAULT_BASE_URL = 'https://router.project-osrm.org'

_cache = None


# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------

def fetch_leg(base_url, src_lat, src_lon, dst_lat, dst_lon, timeout=25, overview='simplified'):
    """Return `(encoded_polyline, road_km, road_minutes)` or None."""
    url = (f'{base_url}/route/v1/driving/'
           f'{src_lon:.6f},{src_lat:.6f};{dst_lon:.6f},{dst_lat:.6f}'
           f'?overview={overview}&geometries=polyline6&alternatives=false&steps=false')
    request = urllib.request.Request(url, headers={'User-Agent': 'OptiGo/2.0 (academic project)'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.load(response)
    if payload.get('code') != 'Ok' or not payload.get('routes'):
        return None
    route = payload['routes'][0]
    return route['geometry'], route['distance'] / 1000.0, route['duration'] / 60.0


def build(base_url=DEFAULT_BASE_URL, delay=0.7, limit=None, resume=True, overview='simplified'):
    """Fetch geometry for every edge, resuming from whatever is already cached."""
    _, edges, _ = ds.load()
    existing = {}
    if resume and os.path.exists(GEOMETRY_PATH):
        with open(GEOMETRY_PATH, encoding='utf-8') as handle:
            existing = json.load(handle).get('edges', {})

    pending = [row for row in edges.itertuples(index=False)
               if f'{row.source}|{row.destination}' not in existing]
    if limit:
        pending = pending[:limit]

    print(f'{len(existing)} cached, {len(pending)} to fetch from {base_url}')
    failures = 0
    for position, row in enumerate(pending, start=1):
        key = f'{row.source}|{row.destination}'
        try:
            result = fetch_leg(base_url, row.src_lat, row.src_lon, row.dst_lat, row.dst_lon,
                               overview=overview)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            failures += 1
            print(f'  ! {key}: {exc}')
            result = None
            time.sleep(min(10.0, delay * 5))     # back off after an error
        if result:
            polyline, road_km, road_minutes = result
            existing[key] = {
                'polyline': polyline,
                'road_km': round(road_km, 3),
                'road_minutes': round(road_minutes, 2),
                'straight_km': round(float(row.segment_km), 3),
            }
        if position % 50 == 0 or position == len(pending):
            _save(existing, base_url)
            print(f'  {position}/{len(pending)} fetched ({failures} failures)')
        time.sleep(delay)

    _save(existing, base_url)
    return existing


def _save(edges, base_url):
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    with open(GEOMETRY_PATH, 'w', encoding='utf-8') as handle:
        json.dump({'source': base_url, 'encoding': 'polyline6',
                   'count': len(edges), 'edges': edges}, handle)


# --------------------------------------------------------------------------
# Lookup (used by the serving layer)
# --------------------------------------------------------------------------

def load():
    """Cached geometry keyed by 'source|destination'; empty when not built."""
    global _cache
    if _cache is not None:
        return _cache
    try:
        with open(GEOMETRY_PATH, encoding='utf-8') as handle:
            _cache = json.load(handle).get('edges', {})
    except (FileNotFoundError, json.JSONDecodeError):
        _cache = {}
    return _cache


def for_edge(source, destination):
    return load().get(f'{source}|{destination}')


def available():
    return bool(load())


def coverage_report():
    """How much of the graph has geometry, and how the router's distances compare."""
    _, edges, _ = ds.load()
    geometry = load()
    covered = [geometry[f'{row.source}|{row.destination}']
               for row in edges.itertuples(index=False)
               if f'{row.source}|{row.destination}' in geometry]
    if not covered:
        return {'edges': int(len(edges)), 'covered': 0, 'coverage_pct': 0.0}

    road = [entry['road_km'] for entry in covered]
    straight = [entry['straight_km'] for entry in covered]
    ratios = [r / s for r, s in zip(road, straight) if s > 0.5]
    return {
        'edges': int(len(edges)),
        'covered': len(covered),
        'coverage_pct': round(len(covered) / len(edges) * 100, 1),
        'mean_road_km': round(sum(road) / len(road), 2),
        'mean_straight_km': round(sum(straight) / len(straight), 2),
        # The road factor the planner assumes for non-network legs is 1.28;
        # this is the same quantity measured on real roads.
        'measured_road_factor': round(sum(ratios) / len(ratios), 3) if ratios else None,
    }


# --------------------------------------------------------------------------
# On-demand geometry for ad-hoc coordinates (customer addresses)
# --------------------------------------------------------------------------

ADHOC_PATH = os.path.join(ARTIFACT_DIR, 'adhoc_geometry.json')
_adhoc = None


def _adhoc_cache():
    global _adhoc
    if _adhoc is None:
        try:
            with open(ADHOC_PATH, encoding='utf-8') as handle:
                _adhoc = json.load(handle)
        except (FileNotFoundError, json.JSONDecodeError):
            _adhoc = {}
    return _adhoc


def _adhoc_key(src_lat, src_lon, dst_lat, dst_lon):
    return f'{src_lat:.4f},{src_lon:.4f}|{dst_lat:.4f},{dst_lon:.4f}'


def for_coordinates(src_lat, src_lon, dst_lat, dst_lon, base_url):
    """Road shape between two arbitrary points, cached on disk across restarts.

    Returns None when lookups are disabled or the router is unreachable — the
    caller then keeps its straight-line rendering rather than failing.
    """
    if not base_url:
        return None
    cache = _adhoc_cache()
    key = _adhoc_key(src_lat, src_lon, dst_lat, dst_lon)
    if key in cache:
        return cache[key]

    try:
        result = fetch_leg(base_url, src_lat, src_lon, dst_lat, dst_lon)
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None
    if not result:
        return None

    polyline, road_km, road_minutes = result
    cache[key] = {'polyline': polyline, 'road_km': round(road_km, 3),
                  'road_minutes': round(road_minutes, 2)}
    try:
        os.makedirs(ARTIFACT_DIR, exist_ok=True)
        with open(ADHOC_PATH, 'w', encoding='utf-8') as handle:
            json.dump(cache, handle)
    except OSError:
        pass          # a read-only deployment still benefits from the in-memory cache
    return cache[key]


def main():
    parser = argparse.ArgumentParser(description='Precompute road geometry for network edges')
    parser.add_argument('--base-url', default=os.environ.get('OSRM_BASE_URL', DEFAULT_BASE_URL))
    parser.add_argument('--delay', type=float, default=0.7,
                        help='seconds between requests (be kind to public servers)')
    parser.add_argument('--limit', type=int, default=None, help='fetch at most N new edges')
    parser.add_argument('--overview', default='simplified', choices=('simplified', 'full'),
                        help='shape detail: simplified (~0.4 MB total) or full (~15 MB)')
    parser.add_argument('--report', action='store_true', help='only print coverage')
    args = parser.parse_args()

    if not args.report:
        build(args.base_url, delay=args.delay, limit=args.limit, overview=args.overview)
    print(json.dumps(coverage_report(), indent=2))


if __name__ == '__main__':
    main()
