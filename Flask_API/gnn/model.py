"""Edge-cost GNN — the single definition used by training *and* serving.

The previous deployment kept two copies of the architecture: the notebook's
`DeeperEdgeGNN` (Linear → ReLU → BatchNorm → **Dropout**) and the API's
`RouteGCN` (Linear → ReLU → BatchNorm → **ReLU**). Parameter names matched, so
`load_state_dict` succeeded silently while inference applied an extra ReLU after
every BatchNorm — clamping exactly the negative activations the model relied on.
Both paths now import this module, so that class of bug cannot recur.

Design notes
------------
* Edge features participate in message passing (`GINEConv`), not only in the
  readout — the 22 contextual attributes describe the road segment, which is
  what a neighbourhood should aggregate.
* Residual connections keep a 4-layer stack from over-smoothing on a 68-node
  graph.
* `conv='mlp'` disables message passing entirely; it exists so the ablation can
  measure what the graph structure is actually worth.
"""
import torch
import torch.nn as nn
from torch_geometric.nn import GCNConv, GINEConv

CONV_TYPES = ('gine', 'gcn', 'mlp')


class EdgeCostGNN(nn.Module):
    """Predicts a scalar cost for every edge of a directed freight graph.

    The output is the model's estimate of `log1p(cost)`; callers invert it with
    `expm1`. Training in log space keeps the heavy right tail of monetary and
    emission targets from dominating the loss, and guarantees positive costs
    after inversion — a hard requirement for shortest-path search.
    """

    def __init__(self, node_in, edge_in, hidden_dim=128, num_layers=4,
                 conv='gine', dropout=0.2):
        super().__init__()
        if conv not in CONV_TYPES:
            raise ValueError(f'conv must be one of {CONV_TYPES}')
        self.conv_type = conv
        self.node_in = node_in
        self.edge_in = edge_in
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers

        self.node_encoder = nn.Sequential(
            nn.Linear(node_in, hidden_dim), nn.ReLU(), nn.Linear(hidden_dim, hidden_dim))
        self.edge_encoder = nn.Sequential(
            nn.Linear(edge_in, hidden_dim), nn.ReLU(), nn.Linear(hidden_dim, hidden_dim))

        self.convs = nn.ModuleList()
        self.norms = nn.ModuleList()
        if conv != 'mlp':
            for _ in range(num_layers):
                if conv == 'gine':
                    self.convs.append(GINEConv(
                        nn.Sequential(nn.Linear(hidden_dim, hidden_dim), nn.ReLU(),
                                      nn.Linear(hidden_dim, hidden_dim)),
                        edge_dim=hidden_dim))
                else:
                    self.convs.append(GCNConv(hidden_dim, hidden_dim))
                self.norms.append(nn.BatchNorm1d(hidden_dim))

        self.dropout = nn.Dropout(dropout)
        self.head = nn.Sequential(
            nn.Linear(hidden_dim * 3, 256), nn.ReLU(), nn.BatchNorm1d(256), nn.Dropout(dropout),
            nn.Linear(256, 64), nn.ReLU(), nn.BatchNorm1d(64), nn.Dropout(dropout),
            nn.Linear(64, 1),
        )

    def forward(self, x, edge_index, edge_attr):
        edge_embedding = self.edge_encoder(edge_attr)
        hidden = self.node_encoder(x)

        for conv, norm in zip(self.convs, self.norms):
            if self.conv_type == 'gine':
                updated = conv(hidden, edge_index, edge_embedding)
            else:
                updated = conv(hidden, edge_index)
            updated = self.dropout(torch.relu(norm(updated)))
            hidden = hidden + updated          # residual

        source, destination = edge_index[0], edge_index[1]
        readout = torch.cat([hidden[source], hidden[destination], edge_embedding], dim=1)
        return self.head(readout).squeeze(-1)

    @property
    def config(self):
        return {
            'node_in': self.node_in, 'edge_in': self.edge_in,
            'hidden_dim': self.hidden_dim, 'num_layers': self.num_layers,
            'conv': self.conv_type,
        }


def build_from_config(config):
    return EdgeCostGNN(
        node_in=config['node_in'], edge_in=config['edge_in'],
        hidden_dim=config.get('hidden_dim', 128), num_layers=config.get('num_layers', 4),
        conv=config.get('conv', 'gine'),
    )


def to_cost(predictions, mean=0.0, std=1.0):
    """Model output → positive costs usable as shortest-path weights.

    Training standardises `log1p(target)`, so inversion is
    `expm1(prediction * std + mean)`. Without the standardisation the head has to
    travel from ~0 to log-cost ≈ 5.4 before it fits anything, which is what
    stalled the first training run.
    """
    if isinstance(predictions, torch.Tensor):
        return torch.clamp(torch.expm1(predictions * std + mean), min=1e-3)
    import numpy as np  # numpy path used by the serving cache
    return np.clip(np.expm1(np.asarray(predictions) * std + mean), 1e-3, None)
