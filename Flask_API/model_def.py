import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv


class _BNWrapper(nn.Module):
    def __init__(self, num_features):
        super().__init__()
        self.module = nn.BatchNorm1d(num_features)

    def forward(self, x):
        return self.module(x)


class RouteGCN(nn.Module):
    def __init__(self, node_in=15, hidden_dim=128, num_gcn_layers=6, edge_feat_dim=22):
        super().__init__()

        self.gcn_layers = nn.ModuleList()
        self.gcn_layers.append(GCNConv(node_in, hidden_dim))
        for _ in range(num_gcn_layers - 1):
            self.gcn_layers.append(GCNConv(hidden_dim, hidden_dim))

        self.bn_layers = nn.ModuleList(
            [_BNWrapper(hidden_dim) for _ in range(num_gcn_layers)]
        )

        fc_in = 2 * hidden_dim + edge_feat_dim  # 256 + 22 = 278
        self.fc_edge = nn.Sequential(
            nn.Linear(fc_in, 256),    # index 0
            nn.ReLU(),                # index 1
            nn.BatchNorm1d(256),      # index 2
            nn.ReLU(),                # index 3
            nn.Linear(256, 64),       # index 4
            nn.ReLU(),                # index 5
            nn.BatchNorm1d(64),       # index 6
            nn.ReLU(),                # index 7
            nn.Linear(64, 1),         # index 8
        )

    def forward(self, data):
        x, edge_index, edge_attr = data.x, data.edge_index, data.edge_attr
        for gcn, bn in zip(self.gcn_layers, self.bn_layers):
            x = F.relu(bn(gcn(x, edge_index)))
        src, dst = edge_index[0], edge_index[1]
        edge_input = torch.cat([x[src], x[dst], edge_attr], dim=1)
        return self.fc_edge(edge_input).squeeze(-1)  # [num_edges]
