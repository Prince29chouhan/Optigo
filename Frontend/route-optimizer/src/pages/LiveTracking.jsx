/* ─────────────── src/pages/LiveTracking.jsx ─────────────── */
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  FaClock,
  FaGasPump,
  FaLeaf,
  FaExclamationTriangle,
  FaCheckCircle,
  FaChevronUp,
  FaCoins,
  FaPlay,
  FaRedo,
} from "react-icons/fa";
import { TbRoad, TbGps, TbChartLine } from "react-icons/tb";
import Topbar from "../components/Topbar";
import Sidebar from "../components/Sidebar";
import Logo from "../assets/logo.png";

const getUserInitials = () => {
  const name = localStorage.getItem("fullName") || "";
  return name.split(" ").map(n => n[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "?";
};

/* Parse stored GNN route once — returns null if missing */
const parseStoredRoute = () => {
  const stored = JSON.parse(localStorage.getItem("lastRoute") || "null");
  if (!stored?.route?.length) return null;
  return {
    waypoints:      stored.route.map(s => [s.lat, s.lon]),
    totalDistance:  stored.total_distance_km   ?? 0,
    plannedTime:    stored.estimated_time_min  ?? 0,
    plannedFuel:    stored.estimated_fuel_l    ?? 0,
    totalCO2:       stored.co2_kg              ?? 0,
    totalCost:      stored.estimated_cost_gbp  ?? 0,
    origin:         stored.route[0]?.depot     ?? "Start",
    destination:    stored.route[stored.route.length - 1]?.depot ?? "End",
    preference:     stored.preference          ?? "greenest",
  };
};

/* Build the static (non-simulating) truck state from route data */
const staticTruckState = (r) => ({
  lat: r.waypoints[0][0],
  lon: r.waypoints[0][1],
  origin:      r.origin,
  destination: r.destination,
  preference:  r.preference,
  totalDistance: r.totalDistance,
  plannedTime:   r.plannedTime,
  plannedFuel:   r.plannedFuel,
  totalCO2:      r.totalCO2,
  totalCost:     r.totalCost,
  distanceDone:      0,
  distanceRemaining: r.totalDistance,
  fuelUsed:  0,
  co2SoFar:  0,
  costSoFar: 0,
  timeRemaining: r.plannedTime,
  routeProgress: 0,
  efficiency: r.plannedFuel > 0 ? +(r.totalDistance / r.plannedFuel).toFixed(2) : 0,
  status: "ready",
});

/* Hook — static by default, simulates only when simulating=true */
const useGNNTracking = (simulating, onSimulationEnd) => {
  const route = useRef(parseStoredRoute());
  const progressRef = useRef(0);

  const [truck, setTruck]               = useState(() =>
    route.current ? staticTruckState(route.current) : null
  );
  const [routeHistory, setRouteHistory] = useState([]);
  const [plannedRoute] = useState(
    () => route.current?.waypoints ?? []
  );

  /* Run simulation interval only when simulating=true */
  useEffect(() => {
    if (!simulating || !route.current) return;

    const r = route.current;
    progressRef.current = 0;
    setRouteHistory([]);

    const tick = () => {
      if (progressRef.current >= 1) {
        onSimulationEnd?.();
        return;
      }
      progressRef.current = Math.min(1, progressRef.current + 0.012);
      const p = progressRef.current;

      const segments = r.waypoints.length - 1;
      const absPos   = p * segments;
      const segIdx   = Math.min(Math.floor(absPos), segments - 1);
      const segFrac  = absPos - segIdx;
      const [lat1, lon1] = r.waypoints[segIdx];
      const [lat2, lon2] = r.waypoints[segIdx + 1] ?? r.waypoints[segIdx];
      const lat = lat1 + (lat2 - lat1) * segFrac;
      const lon = lon1 + (lon2 - lon1) * segFrac;

      const distanceDone      = +(r.totalDistance * p).toFixed(1);
      const distanceRemaining = +(Math.max(0, r.totalDistance - distanceDone)).toFixed(1);
      const fuelUsed          = +(r.plannedFuel * p).toFixed(1);
      const co2SoFar          = +(r.totalCO2    * p).toFixed(1);
      const costSoFar         = +(r.totalCost   * p).toFixed(2);
      const timeRemaining     = Math.round(r.plannedTime * (1 - p));

      setTruck({
        lat, lon,
        origin: r.origin, destination: r.destination, preference: r.preference,
        totalDistance: r.totalDistance, plannedTime: r.plannedTime,
        plannedFuel: r.plannedFuel, totalCO2: r.totalCO2, totalCost: r.totalCost,
        distanceDone, distanceRemaining,
        fuelUsed, co2SoFar, costSoFar,
        timeRemaining,
        routeProgress: Math.round(p * 100),
        efficiency: r.plannedFuel > 0 ? +(r.totalDistance / r.plannedFuel).toFixed(2) : 0,
        status: p >= 0.99 ? "arrived" : "en route",
      });

      setRouteHistory(prev => [...prev, [lat, lon]].slice(-50));
    };

    tick();
    const iv = setInterval(tick, 4000);
    return () => clearInterval(iv);
  }, [simulating]); // eslint-disable-line react-hooks/exhaustive-deps

  /* When simulation stops, reset to static state */
  useEffect(() => {
    if (!simulating && route.current) {
      setTruck(staticTruckState(route.current));
      setRouteHistory([]);
    }
  }, [simulating]);

  return { truck, routeHistory, plannedRoute };
};

/* ── Leaflet truck icon ── */
const truckIcon = new L.Icon({
  iconUrl: "https://maps.google.com/mapfiles/kml/shapes/truck.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
});

/* ── Main component ── */
const LiveTracking = () => {
  const [simulating, setSimulating]           = useState(false);
  const [currentTab, setCurrentTab]           = useState("tracking");
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const navigate     = useNavigate();
  const userInitials = getUserInitials();

  const { truck, routeHistory, plannedRoute } = useGNNTracking(
    simulating,
    () => setSimulating(false)   // called when truck reaches destination
  );

  /* No route stored yet */
  if (!localStorage.getItem("lastRoute")) {
    return (
      <div className="flex flex-col h-screen bg-gradient-to-br from-emerald-100 via-emerald-50 to-white">
        <Topbar logoSrc={Logo} appName="OptiGo" stats={[]} showLiveIndicator={false}
          userInitials={userInitials}
          onHomeClick={() => navigate("/plan")}
          onMapClick={() => navigate("/plan")}
          onProfileClick={() => navigate("/settings")} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center p-8">
              <FaExclamationTriangle size={48} className="mx-auto mb-4 text-amber-400" />
              <h2 className="text-xl font-bold text-emerald-800 mb-2">No Route Planned</h2>
              <p className="text-gray-600 mb-6">Run a route optimisation first to enable live tracking.</p>
              <button onClick={() => navigate("/plan")}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700">
                Go to Route Planner
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!truck) {
    return (
      <div className="flex flex-col h-screen bg-gradient-to-br from-emerald-100 via-emerald-50 to-white">
        <div className="flex items-center justify-center flex-1">
          <div className="text-center">
            <TbGps size={64} className="mx-auto mb-4 text-emerald-500 animate-pulse" />
            <p className="text-xl font-semibold text-emerald-800 mb-2">Loading Route</p>
            <p className="text-sm text-emerald-600">Reading GNN route data…</p>
          </div>
        </div>
      </div>
    );
  }

  /* Topbar stats — static planned values (don't change unless simulating) */
  const topStats = [
    { icon: <TbRoad className="text-emerald-600" size={18} />,  label: "Distance",   value: `${truck.totalDistance} km` },
    { icon: <FaClock className="text-amber-500" size={18} />,   label: "Est. Time",  value: `${truck.plannedTime} min` },
    { icon: <FaGasPump className="text-blue-500" size={18} />,  label: "Fuel",       value: `${truck.plannedFuel} L` },
    { icon: <FaLeaf className="text-green-600" size={18} />,    label: "CO₂",        value: `${truck.totalCO2} kg` },
    { icon: <FaCoins className="text-amber-600" size={18} />,   label: "Est. Cost",  value: `£${truck.totalCost}` },
  ];

  return (
    <div className="flex flex-col h-screen font-sans select-none
                    bg-gradient-to-br from-emerald-100 via-emerald-50 to-white
                    [background-image:radial-gradient(circle_at_15%_15%,rgba(16,185,129,.25)_0%,transparent_55%),
                                     radial-gradient(circle_at_85%_75%,rgba(5,150,105,.2)_0%,transparent_45%)]">

      <Topbar
        logoSrc={Logo} appName="OptiGo"
        stats={topStats} showLiveIndicator={simulating}
        userInitials={userInitials}
        onHomeClick={() => navigate("/plan")}
        onMapClick={() => navigate("/plan")}
        onProfileClick={() => navigate("/settings")}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

        <div className="flex flex-1 min-h-0 flex-col md:flex-row overflow-hidden relative">

          {/* Analytics Panel — desktop only */}
          <aside className="hidden md:flex md:flex-col w-[380px] bg-emerald-50 overflow-y-auto border-r border-emerald-100 z-10 flex-shrink-0">
            <RouteAnalyticsPanel truck={truck} simulating={simulating}
              onStart={() => setSimulating(true)}
              onReset={() => setSimulating(false)} />
          </aside>

          {/* Map column */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Absolute wrapper is the only bulletproof fix for Leaflet + flexbox on mobile */}
            <div className="flex-1 min-h-0 relative">
              {/* absolute inset-0 makes Leaflet fill the relative parent on mobile */}
              <div className="absolute inset-0">
                <MapContainer center={[truck.lat, truck.lon]} zoom={7}
                  style={{ height: "100%", width: "100%" }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />

                  {/* Full planned route — always visible */}
                  {plannedRoute.length > 1 && (
                    <Polyline positions={plannedRoute} color="#d1d5db" weight={4} opacity={0.6} dashArray="8,8" />
                  )}

                  {/* Travelled path — only during simulation */}
                  {simulating && routeHistory.length > 1 && (
                    <Polyline positions={routeHistory} color="#10b981" weight={4} opacity={0.9} />
                  )}

                  <Marker position={[truck.lat, truck.lon]} icon={truckIcon}>
                    <Popup>
                      <div className="text-sm">
                        <strong>{truck.origin} → {truck.destination}</strong><br />
                        {simulating
                          ? `Progress: ${truck.routeProgress}% · Efficiency: ${truck.efficiency} km/L`
                          : `Total: ${truck.totalDistance} km · ${truck.plannedTime} min`}
                      </div>
                    </Popup>
                  </Marker>
                </MapContainer>
              </div>

              {/* Overlay card — sits on top of the map, hidden on very small screens */}
              <div className="hidden sm:block absolute top-4 right-4 z-20 bg-white/95 backdrop-blur-sm rounded-xl shadow-xl p-3 md:p-4 max-w-[200px] md:max-w-[260px] border border-emerald-200">
                <h4 className="font-semibold text-emerald-800 mb-2 md:mb-3 flex items-center gap-2 text-sm md:text-base">
                  <TbGps className="text-emerald-600" /> Route Info
                </h4>
                <div className="space-y-1.5 text-xs md:text-sm">
                  <InfoRow label="From"     value={truck.origin} />
                  <InfoRow label="To"       value={truck.destination} />
                  <InfoRow label="Mode"     value={truck.preference.charAt(0).toUpperCase() + truck.preference.slice(1)} />
                  <InfoRow label="Progress" value={simulating ? `${truck.routeProgress}%` : "Ready"} />
                </div>
              </div>
            </div>

            {/* Status bar */}
            <div className="flex justify-between bg-emerald-50/80 backdrop-blur-md h-12 items-center px-6 border-t border-emerald-100">
              <div className="flex items-center gap-4">
                {simulating ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-medium text-emerald-700">Simulating</span>
                    </div>
                    <span className="text-xs text-emerald-600">{truck.routeProgress}% complete</span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-emerald-700">
                    GNN route ready · {truck.totalDistance} km · {truck.plannedTime} min
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-700">
                  {simulating
                    ? (truck.status === "arrived" ? "Arrived" : "En Route")
                    : "Ready to depart"}
                </span>
                <FaCheckCircle className="text-emerald-500" size={12} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile FABs — only on small screens */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 md:hidden flex gap-2">
        {simulating && (
          <button onClick={() => setSimulating(false)}
            className="bg-gray-600 text-white px-4 py-2.5 rounded-full shadow-lg flex items-center gap-2 hover:bg-gray-700 text-sm font-medium">
            <FaRedo size={12} /> Reset
          </button>
        )}
        <button onClick={() => setMobileDetailsOpen(true)}
          className="bg-emerald-600 text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 hover:bg-emerald-700 text-sm font-medium">
          <TbChartLine /> Analytics
        </button>
      </div>

      {mobileDetailsOpen && (
        <MobileDrawer title="Route Analytics" onClose={() => setMobileDetailsOpen(false)}>
          <RouteAnalyticsPanel truck={truck} simulating={simulating}
            onStart={() => { setSimulating(true); setMobileDetailsOpen(false); }}
            onReset={() => setSimulating(false)} />
        </MobileDrawer>
      )}
    </div>
  );
};

/* ── Sub-components ── */

function RouteAnalyticsPanel({ truck, simulating, onStart, onReset }) {
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-xl bg-emerald-600 text-white shadow-lg">
          <TbChartLine size={22} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-emerald-800">Route Analytics</h3>
          <p className="text-xs text-emerald-600">GNN-optimised · {truck.preference}</p>
        </div>
      </div>

      {/* Simulation control */}
      {!simulating ? (
        <button onClick={onStart}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700
                     text-white font-medium py-3 rounded-xl shadow transition-colors">
          <FaPlay size={14} /> Start Journey Simulation
        </button>
      ) : (
        <button onClick={onReset}
          className="w-full flex items-center justify-center gap-2 bg-gray-200 hover:bg-gray-300
                     text-gray-700 font-medium py-3 rounded-xl transition-colors">
          <FaRedo size={14} /> Reset
        </button>
      )}

      {/* Progress — only shown during simulation */}
      {simulating && (
        <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium text-emerald-800">Progress</span>
            <span className="text-emerald-600 font-semibold">{truck.routeProgress}%</span>
          </div>
          <div className="w-full bg-emerald-100 rounded-full h-3 mb-3">
            <div className="h-3 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full transition-all duration-1000"
              style={{ width: `${truck.routeProgress}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><p className="text-gray-500 text-xs">Completed</p><p className="font-bold text-emerald-800">{truck.distanceDone} km</p></div>
            <div><p className="text-gray-500 text-xs">Remaining</p><p className="font-bold text-emerald-800">{truck.distanceRemaining} km</p></div>
          </div>
        </div>
      )}

      {/* Live metrics (simulation) or planned metrics (static) */}
      <div className="grid grid-cols-2 gap-3">
        {simulating ? (
          <>
            <MetricCard icon={<FaClock className="text-amber-500" />}  label="Time Left"   value={`${truck.timeRemaining} min`} />
            <MetricCard icon={<FaGasPump className="text-blue-500" />} label="Fuel Used"   value={`${truck.fuelUsed} L`} />
            <MetricCard icon={<FaLeaf className="text-green-500" />}   label="CO₂ So Far"  value={`${truck.co2SoFar} kg`} />
            <MetricCard icon={<FaCoins className="text-amber-600" />}  label="Cost So Far" value={`£${truck.costSoFar}`} />
          </>
        ) : (
          <>
            <MetricCard icon={<FaClock className="text-amber-500" />}  label="Est. Time"   value={`${truck.plannedTime} min`} />
            <MetricCard icon={<FaGasPump className="text-blue-500" />} label="Total Fuel"  value={`${truck.plannedFuel} L`} />
            <MetricCard icon={<FaLeaf className="text-green-500" />}   label="Total CO₂"   value={`${truck.totalCO2} kg`} />
            <MetricCard icon={<FaCoins className="text-amber-600" />}  label="Est. Cost"   value={`£${truck.totalCost}`} />
          </>
        )}
      </div>

      {/* GNN Route Summary — always static */}
      <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
        <h4 className="font-semibold text-emerald-800 mb-3">GNN Route Summary</h4>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-gray-600">Total Distance</span><span className="font-semibold">{truck.totalDistance} km</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Estimated Time</span><span className="font-semibold">{truck.plannedTime} min</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Fuel Required</span><span className="font-semibold">{truck.plannedFuel} L</span></div>
          <div className="flex justify-between"><span className="text-gray-600">CO₂ Emissions</span><span className="font-semibold">{truck.totalCO2} kg</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Estimated Cost</span><span className="font-semibold">£{truck.totalCost}</span></div>
        </div>
      </div>

      {/* Fuel Efficiency — always static */}
      <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm">
        <h4 className="font-semibold text-emerald-800 mb-3">Fuel Efficiency</h4>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-gray-600">km/L</span>
          <span className="font-bold text-emerald-700">{truck.efficiency}</span>
        </div>
        <div className="w-full bg-emerald-100 rounded-full h-2">
          <div className="h-2 bg-emerald-500 rounded-full"
            style={{ width: `${Math.min(100, (truck.efficiency / 5) * 100)}%` }} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}:</span>
      <span className="font-semibold text-emerald-800">{value}</span>
    </div>
  );
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="bg-white rounded-lg p-3 border border-emerald-100 shadow-sm">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs font-medium text-gray-600">{label}</span></div>
      <span className="text-base font-bold text-emerald-800">{value}</span>
    </div>
  );
}

function MobileDrawer({ title, onClose, children }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-emerald-50 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col z-50">
      {/* Sticky header — always visible no matter how tall the content */}
      <div className="flex-shrink-0 flex flex-col items-center px-6 pt-4 pb-2 border-b border-emerald-100">
        <div className="w-12 h-1 bg-emerald-200 rounded-full mb-3" />
        <div className="flex justify-between items-center w-full">
          <h2 className="text-lg font-bold text-emerald-800">{title}</h2>
          <button onClick={onClose} className="text-emerald-600 p-2 hover:bg-emerald-100 rounded-lg">
            <FaChevronUp />
          </button>
        </div>
      </div>
      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 px-6 py-4">
        {children}
      </div>
    </div>
  );
}

export default LiveTracking;
