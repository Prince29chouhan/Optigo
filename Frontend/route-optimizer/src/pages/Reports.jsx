import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  TbChartBar, TbClock, TbCoin, TbDownload, TbLeaf, TbPackage, TbRoad, TbTruck, TbTruckReturn,
} from "react-icons/tb";
import PageShell from "../components/PageShell";
import { Button, Card, Chip, Field, Select, Spinner, StatTile, Table, TextInput } from "../components/ui";
import { exportReportCsv, getReport } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { formatDate, formatPercent, titleCase } from "../lib/format";

/**
 * Chart palette — validated with the dataviz palette checker (light surface,
 * all-pairs): lightness band, chroma floor, CVD separation, normal-vision
 * separation and contrast all pass. Assign in this fixed order; never cycle.
 */
const SERIES = { primary: "#059669", secondary: "#4f46e5", tertiary: "#ea580c" };
const NEUTRAL = "#64748b"; // empty running: deliberately non-categorical grey
const AXIS_INK = "#64748b";
const GRID = "#eef2f7";

const TABS = [
  { id: "summary", label: "Summary", icon: <TbChartBar size={16} /> },
  { id: "emissions", label: "Emissions", icon: <TbLeaf size={16} /> },
  { id: "empty-miles", label: "Empty running", icon: <TbTruckReturn size={16} /> },
  { id: "utilisation", label: "Utilisation", icon: <TbTruck size={16} /> },
  { id: "orders", label: "Orders", icon: <TbPackage size={16} /> },
  { id: "routes", label: "Route log", icon: <TbRoad size={16} /> },
];

const chartTooltip = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid #e2e8f0",
    fontSize: 12,
    boxShadow: "0 4px 12px rgba(15,23,42,.08)",
  },
  cursor: { fill: "rgba(15,23,42,.04)" },
};

export default function Reports() {
  const { fmt, units } = useSettings();
  const [tab, setTab] = useState("summary");
  const [range, setRange] = useState({ from: "", to: "" });
  const [groupBy, setGroupBy] = useState("vehicle");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const params = useMemo(() => {
    const query = {};
    if (range.from) query.from = range.from;
    if (range.to) query.to = range.to;
    if (tab === "emissions") query.group_by = groupBy;
    return query;
  }, [range, tab, groupBy]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getReport(tab, params);
      setData(response.data);
    } catch (error) {
      toast.error(error.message || "Could not load the report");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [tab, params]);

  useEffect(() => { load(); }, [load]);

  return (
    <PageShell
      title="Reports"
      subtitle="Operational, emissions and cost reporting across every planned route"
      actions={
        <Button variant="secondary" icon={<TbDownload size={16} />}
          onClick={() => exportReportCsv(tab, params).catch((error) => toast.error(error.message))}>
          Export CSV
        </Button>
      }
    >
      {/* Filters: one row above the charts */}
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <Field label="From"><TextInput type="date" value={range.from}
          onChange={(value) => setRange((current) => ({ ...current, from: value }))} /></Field>
        <Field label="To"><TextInput type="date" value={range.to}
          onChange={(value) => setRange((current) => ({ ...current, to: value }))} /></Field>
        {tab === "emissions" && (
          <Field label="Group by">
            <Select value={groupBy} onChange={setGroupBy}>
              {["vehicle", "route", "day", "preference"].map((option) => (
                <option key={option} value={option}>{titleCase(option)}</option>
              ))}
            </Select>
          </Field>
        )}
        {(range.from || range.to) && (
          <Button variant="ghost" size="sm" onClick={() => setRange({ from: "", to: "" })}>Clear dates</Button>
        )}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-emerald-100 mb-5">
        {TABS.map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors
              ${tab === item.id
                ? "border-emerald-600 text-emerald-800"
                : "border-transparent text-gray-500 hover:text-emerald-700"}`}
          >
            {item.icon} {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner label="Building report…" />
      ) : !data ? (
        <Card><p className="text-sm text-gray-500">No data available for this period.</p></Card>
      ) : (
        <>
          {tab === "summary" && <SummaryReport data={data} fmt={fmt} />}
          {tab === "emissions" && <EmissionsReport data={data} groupBy={groupBy} />}
          {tab === "empty-miles" && <EmptyRunningReport data={data} fmt={fmt} units={units} />}
          {tab === "utilisation" && <UtilisationReport data={data} fmt={fmt} />}
          {tab === "orders" && <OrdersReport data={data} units={units} />}
          {tab === "routes" && <RoutesReport data={data} fmt={fmt} units={units} />}
        </>
      )}
    </PageShell>
  );
}

/* ── Summary: hero numbers, not charts ─────────────────────────────── */
function SummaryReport({ data, fmt }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={<TbRoad size={16} />} label="Distance" value={fmt.distance(data.total_distance_km)}
          hint={`${data.routes_planned} route(s) · ${data.total_stops} stops`} />
        <StatTile icon={<TbTruckReturn size={16} />} label="Empty running" tone="slate"
          value={formatPercent(data.empty_pct)} hint={`${fmt.distance(data.empty_km)} unloaded`} />
        <StatTile icon={<TbLeaf size={16} />} label="CO₂" tone="emerald" value={`${data.co2_kg} kg`}
          hint={`${data.co2_per_km} kg per km`} />
        <StatTile icon={<TbCoin size={16} />} label="Cost" tone="amber" value={fmt.money(data.cost_gbp)}
          hint={`${fmt.money(data.cost_per_stop)} per stop`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card title="Fleet performance" subtitle="Averages across the planned routes in this period">
          <dl className="space-y-3 text-sm">
            {[
              ["Vehicles used", data.vehicles_used],
              ["Loaded distance", fmt.distance(data.loaded_km)],
              ["Driving time", `${data.driving_hours} h`],
              ["Service time", `${data.service_hours} h`],
              ["Fuel / energy", fmt.fuel(data.fuel_l)],
              ["Cost per km", fmt.money(data.cost_per_km)],
              ["Average weight utilisation", formatPercent(data.avg_weight_utilisation_pct)],
              ["Average volume utilisation", formatPercent(data.avg_volume_utilisation_pct)],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-gray-100 pb-2">
                <dt className="text-gray-600">{label}</dt>
                <dd className="font-semibold text-emerald-900">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>

        <Card title="Orders by status" subtitle={`${data.orders_total} orders in the system`}>
          <div className="space-y-2">
            {Object.entries(data.orders || {}).map(([status, count]) => {
              const share = data.orders_total ? (count / data.orders_total) * 100 : 0;
              return (
                <div key={status}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{titleCase(status)}</span>
                    <span className="font-medium text-gray-800">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: SERIES.primary }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ── Emissions: one series, direct-labelled bars ───────────────────── */
function EmissionsReport({ data, groupBy }) {
  const rows = data.rows || [];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatTile icon={<TbLeaf size={16} />} label="Total CO₂" value={`${data.total_co2_kg} kg`} />
        <StatTile icon={<TbLeaf size={16} />} label="Trees to offset" tone="emerald"
          value={data.trees_equivalent} hint="at 21 kg CO₂ per tree per year" />
        <StatTile icon={<TbChartBar size={16} />} label="Groups" tone="slate" value={rows.length}
          hint={`grouped by ${groupBy}`} />
      </div>

      <Card title={`CO₂ by ${groupBy}`} subtitle="Kilograms of CO₂ from planned routes">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">Nothing planned in this period yet.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 48, bottom: 4, left: 8 }}>
                <CartesianGrid horizontal={false} stroke={GRID} />
                <XAxis type="number" tick={{ fill: AXIS_INK, fontSize: 11 }} axisLine={false} tickLine={false}
                  unit=" kg" />
                <YAxis type="category" dataKey="group" width={130} tick={{ fill: AXIS_INK, fontSize: 11 }}
                  axisLine={false} tickLine={false} />
                <Tooltip {...chartTooltip} formatter={(value) => [`${value} kg CO₂`, "Emissions"]} />
                <Bar dataKey="co2_kg" fill={SERIES.primary} radius={[0, 4, 4, 0]} barSize={16}
                  label={{ position: "right", fill: AXIS_INK, fontSize: 11, formatter: (value) => `${value} kg` }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Detail">
        <Table
          columns={["Group", "CO₂ (kg)", "Distance (km)", "Fuel", "Cost (£)", "g CO₂/km", "Routes"]}
          rows={rows}
          renderRow={(row) => (
            <tr key={row.group} className="border-t border-gray-100">
              <td className="p-3 font-medium text-gray-800">{row.group}</td>
              <td className="p-3">{row.co2_kg}</td>
              <td className="p-3">{row.distance_km}</td>
              <td className="p-3">{row.fuel_l}</td>
              <td className="p-3">{row.cost_gbp}</td>
              <td className="p-3">{row.g_co2_per_km}</td>
              <td className="p-3">{row.routes}</td>
            </tr>
          )}
        />
      </Card>
    </div>
  );
}

/* ── Empty running: loaded vs empty, stacked with a 2px surface gap ── */
function EmptyRunningReport({ data, fmt, units }) {
  const rows = (data.rows || []).slice(0, 12).map((row) => ({
    name: `${row.vehicle} · ${row.route}`.slice(0, 28),
    loaded: row.loaded_km,
    empty: row.empty_km,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={<TbTruckReturn size={16} />} label="Empty distance" tone="slate"
          value={fmt.distance(data.total_empty_km)} hint={formatPercent(data.empty_pct)} />
        <StatTile icon={<TbRoad size={16} />} label="Total distance" value={fmt.distance(data.total_distance_km)} />
        <StatTile icon={<TbCoin size={16} />} label="Cost of empty km" tone="amber"
          value={fmt.money(data.wasted_cost_gbp)} />
        <StatTile icon={<TbLeaf size={16} />} label="CO₂ from empty km" tone="emerald"
          value={`${data.wasted_co2_kg} kg`} />
      </div>

      <Card title="Loaded vs empty distance" subtitle="Per vehicle leg — grey is running without a load">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No routes planned in this period.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: AXIS_INK, fontSize: 10 }} axisLine={false} tickLine={false}
                  interval={0} angle={-20} textAnchor="end" height={64} />
                <YAxis tick={{ fill: AXIS_INK, fontSize: 11 }} axisLine={false} tickLine={false} unit=" km" />
                <Tooltip {...chartTooltip} />
                <Legend wrapperStyle={{ fontSize: 12, color: AXIS_INK }} />
                <Bar dataKey="loaded" stackId="d" name="Loaded" fill={SERIES.primary} barSize={22}
                  stroke="#fff" strokeWidth={2} />
                <Bar dataKey="empty" stackId="d" name="Empty" fill={NEUTRAL} radius={[4, 4, 0, 0]} barSize={22}
                  stroke="#fff" strokeWidth={2} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Empty running by leg"
        subtitle="Repositioning is the distance from base to the first pickup">
        <Table
          columns={["Route", "Vehicle", "Date", "Distance", "Empty", "Empty %", "Repositioning", "Cost", "CO₂"]}
          rows={data.rows || []}
          renderRow={(row, index) => (
            <tr key={`${row.route_id}-${index}`} className="border-t border-gray-100">
              <td className="p-3 font-medium text-gray-800">{row.route}</td>
              <td className="p-3">{row.vehicle}</td>
              <td className="p-3 text-xs text-gray-500">{formatDate(row.date, units.dateFormat)}</td>
              <td className="p-3">{row.distance_km} km</td>
              <td className="p-3">{row.empty_km} km</td>
              <td className="p-3">
                <Chip tone={row.empty_pct > 35 ? "rose" : row.empty_pct > 20 ? "amber" : "emerald"}>
                  {row.empty_pct}%
                </Chip>
              </td>
              <td className="p-3">{row.repositioning_km} km</td>
              <td className="p-3">£{row.empty_cost_gbp}</td>
              <td className="p-3">{row.empty_co2_kg} kg</td>
            </tr>
          )}
        />
      </Card>
    </div>
  );
}

/* ── Utilisation: two measures, one axis (both are percentages) ────── */
function UtilisationReport({ data, fmt }) {
  const rows = (data.rows || []).slice(0, 12).map((row) => ({
    name: row.vehicle,
    weight: row.avg_weight_utilisation_pct,
    volume: row.avg_volume_utilisation_pct,
  }));

  return (
    <div className="space-y-5">
      <Card title="Average capacity used" subtitle="Peak load as a share of each vehicle's limit">
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No vehicle activity in this period.</p>
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: AXIS_INK, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: AXIS_INK, fontSize: 11 }} axisLine={false} tickLine={false} unit="%"
                  domain={[0, 100]} />
                <Tooltip {...chartTooltip} formatter={(value, name) => [`${value}%`, name]} />
                <Legend wrapperStyle={{ fontSize: 12, color: AXIS_INK }} />
                <Bar dataKey="weight" name="Weight" fill={SERIES.primary} radius={[4, 4, 0, 0]} barSize={16} />
                <Bar dataKey="volume" name="Volume" fill={SERIES.secondary} radius={[4, 4, 0, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Vehicle detail">
        <Table
          columns={["Vehicle", "Type", "Routes", "Weight used", "Volume used", "Peak load", "Distance", "Stops", "km/stop"]}
          rows={data.rows || []}
          renderRow={(row) => (
            <tr key={row.vehicle} className="border-t border-gray-100">
              <td className="p-3 font-medium text-gray-800">{row.vehicle}</td>
              <td className="p-3 text-gray-600">{row.type}</td>
              <td className="p-3">{row.routes}</td>
              <td className="p-3">{formatPercent(row.avg_weight_utilisation_pct)}</td>
              <td className="p-3">{formatPercent(row.avg_volume_utilisation_pct)}</td>
              <td className="p-3">{row.peak_load_kg} kg</td>
              <td className="p-3">{fmt.distance(row.distance_km)}</td>
              <td className="p-3">{row.stops}</td>
              <td className="p-3">{row.km_per_stop}</td>
            </tr>
          )}
        />
      </Card>
    </div>
  );
}

/* ── Orders ────────────────────────────────────────────────────────── */
function OrdersReport({ data, units }) {
  const statuses = Object.entries(data.by_status || {}).map(([status, count]) => ({
    name: titleCase(status), count,
  }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile icon={<TbPackage size={16} />} label="Orders" value={data.count} />
        <StatTile icon={<TbPackage size={16} />} label="Packages" tone="blue" value={data.total_packages} />
        <StatTile icon={<TbTruck size={16} />} label="Weight" tone="amber" value={`${data.total_weight_kg} kg`} />
        <StatTile icon={<TbTruck size={16} />} label="Volume" tone="slate" value={`${data.total_volume_m3} m³`} />
      </div>

      <Card title="Orders by status">
        {statuses.length === 0 ? (
          <p className="text-sm text-gray-500">No orders in this period.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statuses} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid vertical={false} stroke={GRID} />
                <XAxis dataKey="name" tick={{ fill: AXIS_INK, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: AXIS_INK, fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip {...chartTooltip} />
                <Bar dataKey="count" name="Orders" radius={[4, 4, 0, 0]} barSize={26}
                  label={{ position: "top", fill: AXIS_INK, fontSize: 11 }}>
                  {statuses.map((entry) => (
                    <Cell key={entry.name}
                      fill={entry.name === "Delivered" ? SERIES.primary
                        : entry.name === "Cancelled" || entry.name === "Failed" ? SERIES.tertiary
                          : SERIES.secondary} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Order detail">
        <Table
          columns={["Reference", "Status", "Customer", "Pickup", "Drop-off", "Packages", "Weight", "Created"]}
          rows={data.rows || []}
          renderRow={(row) => (
            <tr key={row.reference} className="border-t border-gray-100">
              <td className="p-3 font-medium text-gray-800">{row.reference}</td>
              <td className="p-3"><Chip tone="slate">{titleCase(row.status)}</Chip></td>
              <td className="p-3">{row.customer || "—"}</td>
              <td className="p-3 text-xs text-gray-600">{row.pickup}</td>
              <td className="p-3 text-xs text-gray-600">{row.dropoff}</td>
              <td className="p-3">{row.packages}</td>
              <td className="p-3">{row.weight_kg} kg</td>
              <td className="p-3 text-xs text-gray-500">{formatDate(row.created_at, units.dateFormat)}</td>
            </tr>
          )}
        />
      </Card>
    </div>
  );
}

/* ── Route log ─────────────────────────────────────────────────────── */
function RoutesReport({ data, fmt, units }) {
  return (
    <Card title={`${data.count} planned route(s)`}>
      <Table
        columns={["Route", "Status", "Objective", "Vehicles", "Orders", "Stops", "Distance", "Empty %", "CO₂", "Cost", "Planned"]}
        rows={data.routes || []}
        renderRow={(row) => (
          <tr key={row.route_id} className="border-t border-gray-100">
            <td className="p-3 font-medium text-gray-800">{row.name}</td>
            <td className="p-3"><Chip tone="slate">{titleCase(row.status)}</Chip></td>
            <td className="p-3">{titleCase(row.preference)}</td>
            <td className="p-3">{row.vehicles}</td>
            <td className="p-3">{row.orders}</td>
            <td className="p-3">{row.stops}</td>
            <td className="p-3">{fmt.distance(row.distance_km)}</td>
            <td className="p-3">{formatPercent(row.empty_pct)}</td>
            <td className="p-3">{row.co2_kg} kg</td>
            <td className="p-3">{fmt.money(row.cost_gbp)}</td>
            <td className="p-3 text-xs text-gray-500">{formatDate(row.created_at, units.dateFormat)}</td>
          </tr>
        )}
      />
    </Card>
  );
}
