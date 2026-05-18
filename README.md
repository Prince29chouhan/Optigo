# OptiGo — AI-Powered Logistics Route Optimisation Platform

A full-stack web application that uses Graph Neural Networks (GNNs) to perform multi-objective freight route optimisation. Users can find the optimal route between depots optimised for minimum CO₂ emissions, minimum travel time, or minimum operational cost.

**Live application:** https://optigo-frontend.vercel.app

---

## ⚠️ Important Disclaimer — Synthetic Training Data

**The GNN models are trained entirely on artificially generated data.** The route dataset (~5,000 routes across 50 simulated UK depot locations) was constructed programmatically. While the network topology and feature distributions are designed to be realistic, they do not reflect any real road network, traffic conditions, or freight patterns.

**Route recommendations produced by this system should not be used for real operational decisions.** Distance, time, fuel, and cost outputs are indicative only and not deployable in real-world logistics without retraining on real, area-specific data.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Leaflet |
| Backend API | Python 3.10, Flask, Flask-PyMongo, Flask-Bcrypt, PyJWT |
| AI / ML | PyTorch 2.1, PyTorch Geometric 2.4, GCNConv (6-layer RouteGCN) |
| Database | MongoDB |
| Deployment | Vercel (frontend) · Railway Docker (backend + GNN) |

---

## Project Structure

```
Project2/
├── Flask_API/              # Flask REST API
│   ├── app.py              # Main API server
│   ├── model_def.py        # GNN model architecture (RouteGCN)
│   └── requirements.txt    # Python dependencies
├── Frontend/
│   └── route-optimizer/    # React + Vite frontend
│       ├── src/
│       │   ├── pages/      # React page components
│       │   ├── context/    # Auth context
│       │   └── components/ # Shared components
│       ├── package.json
│       └── vite.config.js
├── best_gnn_greenest.pt    # Trained GNN model (eco-friendly)
├── best_gnn_fastest.pt     # Trained GNN model (time-efficient)
├── best_gnn_cheapest.pt    # Trained GNN model (cost-effective)
├── *.pkl                   # Feature scalers and encoders
├── Dockerfile              # Docker build for Railway deployment
└── OptiGo_Introduction.md  # Project introduction and overview
```

---

## Running Locally

### Prerequisites

- Python 3.10
- Node.js 18+
- MongoDB (local or Atlas)
- PyTorch 2.1 (CPU build is sufficient for local testing)

---

### 1. Backend (Flask API + GNN)

```bash
# From the project root
cd Flask_API

# Create and activate a virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

# Install Python dependencies
pip install torch==2.1.2 --index-url https://download.pytorch.org/whl/cpu
pip install torch_geometric==2.4.0
pip install -r requirements.txt

# Set environment variables
set MONGO_URI=mongodb://localhost:27017/logistics_db    # Windows
# export MONGO_URI=...                                  # macOS/Linux
set JWT_SECRET=your-secret-key-here

# Run the API server
python app.py
```

The API will start on `http://localhost:5000`.

**Model files required** (must be present in the project root, one level above `Flask_API/`):
- `best_gnn_greenest.pt`
- `best_gnn_fastest.pt`
- `best_gnn_cheapest.pt`
- `loc_type_enc.pkl`, `weather_enc.pkl`
- `scaler_greenest.pkl`, `scaler_fastest.pkl`, `scaler_cheapest.pkl`

---

### 2. Frontend (React)

```bash
# From the project root
cd Frontend/route-optimizer

# Install dependencies
npm install

# Create a local environment file
echo VITE_API_BASE=http://localhost:5000 > .env.local

# Start the development server
npm run dev
```

The frontend will be available at `http://localhost:5173`.

To build for production:
```bash
npm run build
# Output in Frontend/route-optimizer/dist/
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Register a new user |
| POST | `/login` | Authenticate and receive JWT |
| GET | `/depots` | List all depots |
| POST | `/depots` | Add a new depot (admin only) |
| DELETE | `/depots/<id>` | Remove a depot (admin only) |
| POST | `/optimize-route` | Run GNN route optimisation |
| GET | `/emissions` | Get emissions data for the company |

---

## Environment Variables

### Backend

| Variable | Description | Default |
|---|---|---|
| `MONGO_URI` | MongoDB connection string | `mongodb://localhost:27017/logistics_db` |
| `JWT_SECRET` | Secret key for JWT signing | (required) |
| `PORT` | Port for the Flask server | `5000` |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_BASE` | URL of the Flask backend API |

---

## Deployment

The live application is deployed on:
- **Frontend:** Vercel — https://optigo-frontend.vercel.app
- **Backend + GNN:** Railway (Docker-based) — includes Flask API, GNN model inference, and MongoDB

To redeploy after code changes:

```bash
# Frontend (from Frontend/route-optimizer/)
vercel --prod --yes

# Backend (from project root) — push to Railway
railway up --service optigo-api
```

---

## User Roles

| Role | Permissions |
|---|---|
| Admin | Add/delete depots, view all routes and emissions, manage settings |
| Driver | View depots, plan routes, view live tracking and emissions |

---

## Third-Party Libraries

### Backend
- [Flask](https://flask.palletsprojects.com/) — web framework
- [Flask-PyMongo](https://flask-pymongo.readthedocs.io/) — MongoDB integration
- [Flask-Bcrypt](https://flask-bcrypt.readthedocs.io/) — password hashing
- [PyJWT](https://pyjwt.readthedocs.io/) — JWT authentication
- [PyTorch](https://pytorch.org/) — deep learning framework
- [PyTorch Geometric](https://pytorch-geometric.readthedocs.io/) — GNN library (GCNConv)
- [NetworkX](https://networkx.org/) — graph operations and Dijkstra shortest path
- [pandas](https://pandas.pydata.org/) — data processing
- [scikit-learn](https://scikit-learn.org/) — feature scaling

### Frontend
- [React 18](https://react.dev/) — UI framework
- [Vite](https://vitejs.dev/) — build tool
- [Tailwind CSS](https://tailwindcss.com/) — utility-first CSS
- [React Leaflet](https://react-leaflet.js.org/) / [Leaflet](https://leafletjs.com/) — interactive maps
- [React Router](https://reactrouter.com/) — client-side routing
- [React Hot Toast](https://react-hot-toast.com/) — notifications
- [Recharts](https://recharts.org/) — data visualisation charts
- [Lucide React](https://lucide.dev/) — icon library

---

## GNN Architecture

Three separate `RouteGCN` models are trained — one per objective (eco, time, cost):

- **6 GCN layers** with 128 hidden dimensions
- **Node features (15-dim):** depot location, connectivity degree, aggregate load/distance statistics
- **Edge features (22-dim):** distance, speed, fuel, CO₂, toll, road quality, efficiency metrics
- **Output:** single score per edge; sigmoid-normalised scores replace manual cost heuristics in Dijkstra

The training dataset contains ~5,000 synthetic routes across 50 simulated UK depot locations. **Retraining on real GPS-traced freight data would make the system applicable to real-world operations without any architecture changes.**
