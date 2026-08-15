"""Train one edge-cost regressor per objective. CPU-only, minutes to run.

    python -m gnn.train                 # all three objectives
    python -m gnn.train --conv gcn      # ablation: no edge features in messages
    python -m gnn.train --conv mlp      # ablation: no message passing at all

Discipline enforced here (all of it was missing before):
* edges are split train/val/test **before** any scaler is fitted, so the feature
  scaler never sees validation or test rows;
* the scaler, the feature order, the node index and the architecture config are
  written next to the weights as one manifest — serving loads exactly what
  training produced;
* early stopping on validation MAE in real units (GBP / hours / kg), not on the
  transformed loss.
"""
import argparse
import json
import os
import time

import joblib
import numpy as np
import torch
import torch.nn as nn
from sklearn.preprocessing import StandardScaler

from gnn import dataset as ds
from gnn.model import EdgeCostGNN, to_cost

ARTIFACT_DIR = ds.ARTIFACT_DIR
SEED = 17


def split_indices(count, seed=SEED, train_frac=0.70, val_frac=0.15):
    generator = np.random.default_rng(seed)
    order = generator.permutation(count)
    train_end = int(count * train_frac)
    val_end = train_end + int(count * val_frac)
    return order[:train_end], order[train_end:val_end], order[val_end:]


def metrics(true_values, predicted):
    true_values = np.asarray(true_values, dtype=np.float64)
    predicted = np.asarray(predicted, dtype=np.float64)
    errors = predicted - true_values
    ss_res = float(np.sum(errors ** 2))
    ss_tot = float(np.sum((true_values - true_values.mean()) ** 2))
    return {
        'mae': float(np.mean(np.abs(errors))),
        'rmse': float(np.sqrt(np.mean(errors ** 2))),
        'mape_pct': float(np.mean(np.abs(errors) / np.maximum(true_values, 1e-6)) * 100),
        'r2': float(1 - ss_res / ss_tot) if ss_tot > 0 else 0.0,
    }


def train_objective(objective, nodes, edges, meta, conv='gine', epochs=1500, patience=200,
                    hidden_dim=128, num_layers=3, lr=2e-3, weight_decay=1e-5,
                    seed=SEED, verbose=True):
    torch.manual_seed(seed)
    node_matrix, edge_matrix, edge_index = ds.matrices(nodes, edges, meta)
    targets = edges[f'target_{objective}'].to_numpy(dtype=np.float64)

    train_idx, val_idx, test_idx = split_indices(len(edges), seed=seed)

    # Fit on training edges only — the previous pipeline scaled the whole set.
    edge_scaler = StandardScaler().fit(edge_matrix[train_idx])
    node_scaler = StandardScaler().fit(node_matrix)
    x = torch.tensor(node_scaler.transform(node_matrix), dtype=torch.float)
    edge_attr = torch.tensor(edge_scaler.transform(edge_matrix), dtype=torch.float)
    edge_index_t = torch.tensor(edge_index, dtype=torch.long)

    # Standardise the log target on the training edges: the head then starts
    # near the target mean instead of having to climb several log units.
    log_targets = np.log1p(targets)
    target_mean = float(log_targets[train_idx].mean())
    target_std = float(log_targets[train_idx].std()) or 1.0
    y_scaled = torch.tensor((log_targets - target_mean) / target_std, dtype=torch.float)

    model = EdgeCostGNN(node_in=x.shape[1], edge_in=edge_attr.shape[1],
                        hidden_dim=hidden_dim, num_layers=num_layers, conv=conv, dropout=0.1)
    optimiser = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimiser, factor=0.5, patience=60, min_lr=2e-4)
    loss_fn = nn.SmoothL1Loss()

    train_mask = torch.tensor(train_idx, dtype=torch.long)
    best_state, best_val, best_epoch, waited = None, float('inf'), 0, 0
    started = time.perf_counter()

    for epoch in range(1, epochs + 1):
        model.train()
        optimiser.zero_grad()
        predictions = model(x, edge_index_t, edge_attr)
        loss = loss_fn(predictions[train_mask], y_scaled[train_mask])
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 5.0)
        optimiser.step()

        model.eval()
        with torch.no_grad():
            costs = to_cost(model(x, edge_index_t, edge_attr), target_mean, target_std).numpy()
        val_mae = float(np.mean(np.abs(costs[val_idx] - targets[val_idx])))
        scheduler.step(val_mae)

        if val_mae < best_val - 1e-9:
            best_val, best_epoch, waited = val_mae, epoch, 0
            best_state = {key: value.detach().clone() for key, value in model.state_dict().items()}
        else:
            waited += 1
            if waited >= patience:
                break
        if verbose and epoch % 100 == 0:
            print(f'    epoch {epoch:4d}  loss {loss.item():.4f}  val MAE {val_mae:.3f}')

    model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        costs = to_cost(model(x, edge_index_t, edge_attr), target_mean, target_std).numpy()

    result = {
        'objective': objective,
        'conv': conv,
        'epochs_run': epoch,
        'best_epoch': best_epoch,
        'seconds': round(time.perf_counter() - started, 1),
        'split': {'train': len(train_idx), 'val': len(val_idx), 'test': len(test_idx)},
        'train': metrics(targets[train_idx], costs[train_idx]),
        'val': metrics(targets[val_idx], costs[val_idx]),
        'test': metrics(targets[test_idx], costs[test_idx]),
    }
    artefacts = {
        'model': model, 'edge_scaler': edge_scaler, 'node_scaler': node_scaler,
        'config': model.config, 'predictions': costs,
        'target_mean': target_mean, 'target_std': target_std,
        'split': {'train': train_idx.tolist(), 'val': val_idx.tolist(), 'test': test_idx.tolist()},
    }
    return result, artefacts


def main():
    parser = argparse.ArgumentParser(description='Train edge-cost GNNs (CPU)')
    parser.add_argument('--conv', default='gine', choices=('gine', 'gcn', 'mlp'))
    parser.add_argument('--epochs', type=int, default=1500)
    parser.add_argument('--layers', type=int, default=3)
    parser.add_argument('--hidden', type=int, default=128)
    parser.add_argument('--rebuild', action='store_true', help='rebuild the graph from the raw CSV')
    parser.add_argument('--tag', default=None, help='artefact suffix (defaults to the conv type)')
    args = parser.parse_args()

    if args.rebuild or not os.path.exists(os.path.join(ARTIFACT_DIR, 'edges.csv')):
        print('Building graph from the raw route dataset...')
        built_nodes, built_edges, built_meta = ds.build()
        ds.save(built_nodes, built_edges, built_meta)
    nodes, edges, meta = ds.load()
    print(f"Graph: {meta['node_count']} nodes, {meta['edge_count']} edges, conv={args.conv}")

    tag = args.tag or args.conv
    os.makedirs(ARTIFACT_DIR, exist_ok=True)
    manifest = {
        'conv': args.conv,
        'graph': {'nodes': meta['node_count'], 'edges': meta['edge_count']},
        'node_features': meta['node_features'],
        'edge_features': meta['edge_features'],
        'target_units': meta['target_units'],
        'target_transform': 'log1p',
        'seed': SEED,
        'objectives': {},
    }

    for objective in ds.OBJECTIVES:
        print(f'\n=== {objective} ===')
        result, artefacts = train_objective(
            objective, nodes, edges, meta, conv=args.conv, epochs=args.epochs,
            hidden_dim=args.hidden, num_layers=args.layers)
        print(f"    test  MAE {result['test']['mae']:.3f}  R2 {result['test']['r2']:.4f}  "
              f"MAPE {result['test']['mape_pct']:.1f}%  ({result['seconds']}s, "
              f"best epoch {result['best_epoch']})")

        torch.save(artefacts['model'].state_dict(),
                   os.path.join(ARTIFACT_DIR, f'edge_gnn_{objective}_{tag}.pt'))
        joblib.dump(artefacts['edge_scaler'],
                    os.path.join(ARTIFACT_DIR, f'edge_scaler_{objective}_{tag}.pkl'))
        joblib.dump(artefacts['node_scaler'],
                    os.path.join(ARTIFACT_DIR, f'node_scaler_{objective}_{tag}.pkl'))
        manifest['objectives'][objective] = {
            'weights': f'edge_gnn_{objective}_{tag}.pt',
            # Scaler parameters are embedded so serving needs only numpy —
            # no scikit-learn version coupling between training and inference.
            'edge_scaler_params': {
                'mean': artefacts['edge_scaler'].mean_.tolist(),
                'scale': artefacts['edge_scaler'].scale_.tolist()},
            'node_scaler_params': {
                'mean': artefacts['node_scaler'].mean_.tolist(),
                'scale': artefacts['node_scaler'].scale_.tolist()},
            'edge_scaler': f'edge_scaler_{objective}_{tag}.pkl',
            'node_scaler': f'node_scaler_{objective}_{tag}.pkl',
            'config': artefacts['config'],
            'target_mean': artefacts['target_mean'],
            'target_std': artefacts['target_std'],
            'metrics': {'train': result['train'], 'val': result['val'], 'test': result['test']},
            'split': artefacts['split'],
            'seconds': result['seconds'],
        }

    manifest_path = os.path.join(ARTIFACT_DIR, f'manifest_{tag}.json')
    with open(manifest_path, 'w', encoding='utf-8') as handle:
        json.dump(manifest, handle, indent=2)
    if tag == 'gine':      # the served configuration
        with open(os.path.join(ARTIFACT_DIR, 'manifest.json'), 'w', encoding='utf-8') as handle:
            json.dump(manifest, handle, indent=2)
    print(f'\nSaved manifest -> {manifest_path}')


if __name__ == '__main__':
    main()
