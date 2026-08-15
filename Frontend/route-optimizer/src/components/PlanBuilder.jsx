import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  TbArrowDown, TbArrowUp, TbBolt, TbCoin, TbCopy, TbLeaf, TbPackage,
  TbChevronDown, TbPlus, TbRoute, TbTrash, TbTruck,
} from "react-icons/tb";
import { getLocations, getOrders, getVehicles, planRoutes } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import PackageLines, { serializePackages } from "./PackageLines";
import { Button, Field, NumberInput, Select, TextInput, Toggle } from "./ui";

const OBJECTIVES = {
  greenest: { label: "Greenest", icon: <TbLeaf size={16} />, hint: "Lowest CO₂" },
  fastest: { label: "Fastest", icon: <TbBolt size={16} />, hint: "Shortest time" },
  cheapest: { label: "Cheapest", icon: <TbCoin size={16} />, hint: "Lowest cost" },
};

const STOP_TYPES = [
  { value: "pickup", label: "Pickup" },
  { value: "delivery", label: "Drop-off" },
  { value: "rest", label: "Rest" },
  { value: "break", label: "Break" },
  { value: "fuel", label: "Fuel / charge" },
  { value: "custom", label: "Other stop" },
];

let stopCounter = 0;
const newStop = (type = "pickup", serviceMinutes = 15) => {
  stopCounter += 1;
  return {
    key: `stop-${Date.now()}-${stopCounter}`,
    type,
    locationId: "",
    name: "",
    lat: "",
    lon: "",
    service_minutes: type === "rest" || type === "break" ? 45 : type === "fuel" ? 20 : serviceMinutes,
    window_start: "",
    window_end: "",
    order_ref: type === "pickup" || type === "delivery" ? `JOB-${stopCounter}` : "",
    weight_kg: "",
    volume_m3: "",
    notes: "",
    packages: [],
    showPackages: false,
    showDetails: false,
  };
};

/**
 * Builds a plan request: which vehicles, which orders, which stops (including
 * rest/break/custom stops) and how the optimiser should behave.
 */
export default function PlanBuilder({ onResult, onPlanningChange }) {
  const { settings } = useSettings();
  const planning = settings.planning;

  const [locations, setLocations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingData, setLoadingData] = useState(true);

  const [preference, setPreference] = useState(planning.defaultPreference || "greenest");
  const [selectedVehicles, setSelectedVehicles] = useState([]);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [stops, setStops] = useState(() => [newStop("pickup"), newStop("delivery")]);
  const [options, setOptions] = useState({
    optimize_sequence: planning.optimizeSequence ?? true,
    return_to_start: planning.returnToStart ?? true,
    auto_breaks: planning.autoBreaks ?? true,
    break_minutes: planning.breakMinutes ?? 45,
    max_driving_minutes_before_break: planning.maxDrivingMinutesBeforeBreak ?? 270,
  });
  const [planningNow, setPlanningNow] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const advancedSummary = [
    options.optimize_sequence ? "optimised" : "fixed order",
    options.return_to_start ? "returns to base" : "one-way",
    options.auto_breaks ? "breaks on" : "breaks off",
  ].join(" · ");

  const refresh = useCallback(async () => {
    setLoadingData(true);
    try {
      const [locationData, vehicleData, orderData] = await Promise.all([
        getLocations(),
        getVehicles().catch(() => ({ vehicles: [] })),
        getOrders({ status: "new", limit: 200 }).catch(() => ({ orders: [] })),
      ]);
      setLocations(locationData.locations || []);
      setVehicles(vehicleData.vehicles || []);
      setOrders(orderData.orders || []);
    } catch (error) {
      toast.error(error.message || "Could not load planning data");
    } finally {
      setLoadingData(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Keep the objective in step with the saved default until the user overrides it.
  useEffect(() => { setPreference(planning.defaultPreference || "greenest"); }, [planning.defaultPreference]);

  const companyLocations = useMemo(() => locations.filter((l) => l.source === "company"), [locations]);
  const datasetLocations = useMemo(() => locations.filter((l) => l.source === "dataset"), [locations]);

  const updateStop = (key, patch) =>
    setStops((current) => current.map((stop) => (stop.key === key ? { ...stop, ...patch } : stop)));

  const moveStop = (index, direction) =>
    setStops((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const totals = useMemo(() => {
    const jobStops = stops.filter((s) => s.type === "pickup" || s.type === "delivery");
    const weight = stops.reduce((sum, stop) => {
      const packageWeight = stop.packages.reduce(
        (total, pkg) => total + (Number(pkg.weight_kg) || 0) * (Number(pkg.quantity) || 1), 0
      );
      return stop.type === "pickup" ? sum + (Number(stop.weight_kg) || packageWeight) : sum;
    }, 0);
    return { stops: stops.length, jobStops: jobStops.length, weight };
  }, [stops]);

  const buildPayload = () => {
    const located = (stop) => stop.locationId || (stop.lat !== "" && stop.lon !== "");
    const cleanedStops = stops
      .filter(located)
      .map((stop) => {
        const base = {
          key: stop.key,
          type: stop.type,
          name: stop.name || undefined,
          service_minutes: Number(stop.service_minutes) || 0,
          notes: stop.notes || undefined,
        };
        if (stop.locationId) base.location_id = stop.locationId;
        else {
          base.lat = Number(stop.lat);
          base.lon = Number(stop.lon);
        }
        if (stop.type === "pickup" || stop.type === "delivery") {
          base.order_ref = stop.order_ref || undefined;
          if (stop.weight_kg !== "") base.weight_kg = Number(stop.weight_kg);
          if (stop.volume_m3 !== "") base.volume_m3 = Number(stop.volume_m3);
          if (stop.window_start) base.window_start = stop.window_start;
          if (stop.window_end) base.window_end = stop.window_end;
          if (stop.packages.length) base.packages = serializePackages(stop.packages);
        }
        return base;
      });

    return {
      preference,
      vehicle_ids: selectedVehicles,
      order_ids: selectedOrders,
      stops: cleanedStops,
      // The learned network corridor is always used where it applies; it is an
      // implementation detail, not a decision for the person planning a route.
      options: { ...options, use_gnn_corridor: true },
      skipped: stops.filter((stop) => !located(stop)).length,
    };
  };

  const handlePlan = async () => {
    const { skipped, ...payload } = buildPayload();
    if (!payload.stops.length && !payload.order_ids.length) {
      toast.error("Add at least one stop with a location, or select an order.");
      return;
    }
    if (skipped) {
      // Never drop a stop silently — the planner would just be missing work.
      toast(`${skipped} stop${skipped === 1 ? "" : "s"} skipped: no location selected`, { icon: "⚠️" });
    }
    setPlanningNow(true);
    onPlanningChange?.(true);
    try {
      const result = await planRoutes(payload);
      onResult(result, payload);
      const { vehicles_used = 0, total_stops = 0 } = result.summary || {};
      toast.success(`Planned ${total_stops} stop${total_stops === 1 ? "" : "s"} across ${vehicles_used} vehicle${vehicles_used === 1 ? "" : "s"}`);
      if (result.unassigned?.length) {
        toast(`${result.unassigned.length} order(s) could not be assigned — see the results panel`, { icon: "⚠️" });
      }
    } catch (error) {
      toast.error(error.message || "Could not plan the route");
      onResult(null, payload);
    } finally {
      setPlanningNow(false);
      onPlanningChange?.(false);
    }
  };

  return (
    <div className="p-5 space-y-5">
      <header className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow">
          <TbRoute size={20} />
        </div>
        <div>
          <h2 className="font-bold text-emerald-900">Plan a route</h2>
          <p className="text-xs text-emerald-600">Multi-pickup · multi-drop · multi-vehicle</p>
        </div>
      </header>

      {/* Objective */}
      <section>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Objective</p>
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(OBJECTIVES).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPreference(key)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-2 transition-all
                ${preference === key
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-500 hover:border-emerald-300"}`}
            >
              {meta.icon}
              <span className="text-xs font-semibold">{meta.label}</span>
              <span className="text-[10px] opacity-70">{meta.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Vehicles */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Vehicles {selectedVehicles.length > 0 && `(${selectedVehicles.length})`}
          </p>
          {vehicles.length > 0 && (
            <button
              type="button"
              className="text-[11px] text-emerald-700 hover:underline"
              onClick={() =>
                setSelectedVehicles(selectedVehicles.length === vehicles.length ? [] : vehicles.map((v) => v.id))
              }
            >
              {selectedVehicles.length === vehicles.length ? "Clear all" : "Select all"}
            </button>
          )}
        </div>
        {vehicles.length === 0 ? (
          <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg p-3">
            No vehicles saved yet — planning will use one default 7.5t rigid starting at your first stop.
            Add vehicles on the Fleet page for real capacity, cost and depot data.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {vehicles.map((vehicle) => {
              const checked = selectedVehicles.includes(vehicle.id);
              return (
                <label
                  key={vehicle.id}
                  className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer transition-colors
                    ${checked ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-emerald-200"}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-emerald-600"
                    checked={checked}
                    onChange={() =>
                      setSelectedVehicles((current) =>
                        checked ? current.filter((id) => id !== vehicle.id) : [...current, vehicle.id]
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <TbTruck size={14} className="text-emerald-600 shrink-0" />
                      <span className="text-sm font-medium text-gray-800 truncate">{vehicle.name}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {vehicle.type_label || vehicle.type} · {vehicle.capacity_kg} kg · {vehicle.capacity_m3} m³
                      {vehicle.temperature_controlled ? " · chilled" : ""}
                    </div>
                    {!vehicle.start_location_id && (
                      <div className="text-[11px] text-amber-600">No start depot set — first stop will be used</div>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved orders */}
      {orders.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Unplanned orders {selectedOrders.length > 0 && `(${selectedOrders.length} selected)`}
          </p>
          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {orders.map((order) => {
              const checked = selectedOrders.includes(order.id);
              return (
                <label
                  key={order.id}
                  className={`flex items-start gap-2 rounded-lg border p-2 cursor-pointer transition-colors
                    ${checked ? "border-emerald-400 bg-emerald-50" : "border-gray-200 hover:border-emerald-200"}`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-emerald-600"
                    checked={checked}
                    onChange={() =>
                      setSelectedOrders((current) =>
                        checked ? current.filter((id) => id !== order.id) : [...current, order.id]
                      )
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate">{order.reference}</div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {(order.pickup?.name) || "Depot load"} → {order.dropoff?.name} ·{" "}
                      {order.totals?.total_weight_kg || 0} kg
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </section>
      )}

      {/* Stops */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Stops ({totals.stops})
          </p>
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" icon={<TbPlus size={14} />}
              onClick={() => setStops((c) => [...c, newStop("pickup", planning.defaultServiceMinutes)])}>
              Pickup
            </Button>
            <Button size="sm" variant="secondary" icon={<TbPlus size={14} />}
              onClick={() => setStops((c) => [...c, newStop("delivery", planning.defaultServiceMinutes)])}>
              Drop
            </Button>
            <Button size="sm" variant="ghost" icon={<TbPlus size={14} />}
              onClick={() => setStops((c) => [...c, newStop("rest")])} title="Add a rest or break stop">
              Rest
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {stops.map((stop, index) => (
            <StopCard
              key={stop.key}
              stop={stop}
              index={index}
              total={stops.length}
              companyLocations={companyLocations}
              datasetLocations={datasetLocations}
              loading={loadingData}
              onChange={(patch) => updateStop(stop.key, patch)}
              onRemove={() => setStops((c) => c.filter((s) => s.key !== stop.key))}
              onDuplicate={() =>
                setStops((c) => {
                  const copy = { ...stop, key: `stop-${Date.now()}-${(stopCounter += 1)}` };
                  return [...c.slice(0, index + 1), copy, ...c.slice(index + 1)];
                })
              }
              onMove={(direction) => moveStop(index, direction)}
            />
          ))}
        </div>
      </section>

      {/* Advanced — sensible defaults, hidden until asked for */}
      <section className="rounded-xl border border-emerald-100 bg-emerald-50/50">
        <button
          type="button"
          onClick={() => setShowAdvanced((value) => !value)}
          className="w-full flex items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Advanced settings
          </span>
          <span className="flex items-center gap-2 text-[11px] text-gray-500">
            {advancedSummary}
            <TbChevronDown
              size={16}
              className={`transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {showAdvanced && (
          <div className="px-3 pb-3">
            <Toggle
              label="Optimise stop order"
              description="Off = keep exactly the order listed above"
              checked={options.optimize_sequence}
              onChange={(value) => setOptions((o) => ({ ...o, optimize_sequence: value }))}
            />
            <Toggle
              label="Return to start"
              description="Include the run back to base in distance and cost"
              checked={options.return_to_start}
              onChange={(value) => setOptions((o) => ({ ...o, return_to_start: value }))}
            />
            <Toggle
              label="Automatic driver breaks"
              description={`${options.break_minutes} min after ${Math.round(options.max_driving_minutes_before_break / 60 * 10) / 10} h driving`}
              checked={options.auto_breaks}
              onChange={(value) => setOptions((o) => ({ ...o, auto_breaks: value }))}
            />
            {options.auto_breaks && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <Field label="Break (min)">
                  <NumberInput min={0} max={240} value={options.break_minutes}
                    onChange={(value) => setOptions((o) => ({ ...o, break_minutes: value }))} />
                </Field>
                <Field label="Max driving (min)">
                  <NumberInput min={60} max={720} value={options.max_driving_minutes_before_break}
                    onChange={(value) => setOptions((o) => ({ ...o, max_driving_minutes_before_break: value }))} />
                </Field>
              </div>
            )}
          </div>
        )}
      </section>

      <div className="sticky bottom-0 bg-emerald-50/95 backdrop-blur pt-2 pb-1">
        <Button className="w-full" size="lg" loading={planningNow} onClick={handlePlan}
          icon={<TbRoute size={18} />}>
          {planningNow ? "Optimising…" : "Plan routes"}
        </Button>
        <p className="text-[11px] text-center text-gray-500 mt-1">
          {totals.jobStops} job stop{totals.jobStops === 1 ? "" : "s"} · {selectedOrders.length} saved order
          {selectedOrders.length === 1 ? "" : "s"} · {totals.weight ? `${totals.weight} kg to load` : "no weight set"}
        </p>
      </div>
    </div>
  );
}

/** One-line preview of what is set on a stop, so hiding fields hides nothing important. */
function detailSummary(stop) {
  const parts = [];
  if (stop.service_minutes) parts.push(`${stop.service_minutes} min`);
  if (stop.window_start || stop.window_end) {
    parts.push(`${stop.window_start || "…"}–${stop.window_end || "…"}`);
  }
  if (stop.weight_kg) parts.push(`${stop.weight_kg} kg`);
  if (stop.packages?.length) parts.push(`${stop.packages.length} package line(s)`);
  return parts.length ? parts.join(" · ") : "Times, weight, packages";
}

/* ── One stop in the builder ───────────────────────────────────────── */
function StopCard({
  stop, index, total, companyLocations, datasetLocations, loading,
  onChange, onRemove, onDuplicate, onMove,
}) {
  const isJob = stop.type === "pickup" || stop.type === "delivery";
  const usesCustom = !stop.locationId;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>
        <Select value={stop.type} onChange={(value) => onChange({ type: value })} className="!py-1.5 text-xs">
          {STOP_TYPES.map((type) => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </Select>
        <div className="flex items-center gap-0.5 ml-auto">
          <button type="button" onClick={() => onMove(-1)} disabled={index === 0}
            className="p-1 text-gray-400 hover:text-emerald-700 disabled:opacity-30" title="Move up">
            <TbArrowUp size={15} />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={index === total - 1}
            className="p-1 text-gray-400 hover:text-emerald-700 disabled:opacity-30" title="Move down">
            <TbArrowDown size={15} />
          </button>
          <button type="button" onClick={onDuplicate}
            className="p-1 text-gray-400 hover:text-emerald-700" title="Duplicate stop">
            <TbCopy size={15} />
          </button>
          <button type="button" onClick={onRemove}
            className="p-1 text-gray-400 hover:text-rose-600" title="Remove stop">
            <TbTrash size={15} />
          </button>
        </div>
      </div>

      <Field label="Location">
        <Select
          value={stop.locationId}
          onChange={(value) => onChange({ locationId: value })}
          disabled={loading}
        >
          <option value="">— Custom coordinates —</option>
          {companyLocations.length > 0 && (
            <optgroup label="My locations">
              {companyLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}{location.city ? ` · ${location.city}` : ""}
                </option>
              ))}
            </optgroup>
          )}
          {datasetLocations.length > 0 && (
            <optgroup label="Trained network locations">
              {datasetLocations.map((location) => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </optgroup>
          )}
        </Select>
      </Field>

      {usesCustom && (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Name"><TextInput value={stop.name} placeholder="Customer site"
            onChange={(value) => onChange({ name: value })} /></Field>
          <Field label="Latitude"><NumberInput step="0.0001" value={stop.lat}
            onChange={(value) => onChange({ lat: value })} /></Field>
          <Field label="Longitude"><NumberInput step="0.0001" value={stop.lon}
            onChange={(value) => onChange({ lon: value })} /></Field>
        </div>
      )}

      {/* Everything below is optional. Hidden by default so the common case —
          "collect here, drop there" — is two fields, not twelve. */}
      <button
        type="button"
        onClick={() => onChange({ showDetails: !stop.showDetails })}
        className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline"
      >
        <TbChevronDown size={13} className={stop.showDetails ? "rotate-180" : ""} />
        {stop.showDetails ? "Hide details" : detailSummary(stop)}
      </button>

      {stop.showDetails && (
        <div className="space-y-2 border-t border-dashed border-gray-200 pt-2">
          <div className="grid grid-cols-3 gap-2">
            <Field label="Service (min)">
              <NumberInput min={0} value={stop.service_minutes}
                onChange={(value) => onChange({ service_minutes: value })} />
            </Field>
            {isJob ? (
              <>
                <Field label="From"><TextInput type="time" value={stop.window_start}
                  onChange={(value) => onChange({ window_start: value })} /></Field>
                <Field label="Until"><TextInput type="time" value={stop.window_end}
                  onChange={(value) => onChange({ window_end: value })} /></Field>
              </>
            ) : (
              <Field label="Note" className="col-span-2">
                <TextInput value={stop.notes} placeholder="e.g. statutory rest"
                  onChange={(value) => onChange({ notes: value })} />
              </Field>
            )}
          </div>

          {isJob && (
            <>
              <div className="grid grid-cols-3 gap-2">
                <Field label="Job ref" hint="Links a pickup to its drop-off">
                  <TextInput value={stop.order_ref} onChange={(value) => onChange({ order_ref: value })} />
                </Field>
                <Field label="Weight (kg)">
                  <NumberInput min={0} value={stop.weight_kg}
                    onChange={(value) => onChange({ weight_kg: value })} />
                </Field>
                <Field label="Volume (m³)">
                  <NumberInput min={0} step="0.1" value={stop.volume_m3}
                    onChange={(value) => onChange({ volume_m3: value })} />
                </Field>
              </div>

              <button
                type="button"
                onClick={() => onChange({ showPackages: !stop.showPackages })}
                className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 hover:underline"
              >
                <TbPackage size={14} />
                {stop.packages.length ? `${stop.packages.length} package line(s)` : "Add package details"}
              </button>

              {stop.showPackages && (
                <PackageLines compact packages={stop.packages}
                  onChange={(packages) => onChange({ packages })} />
              )}
            </>
          )}
        </div>
      )}

    </div>
  );
}
