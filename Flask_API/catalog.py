"""Location catalog: company-owned depots (MongoDB) + the GNN dataset depots.

The planner previously offered a hard-coded list of `Depot_0 … Depot_49` taken
from the training CSV, so a depot created on the Depots page never appeared as a
routing option. Everything now resolves through this one catalog, which merges
both sources and can turn any reference (saved location id, dataset depot name,
or raw coordinates) into a concrete point.
"""
import csv
import logging
import os
import threading

from db import get_db, serialize, to_object_id, with_retry
from geo import valid_coords

log = logging.getLogger('optigo.catalog')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# The network locations are the nodes the edge-cost models were trained on.
# Reading them from the GNN artefacts (rather than a separate depot CSV) is what
# guarantees the planner, the catalog and the model share one node vocabulary.
NETWORK_NODES_CSV = os.path.join(BASE_DIR, 'gnn_artifacts', 'nodes.csv')
LEGACY_DEPOT_CSV = os.path.join(BASE_DIR, 'expanded_depots_df.csv')

_dataset_lock = threading.Lock()
_dataset_cache = None


class LocationError(ValueError):
    """Raised when a stop/vehicle references a location that cannot be resolved."""


def dataset_depots():
    """Locations in the trained freight network, keyed by name.

    Read straight from the GNN artefacts so no PyTorch import is needed just to
    list locations — the catalog stays available even when inference is not.
    """
    global _dataset_cache
    if _dataset_cache is not None:
        return _dataset_cache
    with _dataset_lock:
        if _dataset_cache is not None:
            return _dataset_cache
        _dataset_cache = _read_network_nodes() or _read_legacy_depots()
        return _dataset_cache


def _read_network_nodes():
    locations = {}
    try:
        with open(NETWORK_NODES_CSV, newline='', encoding='utf-8') as handle:
            for row in csv.DictReader(handle):
                name = (row.get('name') or '').strip()
                try:
                    lat, lon = float(row['lat']), float(row['lon'])
                except (KeyError, TypeError, ValueError):
                    continue
                if not name or (abs(lat) < 1e-9 and abs(lon) < 1e-9):
                    continue
                locations[name] = {
                    'id': name, 'name': name, 'lat': lat, 'lon': lon,
                    'type': 'depot', 'source': 'dataset', 'city': '',
                    'capacity': 0, 'in_gnn_network': True,
                }
    except FileNotFoundError:
        log.warning('GNN network nodes missing at %s — run `python -m gnn.dataset`',
                    NETWORK_NODES_CSV)
    return locations


def _read_legacy_depots():
    """Fallback for deployments that have not built the GNN artefacts yet."""
    depots = {}
    try:
        with open(LEGACY_DEPOT_CSV, newline='', encoding='utf-8') as handle:
            for row in csv.DictReader(handle):
                depot_id = (row.get('Depot_ID') or '').strip()
                try:
                    lat, lon = float(row['Latitude']), float(row['Longitude'])
                except (KeyError, TypeError, ValueError):
                    continue
                if depot_id:
                    depots[depot_id] = {
                        'id': depot_id, 'name': depot_id.replace('_', ' '),
                        'lat': lat, 'lon': lon, 'type': 'depot', 'source': 'dataset',
                        'city': '', 'capacity': 0, 'in_gnn_network': False,
                    }
    except FileNotFoundError:
        log.warning('No network locations available (neither GNN artefacts nor legacy CSV)')
    return depots


def dataset_depot_coords():
    return {d['id']: (d['lat'], d['lon']) for d in dataset_depots().values()}


def company_locations(company, include_inactive=False):
    """Locations saved by this company (depots, customer sites, rest stops…)."""
    query = {'company': company}
    if not include_inactive:
        query['archived'] = {'$ne': True}
    docs = with_retry(lambda: list(get_db().depots.find(query).sort('name', 1)))
    out = []
    for doc in docs:
        data = serialize(doc)
        data.setdefault('type', 'depot')
        data['source'] = 'company'
        data['in_gnn_network'] = False
        out.append(data)
    return out


def all_locations(company, include_dataset=True):
    """Everything a planner can pick from, company records first."""
    locations = company_locations(company)
    if include_dataset:
        locations.extend(sorted(dataset_depots().values(),
                                key=lambda d: int(d['id'].split('_')[-1]) if d['id'].split('_')[-1].isdigit() else 0))
    return locations


def find_company_location(company, location_id):
    oid = to_object_id(location_id)
    if not oid:
        return None
    doc = with_retry(lambda: get_db().depots.find_one({'_id': oid, 'company': company}))
    if not doc:
        return None
    data = serialize(doc)
    data.setdefault('type', 'depot')
    data['source'] = 'company'
    return data


def resolve_location(company, reference, label='location'):
    """Turn any location reference into `{name, lat, lon, location_id, …}`.

    Accepted forms::

        "Depot_7"                      # dataset depot id
        "665f0c…"                      # saved location id
        {"location_id": "665f0c…"}
        {"depot": "Depot_7"}
        {"lat": 53.8, "lon": -1.5, "name": "Customer site"}
    """
    if reference is None:
        raise LocationError(f'No {label} provided')

    if isinstance(reference, str):
        reference = {'location_id': reference}

    if not isinstance(reference, dict):
        raise LocationError(f'Unsupported {label} reference: {reference!r}')

    # explicit coordinates always win
    lat, lon = reference.get('lat'), reference.get('lon')
    if lat is not None and lon is not None and valid_coords(lat, lon):
        return {
            'location_id': reference.get('location_id'),
            'name': reference.get('name') or reference.get('address') or f'{float(lat):.4f}, {float(lon):.4f}',
            'lat': float(lat), 'lon': float(lon),
            'address': reference.get('address', ''),
            'city': reference.get('city', ''),
            'source': 'custom',
            'in_gnn_network': False,
        }

    key = reference.get('location_id') or reference.get('depot') or reference.get('id') or reference.get('name')
    if not key:
        raise LocationError(f'A {label} needs coordinates or a saved location id')
    key = str(key).strip()

    dataset = dataset_depots().get(key)
    if dataset:
        return {**dataset, 'location_id': dataset['id'], 'address': ''}

    saved = find_company_location(company, key)
    if saved and valid_coords(saved.get('lat'), saved.get('lon')):
        return {
            'location_id': saved['id'],
            'name': saved.get('name') or 'Depot',
            'lat': float(saved['lat']), 'lon': float(saved['lon']),
            'address': saved.get('address', '') or saved.get('city', ''),
            'city': saved.get('city', ''),
            'source': 'company',
            'type': saved.get('type', 'depot'),
            'in_gnn_network': False,
        }
    if saved:
        raise LocationError(f"Location '{saved.get('name', key)}' has no valid coordinates — edit it and add lat/lon")
    raise LocationError(f"Unknown {label} '{key}'")


def clear_cache():
    """Test hook."""
    global _dataset_cache
    _dataset_cache = None
