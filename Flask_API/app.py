import os
from flask import Flask, request, jsonify
from flask_pymongo import PyMongo
from flask_bcrypt import Bcrypt
import jwt
import datetime
from functools import wraps
from flask_cors import CORS
from bson import ObjectId
import numpy as np
import torch
import torch.nn.functional as F
import pandas as pd
import networkx as nx
from torch_geometric.data import Data

from model_def import RouteGCN

# === App & DB Setup ===
app = Flask(__name__)
CORS(app)
app.config['MONGO_URI'] = os.environ.get('MONGO_URI', 'mongodb://localhost:27017/logistics_db')
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'optigo-dev-secret-change-in-production')

mongo = PyMongo(app)
bcrypt = Bcrypt(app)

# === Load Preference-Specific GNN Models ===
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.join(BASE_DIR, '..')

def _load_model(path):
    m = RouteGCN()  # defaults: node_in=15, hidden_dim=128, num_gcn_layers=6, edge_feat_dim=22
    m.load_state_dict(torch.load(path, map_location='cpu', weights_only=True))
    m.eval()
    return m

# Try loading preference-specific models first, fall back to generic
_model_paths = {
    'greenest': os.path.join(ROOT_DIR, 'best_gnn_greenest.pt'),
    'fastest':  os.path.join(ROOT_DIR, 'best_gnn_fastest.pt'),
    'cheapest': os.path.join(ROOT_DIR, 'best_gnn_cheapest.pt'),
}
_fallback_path = os.path.join(BASE_DIR, 'trained_gcn_model.pt')

models = {}
for pref, path in _model_paths.items():
    if os.path.exists(path):
        models[pref] = _load_model(path)
    elif os.path.exists(_fallback_path):
        models[pref] = _load_model(_fallback_path)
    else:
        raise FileNotFoundError(f"No model found for preference '{pref}'. Expected: {path}")

# === Load Route & Depot Data ===
route_df  = pd.read_csv(os.path.join(BASE_DIR, 'expanded_route_df.csv'))
depots_df = pd.read_csv(os.path.join(BASE_DIR, 'expanded_depots_df.csv'))
depot_locations = {
    row['Depot_ID']: (row['Latitude'], row['Longitude'])
    for _, row in depots_df.iterrows()
}

# === JWT Helper ===
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            token = request.headers['Authorization'].split()[1]
        if not token:
            return jsonify({'message': 'Token is missing!'}), 401
        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
            current_user = mongo.db.users.find_one({'_id': ObjectId(data['user_id'])})
            if not current_user:
                raise Exception("User not found")
            role = current_user.get('user_type', 'driver')
            company = current_user.get('company_name', None)
        except Exception as e:
            print(f"JWT error: {e}")
            return jsonify({'message': 'Token is invalid!'}), 401
        return f(current_user, role, company, *args, **kwargs)
    return decorated

# === Company Schema Helper ===
def ensure_company(company_name):
    company = mongo.db.companies.find_one({'name': company_name})
    if not company:
        mongo.db.companies.insert_one({
            'name': company_name,
            'total_emission': 0,
            'drivers': [],
            'created_at': datetime.datetime.utcnow()
        })

# === User Registration ===
@app.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    full_name = data.get('fullName')
    company_name = data.get('companyName')
    user_type = data.get('userType', 'driver')

    if not email or not password or not company_name or not full_name:
        return jsonify({'message': 'All fields required'}), 400

    if mongo.db.users.find_one({'email': email}):
        return jsonify({'message': 'Email already exists'}), 409

    ensure_company(company_name)

    hashed = bcrypt.generate_password_hash(password).decode('utf-8')
    user = {
        'email': email,
        'password': hashed,
        'full_name': full_name,
        'company_name': company_name,
        'user_type': user_type,
        'created_at': datetime.datetime.utcnow()
    }
    user_id = mongo.db.users.insert_one(user).inserted_id

    if user_type == "driver":
        mongo.db.companies.update_one(
            {'name': company_name},
            {'$addToSet': {'drivers': str(user_id)}}
        )

    return jsonify({'message': 'User created', 'user_id': str(user_id)})

# === User Login ===
@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    email = data.get('email')
    password = data.get('password')
    user = mongo.db.users.find_one({'email': email})
    if user and bcrypt.check_password_hash(user['password'], password):
        token = jwt.encode({
            'user_id': str(user['_id']),
            'role': user.get('user_type', 'driver'),
            'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=12)
        }, app.config['SECRET_KEY'], algorithm="HS256")
        return jsonify({
            'token': token,
            'role': user.get('user_type', 'driver'),
            'fullName': user.get('full_name'),
            'companyName': user.get('company_name'),
            'email': user.get('email')
        })
    return jsonify({'message': 'Invalid credentials'}), 401

# === Depots API ===
@app.route('/depots', methods=['GET'])
@token_required
def get_depots(current_user, role, company):
    depots = list(mongo.db.depots.find({'company': company}))
    for d in depots:
        d['_id'] = str(d['_id'])
    return jsonify(depots)

@app.route('/depots', methods=['POST'])
@token_required
def add_depot(current_user, role, company):
    if role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403
    data = request.get_json()
    depot = {
        'name': data['name'],
        'city': data['city'],
        'lat': data['lat'],
        'lon': data['lon'],
        'capacity': data.get('capacity', 0),
        'company': company,
        'created_at': datetime.datetime.utcnow()
    }
    result = mongo.db.depots.insert_one(depot)
    depot['_id'] = str(result.inserted_id)
    return jsonify(depot), 201

@app.route('/depots/<depot_id>', methods=['DELETE'])
@token_required
def delete_depot(current_user, role, company, depot_id):
    if role != 'admin':
        return jsonify({'message': 'Unauthorized'}), 403
    result = mongo.db.depots.delete_one({'_id': ObjectId(depot_id), 'company': company})
    if result.deleted_count:
        return jsonify({'message': 'Depot deleted'})
    return jsonify({'message': 'Depot not found'}), 404

# === Drivers List API ===
@app.route('/drivers', methods=['GET'])
@token_required
def get_drivers(current_user, role, company):
    drivers = list(mongo.db.users.find({'company_name': company, 'user_type': 'driver'}))
    for d in drivers:
        d['_id'] = str(d['_id'])
        d.pop('password', None)
    return jsonify(drivers)

# === Company Stats API ===
@app.route('/company-stats', methods=['GET'])
@token_required
def company_stats(current_user, role, company):
    company_doc = mongo.db.companies.find_one({'name': company})
    if not company_doc:
        return jsonify({'error': 'Company not found'}), 404
    num_depots = mongo.db.depots.count_documents({'company': company})
    num_drivers = mongo.db.users.count_documents({'company_name': company, 'user_type': 'driver'})
    total_routes = mongo.db.routes.count_documents({'company': company}) if 'routes' in mongo.db.list_collection_names() else 0
    return jsonify({
        'total_emission': company_doc.get('total_emission', 0),
        'num_depots': num_depots,
        'num_drivers': num_drivers,
        'total_routes': total_routes,
        'company_name': company
    })

# === Emissions Update Endpoint ===
@app.route('/add-emission', methods=['POST'])
@token_required
def add_emission(current_user, role, company):
    data = request.get_json()
    emission = data.get('emission', 0)
    if not isinstance(emission, (int, float)):
        return jsonify({'error': 'Emission value required'}), 400
    mongo.db.companies.update_one({'name': company}, {'$inc': {'total_emission': emission}})
    return jsonify({'message': 'Emission updated'})

# === GNN Route Optimization Helpers ===

def _build_node_features(df, depot_to_idx):
    """Build 15-dim node feature matrix for all depots.

    Features (per depot):
      0-1:  normalized lat, lon
      2-3:  out-degree, in-degree
      4-8:  mean outgoing distance_km, time_min, load_ton, toll_cost, emission_zone
      9-11: mean outgoing accident_risk, hgv_restricted, toll_road
     12-14: mean incoming distance_km, time_min, load_ton
    """
    n = len(depot_to_idx)
    feats = np.zeros((n, 15), dtype=np.float32)

    lats = [depot_locations[d][0] for d in depot_to_idx]
    lons = [depot_locations[d][1] for d in depot_to_idx]
    lat_min, lat_max = min(lats), max(lats)
    lon_min, lon_max = min(lons), max(lons)
    lat_range = (lat_max - lat_min) or 1.0
    lon_range = (lon_max - lon_min) or 1.0

    for depot, idx in depot_to_idx.items():
        lat, lon = depot_locations[depot]
        feats[idx, 0] = (lat - lat_min) / lat_range
        feats[idx, 1] = (lon - lon_min) / lon_range

    # Aggregate outgoing edge stats
    for depot, idx in depot_to_idx.items():
        out_rows = df[df['Source_Depot'] == depot]
        feats[idx, 2] = len(out_rows)
        if not out_rows.empty:
            feats[idx, 4] = out_rows['Distance_km'].mean()
            feats[idx, 5] = out_rows['Estimated_Time_Min'].mean()
            feats[idx, 6] = out_rows['Vehicle_Load_ton'].mean()
            feats[idx, 7] = out_rows['Toll_Cost_GBP'].mean()
            feats[idx, 8] = out_rows['Emission_Zone'].mean()
            feats[idx, 9] = out_rows['Accident_Risk_Flag'].mean()
            feats[idx, 10] = out_rows['HGV_Restricted'].mean()
            feats[idx, 11] = out_rows['Toll_Road'].mean()
        in_rows = df[df['Destination_Depot'] == depot]
        feats[idx, 3] = len(in_rows)
        if not in_rows.empty:
            feats[idx, 12] = in_rows['Distance_km'].mean()
            feats[idx, 13] = in_rows['Estimated_Time_Min'].mean()
            feats[idx, 14] = in_rows['Vehicle_Load_ton'].mean()

    # Normalize continuous columns by their max
    for col in [2, 3, 4, 5, 6, 7, 8, 12, 13, 14]:
        col_max = feats[:, col].max()
        if col_max > 0:
            feats[:, col] /= col_max

    return torch.tensor(feats, dtype=torch.float)


def _build_edge_features(df, depot_to_idx):
    """Build 22-dim edge feature matrix.

    Features (per edge):
      Raw (9):         Road_Type, Distance_km, Vehicle_Load_ton, Emission_Zone,
                       HGV_Restricted, Toll_Road, Toll_Cost_GBP, Accident_Risk_Flag,
                       Estimated_Time_Min
      Derived (5):     fuel_l, co2_kg, speed_kmh, road_score, efficiency_label
      Geo (4):         src_lat, src_lon, dst_lat, dst_lon  (normalized)
      Delta/norm (4):  norm_distance, norm_time, delta_lat, delta_lon
    """
    raw_cols = ['Road_Type', 'Distance_km', 'Vehicle_Load_ton', 'Emission_Zone',
                'HGV_Restricted', 'Toll_Road', 'Toll_Cost_GBP', 'Accident_Risk_Flag',
                'Estimated_Time_Min']
    raw = df[raw_cols].values.astype(np.float32)

    dist = df['Distance_km'].values.astype(np.float32)
    time = df['Estimated_Time_Min'].values.astype(np.float32)
    load = df['Vehicle_Load_ton'].values.astype(np.float32)

    fuel    = dist / 3.5                                              # L (avg HGV efficiency)
    co2     = fuel * 2.7                                              # kg CO2
    speed   = np.where(time > 0, dist / (time / 60.0), 0.0)          # km/h
    road_score = 1.0 - (df['HGV_Restricted'].values + df['Emission_Zone'].values +
                        df['Accident_Risk_Flag'].values).astype(np.float32) / 3.0
    efficiency_label = np.where(
        (dist > 0) & (time > 0),
        dist / (time / 60.0) / (load + 1e-6),
        0.0
    ).astype(np.float32)

    # Geo coordinates (normalized)
    lats = [depot_locations[d][0] for d in depot_to_idx]
    lons = [depot_locations[d][1] for d in depot_to_idx]
    lat_min, lat_max = min(lats), max(lats)
    lon_min, lon_max = min(lons), max(lons)
    lat_range = (lat_max - lat_min) or 1.0
    lon_range = (lon_max - lon_min) or 1.0

    src_lat = np.array([(depot_locations[d][0] - lat_min) / lat_range
                        for d in df['Source_Depot']], dtype=np.float32)
    src_lon = np.array([(depot_locations[d][1] - lon_min) / lon_range
                        for d in df['Source_Depot']], dtype=np.float32)
    dst_lat = np.array([(depot_locations[d][0] - lat_min) / lat_range
                        for d in df['Destination_Depot']], dtype=np.float32)
    dst_lon = np.array([(depot_locations[d][1] - lon_min) / lon_range
                        for d in df['Destination_Depot']], dtype=np.float32)

    dist_max = dist.max() if dist.max() > 0 else 1.0
    time_max = time.max() if time.max() > 0 else 1.0
    norm_dist  = dist / dist_max
    norm_time  = time / time_max
    delta_lat  = np.abs(dst_lat - src_lat)
    delta_lon  = np.abs(dst_lon - src_lon)

    derived = np.column_stack([fuel, co2, speed, road_score, efficiency_label])
    geo     = np.column_stack([src_lat, src_lon, dst_lat, dst_lon])
    delta   = np.column_stack([norm_dist, norm_time, delta_lat, delta_lon])

    edge_feats = np.concatenate([raw, derived, geo, delta], axis=1)  # (E, 22)
    return torch.tensor(edge_feats, dtype=torch.float)


def update_predictions_with_gcn(model, df):
    """Run GNN on route graph edges, annotate df with GNN_Score (sigmoid, 0-1)."""
    depot_to_idx = {depot: i for i, depot in enumerate(depot_locations)}

    valid_mask = (
        df['Source_Depot'].isin(depot_to_idx) &
        df['Destination_Depot'].isin(depot_to_idx)
    )
    df = df[valid_mask].copy()

    if df.empty:
        df['GNN_Score'] = 0.5
        return df

    edge_index = torch.tensor([
        [depot_to_idx[src], depot_to_idx[dst]]
        for src, dst in zip(df['Source_Depot'], df['Destination_Depot'])
    ], dtype=torch.long).t().contiguous()

    x         = _build_node_features(df, depot_to_idx)   # (N, 15)
    edge_attr = _build_edge_features(df, depot_to_idx)   # (E, 22)
    data      = Data(x=x, edge_index=edge_index, edge_attr=edge_attr)

    with torch.no_grad():
        logits = model(data)                             # [E]
        scores = F.sigmoid(logits).tolist()

    df['GNN_Score'] = scores
    return df


def compute_route_cost(row, preference='greenest'):
    """Edge cost function used by Dijkstra.

    GNN_Score is a sigmoid value in [0, 1]. Higher score = the model considers
    this edge worse (same sign convention as the old binary Predicted_Label).
    """
    gnn = row.get('GNN_Score', 0.5)
    cost = 0.0
    if preference == 'greenest':
        cost += 1.0 * gnn
        cost += 0.5 * row.get('Emission_Zone', 0)
    elif preference == 'fastest':
        cost += 0.05 * row.get('Estimated_Time_Min', row['Distance_km'] / 80 * 60)
        cost += 0.3 * gnn
    elif preference == 'cheapest':
        cost += 0.1 * row.get('Toll_Cost_GBP', 0)
        cost += 0.3 * gnn
    cost += 0.3 * row.get('HGV_Restricted', 0)
    cost += 0.2 * row.get('Accident_Risk_Flag', 0)
    return cost


def find_best_route(df, start, end, preference='greenest'):
    """Build weighted graph from annotated df and run Dijkstra."""
    G = nx.DiGraph()
    df['Edge_Cost'] = df.apply(lambda row: compute_route_cost(row, preference), axis=1)
    for _, row in df.iterrows():
        G.add_edge(row['Source_Depot'], row['Destination_Depot'], weight=row['Edge_Cost'])
    try:
        path = nx.dijkstra_path(G, source=start, target=end, weight='weight')
        cost = sum(G[u][v]['weight'] for u, v in zip(path[:-1], path[1:]))
        return path, cost
    except nx.NetworkXNoPath:
        return None, float('inf')


# Fuel efficiency (km/L) per preference — HGV averages
_EFFICIENCY = {'greenest': 3.8, 'fastest': 3.0, 'cheapest': 3.5}
_CO2_PER_LITRE = 2.7   # kg CO2 per litre diesel
_DIESEL_PRICE_GBP = 1.55  # £/litre UK average


def compute_route_metrics(df, path, preference):
    """Sum up distance/time along a path and derive fuel, CO2 and cost estimates."""
    total_distance = 0.0
    total_time = 0.0
    total_toll = 0.0
    has_time_col = 'Estimated_Time_Min' in df.columns

    for u, v in zip(path[:-1], path[1:]):
        edge_rows = df[(df['Source_Depot'] == u) & (df['Destination_Depot'] == v)]
        if not edge_rows.empty:
            row = edge_rows.iloc[0]
            d = row.get('Distance_km', 0)
            total_distance += d
            total_toll += row.get('Toll_Cost_GBP', 0)
            if has_time_col:
                total_time += row.get('Estimated_Time_Min', d / 80 * 60)
            else:
                total_time += d / 80 * 60

    efficiency = _EFFICIENCY.get(preference, 3.5)
    estimated_fuel = round(total_distance / efficiency, 1) if efficiency else 0
    co2_kg = round(estimated_fuel * _CO2_PER_LITRE, 1)
    estimated_cost = round(estimated_fuel * _DIESEL_PRICE_GBP + total_toll, 2)

    return {
        'total_distance_km': round(total_distance, 1),
        'estimated_time_min': round(total_time),
        'estimated_fuel_l': estimated_fuel,
        'co2_kg': co2_kg,
        'estimated_cost_gbp': estimated_cost
    }


# === Best Route Endpoint ===
@app.route('/best-route', methods=['POST'])
def best_route():
    data = request.get_json()
    start = data.get('start')
    end = data.get('end')
    preference = data.get('preference', 'greenest')

    if not start or not end:
        return jsonify({'error': 'start and end depots required'}), 400

    if start == end:
        return jsonify({'error': 'Start and end depots must be different'}), 400

    if start not in depot_locations or end not in depot_locations:
        return jsonify({'error': f'Depot not found in dataset'}), 400

    if preference not in models:
        preference = 'greenest'

    model = models[preference]
    annotated_df = update_predictions_with_gcn(model, route_df.copy())
    path, cost = find_best_route(annotated_df, start, end, preference)

    if path is None:
        return jsonify({'error': 'No route found between these depots'}), 404

    response_path = [
        {
            'depot': depot,
            'lat': depot_locations[depot][0],
            'lon': depot_locations[depot][1]
        }
        for depot in path
    ]

    metrics = compute_route_metrics(annotated_df, path, preference)

    return jsonify({
        'route': response_path,
        'gnn_cost': round(cost, 4),
        'preference': preference,
        **metrics
    })


# === MAIN ===
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
