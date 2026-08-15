import { useState } from "react";
import toast from "react-hot-toast";
import {
  TbAlertTriangle, TbArrowDown, TbArrowUp, TbClock, TbCoin, TbDeviceFloppy, TbLeaf,
  TbRoad, TbRouteAltLeft, TbTruckDelivery, TbTruckReturn,
} from "react-icons/tb";
import { compareObjectives, resequenceDraft, saveRoute, updateRoute } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { STOP_STYLES, formatPercent, formatWeight, titleCase } from "../lib/format";
import { Button, Chip, StatTile } from "./ui";

/**
 * Right-hand results panel: per-vehicle itineraries with live re-sequencing,
 * empty-running figures, constraint warnings and save/dispatch actions.
 */
export default function PlanResults({ plan, onPlanChange, onAlternatives }) {
  const { fmt } = useSettings();
  const [savedRouteId, setSavedRouteId] = useState(plan?.route_id || null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [alternatives, setAlternatives] = useState(null);

  if (!plan) return null;
  const summary = plan.summary || {};

  const handleSave = async () => {
    setBusy(true);
    try {
      const response = await saveRoute({ name: name || undefined, plan });
      setSavedRouteId(response.route.id);
      toast.success("Plan saved");
    } catch (error) {
      toast.error(error.message || "Could not save the plan");
    } finally {
      setBusy(false);
    }
  };

  const handleDispatch = async () => {
    if (!savedRouteId) return;
    setBusy(true);
    try {
      await updateRoute(savedRouteId, { status: "dispatched" });
      toast.success("Route dispatched — orders marked in transit");
    } catch (error) {
      toast.error(error.message || "Could not dispatch the route");
    } finally {
      setBusy(false);
    }
  };

  /** Move one stop and ask the server to re-cost the hand-made sequence. */
  const handleMove = async (vehicleIndex, stopIndex, direction) => {
    const vehicle = plan.vehicles[vehicleIndex];
    const target = stopIndex + direction;
    if (target < 0 || target >= vehicle.stops.length) return;

    const reordered = [...vehicle.stops];
    [reordered[stopIndex], reordered[target]] = [reordered[target], reordered[stopIndex]];

    const timeline = vehicle.timeline || [];
    const start = timeline.find((entry) => entry.type === "depot_start");
    const end = timeline.find((entry) => entry.type === "depot_end");

    setBusy(true);
    try {
      const response = await resequenceDraft({
        preference: plan.preference,
        options: { ...(plan.options || {}), optimize_sequence: false },
        stops: reordered,
        vehicle: {
          id: vehicle.vehicle_id,
          name: vehicle.vehicle_name,
          start: start && { lat: start.lat, lon: start.lon, name: start.name, location_id: start.location_id },
          end: end && { lat: end.lat, lon: end.lon, name: end.name, location_id: end.location_id },
          return_to_start: Boolean(end),
        },
      });
      const vehicles = plan.vehicles.map((item, index) => (index === vehicleIndex ? response.vehicle : item));
      onPlanChange({ ...plan, vehicles, summary: recalculate(vehicles, plan.unassigned) });
      if (savedRouteId) toast("Sequence changed — save again to store it", { icon: "💾" });
    } catch (error) {
      toast.error(error.message || "That sequence is not feasible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 space-y-5">
      <header className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-emerald-600 text-white shadow">
          <TbTruckDelivery size={20} />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-emerald-900">Plan results</h2>
          <p className="text-xs text-emerald-600">
            {summary.vehicles_used || 0} vehicle{summary.vehicles_used === 1 ? "" : "s"} ·{" "}
            {summary.total_stops || 0} stops · {titleCase(plan.preference)} objective
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <StatTile icon={<TbRoad size={16} />} label="Distance"
          value={fmt.distance(summary.total_distance_km)} hint={`${summary.loaded_km ?? 0} km loaded`} />
        <StatTile icon={<TbClock size={16} />} label="Duration" tone="blue"
          value={fmt.duration(summary.total_minutes)} hint={`${fmt.duration(summary.driving_minutes)} driving`} />
        <StatTile icon={<TbLeaf size={16} />} label="CO₂" tone="emerald"
          value={`${summary.co2_kg ?? 0} kg`} hint={`${summary.estimated_fuel_l ?? 0} L fuel`} />
        <StatTile icon={<TbCoin size={16} />} label="Cost" tone="amber"
          value={fmt.money(summary.estimated_cost_gbp)} hint="fuel + running + driver" />
      </div>

      {/* Empty running — the metric the fleet actually pays for */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">Empty running</span>
          <TbTruckReturn className="text-slate-500" size={16} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-slate-800">{fmt.distance(summary.empty_km)}</span>
          <span className="text-sm text-slate-500">({formatPercent(summary.empty_pct)} of distance)</span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-slate-500" style={{ width: `${Math.min(100, summary.empty_pct || 0)}%` }} />
        </div>
        <p className="text-[11px] text-slate-500 mt-2">
          Includes repositioning from base to the first pickup and the run home after the last drop.
        </p>
      </div>

      {plan.unassigned?.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm mb-2">
            <TbAlertTriangle size={16} /> {plan.unassigned.length} order(s) not assigned
          </div>
          <ul className="space-y-1 text-xs text-amber-800">
            {plan.unassigned.map((item, index) => (
              <li key={index}>
                <strong>{item.reference || item.order_id}</strong> — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <ObjectiveComparison
        plan={plan}
        alternatives={alternatives}
        onLoaded={(list) => { setAlternatives(list); onAlternatives?.(list); }}
        fmt={fmt}
      />

      {plan.vehicles.map((vehicle, vehicleIndex) => (
        <VehiclePlan
          key={vehicle.vehicle_id || vehicleIndex}
          vehicle={vehicle}
          busy={busy}
          fmt={fmt}
          onMove={(stopIndex, direction) => handleMove(vehicleIndex, stopIndex, direction)}
        />
      ))}

      <div className="space-y-2 pt-2 border-t border-emerald-100">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Plan name (optional)"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        <Button className="w-full" loading={busy} onClick={handleSave} icon={<TbDeviceFloppy size={16} />}>
          {savedRouteId ? "Save again" : "Save plan"}
        </Button>
        {savedRouteId && (
          <Button className="w-full" variant="secondary" loading={busy} onClick={handleDispatch}
            icon={<TbTruckDelivery size={16} />}>
            Dispatch to drivers
          </Button>
        )}
      </div>
    </div>
  );
}

function VehiclePlan({ vehicle, busy, fmt, onMove }) {
  const metrics = vehicle.metrics || {};
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-xl border border-emerald-100 bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="min-w-0">
          <div className="font-semibold text-emerald-900 truncate">{vehicle.vehicle_name}</div>
          <div className="text-[11px] text-gray-500">
            {metrics.stop_count} stops · {fmt.distance(metrics.total_distance_km)} ·{" "}
            {fmt.duration(metrics.total_minutes)} · {metrics.start_time}–{metrics.end_time}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Chip tone={metrics.weight_utilisation_pct > 90 ? "rose" : "emerald"}>
            {formatPercent(metrics.weight_utilisation_pct, 0)} full
          </Chip>
          <Chip tone="slate">{fmt.distance(metrics.empty_km)} empty</Chip>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["CO₂", `${metrics.co2_kg} kg`],
              ["Cost", fmt.money(metrics.estimated_cost_gbp)],
              ["Peak load", formatWeight(metrics.peak_load_kg)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-emerald-50 py-2">
                <div className="text-[10px] uppercase tracking-wide text-emerald-700">{label}</div>
                <div className="text-sm font-semibold text-emerald-900">{value}</div>
              </div>
            ))}
          </div>

          {vehicle.violations?.length > 0 && (
            <ul className="space-y-1">
              {vehicle.violations.map((violation, index) => (
                <li key={index} className="flex items-start gap-1.5 text-[11px] text-amber-700">
                  <TbAlertTriangle size={13} className="mt-0.5 shrink-0" /> {violation.message}
                </li>
              ))}
            </ul>
          )}

          <ol className="space-y-1.5">
            {(vehicle.timeline || []).map((entry, index) => {
              const style = STOP_STYLES[entry.type] || STOP_STYLES.custom;
              const stopIndex = vehicle.stops.findIndex((stop) => stop.key === entry.key);
              const movable = stopIndex >= 0 && !entry.auto;
              return (
                <li key={`${entry.sequence}-${index}`} className="flex items-start gap-2">
                  <span
                    className="mt-1 w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: style.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-800 truncate">{entry.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${style.chip}`}>{style.label}</span>
                    </div>
                    <div className="text-[11px] text-gray-500">
                      {entry.arrival}
                      {entry.departure && entry.departure !== entry.arrival ? ` → ${entry.departure}` : ""}
                      {entry.load_kg != null ? ` · ${entry.load_kg} kg on board` : ""}
                      {entry.late_minutes > 0 ? ` · ${Math.round(entry.late_minutes)} min late` : ""}
                      {entry.waiting_minutes > 0 ? ` · waits ${Math.round(entry.waiting_minutes)} min` : ""}
                    </div>
                  </div>
                  {movable && (
                    <div className="flex flex-col shrink-0">
                      <button type="button" disabled={busy} onClick={() => onMove(stopIndex, -1)}
                        className="text-gray-300 hover:text-emerald-600 disabled:opacity-30" title="Move earlier">
                        <TbArrowUp size={14} />
                      </button>
                      <button type="button" disabled={busy} onClick={() => onMove(stopIndex, 1)}
                        className="text-gray-300 hover:text-emerald-600 disabled:opacity-30" title="Move later">
                        <TbArrowDown size={14} />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </div>
  );
}

/** Recompute the fleet-level summary after a manual re-sequence. */
function recalculate(vehicles, unassigned = []) {
  const sum = (field) =>
    Number(vehicles.reduce((total, vehicle) => total + (vehicle.metrics?.[field] || 0), 0).toFixed(2));
  const distance = sum("total_distance_km");
  const empty = sum("empty_km");
  return {
    vehicles_used: vehicles.length,
    orders_unassigned: unassigned.length,
    total_stops: vehicles.reduce((total, vehicle) => total + (vehicle.metrics?.total_stops || 0), 0),
    total_distance_km: distance,
    loaded_km: sum("loaded_km"),
    empty_km: empty,
    empty_miles: sum("empty_miles"),
    empty_pct: distance ? Number(((empty / distance) * 100).toFixed(1)) : 0,
    total_minutes: Math.round(sum("total_minutes")),
    driving_minutes: Math.round(sum("driving_minutes")),
    co2_kg: sum("co2_kg"),
    estimated_fuel_l: sum("estimated_fuel_l"),
    estimated_cost_gbp: sum("estimated_cost_gbp"),
  };
}

/**
 * The three learned objectives, side by side for one network corridor.
 *
 * Each objective has its own cost model, so each can prefer a different road —
 * showing the trade-off is more useful than presenting one route as "the"
 * answer. Only offered when the plan actually used trained-network locations.
 */
function ObjectiveComparison({ plan, alternatives, onLoaded, fmt }) {
  const [busy, setBusy] = useState(false);

  const corridor = plan.vehicles
    .flatMap((vehicle) => vehicle.legs || [])
    .find((leg) => Array.isArray(leg.shapes) && leg.shapes.length > 0);
  if (!corridor) return null;

  const origin = corridor.shapes[0].from;
  const destination = corridor.shapes[corridor.shapes.length - 1].to;

  const handleCompare = async () => {
    setBusy(true);
    try {
      const response = await compareObjectives(origin, destination);
      onLoaded(response.alternatives || []);
    } catch (error) {
      toast.error(error.message || "Could not compare objectives");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-white p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-emerald-900 text-sm">Compare objectives</div>
          <div className="text-[11px] text-gray-500 truncate">{origin} → {destination}</div>
        </div>
        <Button size="sm" variant="secondary" loading={busy} onClick={handleCompare}
          icon={<TbRouteAltLeft size={14} />}>
          {alternatives ? "Refresh" : "Compare"}
        </Button>
      </div>

      {alternatives && (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-gray-500 text-left">
              <th className="py-1">Objective</th>
              <th className="py-1 text-right">Distance</th>
              <th className="py-1 text-right">Time</th>
              <th className="py-1 text-right">Cost</th>
              <th className="py-1 text-right">CO₂</th>
            </tr>
          </thead>
          <tbody>
            {alternatives.map((alternative) => (
              <tr key={alternative.preference} className="border-t border-gray-100">
                <td className="py-1.5 font-medium capitalize text-gray-800">
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{
                    backgroundColor: alternative.preference === "greenest" ? "#059669"
                      : alternative.preference === "fastest" ? "#4f46e5" : "#ea580c",
                  }} />
                  {alternative.preference}
                </td>
                <td className="py-1.5 text-right">{fmt.distance(alternative.distance_km, 0)}</td>
                <td className="py-1.5 text-right">
                  {fmt.duration(alternative.estimated_time_min)}
                  {alternative.delta?.time_pct > 0 && (
                    <span className="text-gray-400"> +{alternative.delta.time_pct}%</span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  {fmt.money(alternative.estimated_cost_gbp, 0)}
                  {alternative.delta?.cost_pct > 0 && (
                    <span className="text-gray-400"> +{alternative.delta.cost_pct}%</span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  {alternative.co2_kg} kg
                  {alternative.delta?.co2_pct > 0 && (
                    <span className="text-gray-400"> +{alternative.delta.co2_pct}%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {alternatives && (
        <p className="text-[10px] text-gray-400 mt-2">
          Each row is a separate trained model choosing its own corridor; the map overlays all three.
        </p>
      )}
    </div>
  );
}
