import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FaClock, FaCoins, FaGasPump, FaLeaf, FaRoute } from "react-icons/fa";
import { TbChartLine, TbMap, TbRoad, TbTruckReturn } from "react-icons/tb";
import Topbar from "../components/Topbar";
import Sidebar from "../components/Sidebar";
import PlanBuilder from "../components/PlanBuilder";
import PlanResults from "../components/PlanResults";
import LeafletMap from "../components/LeafletMap";
import { fetchLegGeometry } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { useAuth } from "../context/AuthContext";
import { formatPercent } from "../lib/format";
import Logo from "../assets/logo.png";

/** Keep the tracking page working by storing the first vehicle leg in its shape. */
function persistForTracking(plan) {
  if (!plan?.vehicles?.length) {
    localStorage.removeItem("lastRoute");
    return;
  }
  const vehicle = plan.vehicles[0];
  localStorage.setItem("lastPlan", JSON.stringify(plan));
  localStorage.setItem(
    "lastRoute",
    JSON.stringify({
      route: (vehicle.timeline || []).map((entry) => ({
        depot: entry.name,
        lat: entry.lat,
        lon: entry.lon,
      })),
      total_distance_km: vehicle.metrics?.total_distance_km ?? 0,
      estimated_time_min: vehicle.metrics?.total_minutes ?? 0,
      estimated_fuel_l: vehicle.metrics?.estimated_fuel_l ?? 0,
      co2_kg: vehicle.metrics?.co2_kg ?? 0,
      estimated_cost_gbp: vehicle.metrics?.estimated_cost_gbp ?? 0,
      preference: plan.preference,
      empty_km: vehicle.metrics?.empty_km ?? 0,
    })
  );
}

export default function RoutePlanner() {
  const [plan, setPlan] = useState(null);
  const [alternatives, setAlternatives] = useState([]);
  const [mobilePanel, setMobilePanel] = useState(null); // 'builder' | 'results'
  const [isDarkMode, setIsDarkMode] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { fmt } = useSettings();

  useEffect(() => {
    const cached = localStorage.getItem("lastPlan");
    if (cached) {
      try {
        setPlan(JSON.parse(cached));
      } catch {
        localStorage.removeItem("lastPlan");
      }
    }
  }, []);

  /**
   * Upgrade straight-line legs to road-following shapes after the plan renders.
   * Failures are silent: the plan is already correct and usable without this.
   */
  const enrichWithRoadShapes = useCallback(async (planToEnrich) => {
    const missing = [];
    planToEnrich.vehicles.forEach((vehicle, vehicleIndex) => {
      (vehicle.legs || []).forEach((leg, legIndex) => {
        if (!leg.shapes?.length && Number.isFinite(leg.from_lat) && Number.isFinite(leg.to_lat)) {
          missing.push({ vehicleIndex, legIndex, from: [leg.from_lat, leg.from_lon], to: [leg.to_lat, leg.to_lon] });
        }
      });
    });
    if (!missing.length) return;

    try {
      const response = await fetchLegGeometry(missing.map(({ from, to }) => ({ from, to })));
      if (!response.enabled || !response.resolved) return;

      const vehicles = planToEnrich.vehicles.map((vehicle) => ({ ...vehicle, legs: [...(vehicle.legs || [])] }));
      missing.forEach((target, index) => {
        const shape = response.shapes[index];
        if (!shape) return;
        const leg = vehicles[target.vehicleIndex].legs[target.legIndex];
        vehicles[target.vehicleIndex].legs[target.legIndex] = {
          ...leg,
          shapes: [{ from: leg.from, to: leg.to, polyline: shape.polyline, road_km: shape.road_km }],
        };
      });
      setPlan((current) => (current && current.planKey === planToEnrich.planKey
        ? { ...current, vehicles } : current));
    } catch {
      // Router unreachable or disabled — keep the straight-line rendering.
    }
  }, []);

  const handleResult = (result) => {
    // A fresh plan gets a new key so the results panel resets its saved-route
    // state instead of re-using the previously saved route's id.
    const keyed = result ? { ...result, planKey: `${Date.now()}` } : null;
    setPlan(keyed);
    setAlternatives([]);          // a new plan invalidates the objective overlay
    persistForTracking(keyed);
    if (keyed) enrichWithRoadShapes(keyed);
    if (keyed && window.innerWidth < 768) setMobilePanel("results");
  };

  const summary = plan?.summary || {};
  const userInitials =
    (user?.fullName || "")
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  const stats = [
    { icon: <TbRoad className="text-emerald-600" size={18} />, label: "Distance",
      value: plan ? fmt.distance(summary.total_distance_km) : "—" },
    { icon: <FaClock className="text-amber-500" size={18} />, label: "Duration",
      value: plan ? fmt.duration(summary.total_minutes) : "—" },
    { icon: <TbTruckReturn className="text-slate-500" size={18} />, label: "Empty",
      value: plan ? formatPercent(summary.empty_pct, 0) : "—" },
    { icon: <FaGasPump className="text-blue-500" size={18} />, label: "Fuel",
      value: plan ? fmt.fuel(summary.estimated_fuel_l) : "—" },
    { icon: <FaLeaf className="text-green-600" size={18} />, label: "CO₂",
      value: plan ? `${summary.co2_kg ?? 0} kg` : "—" },
    { icon: <FaCoins className="text-amber-600" size={18} />, label: "Cost",
      value: plan ? fmt.money(summary.estimated_cost_gbp) : "—" },
  ];

  return (
    <div className="flex flex-col h-screen font-sans bg-gradient-to-br from-emerald-100 via-emerald-50 to-white">
      <Topbar
        logoSrc={Logo}
        appName="OptiGo"
        stats={stats}
        showLiveIndicator={Boolean(plan)}
        userInitials={userInitials}
        isDarkMode={isDarkMode}
        onDarkModeToggle={() => setIsDarkMode((value) => !value)}
        onHomeClick={() => navigate("/plan")}
        onMapClick={() => navigate("/tracking")}
        onProfileClick={() => navigate("/settings")}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar />

        <div className="flex flex-1 overflow-hidden">
          {/* Builder */}
          <aside className="hidden md:block w-[400px] shrink-0 bg-emerald-50 overflow-y-auto border-r border-emerald-100">
            <PlanBuilder onResult={handleResult} />
          </aside>

          {/* Map */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="relative flex-1">
              <LeafletMap routes={plan?.vehicles} alternatives={alternatives} />
              {!plan && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
                  <div className="pointer-events-auto text-center p-6 bg-white/90 backdrop-blur rounded-2xl shadow-lg border border-emerald-200 max-w-sm">
                    <TbMap size={52} className="text-emerald-400 mx-auto mb-3" />
                    <h3 className="text-lg font-bold text-emerald-800">Plan your first route</h3>
                    <p className="text-sm text-emerald-600 mt-1">
                      Add pickups, drop-offs and any rest stops, pick your vehicles, then hit
                      <strong> Plan routes</strong>. Empty running, load and driver hours are all costed for you.
                    </p>
                    <button
                      onClick={() => setMobilePanel("builder")}
                      className="md:hidden mt-4 bg-emerald-600 text-white px-5 py-2.5 rounded-full text-sm font-medium"
                    >
                      Open planner
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between h-11 px-5 bg-emerald-50/80 border-t border-emerald-100 text-xs text-gray-600">
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {plan
                  ? `${summary.vehicles_used || 0} vehicle route${summary.vehicles_used === 1 ? "" : "s"} planned`
                  : "No active plan"}
              </span>
              <span className="hidden sm:flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 h-0.5 bg-emerald-600" /> loaded
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-4 border-t-2 border-dashed border-slate-400" /> empty
                </span>
              </span>
            </div>
          </div>

          {/* Results */}
          {plan && (
            <aside className="hidden lg:block w-[400px] shrink-0 bg-emerald-50/60 overflow-y-auto border-l border-emerald-100">
              <PlanResults key={plan.planKey} plan={plan} onAlternatives={setAlternatives}
                onPlanChange={(next) => { setPlan(next); persistForTracking(next); }} />
            </aside>
          )}
        </div>
      </div>

      {/* Mobile controls */}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 lg:hidden flex gap-2">
        <button
          onClick={() => setMobilePanel("builder")}
          className="bg-emerald-600 text-white px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium"
        >
          <FaRoute size={14} /> Plan
        </button>
        {plan && (
          <button
            onClick={() => setMobilePanel("results")}
            className="bg-white text-emerald-700 border border-emerald-200 px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 text-sm font-medium"
          >
            <TbChartLine size={16} /> Results
          </button>
        )}
      </div>

      {mobilePanel && (
        <div className="fixed inset-0 z-50 bg-black/40 lg:hidden" onClick={() => setMobilePanel(null)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto bg-emerald-50 rounded-t-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 flex justify-center py-2 bg-emerald-50">
              <span className="w-12 h-1 rounded-full bg-emerald-200" />
            </div>
            {mobilePanel === "builder" ? (
              <PlanBuilder onResult={(result, request) => { handleResult(result, request); setMobilePanel(null); }} />
            ) : (
              <PlanResults key={plan.planKey} plan={plan} onAlternatives={setAlternatives}
                onPlanChange={(next) => { setPlan(next); persistForTracking(next); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
