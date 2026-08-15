/** Display formatting that respects the user's saved unit preferences. */

const KM_PER_MILE = 1.609344;
const LITRES_PER_GALLON = 4.54609; // UK gallon

const CURRENCY_SYMBOLS = { GBP: "£", USD: "$", EUR: "€" };

export const kmToMiles = (km) => (Number(km) || 0) / KM_PER_MILE;
export const litresToGallons = (l) => (Number(l) || 0) / LITRES_PER_GALLON;

export function formatDistance(km, unit = "km", digits = 1) {
  const value = Number(km) || 0;
  return unit === "miles"
    ? `${kmToMiles(value).toFixed(digits)} mi`
    : `${value.toFixed(digits)} km`;
}

export function formatFuel(litres, unit = "liters", digits = 1) {
  const value = Number(litres) || 0;
  return unit === "gallons"
    ? `${litresToGallons(value).toFixed(digits)} gal`
    : `${value.toFixed(digits)} L`;
}

export function formatMoney(value, currency = "GBP", digits = 2) {
  const symbol = CURRENCY_SYMBOLS[currency] || "£";
  return `${symbol}${(Number(value) || 0).toFixed(digits)}`;
}

export function formatDuration(minutes) {
  const total = Math.round(Number(minutes) || 0);
  if (!total) return "—";
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return hours > 0 ? `${hours}h ${String(mins).padStart(2, "0")}m` : `${mins}m`;
}

export function formatWeight(kg, digits = 0) {
  const value = Number(kg) || 0;
  return value >= 1000 ? `${(value / 1000).toFixed(2)} t` : `${value.toFixed(digits)} kg`;
}

export function formatVolume(m3, digits = 2) {
  return `${(Number(m3) || 0).toFixed(digits)} m³`;
}

export function formatPercent(value, digits = 1) {
  return `${(Number(value) || 0).toFixed(digits)}%`;
}

export function formatDateTime(value, dateFormat = "DD/MM/YYYY") {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const day =
    dateFormat === "MM/DD/YYYY"
      ? `${mm}/${dd}/${yyyy}`
      : dateFormat === "YYYY-MM-DD"
        ? `${yyyy}-${mm}-${dd}`
        : `${dd}/${mm}/${yyyy}`;
  return `${day} ${time}`;
}

export function formatDate(value, dateFormat = "DD/MM/YYYY") {
  return formatDateTime(value, dateFormat).split(" ")[0];
}

/** "pickup" -> "Pickup", "depot_start" -> "Depot start" */
export function titleCase(value) {
  if (!value) return "";
  const text = String(value).replace(/[_-]/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const STOP_STYLES = {
  pickup: { label: "Pickup", color: "#0ea5e9", chip: "bg-sky-100 text-sky-700" },
  delivery: { label: "Delivery", color: "#e11d48", chip: "bg-rose-100 text-rose-700" },
  rest: { label: "Rest", color: "#8b5cf6", chip: "bg-violet-100 text-violet-700" },
  break: { label: "Break", color: "#8b5cf6", chip: "bg-violet-100 text-violet-700" },
  fuel: { label: "Fuel", color: "#f59e0b", chip: "bg-amber-100 text-amber-700" },
  custom: { label: "Stop", color: "#64748b", chip: "bg-slate-100 text-slate-700" },
  depot_start: { label: "Start", color: "#059669", chip: "bg-emerald-100 text-emerald-700" },
  depot_end: { label: "End", color: "#047857", chip: "bg-emerald-100 text-emerald-700" },
};

export const VEHICLE_COLORS = [
  "#059669", "#2563eb", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#e11d48",
];
