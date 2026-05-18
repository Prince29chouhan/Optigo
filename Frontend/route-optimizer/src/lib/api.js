const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function handleResponse(res) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}

export async function getBestRoute({ start, end, preference = "greenest" }) {
  const res = await fetch(`${BASE}/best-route`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ start, end, preference }),
  });
  return handleResponse(res);
}

export async function getCompanyStats() {
  const res = await fetch(`${BASE}/company-stats`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getDrivers() {
  const res = await fetch(`${BASE}/drivers`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function getDepots() {
  const res = await fetch(`${BASE}/depots`, { headers: authHeaders() });
  return handleResponse(res);
}

export async function addDepot(depotData) {
  const res = await fetch(`${BASE}/depots`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(depotData),
  });
  return handleResponse(res);
}

export async function deleteDepot(id) {
  const res = await fetch(`${BASE}/depots/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return handleResponse(res);
}

export async function addEmission(emission) {
  const res = await fetch(`${BASE}/add-emission`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ emission }),
  });
  return handleResponse(res);
}
