/**
 * OptiGo API client.
 *
 * Every call goes through `request()` so authentication, error messages and
 * expired-session handling behave the same everywhere.
 */
const BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export const API_BASE = BASE;

const TOKEN_KEY = "token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

/** Decode the JWT payload without a library (no verification — display only). */
export function decodeToken(token = getToken()) {
  if (!token) return null;
  try {
    const [, payload] = token.split(".");
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function isTokenExpired(token = getToken()) {
  const payload = decodeToken(token);
  if (!payload?.exp) return !token;
  return payload.exp * 1000 <= Date.now();
}

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body || {};
    this.field = body?.field;
  }
}

let onUnauthorized = null;
/** Registered by AuthContext so a 401 anywhere logs the user out cleanly. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(path, { method = "GET", body, headers, raw = false } = {}) {
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers: authHeaders(headers),
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new ApiError(
      "Cannot reach the OptiGo server. Check your connection and try again.",
      0
    );
  }

  if (response.status === 401 && getToken()) {
    onUnauthorized?.();
  }
  if (raw) {
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new ApiError(data.message || data.error || "Request failed", response.status, data);
    }
    return response;
  }

  const text = await response.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!response.ok) {
    throw new ApiError(
      data.error || data.message || `Request failed (${response.status})`,
      response.status,
      data
    );
  }
  return data;
}

const query = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.append(key, value);
  });
  const string = search.toString();
  return string ? `?${string}` : "";
};

/** Trigger a browser download for an authenticated endpoint. */
export async function download(path, filename) {
  const response = await request(path, { raw: true });
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ── Auth ───────────────────────────────────────────────────────── */
export const login = (email, password) =>
  request("/login", { method: "POST", body: { email, password } });

export const register = (payload) =>
  request("/register", { method: "POST", body: payload });

export const getMe = () => request("/auth/me");

export const updateProfile = (payload) =>
  request("/auth/profile", { method: "PATCH", body: payload });

export const changePassword = (currentPassword, newPassword) =>
  request("/auth/change-password", { method: "POST", body: { currentPassword, newPassword } });

export const getHealth = () => request("/health");

/* ── Locations / depots ─────────────────────────────────────────── */
export const getDepots = () => request("/depots");

export const getLocations = (params) => request(`/locations${query(params)}`);

export const addDepot = (payload) => request("/depots", { method: "POST", body: payload });

export const updateDepot = (id, payload) =>
  request(`/depots/${id}`, { method: "PATCH", body: payload });

export const deleteDepot = (id) => request(`/depots/${id}`, { method: "DELETE" });

export const importDatasetDepots = (depotIds) =>
  request("/depots/import", { method: "POST", body: { depot_ids: depotIds } });

/* ── Vehicles ───────────────────────────────────────────────────── */
export const getVehicles = (params) => request(`/vehicles${query(params)}`);

export const getVehicleTypes = () => request("/vehicle-types");

export const createVehicle = (payload) => request("/vehicles", { method: "POST", body: payload });

export const updateVehicle = (id, payload) =>
  request(`/vehicles/${id}`, { method: "PATCH", body: payload });

export const deleteVehicle = (id, force = false) =>
  request(`/vehicles/${id}${force ? "?force=1" : ""}`, { method: "DELETE" });

/* ── Orders ─────────────────────────────────────────────────────── */
export const getOrders = (params) => request(`/orders${query(params)}`);

export const getOrder = (id) => request(`/orders/${id}`);

export const createOrder = (payload) => request("/orders", { method: "POST", body: payload });

export const updateOrder = (id, payload) =>
  request(`/orders/${id}`, { method: "PATCH", body: payload });

export const setOrderStatus = (id, status) =>
  request(`/orders/${id}/status`, { method: "POST", body: { status } });

export const deleteOrder = (id, force = false) =>
  request(`/orders/${id}${force ? "?force=1" : ""}`, { method: "DELETE" });

export const exportOrdersCsv = () => download("/orders/export.csv", "optigo-orders.csv");

/* ── Planning ───────────────────────────────────────────────────── */
export const planRoutes = (payload) => request("/plan", { method: "POST", body: payload });

export const resequenceDraft = (payload) =>
  request("/plan/resequence", { method: "POST", body: payload });

export const saveRoute = (payload) => request("/routes", { method: "POST", body: payload });

export const getRoutes = (params) => request(`/routes${query(params)}`);

export const getRoute = (id) => request(`/routes/${id}`);

export const updateRoute = (id, payload) =>
  request(`/routes/${id}`, { method: "PATCH", body: payload });

export const deleteRoute = (id) => request(`/routes/${id}`, { method: "DELETE" });

export const resequenceRoute = (routeId, vehicleId, stopKeys) =>
  request(`/routes/${routeId}/resequence`, {
    method: "POST",
    body: { vehicle_id: vehicleId, stop_keys: stopKeys },
  });

/**
 * Road shapes for legs the planner could not draw on roads (custom addresses).
 * Progressive enhancement: the plan renders first, roads fill in after.
 */
export const fetchLegGeometry = (legs) =>
  request("/geometry", { method: "POST", body: { legs } });

/**
 * Compare the three learned objectives for one origin/destination pair.
 * Only available between trained-network locations.
 */
export const compareObjectives = (origin, destination) =>
  request("/route-alternatives", { method: "POST", body: { origin, destination } });

/** Legacy depot-to-depot GNN endpoint (kept for the dataset network demo). */
export const getBestRoute = ({ start, end, preference = "greenest" }) =>
  request("/best-route", { method: "POST", body: { start, end, preference } });

/* ── Reports ────────────────────────────────────────────────────── */
export const listReports = () => request("/reports");

export const getReport = (id, params) => request(`/reports/${id}${query(params)}`);

export const exportReportCsv = (id, params) =>
  download(`/reports/${id}/export.csv${query(params)}`, `optigo-${id}.csv`);

/* ── Company / dashboard ────────────────────────────────────────── */
export const getCompanyStats = () => request("/company-stats");

export const getDrivers = () => request("/drivers");

export const addEmission = (emission) =>
  request("/add-emission", { method: "POST", body: { emission } });

/* ── Settings ───────────────────────────────────────────────────── */
export const getSettings = () => request("/settings");

export const saveSettings = (settings) => request("/settings", { method: "PUT", body: { settings } });

export const resetSettings = () => request("/settings/reset", { method: "POST" });

export const getApiKeys = () => request("/api-keys");

export const createApiKey = (name, role = "planner") =>
  request("/api-keys", { method: "POST", body: { name, role } });

export const revokeApiKey = (id) => request(`/api-keys/${id}`, { method: "DELETE" });

export const exportDataset = (dataset = "all") =>
  download(
    `/settings/export${dataset === "all" ? "" : `/${dataset}`}`,
    dataset === "all" ? "optigo-export.zip" : `optigo-${dataset}.json`
  );

export const deleteCompanyData = (datasets) =>
  request("/settings/data", { method: "DELETE", body: { confirm: "DELETE", datasets } });
