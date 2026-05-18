// src/pages/AdminDashboard.jsx
import { useState, useEffect } from "react";
import Sidebar from "../components/Sidebar";
import {
  Bell, Users, Package, Route, TrendingUp, BarChart3,
  Settings, Plus, Edit, Trash2, Eye, Filter, Download, RefreshCw
} from "lucide-react";
import { getDrivers, getCompanyStats } from "../lib/api";

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [selectedTimeframe, setSelectedTimeframe] = useState("week");
  const [currentTab, setCurrentTab] = useState('admin');

  const fullName = localStorage.getItem("fullName") || "Admin User";
  const email = localStorage.getItem("email") || "admin@optigo.com";

  // Real data from API
  const [apiStats, setApiStats]   = useState(null);
  const [drivers, setDrivers]     = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    getCompanyStats()
      .then(setApiStats)
      .catch(() => setApiStats(null))
      .finally(() => setLoadingStats(false));
    getDrivers()
      .then(setDrivers)
      .catch(() => setDrivers([]));
  }, []);

  const stats = [
    {
      title: "Active Drivers",
      value: loadingStats ? "…" : (apiStats?.num_drivers ?? drivers.length),
      diff: "", icon: <Users className="w-6 h-6 text-blue-600" />,
      color: "from-blue-100 to-blue-200", diffColor: "text-green-500"
    },
    {
      title: "Depots",
      value: loadingStats ? "…" : (apiStats?.num_depots ?? "—"),
      diff: "", icon: <Package className="w-6 h-6 text-green-600" />,
      color: "from-green-100 to-green-200", diffColor: "text-green-500"
    },
    {
      title: "Total CO₂ Tracked",
      value: loadingStats ? "…" : (apiStats?.total_emission != null ? `${apiStats.total_emission.toFixed(1)} kg` : "0 kg"),
      diff: "", icon: <BarChart3 className="w-6 h-6 text-teal-600" />,
      color: "from-teal-100 to-teal-200", diffColor: "text-green-500"
    },
    {
      title: "Total Routes Run",
      value: loadingStats ? "…" : (apiStats?.total_routes ?? "—"),
      diff: "", icon: <Route className="w-6 h-6 text-purple-600" />,
      color: "from-purple-100 to-purple-200", diffColor: "text-green-500"
    },
  ];

  // Deliveries table remains demonstration data — no delivery-tracking collection in DB yet
  const recentDeliveries = [
    { id: "DEL001", driver: "—", route: "Run a route to see data", status: "pending", time: "" },
  ];

  const getStatusColor = (status) => {
    switch (status) {
      case "delivered": return "text-green-600 bg-green-100";
      case "in-transit": return "text-blue-600 bg-blue-100";
      case "pending": return "text-yellow-600 bg-yellow-100";
      case "active": return "text-green-600 bg-green-100";
      case "offline": return "text-gray-600 bg-gray-100";
      default: return "text-gray-600 bg-gray-100";
    }
  };

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: BarChart3 },
    { id: "deliveries", label: "Deliveries", icon: Package },
    { id: "drivers", label: "Drivers", icon: Users },
    { id: "routes", label: "Routes", icon: Route },
    { id: "analytics", label: "Analytics", icon: TrendingUp },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  const renderDashboard = () => (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6">
        {stats.map((s, i) => (
          <div key={i} className={`bg-gradient-to-br ${s.color} rounded-2xl shadow-md p-6 flex flex-col gap-3 hover:scale-[1.03] transition-all duration-300`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-gray-600 text-sm">{s.title}</div>
                <div className="text-2xl font-bold text-gray-800 mt-1">{s.value}</div>
              </div>
              <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-white/70 shadow">{s.icon}</div>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className={`font-semibold ${s.diffColor}`}>{s.diff}</span>
              <span className="text-xs text-gray-500 ml-1">vs last month</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white/95 shadow rounded-2xl overflow-x-auto border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-lg font-bold text-gray-800">Recent Deliveries</h3>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1.5 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors">View All</button>
            <button className="p-1.5 text-gray-500 hover:text-gray-700 transition-colors"><RefreshCw className="w-4 h-4" /></button>
          </div>
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="p-4 text-left">Delivery ID</th>
              <th className="p-4 text-left">Driver</th>
              <th className="p-4 text-left">Route</th>
              <th className="p-4 text-left">Status</th>
              <th className="p-4 text-left">Time</th>
              <th className="p-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {recentDeliveries.map((delivery) => (
              <tr key={delivery.id} className="border-t hover:bg-emerald-50/50">
                <td className="p-4 font-semibold">{delivery.id}</td>
                <td className="p-4">{delivery.driver}</td>
                <td className="p-4">{delivery.route}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(delivery.status)}`}>{delivery.status}</span>
                </td>
                <td className="p-4 text-gray-500">{delivery.time}</td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <button className="p-1 text-gray-500 hover:text-blue-600 transition-colors"><Eye className="w-4 h-4" /></button>
                    <button className="p-1 text-gray-500 hover:text-green-600 transition-colors"><Edit className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDrivers = () => (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Driver Management</h2>
        <button className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 py-2 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all duration-300 flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Driver
        </button>
      </div>

      <div className="bg-white/95 shadow rounded-2xl overflow-x-auto border border-gray-100">
        <div className="flex flex-col sm:flex-row gap-4 p-4 border-b">
          <div className="relative flex-1">
            <input type="text" placeholder="Search drivers..." className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:border-green-500 focus:outline-none" />
            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"><Users className="w-4 h-4" /></span>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-2 border border-gray-200 rounded-lg hover:border-green-300 transition-colors flex items-center gap-2"><Filter className="w-4 h-4" /> Filter</button>
            <button className="px-3 py-2 border border-gray-200 rounded-lg hover:border-green-300 transition-colors flex items-center gap-2"><Download className="w-4 h-4" /> Export</button>
          </div>
        </div>

        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50/70">
              <th className="p-4 text-left">Driver</th>
              <th className="p-4 text-left">Email</th>
              <th className="p-4 text-left">Joined</th>
              <th className="p-4 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingStats && (
              <tr><td colSpan={4} className="p-4 text-center text-gray-400">Loading drivers…</td></tr>
            )}
            {!loadingStats && drivers.length === 0 && (
              <tr><td colSpan={4} className="p-4 text-center text-gray-400">No drivers registered yet</td></tr>
            )}
            {drivers.map((driver) => {
              const initials = (driver.full_name || driver.email || "?")
                .split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
              const joined = driver.created_at
                ? new Date(driver.created_at).toLocaleDateString()
                : "—";
              return (
                <tr key={driver._id} className="border-t hover:bg-emerald-50/50">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center text-white font-medium text-sm">
                        {initials}
                      </div>
                      <span className="font-medium text-gray-800">{driver.full_name || "—"}</span>
                    </div>
                  </td>
                  <td className="p-4 text-gray-600">{driver.email}</td>
                  <td className="p-4 text-gray-500">{joined}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button className="p-1 text-gray-500 hover:text-blue-600 transition-colors"><Eye className="w-4 h-4" /></button>
                      <button className="p-1 text-gray-500 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    // Overall page background
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50">
      {/* Sidebar: kept as a standalone element so it can be fixed or normal (component controls its internals) */}
      <div className="hidden md:block fixed left-0 top-0 h-screen w-64 z-50">
        <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />
      </div>

      {/* Main content area: reserve left space on md+ screens (md:ml-64). On small screens the sidebar should collapse so ml-0 */}
      <div className="md:ml-64">
        {/* Header (constrained & centered) */}
        <header className="bg-white/90 backdrop-blur-xl shadow-sm border-b border-white/20 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gray-800 capitalize">
                {menuItems.find(item => item.id === activeTab)?.label || "Dashboard"}
              </h1>
              <p className="text-gray-600 text-sm">Welcome back, manage your logistics operations</p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedTimeframe}
                onChange={(e) => setSelectedTimeframe(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:border-green-500 focus:outline-none"
              >
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
              </select>

              <button className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors">
                <Bell className="w-5 h-5" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></span>
              </button>

              <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1 px-3">
                <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-emerald-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                  {fullName.charAt(0)}
                </div>
                <span className="hidden sm:block text-sm font-medium text-gray-700">{fullName}</span>
                <span className="hidden md:block text-xs text-gray-500">{email}</span>
              </div>
            </div>
          </div>
        </header>

        {/* Tab Nav (constrained & centered) */}
        <nav className="bg-white/80 border-b border-white/20 sticky top-[72px] z-30">
          <div className="max-w-7xl mx-auto px-4 lg:px-8 py-2 flex gap-1">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-4 py-2 rounded-t-lg font-medium flex items-center gap-2 transition-all duration-200
                  ${activeTab === item.id ? "bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 shadow" : "text-gray-600 hover:bg-gray-100"}`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Content wrapper - constrained width and centered */}
        <main className="flex-1 py-6">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            {activeTab === "dashboard" && renderDashboard()}
            {activeTab === "drivers" && renderDrivers()}
            {/* add other tabs here */}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;
