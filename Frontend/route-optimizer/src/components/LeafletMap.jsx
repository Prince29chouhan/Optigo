import { useEffect, useMemo } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { STOP_STYLES, VEHICLE_COLORS } from "../lib/format";
import { decodePolyline, legPositions } from "../lib/polyline";

/** Distinct styling per learned objective for the comparison overlay. */
const OBJECTIVE_STYLES = {
  greenest: { color: "#059669", label: "Greenest", dash: undefined },
  fastest: { color: "#4f46e5", label: "Fastest", dash: "10 6" },
  cheapest: { color: "#ea580c", label: "Cheapest", dash: "2 6" },
};

/**
 * Plan map.
 *
 * Draws one polyline per leg so empty (unloaded) running can be shown as a
 * dashed grey line — the visual counterpart of the empty-miles metric — and one
 * numbered marker per stop, coloured by stop type.
 *
 * Legs whose endpoints are trained-network locations are drawn along their real
 * road geometry, decoded from polylines precomputed into the model artefacts —
 * so the map looks like a road map without calling any routing service at
 * request time. Legs to arbitrary customer coordinates, which have no
 * precomputed shape, stay straight: the map shows what is actually known.
 */

const UK_CENTER = [54.0, -2.2];

function numberedIcon(index, type, color) {
  const style = STOP_STYLES[type] || STOP_STYLES.custom;
  const background = color || style.color;
  return L.divIcon({
    className: "optigo-stop-marker",
    html: `<div style="
        background:${background};
        color:#fff;border-radius:9999px;width:26px;height:26px;
        display:flex;align-items:center;justify-content:center;
        font:600 12px/1 system-ui,sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.4);
        border:2px solid #fff;">${index}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView(points[0], 11);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 12 });
  }, [map, points]);
  return null;
}

/** Turn a plan response (or the legacy `route` array) into drawable layers. */
function buildLayers(routes, legacyRoute) {
  if (Array.isArray(legacyRoute) && legacyRoute.length) {
    const points = legacyRoute.map((p) => [p.lat, p.lon]);
    return [
      {
        id: "legacy",
        name: "Route",
        color: VEHICLE_COLORS[0],
        legs: points.slice(0, -1).map((from, i) => ({
          positions: [from, points[i + 1]],
          empty: false,
        })),
        stops: legacyRoute.map((p, i) => ({
          key: `legacy-${i}`,
          position: [p.lat, p.lon],
          label: p.depot,
          type: i === 0 ? "depot_start" : i === legacyRoute.length - 1 ? "depot_end" : "custom",
          index: i + 1,
        })),
      },
    ];
  }

  return (routes || []).map((route, routeIndex) => {
    const color = VEHICLE_COLORS[routeIndex % VEHICLE_COLORS.length];
    // When no weights were entered, every leg is technically "empty" — showing a
    // whole route in the empty style would be noise. The distinction is only
    // drawn once the plan actually carries something.
    const carriesLoad = (route.legs || []).some((leg) => (leg.load_kg || 0) > 0);
    const legs = (route.legs || []).map((leg) => ({
      positions: legPositions(leg),
      empty: carriesLoad && Boolean(leg.empty),
      distance: leg.distance_km,
      from: leg.from,
      to: leg.to,
      onRoad: Array.isArray(leg.shapes) && leg.shapes.length > 0,
    }));

    const timeline = route.timeline || [];
    const stops = timeline.map((entry, index) => ({
      key: `${route.vehicle_id}-${entry.sequence}-${index}`,
      position: [entry.lat, entry.lon],
      label: entry.name,
      type: entry.type,
      index: index + 1,
      arrival: entry.arrival,
      departure: entry.departure,
      load: entry.load_kg,
      orderRef: entry.order_ref,
      vehicle: route.vehicle_name,
    }));

    return { id: route.vehicle_id || `route-${routeIndex}`, name: route.vehicle_name, color, legs, stops };
  });
}

export default function LeafletMap({ routes, route: legacyRoute, alternatives = [], className = "" }) {
  const layers = useMemo(() => buildLayers(routes, legacyRoute), [routes, legacyRoute]);
  const points = useMemo(
    () => layers.flatMap((layer) => layer.stops.map((stop) => stop.position)).filter(
      ([lat, lon]) => Number.isFinite(lat) && Number.isFinite(lon)
    ),
    [layers]
  );

  return (
    <MapContainer
      center={UK_CENTER}
      zoom={6}
      className={`h-full w-full z-0 ${className}`}
      style={{ height: "100%", width: "100%" }}
      scrollWheelZoom
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap contributors"
      />
      <FitBounds points={points} />

      {/* White casing under every route, the way road maps do it — a thin
          coloured line alone disappears against OpenStreetMap's own roads. */}
      {layers.map((layer) =>
        layer.legs.map((leg, index) => (
          <Polyline
            key={`${layer.id}-casing-${index}`}
            positions={leg.positions}
            pathOptions={{ color: "#ffffff", weight: 10, opacity: 0.9, lineCap: "round" }}
            interactive={false}
          />
        ))
      )}

      {layers.map((layer) =>
        layer.legs.map((leg, index) => (
          <Polyline
            key={`${layer.id}-leg-${index}`}
            positions={leg.positions}
            pathOptions={{
              color: leg.empty ? "#475569" : layer.color,
              weight: 6,
              opacity: 1,
              lineCap: "round",
              lineJoin: "round",
              dashArray: leg.empty ? "1 12" : undefined,
            }}
          >
            <Popup>
              <div className="text-xs">
                <strong>{leg.from} → {leg.to}</strong>
                <br />
                {leg.distance != null && `${leg.distance} km`}
                {leg.empty && <span className="text-slate-500"> · running empty</span>}
                {!leg.onRoad && (
                  <div className="text-slate-400 mt-0.5">straight-line estimate</div>
                )}
              </div>
            </Popup>
          </Polyline>
        ))
      )}

      {/* Objective comparison overlay: one line per learned objective */}
      {alternatives.map((alternative) => {
        const positions = (alternative.shapes || []).flatMap((shape, index) => {
          const decoded = decodePolyline(shape.polyline);
          return index === 0 ? decoded : decoded.slice(1);
        });
        if (positions.length < 2) return null;
        const style = OBJECTIVE_STYLES[alternative.preference] || OBJECTIVE_STYLES.greenest;
        return (
          <Polyline
            key={`alt-${alternative.preference}`}
            positions={positions}
            pathOptions={{ color: style.color, weight: 5, opacity: 0.95,
                           dashArray: style.dash, lineCap: "round" }}
          >
            <Popup>
              <div className="text-xs">
                <strong>{style.label} route</strong>
                <br />
                {alternative.distance_km} km · {Math.round(alternative.estimated_time_min)} min
                <br />
                £{alternative.estimated_cost_gbp} · {alternative.co2_kg} kg CO₂
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {layers.map((layer) =>
        layer.stops.map((stop) => (
          <Marker
            key={stop.key}
            position={stop.position}
            icon={numberedIcon(stop.index, stop.type, layer.color)}
          >
            <Popup>
              <div className="text-xs space-y-0.5">
                <div className="font-semibold">{stop.label}</div>
                <div className="text-slate-500">
                  {(STOP_STYLES[stop.type] || STOP_STYLES.custom).label}
                  {stop.orderRef ? ` · ${stop.orderRef}` : ""}
                </div>
                {stop.vehicle && <div>Vehicle: {stop.vehicle}</div>}
                {stop.arrival && <div>Arrive {stop.arrival}{stop.departure ? ` · leave ${stop.departure}` : ""}</div>}
                {stop.load != null && <div>On board: {stop.load} kg</div>}
              </div>
            </Popup>
          </Marker>
        ))
      )}
    </MapContainer>
  );
}
