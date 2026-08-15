import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  TbBuildingWarehouse, TbLeaf, TbPackage, TbRoute, TbTruck, TbUsers,
} from "react-icons/tb";
import PageShell from "../components/PageShell";
import { Button, Card, Chip, Spinner, StatTile, Table } from "../components/ui";
import { getCompanyStats, getDrivers, getOrders, getRoutes } from "../lib/api";
import { useSettings } from "../context/SettingsContext";
import { formatDateTime, formatPercent, titleCase } from "../lib/format";

/** Admin overview: company-wide counts, the team, and the latest activity. */
const AdminDashboard = () => {
  const navigate = useNavigate();
  const { fmt, units } = useSettings();
  const [stats, setStats] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statsData, driverData, routeData, orderData] = await Promise.all([
        getCompanyStats(),
        getDrivers().catch(() => []),
        getRoutes({ limit: 10 }).catch(() => ({ routes: [] })),
        getOrders({ limit: 10 }).catch(() => ({ orders: [] })),
      ]);
      setStats(statsData);
      setDrivers(Array.isArray(driverData) ? driverData : []);
      setRoutes(routeData.routes || []);
      setOrders(orderData.orders || []);
    } catch (error) {
      toast.error(error.message || "Could not load the dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <PageShell
      title="Admin dashboard"
      subtitle={stats ? `${stats.company_name} — company-wide activity` : "Company-wide activity"}
      actions={
        <>
          <Button variant="secondary" onClick={() => navigate("/reports")}>Reports</Button>
          <Button onClick={() => navigate("/plan")}>Plan a route</Button>
        </>
      }
    >
      {loading ? (
        <Spinner label="Loading dashboard…" />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={<TbUsers size={16} />} label="Drivers" value={stats?.num_drivers ?? 0} />
            <StatTile icon={<TbTruck size={16} />} label="Vehicles" tone="blue" value={stats?.num_vehicles ?? 0} />
            <StatTile icon={<TbBuildingWarehouse size={16} />} label="Depots" tone="slate" value={stats?.num_depots ?? 0} />
            <StatTile icon={<TbPackage size={16} />} label="Orders" tone="amber" value={stats?.num_orders ?? 0} />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatTile icon={<TbRoute size={16} />} label="Routes planned" value={stats?.total_routes ?? 0} />
            <StatTile icon={<TbRoute size={16} />} label="Distance planned" tone="blue"
              value={fmt.distance(stats?.total_distance_km ?? 0)} />
            <StatTile icon={<TbTruck size={16} />} label="Empty running" tone="slate"
              value={formatPercent(stats?.empty_pct ?? 0)} hint={fmt.distance(stats?.empty_km ?? 0)} />
            <StatTile icon={<TbLeaf size={16} />} label="CO₂ dispatched" tone="emerald"
              value={`${stats?.total_emission ?? 0} kg`} hint={`${stats?.planned_emission ?? 0} kg planned`} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Recent routes" subtitle="Latest saved plans">
              <Table
                columns={["Route", "Status", "Vehicles", "Distance", "CO₂", "Planned"]}
                rows={routes}
                empty="No routes saved yet."
                renderRow={(route) => (
                  <tr key={route.id} className="border-t border-gray-100">
                    <td className="p-3 font-medium text-gray-800">{route.name}</td>
                    <td className="p-3"><Chip tone="slate">{titleCase(route.status)}</Chip></td>
                    <td className="p-3">{route.vehicle_count}</td>
                    <td className="p-3">{fmt.distance(route.summary?.total_distance_km ?? 0)}</td>
                    <td className="p-3">{route.summary?.co2_kg ?? 0} kg</td>
                    <td className="p-3 text-xs text-gray-500">
                      {formatDateTime(route.created_at, units.dateFormat)}
                    </td>
                  </tr>
                )}
              />
            </Card>

            <Card title="Recent orders">
              <Table
                columns={["Reference", "Customer", "Status", "Weight"]}
                rows={orders}
                empty="No orders yet."
                renderRow={(order) => (
                  <tr key={order.id} className="border-t border-gray-100">
                    <td className="p-3 font-medium text-gray-800">{order.reference}</td>
                    <td className="p-3">{order.customer_name || "—"}</td>
                    <td className="p-3"><Chip tone="slate">{titleCase(order.status)}</Chip></td>
                    <td className="p-3">{order.totals?.total_weight_kg ?? 0} kg</td>
                  </tr>
                )}
              />
            </Card>
          </div>

          <Card title="Team"
            subtitle={`${drivers.length} driver(s) and planner(s) in ${stats?.company_name || "your company"}`}>
            <Table
              columns={["Name", "Email", "Role", "Joined"]}
              rows={drivers}
              empty="No drivers registered yet."
              renderRow={(driver) => (
                <tr key={driver.id || driver._id} className="border-t border-gray-100">
                  <td className="p-3 font-medium text-gray-800">{driver.full_name || "—"}</td>
                  <td className="p-3 text-gray-600">{driver.email}</td>
                  <td className="p-3"><Chip tone="emerald">{driver.user_type}</Chip></td>
                  <td className="p-3 text-xs text-gray-500">
                    {formatDateTime(driver.created_at, units.dateFormat)}
                  </td>
                </tr>
              )}
            />
          </Card>
        </div>
      )}
    </PageShell>
  );
};

export default AdminDashboard;
