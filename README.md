# OptiGo — AI-Powered Logistics Route Optimisation Platform

A full-stack fleet planning application. A Graph Neural Network scores the road
network for three objectives (lowest CO₂, fastest, cheapest), and a
pickup-and-delivery route optimiser turns orders, packages and vehicles into
costed, sequenced itineraries — including empty running, driver breaks and
capacity checks.

**Live application:** https://optigo-frontend.vercel.app

---

## ⚠️ Important Disclaimer — Synthetic Training Data

**The models are trained entirely on artificially generated data.** The dataset
(~5,000 synthetic journeys, reduced to a 68-location / 1,706-edge freight graph)
was constructed programmatically. While the topology and feature distributions
are designed to be realistic, they do not reflect any real road network, traffic
conditions, or freight patterns — and because the generator derives cost largely
from distance, simple baselines are competitive with the learned model here (see
the results table below).

The pipeline itself is dataset-agnostic: point it at a real feed through a schema
file and everything downstream — training, evaluation, serving, the planner's
location catalog — follows automatically.

**Route recommendations produced by this system should not be used for real
operational decisions.** Distance, time, fuel, and cost outputs are indicative
only and not deployable in real-world logistics without retraining on real,
area-specific data.

---

## What the platform does

| Capability | Where |
|---|---|
| Multi-pickup / multi-drop planning with pickup-before-delivery precedence | `Flask_API/vrp.py`, planner UI |
| Multi-vehicle, multi-order assignment across a fleet | `POST /plan` |
| Manual stop re-sequencing with instant re-costing | `POST /plan/resequence`, `POST /routes/<id>/resequence` |
| Custom stops — rest, break, fuel, arbitrary waypoints | planner UI → `stops[].type` |
| Automatic statutory driver breaks (45 min after 4.5 h driving) | `PlanOptions.auto_breaks` |
| Empty-mile measurement (base → first pickup, inter-order, run home) | every plan's `metrics.empty_km` |
| Package details — weight, dimensions, pallets, fragile, hazardous, chilled, value | Orders page, `POST /orders` |
| Vehicle records — capacity, dimensions, type, fuel, efficiency, costs, base depot | Fleet page, `POST /vehicles` |
| Capacity, volume, pallet and temperature-compatibility checks | planner engine |
| Time windows with waiting / lateness reporting | `window_start` / `window_end` |
| Reports: summary, emissions, utilisation, empty running, orders, route log (+ CSV) | Reports page, `GET /reports/*` |
| Public REST API with API-key auth for creating orders and routes | `/api/v1/*` |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, React-Leaflet, Recharts |
| Backend API | Python 3.10, Flask (blueprints + app factory), PyMongo, bcrypt, PyJWT |
| Optimisation | Custom pickup-and-delivery solver (cheapest insertion + or-opt / 2-opt) |
| AI / ML | PyTorch, PyTorch Geometric — `GINEConv` edge-cost regressors (one per objective) |
| Database | MongoDB |
| Deployment | Vercel (frontend) · Railway Docker + gunicorn (backend + GNN) |

---

## Project Structure

```
Project2/
├── Flask_API/
│   ├── app.py              # App factory, error handling, /health, /api/v1 index
│   ├── config.py           # Environment configuration, vehicle & fuel presets
│   ├── db.py               # Mongo client, retries, indexes, serialisation
│   ├── security.py         # Password hashing, JWT, API keys, auth decorators
│   ├── geo.py              # Distance, energy, emission and cost model
│   ├── catalog.py          # Location catalog: company depots + GNN dataset depots
│   ├── vrp.py              # Route optimisation engine (pure Python)
│   ├── gnn/                # ML pipeline: schema, dataset, model, train,
│   │                       #   evaluate, service (see "Machine learning" below)
│   ├── gnn_artifacts/      # Built graph + trained weights + scalers + manifest
│   ├── models.py           # Validation / normalisation of every document type
│   ├── web.py              # Request helpers, CSV responses, validation errors
│   ├── api_*.py            # Blueprints: auth, locations, vehicles, orders,
│   │                       #   planning, reports, settings
│   └── tests/              # test_planning.py (solver) · test_api.py (HTTP)
│                           #   test_gnn.py (ML pipeline + train/serve parity)
├── Frontend/route-optimizer/
│   └── src/
│       ├── pages/          # Login, RoutePlanner, Orders, Vehicles, Depots,
│       │                   #   Reports, Emissions, LiveTracking, Settings, Admin
│       ├── components/     # PlanBuilder, PlanResults, LeafletMap, PackageLines, ui
│       ├── context/        # AuthContext, SettingsContext
│       └── lib/            # api.js (API client), format.js (unit formatting)
├── Dockerfile              # Railway image (gunicorn + PyTorch CPU)
└── OptiGo_Introduction.md
```

---

## Running Locally

### 1. Backend (Flask API + GNN)

```bash
cd Flask_API
python -m venv venv
venv\Scripts\activate                # Windows   (source venv/bin/activate on macOS/Linux)

pip install torch==2.1.2 --index-url https://download.pytorch.org/whl/cpu
pip install torch_geometric==2.4.0
pip install -r requirements.txt

set MONGO_URI=mongodb://localhost:27017/logistics_db
set JWT_SECRET=your-secret-key-here
python app.py                        # http://localhost:5000
```

For production, run it the way the container does:

```bash
gunicorn "app:create_app()" --bind 0.0.0.0:5000 --workers 1 --threads 8 --timeout 120
```

**Trained models** live in `Flask_API/gnn_artifacts/` and are built by
`python -m gnn.train` (about 3 minutes on CPU — no GPU needed). If they or
PyTorch are missing the API still runs: planning falls back to geometric
distances and `/health` reports the GNN as `unavailable`.

### 2. Frontend (React)

```bash
cd Frontend/route-optimizer
npm install
echo VITE_API_BASE=http://localhost:5000 > .env.local
npm run dev                          # http://localhost:5173
npm run build                        # production bundle in dist/
```

### 3. Tests

```bash
cd Flask_API
python -m tests.test_planning        # optimisation engine — standard library only
pip install mongomock flask flask-cors pymongo bcrypt PyJWT
python -m tests.test_api             # full HTTP surface against in-memory MongoDB
python -m tests.test_gnn             # ML pipeline: leakage guards, train/serve parity
```

---

## API

Two authentication schemes are accepted on every protected endpoint:

* `Authorization: Bearer <token>` — JWT from `POST /login` (used by the web app)
* `X-API-Key: og_…` — created in **Settings → API access** (used by integrations)

`GET /api/v1` returns machine-readable documentation with request examples.

### Core endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness, database and GNN status |
| POST | `/register` · `/login` | Account creation and sign-in |
| GET/PATCH | `/auth/me` · `/auth/profile` | Current user, profile updates |
| POST | `/auth/change-password` | Password change |
| GET/POST/PATCH/DELETE | `/depots`, `/locations` | Location catalog (company + dataset) |
| POST | `/depots/import` | Copy trained-network locations into your own catalog |
| GET/POST/PATCH/DELETE | `/vehicles` | Fleet register |
| GET | `/vehicle-types` | Vehicle presets (capacity, dimensions, efficiency) |
| GET/POST/PATCH/DELETE | `/orders` | Orders with package detail (bulk create supported) |
| POST | `/orders/<id>/status` | Status transitions |
| GET | `/orders/export.csv` | CSV export |
| POST | `/plan` | Plan routes for vehicles + orders/stops |
| POST | `/plan/resequence` | Re-cost a hand-ordered sequence (unsaved plan) |
| GET/POST/PATCH/DELETE | `/routes` | Saved plans; `PATCH status=dispatched` books CO₂ |
| POST | `/routes/<id>/resequence` | Re-order a saved route's stops |
| GET | `/reports` · `/reports/<id>` | summary · routes · emissions · utilisation · empty-miles · orders · vehicles |
| GET | `/reports/<id>/export.csv` | CSV export of any report |
| GET/PUT | `/settings` | Preferences, planning defaults, notifications |
| GET/POST/DELETE | `/api-keys` | Integration key management |
| GET | `/settings/export[/<dataset>]` | Data export (ZIP or JSON) |
| POST | `/route-alternatives` | Compare greenest / fastest / cheapest for one pair, with road geometry |
| POST | `/best-route` | Single learned-cost route between two network locations |

### Example — create an order and plan it

```bash
curl -X POST "$OPTIGO_URL/api/v1/orders" \
  -H "X-API-Key: $OPTIGO_KEY" -H "Content-Type: application/json" \
  -d '{
    "reference": "ORD-1001",
    "customer_name": "Northern Foods",
    "pickup":  {"location_id": "Depot_3", "window_start": "08:00", "window_end": "12:00"},
    "dropoff": {"lat": 53.4808, "lon": -2.2426, "name": "Manchester RDC"},
    "packages": [{"package_type": "pallet", "quantity": 4, "weight_kg": 250,
                  "length_cm": 120, "width_cm": 100, "height_cm": 150,
                  "temperature_controlled": true, "temp_max_c": 4}]
  }'

curl -X POST "$OPTIGO_URL/api/v1/plan" \
  -H "X-API-Key: $OPTIGO_KEY" -H "Content-Type: application/json" \
  -d '{"preference": "greenest",
       "vehicle_ids": ["<vehicle id>"],
       "order_ids":  ["<order id>"],
       "stops": [{"type": "rest", "location_id": "Depot_12", "service_minutes": 45}],
       "options": {"optimize_sequence": true, "auto_breaks": true, "return_to_start": true},
       "save": true}'
```

Every plan response contains, per vehicle: the ordered `stops`, a `timeline`
with arrival/departure times and on-board load, `legs` flagged `empty` when the
vehicle runs unloaded, `violations` (late windows, over-capacity, shift length)
and `metrics` (distance, empty km/miles, repositioning km, driving and service
minutes, fuel, CO₂, cost breakdown, capacity utilisation).

---

## Environment Variables

### Backend

| Variable | Description | Default |
|---|---|---|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/logistics_db` |
| `SECRET_KEY` / `JWT_SECRET` | JWT signing key (either name works) | dev fallback — **set in production** |
| `TOKEN_TTL_HOURS` | Session length | `12` |
| `PORT` | HTTP port | `5000` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `*` |
| `EAGER_MODEL_LOAD` | `1` loads the GNNs at boot instead of on first use | `0` |
| `ROAD_FACTOR` | Great-circle → road distance multiplier | `1.28` |
| `DEFAULT_SPEED_KMH` · `DIESEL_PRICE_GBP` · `DRIVER_COST_PER_HOUR_GBP` | Cost model | `62` · `1.55` · `16.5` |
| `MAX_DRIVING_MINUTES_BEFORE_BREAK` · `DEFAULT_BREAK_MINUTES` | Driver-hours rules | `270` · `45` |
| `WEB_CONCURRENCY` · `WEB_THREADS` · `WEB_TIMEOUT` | gunicorn sizing (Docker) | `1` · `8` · `120` |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_BASE` | URL of the Flask backend API |

---

## How the numbers are calculated

* **Distance** — great-circle distance × `ROAD_FACTOR`, or the GNN corridor
  distance when both endpoints are dataset depots and the corridor option is on.
* **Time** — distance ÷ the vehicle's average speed, plus service time, waiting
  for time windows, and statutory breaks.
* **Fuel / energy** — the vehicle's own km/L (or kWh/km), scaled up to +18% at
  full payload.
* **CO₂** — 2.68 kg/L diesel, 2.31 kg/L petrol, 0.207 kg/kWh (UK grid average).
* **Cost** — fuel + per-km running cost + driver time.
* **Empty running** — any leg driven with zero load, reported separately along
  with the repositioning leg from base to the first pickup.

---

## Deployment

- **Frontend:** Vercel — https://optigo-frontend.vercel.app
- **Backend + GNN:** Railway (Docker, gunicorn)

```bash
# Frontend (from Frontend/route-optimizer/)
vercel --prod --yes

# Backend (from the project root)
railway up --service optigo-api
```

The container exposes `/health` for platform health checks; it reports `503`
while MongoDB is unreachable so a bad deploy is caught before users are.

---

## User Roles

| Role | Permissions |
|---|---|
| Admin | Everything, including fleet/depot management, API keys and data deletion |
| Planner | Fleet, depots, orders, planning, API keys |
| Driver | View depots and fleet, plan routes, view tracking, emissions and reports |

---

## Machine learning: learned edge costs

The models predict **what one leg of a journey costs** — in pounds, hours or kg
of CO2 — and those predictions are used directly as edge weights inside the
shortest-path search. Routing therefore optimises a learned objective rather
than a hand-tuned formula.

```
gnn/schema.py     column mapping for your dataset  (swap this for real data)
gnn/dataset.py    raw journeys  ->  per-edge graph with additive targets
gnn/model.py      EdgeCostGNN — imported by BOTH training and serving
gnn/train.py      one regressor per objective, clean splits, artefact manifest
gnn/evaluate.py   held-out accuracy, baselines, ablations, routing regret
gnn/service.py    lazy loading, cached inference, graceful degradation
```

### Architecture

`EdgeCostGNN`: node/edge encoders -> 3 x `GINEConv` message passing with
residual connections -> MLP readout over `[h_u ‖ h_v ‖ e_uv]` -> one scalar.
Edge attributes participate in message passing, not only in the readout, since
they describe the road segment being aggregated. Targets are trained as
standardised `log1p(cost)`, so inversion is always positive — a hard requirement
for Dijkstra.

### Results (68 nodes, 1,706 edges, 257 held-out edges per objective)

| Objective | GNN MAE | GNN R² | Best baseline | GNN routing regret | Distance-only regret |
|---|---|---|---|---|---|
| cheapest (GBP) | 13.18 | 0.9884 | 0.9900 (distance × rate) | **1.15%** | 1.71% |
| fastest (hours) | 0.071 | 0.9961 | 0.9919 (gradient boosting) | **0.38%** | 4.50% |
| greenest (kg CO₂) | 4.83 | 0.9905 | 0.9944 (distance × rate) | **1.22%** | 2.26% |

Read this honestly: on **magnitude** accuracy the GNN only matches simple
baselines, because in this synthetic dataset cost is close to proportional to
distance — a one-parameter model is already strong. The gain shows up in
**decision quality**: routing on learned costs cuts mean regret against the
oracle path by 1.5–12x versus distance-only routing, and matches or beats it on
81–97% of origin–destination pairs. Regenerate every number with
`python -m gnn.evaluate`; add `--ablations` to train GCN and no-message-passing
variants for comparison.

### Defects fixed in this pipeline

The previous version loaded checkpoints successfully and produced numbers that
did not mean anything. Each of these was silent:

1. **Non-additive targets** — every leg of a journey was labelled with the
   *whole journey's* total, so summing predictions along a 3-leg path triple-counted
   it. Targets are now allocated across legs by distance share.
2. **Target leakage** — `total_cost_gbp`, `total_time_hours` and
   `co2_emissions_kg` were inputs *and* labels. `gnn/schema.py` now refuses any
   feature that is a target or a component of one.
3. **Train/serve skew** — serving rebuilt features by hand from a different CSV,
   in a different order, unscaled, against a different node vocabulary. Serving
   now reads the feature order, scaler parameters and node index from the
   manifest training wrote.
4. **Architecture mismatch** — the serving class substituted `ReLU` where
   training had `Dropout`, applying an extra ReLU after every BatchNorm.
   `load_state_dict` accepted it silently. One class is now shared by both.
5. **Sigmoid on a regression head** — a model trained to output pounds was
   squashed to 0–1 and mixed into a hand-tuned heuristic. Predictions are now
   used in their real units.
6. **Scaler leakage** — the scaler was fitted on all rows before splitting; it is
   now fitted on training edges only.

`tests/test_gnn.py` asserts the properties that were violated, including
train/serve prediction parity to 1e-3.

### Drawing routes on real roads

The models decide *which* locations to route through; they know nothing about
road shape, because the dataset has no geometry. So the road-following polyline
for every network edge is fetched **once, offline** and stored beside the model
artefacts:

```bash
python -m gnn.geometry                                  # OSRM public demo, no key
python -m gnn.geometry --base-url http://localhost:5000 # your own OSRM
python -m gnn.geometry --report                         # coverage + distance sanity check
```

The deployed app then renders road-following routes with **no routing API, no
key and no internet at request time** — a demo works offline, rendering is
instant, and nothing rate-limits. Legs to arbitrary customer coordinates have no
precomputed shape and stay straight lines, labelled as such in the map popup:
the map shows exactly what is known.

Storing the router's own distance per edge does two things beyond drawing:

* **Validation.** Measured across all 1,706 edges the road factor is **1.279**,
  against the 1.28 the planner assumes for legs it has to estimate — the
  approximation holds up.
* **Accuracy.** Corridor legs report the measured road distance rather than a
  great-circle hop. Before this, a network route understated its own distance
  (and therefore its fuel, CO₂ and cost) by roughly 28% relative to every other
  leg in the same plan.

### Comparing objectives

Because each objective is a separate trained model, each can prefer a different
corridor. `POST /route-alternatives` returns all three for one origin/destination
pair with their distance, time, cost, CO₂ and road geometry, and the planner
overlays them on one map — greenest solid, fastest dashed, cheapest dotted. That
is the trade-off a fleet planner actually needs to see, and it is something a
single-answer routing product does not show you.

### Using your own dataset

Everything above is dataset-agnostic. Describe your columns in a JSON schema and
rebuild — no pipeline code changes:

```bash
python -m gnn.dataset --csv data/your_legs.csv --schema schemas/your_fleet.json
python -m gnn.train                  # ~3 minutes on CPU, no GPU required
python -m gnn.evaluate               # verify before shipping
```

Set `"mode": "direct"` in the schema when each row is already a single measured
leg (typical of telematics or TMS leg tables); the distance-share allocation is
then skipped entirely, which is strictly better — allocation is an assumption,
measurement is not. The planner picks up the retrained models on restart, and
the location catalog follows the node set in the new artefacts automatically.

---

## Third-Party Libraries

**Backend:** Flask · Flask-CORS · PyMongo · bcrypt · PyJWT · gunicorn · PyTorch ·
PyTorch Geometric · NetworkX · pandas

**Frontend:** React 19 · Vite · Tailwind CSS · React-Leaflet / Leaflet · React
Router · React Hot Toast · Recharts · React Icons · Lucide
