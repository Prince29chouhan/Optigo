FROM python:3.10-slim

WORKDIR /app

# Build tools needed for some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential curl \
    && rm -rf /var/lib/apt/lists/*

# PyTorch CPU-only (avoids the 2 GB CUDA build). Pinned to the exact versions
# the edge-cost models were trained and validated with: a checkpoint written by a
# newer torch cannot be relied on to load in an older one.
RUN pip install --no-cache-dir \
    torch==2.13.0+cpu \
    --extra-index-url https://download.pytorch.org/whl/cpu

# PyTorch Geometric supplies GINEConv, used by the edge-cost encoder.
RUN pip install --no-cache-dir torch_geometric==2.8.0

# Install remaining app dependencies
RUN pip install --no-cache-dir \
    "flask>=2.3" \
    "flask-cors>=4.0" \
    "pymongo>=4.6" \
    "bcrypt>=4.0" \
    "PyJWT>=2.8" \
    "gunicorn>=21.2" \
    "pandas>=2.0" \
    "networkx>=3.2"

# Copy the Flask application. The trained edge-cost models, their scalers and
# the graph artefacts travel with it in Flask_API/gnn_artifacts/, so training
# and serving can never drift apart in a deployed image.
COPY Flask_API/ ./Flask_API/

WORKDIR /app/Flask_API

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS "http://localhost:${PORT:-5000}/health" || exit 1

# Gunicorn instead of the single-threaded Flask dev server: one long GNN request
# no longer blocks logins, and a wedged worker is recycled instead of hanging.
# Threads (not extra workers) keep the PyTorch memory footprint to one copy.
CMD gunicorn "app:create_app()" \
    --bind "0.0.0.0:${PORT:-5000}" \
    --workers "${WEB_CONCURRENCY:-1}" \
    --threads "${WEB_THREADS:-8}" \
    --timeout "${WEB_TIMEOUT:-120}" \
    --graceful-timeout 30 \
    --access-logfile - \
    --error-logfile -
