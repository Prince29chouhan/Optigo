# OptiGo — AI-Powered Logistics Route Optimisation Platform

## Overview

OptiGo is a full-stack web application that applies Graph Neural Networks (GNNs) to the problem of multi-objective freight route optimisation. Given a network of depots and the road connections between them, the system learns to score each route segment according to three competing objectives — minimising carbon emissions, minimising travel time, or minimising operational cost — and uses those learned scores to find the optimal path between any two depots in the network. The platform is built around a React frontend, a Flask REST API, and a PyTorch Geometric GNN backend, with a MongoDB database for user and company management.

---

## Key Functionalities

**Multi-Objective Route Optimisation.** Users select a start depot, an end depot, and a preference (Eco-friendly / Time-efficient / Cost-effective). The system invokes a trained GNN model to score every road segment in the graph, then applies Dijkstra's shortest-path algorithm over those GNN-derived costs to return the optimal route. Output includes the full depot-by-depot path, total distance (km), estimated travel time (min), fuel consumption (L), CO₂ emissions (kg), and estimated operational cost (£).

**Graph Neural Network Scoring Engine.** Three separate RouteGCN models are trained — one per objective. Each model uses six Graph Convolutional Network (GCN) layers with 128 hidden dimensions. Node features (15-dimensional) encode depot-level statistics such as location, connectivity degree, and aggregate load and distance characteristics. Edge features (22-dimensional) encode segment-level attributes including distance, speed, fuel, CO₂, toll, road quality, and derived efficiency metrics. The model outputs a single score per edge; sigmoid-normalised scores replace manual cost heuristics inside the path-finding step.

**Live Tracking Simulation.** After a route is computed, users can visit the Live Tracking page to see the planned path drawn on an interactive map. A "Start Journey Simulation" button animates the vehicle's progress along the actual GNN-computed waypoints, updating distance covered, fuel consumed, CO₂ emitted, and cost in real time. The page is fully static by default — no values change until the user explicitly starts the simulation.

**Emissions Analytics.** A dedicated Emissions page aggregates CO₂ output across all routes for the logged-in company, visualised over time. This links route-level GNN outputs directly to fleet-level environmental reporting.

**Depot & Fleet Management.** Admin users can add and delete depot locations. A driver-facing view shows available depots and their geographic coordinates. Role-based JWT authentication (admin / driver) controls access throughout the application.

---

## Why OptiGo is Novel

Most commercial route-planning tools (Google Maps, HERE Maps, OpenRouteService) rely on hand-crafted cost functions and classical shortest-path algorithms. These systems score road segments using fixed rules — speed limits, known toll rates, static emission factors — that cannot adapt to complex, non-linear patterns in real freight logistics data.

OptiGo replaces the fixed cost function with a **learned graph representation**. The GCN layers aggregate information from a depot's neighbourhood across the entire network before scoring each edge. This means the model captures structural patterns — for example, that a segment which is individually cheap may be expensive in context because it routes through a congested sub-network — in a way that hand-crafted heuristics cannot. The three objective-specific models allow preference-aware optimisation with a single API call, rather than requiring a separate routing engine per objective.

The integration of GNN scoring directly into the Dijkstra loop (replacing edge weights with model outputs) is a lightweight, interpretable architecture that can be retrained on new data without changing any application code.

---

## Important Limitation — Synthetic Training Data

**The GNN models in the current deployment are trained entirely on artificially generated data.** The route dataset (~5,000 routes across 50 simulated UK depot locations) was constructed programmatically to cover a range of distance, load, toll, and emission scenarios. While the network topology and feature distributions are designed to be realistic, they do not reflect the actual road network, traffic conditions, or freight patterns of any real geographic area.

As a consequence, **the route recommendations produced by the current system should not be used for real operational decisions.** Distance, time, fuel, and cost outputs are indicative only.

The architecture is explicitly designed to support extension to real-world deployment. Replacing the synthetic CSV dataset with GPS-traced real route logs and retraining the three GCN models on area-specific data — for example, actual HGV journey records for the UK road network — would make the system directly applicable to commercial freight operations without any changes to the application code or model architecture.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Leaflet (maps) |
| Backend API | Python 3.10, Flask, Flask-PyMongo, Flask-Bcrypt, PyJWT |
| AI / ML | PyTorch 2.1, PyTorch Geometric 2.4, GCNConv (6-layer RouteGCN) |
| Database | MongoDB (Railway-managed) |
| Deployment | Vercel (frontend) · Railway Docker (backend + GNN) |

**Live application:** `https://optigo-frontend.vercel.app`
