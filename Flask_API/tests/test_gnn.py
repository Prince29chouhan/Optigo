"""Tests for the GNN edge-cost pipeline.

    python -m tests.test_gnn        (requires torch, torch_geometric, pandas)

These exist because every historic defect in this pipeline was silent: the
checkpoints loaded, inference produced numbers, and nothing complained while the
numbers meant nothing. The parity test below is the important one — it asserts
that what serving computes equals what the evaluation pipeline computes from the
same artefacts, which is exactly the property that was broken.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

SKIP_REASON = None
try:
    import numpy as np
    import torch

    from gnn import dataset as ds
    from gnn import schema as schema_module
    from gnn import service
    from gnn.evaluate import load_manifest, predict_with_manifest, routing_regret
    from gnn.model import EdgeCostGNN, to_cost
except ImportError as exc:  # pragma: no cover - minimal installs
    SKIP_REASON = f'ML dependencies unavailable ({exc})'

ARTIFACTS_BUILT = SKIP_REASON is None and os.path.exists(
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                 'gnn_artifacts', 'manifest.json'))


def test_schema_rejects_target_leakage():
    """A context column that is a target component must be refused outright."""
    schema = schema_module.load()
    schema['context'] = list(schema['context']) + ['total_cost_gbp']
    try:
        schema_module.validate(schema, ['origin_name', 'destination_name', 'total_cost_gbp',
                                        'total_time_hours', 'co2_emissions_kg'])
    except schema_module.SchemaError as exc:
        assert 'leak' in str(exc).lower()
        return
    raise AssertionError('validate() accepted a leaking context column')


def test_schema_reports_missing_target_column():
    schema = schema_module.load()
    try:
        schema_module.validate(schema, ['origin_name', 'destination_name'])
    except schema_module.SchemaError as exc:
        assert 'Target column' in str(exc)
        return
    raise AssertionError('validate() accepted a dataset without target columns')


def test_targets_are_positive_and_additive_in_scale():
    nodes, edges, meta = ds.load()
    assert len(nodes) > 0 and len(edges) > 0
    for objective in meta['objectives']:
        values = edges[f'target_{objective}'].to_numpy()
        assert (values > 0).all(), f'{objective} has non-positive edge costs'
        # A per-leg cost must be far smaller than a whole journey: the original
        # pipeline assigned the journey total to every leg.
        assert values.mean() < values.max(), 'targets look constant per journey'


def test_feature_matrices_match_the_manifest_contract():
    nodes, edges, meta = ds.load()
    node_matrix, edge_matrix, edge_index = ds.matrices(nodes, edges, meta)
    manifest = load_manifest()

    assert list(manifest['node_features']) == list(meta['node_features'])
    assert list(manifest['edge_features']) == list(meta['edge_features'])
    assert node_matrix.shape[1] == len(meta['node_features'])
    assert edge_matrix.shape[1] == len(meta['edge_features'])
    assert edge_index.shape == (2, len(edges))

    for objective, entry in manifest['objectives'].items():
        assert entry['config']['node_in'] == node_matrix.shape[1], objective
        assert entry['config']['edge_in'] == edge_matrix.shape[1], objective
        assert len(entry['edge_scaler_params']['mean']) == edge_matrix.shape[1]
        assert len(entry['node_scaler_params']['mean']) == node_matrix.shape[1]


def test_training_and_serving_produce_identical_predictions():
    """The regression that motivated this rewrite: train/serve skew."""
    nodes, edges, meta = ds.load()
    manifest = load_manifest()
    assert service.ensure_loaded(), service.status()

    for objective in meta['objectives']:
        reference = predict_with_manifest(manifest, objective, nodes, edges, meta)
        served = service._state['costs'][objective]
        assert served.shape == reference.shape
        largest_gap = float(np.max(np.abs(served - reference)))
        assert largest_gap < 1e-3, f'{objective}: serving differs from training by {largest_gap}'


def test_predictions_are_usable_as_shortest_path_weights():
    assert service.ensure_loaded()
    for objective, costs in service._state['costs'].items():
        assert np.isfinite(costs).all(), f'{objective} produced non-finite costs'
        assert (costs > 0).all(), f'{objective} produced a non-positive weight'


def test_corridor_cost_equals_the_sum_of_its_edges():
    assert service.ensure_loaded()
    names = sorted(service.network_locations())
    graph = service._graph('cheapest')

    checked = 0
    for origin in names[:8]:
        for destination in names[-8:]:
            result = service.corridor(origin, destination, 'cheapest')
            if not result or len(result['path']) < 2:
                continue
            summed = sum(graph[u][v]['weight']
                         for u, v in zip(result['path'][:-1], result['path'][1:]))
            assert abs(summed - result['predicted_cost']) < 1e-6
            checked += 1
    assert checked > 0, 'no routable pair found to verify additivity'


def test_objectives_disagree_somewhere():
    """Three objectives that always pick the same path would be pointless."""
    assert service.ensure_loaded()
    names = sorted(service.network_locations())
    differences = 0
    for origin in names[:12]:
        for destination in names[-12:]:
            cheapest = service.corridor(origin, destination, 'cheapest')
            greenest = service.corridor(origin, destination, 'greenest')
            if cheapest and greenest and cheapest['path'] != greenest['path']:
                differences += 1
    assert differences > 0, 'cheapest and greenest never differ — objectives are not distinct'


def test_model_ablation_modes_build():
    for conv in ('gine', 'gcn', 'mlp'):
        model = EdgeCostGNN(node_in=12, edge_in=26, hidden_dim=32, num_layers=2, conv=conv)
        model.eval()
        x = torch.randn(6, 12)
        edge_index = torch.tensor([[0, 1, 2, 3], [1, 2, 3, 4]], dtype=torch.long)
        edge_attr = torch.randn(4, 26)
        with torch.no_grad():
            output = model(x, edge_index, edge_attr)
        assert output.shape == (4,)
        assert torch.isfinite(output).all()
        assert (to_cost(output) > 0).all()


def test_routing_regret_beats_distance_only():
    """The application-level claim, asserted rather than assumed."""
    nodes, edges, meta = ds.load()
    manifest = load_manifest()
    for objective in meta['objectives']:
        targets = edges[f'target_{objective}'].to_numpy(dtype=float)
        predictions = predict_with_manifest(manifest, objective, nodes, edges, meta)
        result = routing_regret(edges, targets, predictions,
                                edges['segment_km'].to_numpy(dtype=float), pairs=60)
        assert result['model_regret_mean_pct'] <= result['distance_regret_mean_pct'] + 1e-9, (
            objective, result)
        assert result['model_regret_mean_pct'] < 15.0, (objective, result)


def test_geometry_artefact_is_consistent_when_present():
    """Road shapes must decode, match their edge, and be sane against the straight line."""
    from gnn import geometry

    if not geometry.available():
        return                      # optional artefact; skip when not built
    report = geometry.coverage_report()
    assert report['covered'] > 0
    assert 1.0 <= report['measured_road_factor'] <= 2.0, report

    _, edges, _ = ds.load()
    checked = 0
    for row in edges.itertuples(index=False):
        entry = geometry.for_edge(row.source, row.destination)
        if not entry:
            continue
        assert isinstance(entry['polyline'], str) and entry['polyline']
        # A road can only be longer than the great-circle line between its ends.
        assert entry['road_km'] >= entry['straight_km'] * 0.9, (row.source, row.destination, entry)
        checked += 1
        if checked >= 200:
            break
    assert checked > 0


def _run():
    if SKIP_REASON:
        print(f'  SKIP  every test — {SKIP_REASON}')
        return 0
    if not ARTIFACTS_BUILT:
        print('  SKIP  every test — artefacts missing; run `python -m gnn.train` first')
        return 0

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
