"""Evaluate the edge-cost models: accuracy, baselines, ablations, routing regret.

    python -m gnn.evaluate                 # served models vs baselines + routing quality
    python -m gnn.evaluate --ablations     # also train GCN / no-graph variants

Two levels of evidence are produced, because they answer different questions:

1. **Edge accuracy** (MAE / RMSE / R2 on held-out edges) — is the cost model any
   good? Reported next to a mean predictor, a distance x flat-rate predictor,
   ridge regression and gradient boosting, so "the GNN works" is a comparison
   rather than an assertion.
2. **Routing regret** — the question the application actually asks. Route with
   *predicted* costs, then score the chosen path with *true* costs and compare
   against the oracle path. A model can have excellent R2 and still pick poor
   paths; regret is what the planner feels.
"""
import argparse
import json
import os

import joblib
import networkx as nx
import numpy as np
import torch
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import Ridge
from sklearn.preprocessing import StandardScaler

from gnn import dataset as ds
from gnn import train as trainer
from gnn.model import build_from_config, to_cost

ARTIFACT_DIR = ds.ARTIFACT_DIR


def load_manifest(tag='gine'):
    path = os.path.join(ARTIFACT_DIR, f'manifest_{tag}.json')
    if not os.path.exists(path):
        path = os.path.join(ARTIFACT_DIR, 'manifest.json')
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def predict_with_manifest(manifest, objective, nodes, edges, meta):
    """Recreate serving-time predictions for every edge in the graph."""
    entry = manifest['objectives'][objective]
    node_matrix, edge_matrix, edge_index = ds.matrices(nodes, edges, meta)

    edge_scaler = joblib.load(os.path.join(ARTIFACT_DIR, entry['edge_scaler']))
    node_scaler = joblib.load(os.path.join(ARTIFACT_DIR, entry['node_scaler']))
    model = build_from_config(entry['config'])
    model.load_state_dict(torch.load(os.path.join(ARTIFACT_DIR, entry['weights']), map_location='cpu'))
    model.eval()

    x = torch.tensor(node_scaler.transform(node_matrix), dtype=torch.float)
    edge_attr = torch.tensor(edge_scaler.transform(edge_matrix), dtype=torch.float)
    with torch.no_grad():
        raw = model(x, torch.tensor(edge_index, dtype=torch.long), edge_attr)
    return to_cost(raw, entry['target_mean'], entry['target_std']).numpy()


# --------------------------------------------------------------------------
# Baselines
# --------------------------------------------------------------------------

def baseline_predictions(edges, meta, objective, train_idx, test_idx):
    targets = edges[f'target_{objective}'].to_numpy(dtype=np.float64)
    edge_matrix = edges[meta['edge_features']].to_numpy(dtype=np.float32)

    scaler = StandardScaler().fit(edge_matrix[train_idx])
    x_train, x_test = scaler.transform(edge_matrix[train_idx]), scaler.transform(edge_matrix[test_idx])
    y_train = np.log1p(targets[train_idx])

    kilometres = edges['allocated_km'].to_numpy(dtype=np.float64)
    rate = float(np.mean(targets[train_idx] / np.maximum(kilometres[train_idx], 1e-6)))

    ridge = Ridge(alpha=1.0).fit(x_train, y_train)
    gbm = HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06,
                                        random_state=0).fit(x_train, y_train)
    return {
        'mean': np.full(len(test_idx), targets[train_idx].mean()),
        'distance_rate': kilometres[test_idx] * rate,
        'ridge': np.expm1(ridge.predict(x_test)),
        'gbm': np.expm1(gbm.predict(x_test)),
    }


# --------------------------------------------------------------------------
# Routing regret
# --------------------------------------------------------------------------

def routing_regret(edges, true_costs, predicted_costs, distances, pairs=200, seed=11):
    """Route on predicted costs, score the result with true costs, compare to the oracle.

    Returns mean/median regret (%) and the win rate against distance-only routing.
    """
    graph_true, graph_pred, graph_km = nx.DiGraph(), nx.DiGraph(), nx.DiGraph()
    for position, row in enumerate(edges.itertuples(index=False)):
        source, destination = row.source, row.destination
        graph_true.add_edge(source, destination, weight=float(true_costs[position]))
        graph_pred.add_edge(source, destination, weight=float(predicted_costs[position]))
        graph_km.add_edge(source, destination, weight=float(distances[position]))

    truth = {(row.source, row.destination): float(true_costs[position])
             for position, row in enumerate(edges.itertuples(index=False))}

    def realised(path):
        return sum(truth[(u, v)] for u, v in zip(path[:-1], path[1:]))

    nodes = list(graph_true.nodes)
    generator = np.random.default_rng(seed)
    model_regrets, distance_regrets, wins, evaluated = [], [], 0, 0

    while evaluated < pairs:
        origin, destination = generator.choice(nodes, size=2, replace=False)
        if origin == destination:
            continue
        try:
            optimal = realised(nx.dijkstra_path(graph_true, origin, destination, weight='weight'))
            model_path = realised(nx.dijkstra_path(graph_pred, origin, destination, weight='weight'))
            km_path = realised(nx.dijkstra_path(graph_km, origin, destination, weight='weight'))
        except (nx.NetworkXNoPath, nx.NodeNotFound):
            continue
        if optimal <= 0:
            continue
        evaluated += 1
        model_regret = (model_path - optimal) / optimal * 100
        distance_regret = (km_path - optimal) / optimal * 100
        model_regrets.append(model_regret)
        distance_regrets.append(distance_regret)
        wins += int(model_path <= km_path + 1e-9)

    return {
        'pairs': evaluated,
        'model_regret_mean_pct': round(float(np.mean(model_regrets)), 3),
        'model_regret_median_pct': round(float(np.median(model_regrets)), 3),
        'model_optimal_pct': round(float(np.mean(np.array(model_regrets) < 1e-6) * 100), 1),
        'distance_regret_mean_pct': round(float(np.mean(distance_regrets)), 3),
        'distance_regret_median_pct': round(float(np.median(distance_regrets)), 3),
        'win_rate_vs_distance_pct': round(wins / evaluated * 100, 1),
    }


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

def evaluate(with_ablations=False, pairs=200):
    nodes, edges, meta = ds.load()
    manifest = load_manifest()
    report = {'graph': {'nodes': meta['node_count'], 'edges': meta['edge_count'],
                        'source': meta['source_csv'], 'mode': meta['mode']},
              'objectives': {}}

    for objective in meta['objectives']:
        entry = manifest['objectives'][objective]
        split = entry['split']
        train_idx = np.array(split['train'])
        test_idx = np.array(split['test'])
        targets = edges[f'target_{objective}'].to_numpy(dtype=np.float64)

        predictions = predict_with_manifest(manifest, objective, nodes, edges, meta)
        model_metrics = trainer.metrics(targets[test_idx], predictions[test_idx])

        comparisons = {'gnn_gine': model_metrics}
        for name, values in baseline_predictions(edges, meta, objective, train_idx, test_idx).items():
            comparisons[name] = trainer.metrics(targets[test_idx], values)

        if with_ablations:
            for conv in ('gcn', 'mlp'):
                result, artefacts = trainer.train_objective(
                    objective, nodes, edges, meta, conv=conv, verbose=False)
                comparisons[f'gnn_{conv}'] = result['test']

        regret = routing_regret(
            edges, targets, predictions,
            edges['segment_km'].to_numpy(dtype=np.float64), pairs=pairs)

        report['objectives'][objective] = {
            'unit': meta['target_units'].get(objective, ''),
            'test_edges': int(len(test_idx)),
            'accuracy': comparisons,
            'routing': regret,
        }

    with open(os.path.join(ARTIFACT_DIR, 'evaluation.json'), 'w', encoding='utf-8') as handle:
        json.dump(report, handle, indent=2)
    return report


def print_report(report):
    print(f"\nGraph: {report['graph']['nodes']} nodes, {report['graph']['edges']} edges "
          f"({report['graph']['source']}, mode={report['graph']['mode']})")

    for objective, section in report['objectives'].items():
        print(f"\n=== {objective}  [{section['unit']}]  "
              f"{section['test_edges']} held-out edges ===")
        print(f"  {'model':<16}{'MAE':>12}{'RMSE':>12}{'MAPE %':>10}{'R2':>10}")
        for name, values in section['accuracy'].items():
            print(f"  {name:<16}{values['mae']:>12.3f}{values['rmse']:>12.3f}"
                  f"{values['mape_pct']:>10.2f}{values['r2']:>10.4f}")
        routing = section['routing']
        print(f"  routing over {routing['pairs']} origin-destination pairs:")
        print(f"    GNN-weighted    regret {routing['model_regret_mean_pct']:>7.2f}% mean, "
              f"{routing['model_regret_median_pct']:.2f}% median, "
              f"{routing['model_optimal_pct']}% optimal")
        print(f"    distance-only   regret {routing['distance_regret_mean_pct']:>7.2f}% mean, "
              f"{routing['distance_regret_median_pct']:.2f}% median")
        print(f"    GNN matches or beats distance-only on "
              f"{routing['win_rate_vs_distance_pct']}% of pairs")


def main():
    parser = argparse.ArgumentParser(description='Evaluate edge-cost models')
    parser.add_argument('--ablations', action='store_true', help='train GCN / no-graph variants too')
    parser.add_argument('--pairs', type=int, default=200)
    args = parser.parse_args()
    print_report(evaluate(with_ablations=args.ablations, pairs=args.pairs))
    print(f"\nWritten to {os.path.join(ARTIFACT_DIR, 'evaluation.json')}")


if __name__ == '__main__':
    main()
