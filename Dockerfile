FROM python:3.10-slim

WORKDIR /app

# Build tools needed for some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install PyTorch CPU-only (avoids downloading the 2GB CUDA version)
RUN pip install --no-cache-dir \
    torch==2.1.2+cpu \
    --index-url https://download.pytorch.org/whl/cpu

# Install PyTorch Geometric core (GCNConv + Data are all we need)
RUN pip install --no-cache-dir torch_geometric==2.4.0

# Install remaining app dependencies
RUN pip install --no-cache-dir \
    "flask>=2.3" \
    "flask-cors>=4.0" \
    "flask-pymongo>=2.3" \
    "flask-bcrypt>=1.0" \
    "PyJWT>=2.8" \
    "pymongo>=4.6" \
    "pandas>=2.0" \
    "networkx>=3.2"

# Copy GNN model files — app.py looks for them at ROOT_DIR = /app
COPY best_gnn_greenest.pt ./best_gnn_greenest.pt
COPY best_gnn_fastest.pt  ./best_gnn_fastest.pt
COPY best_gnn_cheapest.pt ./best_gnn_cheapest.pt

# Copy Flask application — BASE_DIR = /app/Flask_API
COPY Flask_API/ ./Flask_API/

WORKDIR /app/Flask_API

EXPOSE 5000

CMD ["python", "app.py"]
