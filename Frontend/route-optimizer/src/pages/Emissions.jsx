import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { TbDownload, TbLeaf, TbRoad, TbTree, TbTruck, TbTruckReturn } from "react-icons/tb";
import PageShell from "../components/PageShell";
import { Button, Card, Chip, Select, Spinner, StatTile, Table } from "../components/ui";
import { exportReportCsv, getReport } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { formatPercent, titleCase } from "../lib/format";

/** Same validated series colour as the other reporting screens. */
const SERIES = "#059669";
const AXIS_INK = "#64748b";
const GRID = "#eef2f7";

/**
 * Emissions dashboard. Every figure comes from planned routes via
 * /reports/emissions and /reports/summary — nothing here is synthesised.
 */
export default function Emissions() {
  const { fmt } = useSettings();
  const [groupBy, setGroupBy] = useState("vehicle");
  const [emissions, setEmissions] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [emissionsReport, summaryReport] = await Promise.all([
        getReport("emissions", { group_by: groupBy }),
        getReport("summary"),
      ]);
      setEmissions(emissionsReport.data);
      setSummary(summaryReport.data);
    } catch (error) {
      toast.error(error.message || "Could not load emissions data");
    } finally {
      setLoading(false);
    }
  }, [groupBy]);

  useEffect(() => { load(); }, [load]);

  const rows = emissions?.rows || [];

  const stats = [
    { icon: <TbLeaf className="text-emerald-600" size={18} />, label: "Total CO₂",
      value: `${emissions?.total_co2_kg ?? 0} kg` },
    { icon: <TbTree className="text-green-600" size={18} />, label: "Trees to offset",
      value: emissions?.trees_equivalent ?? 0 },
    { icon: <TbRoad className="text-blue-500" size={18} />, label: "Distance",
      value: summary ? fmt.distance(summary.total_distance_km) : "—" },
  ];

  return (
    <PageShell
      title="Emissions"
      subtitle="CO₂ from every planned route, derived from real distance and vehicle data"
      stats={stats}
      actions={
        <Button variant="secondary" icon={<TbDownload size={16} />}
          onClick={() => exportReportCsv("emissions", { group_by: groupBy })}>
          Export CSV
        </Button>
      }
    >
      {loading ? (
        <Spinner label="Loading emissions…" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={<TbLeaf size={16} />} label="Total CO₂" value={`${emissions?.total_co2_kg ?? 0} kg`}
              hint={summary ? `${summary.co2_per_km} kg per km` : ""} />
            <StatTile icon={<TbTruck size={16} />} label="Fuel / energy" tone="blue"
              value={summary ? fmt.fuel(summary.fuel_l) : "—"} />
            <StatTile icon={<TbTruckReturn size={16} />} label="CO₂ while empty" tone="slate"
              value={summary ? `${(summary.co2_kg * (summary.empty_pct / 100)).toFixed(1)} kg` : "—"}
              hint={summary ? `${formatPercent(summary.empty_pct)} of distance runs empty` : ""} />
            <StatTile icon={<TbTree size={16} />} label="Trees to offset" tone="emerald"
              value={emissions?.trees_equivalent ?? 0} hint="21 kg CO₂ per tree per year" />
          </div>

          <Card
            title={`CO₂ by ${groupBy}`}
            subtitle="Kilograms of CO₂ from planned routes"
            actions={
              <Select value={groupBy} onChange={setGroupBy}>
                {["vehicle", "route", "day", "preference"].map((option) => (
                  <option key={option} value={option}>{titleCase(option)}</option>
                ))}
              </Select>
            }
          >
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">
                No routes planned yet — plan and save a route to start tracking emissions.
              </p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
                    <CartesianGrid horizontal={false} stroke={GRID} />
                    <XAxis type="number" unit=" kg" tick={{ fill: AXIS_INK, fontSize: 11 }}
                      axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="group" width={140}
                      tick={{ fill: AXIS_INK, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 12 }}
                      cursor={{ fill: "rgba(15,23,42,.04)" }}
                      formatter={(value) => [`${value} kg CO₂`, "Emissions"]}
                    />
                    <Bar dataKey="co2_kg" fill={SERIES} radius={[0, 4, 4, 0]} barSize={16}
                      label={{ position: "right", fill: AXIS_INK, fontSize: 11,
                        formatter: (value) => `${value} kg` }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          <Card title="Detail" subtitle="Carbon intensity per group — grams of CO₂ per kilometre">
            <Table
              columns={["Group", "CO₂ (kg)", "Distance", "Fuel", "Cost", "g CO₂/km", "Routes"]}
              rows={rows}
              empty="Nothing planned yet."
              renderRow={(row) => (
                <tr key={row.group} className="border-t border-gray-100">
                  <td className="p-3 font-medium text-gray-800">{row.group}</td>
                  <td className="p-3">{row.co2_kg}</td>
                  <td className="p-3">{fmt.distance(row.distance_km)}</td>
                  <td className="p-3">{fmt.fuel(row.fuel_l)}</td>
                  <td className="p-3">{fmt.money(row.cost_gbp)}</td>
                  <td className="p-3">
                    <Chip tone={row.g_co2_per_km > 900 ? "rose" : row.g_co2_per_km > 600 ? "amber" : "emerald"}>
                      {row.g_co2_per_km}
                    </Chip>
                  </td>
                  <td className="p-3">{row.routes}</td>
                </tr>
              )}
            />
          </Card>

          <Card title="How these numbers are produced">
            <ul className="text-sm text-gray-600 space-y-1.5 list-disc pl-5">
              <li>Distance comes from the planned stop sequence — great-circle inflated by a road factor, or the
                  GNN corridor when both ends are network depots.</li>
              <li>Fuel and energy use each vehicle's own efficiency, scaled up to +18% at full payload.</li>
              <li>CO₂ uses 2.68 kg per litre of diesel, 2.31 for petrol, and the UK grid average of
                  0.207 kg per kWh for electric vehicles.</li>
              <li>Empty-running emissions are the share of CO₂ produced while the vehicle carries no load.</li>
            </ul>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
