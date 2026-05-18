import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  FaWarehouse,
  FaPlus,
  FaTrash,
  FaSearch,
  FaCity
} from "react-icons/fa";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import Logo from "../assets/logo.png";

const getToken = () => localStorage.getItem("token");
const getUserRole = () => localStorage.getItem("userRole") || "driver";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000";

export default function Depots() {
  const navigate = useNavigate();
  const [currentTab] = useState("depots");
  const [depots, setDepots] = useState([]);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newDepot, setNewDepot] = useState({ name: "", city: "", lat: "", lon: "", capacity: "" });
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("");

  const userInitials = (localStorage.getItem("fullName") || "Admin User")
    .split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const isAdmin = getUserRole() === "admin";

  useEffect(() => {
    fetchDepots();
  }, []);

  const fetchDepots = async () => {
    setDataLoaded(false);
    try {
      const res = await fetch(`${API_BASE}/depots`, {
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (!res.ok) throw new Error("Could not fetch depots");
      const data = await res.json();
      setDepots(data.map(d => ({ ...d, id: d._id || d.id })));
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      setDepots([]);
      toast.error("Failed to load depots.");
    } finally {
      setTimeout(() => setDataLoaded(true), 400);
    }
  };

  const handleAddDepot = async () => {
    if (!newDepot.name.trim() || !newDepot.city.trim()) {
      toast.error("Name and city are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/depots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          ...newDepot,
          lat: parseFloat(newDepot.lat) || 0,
          lon: parseFloat(newDepot.lon) || 0,
          capacity: parseInt(newDepot.capacity, 10) || 0,
        })
      });
      if (res.ok) {
        toast.success("Depot added.");
        setNewDepot({ name: "", city: "", lat: "", lon: "", capacity: "" });
        setShowAdd(false);
        await fetchDepots();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error || "Failed to add depot.");
      }
    } catch {
      toast.error("Network error — could not add depot.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveDepot = async (id) => {
    if (!window.confirm("Delete this depot?")) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/depots/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` }
      });
      if (res.ok) {
        toast.success("Depot removed.");
        await fetchDepots();
      } else {
        toast.error("Failed to delete depot.");
      }
    } catch {
      toast.error("Network error — could not delete depot.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = depots.filter(d =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.city.toLowerCase().includes(search.toLowerCase())
  );

  const topStats = [
    {
      icon: <FaWarehouse className="text-emerald-600" size={18} />,
      label: "Total Depots",
      value: depots.length
    },
    {
      icon: <FaCity className="text-blue-500" size={18} />,
      label: "Cities",
      value: [...new Set(depots.map(d => d.city))].length
    },
    {
      icon: <FaWarehouse className="text-emerald-500" size={18} />,
      label: "Max Capacity",
      value: depots.reduce((max, d) => Math.max(max, d.capacity ?? 0), 0) + " units"
    }
  ];

  return (
    <div className="flex flex-col h-screen font-sans select-none
      bg-gradient-to-br from-emerald-100 via-emerald-50 to-white
      [background-image:radial-gradient(circle_at_15%_15%,rgba(16,185,129,.20)_0%,transparent_55%),
        radial-gradient(circle_at_85%_75%,rgba(5,150,105,.18)_0%,transparent_45%)]">

      <Topbar
        logoSrc={Logo}
        appName="OptiGo"
        stats={topStats}
        showLiveIndicator={true}
        userInitials={userInitials}
        onHomeClick={() => navigate("/plan")}
        onMapClick={() => navigate("/tracking")}
        onProfileClick={() => navigate("/settings")}
      />

      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar currentTab={currentTab} />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Title + Actions */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 px-8 pt-10 pb-4">
            <div>
              <h1 className="text-3xl font-bold text-emerald-800">Depots & Locations</h1>
              <p className="text-gray-600 text-base">
                {isAdmin
                  ? "Manage all depots, hubs, and warehouse locations for your fleet."
                  : "Browse available depots and their details."}
              </p>
            </div>
            <div className="flex gap-2 mt-2 w-full md:w-auto">
              <input
                type="text"
                placeholder="Search by name/city..."
                className="px-4 py-2 rounded-lg border border-emerald-200 text-base bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400 flex-1 md:w-auto"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <button className="p-2 rounded-lg border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-100">
                <FaSearch />
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowAdd(v => !v)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 flex items-center gap-2 whitespace-nowrap"
                  disabled={loading}
                >
                  <FaPlus /> Add Depot
                </button>
              )}
            </div>
          </div>

          {/* Stat Cards */}
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 px-8 mb-8">
            {topStats.map((s, i) => (
              <div key={i} className="rounded-2xl border bg-white/80 border-emerald-100 p-6 flex items-center gap-4 shadow">
                <div className="flex-shrink-0 rounded-xl p-4 bg-emerald-50">{s.icon}</div>
                <div>
                  <div className="text-sm text-gray-500 font-medium uppercase">{s.label}</div>
                  <div className="text-2xl font-bold text-emerald-800 mt-1">{s.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Add New Depot (Admin Only) */}
          {isAdmin && showAdd && (
            <div className="px-8 mb-4">
              <div className="bg-white border border-emerald-200 rounded-2xl shadow-lg p-6 flex flex-col gap-3">
                <div className="flex flex-wrap gap-3">
                  <input
                    className="border border-emerald-200 rounded-lg px-3 py-2 flex-1 min-w-[120px]"
                    placeholder="Depot Name"
                    value={newDepot.name}
                    onChange={e => setNewDepot(v => ({ ...v, name: e.target.value }))}
                  />
                  <input
                    className="border border-emerald-200 rounded-lg px-3 py-2 flex-1 min-w-[120px]"
                    placeholder="City"
                    value={newDepot.city}
                    onChange={e => setNewDepot(v => ({ ...v, city: e.target.value }))}
                  />
                  <input
                    className="border border-emerald-200 rounded-lg px-3 py-2 w-28"
                    placeholder="Latitude"
                    value={newDepot.lat}
                    onChange={e => setNewDepot(v => ({ ...v, lat: e.target.value }))}
                  />
                  <input
                    className="border border-emerald-200 rounded-lg px-3 py-2 w-28"
                    placeholder="Longitude"
                    value={newDepot.lon}
                    onChange={e => setNewDepot(v => ({ ...v, lon: e.target.value }))}
                  />
                  <input
                    className="border border-emerald-200 rounded-lg px-3 py-2 w-28"
                    type="number"
                    min={0}
                    placeholder="Capacity"
                    value={newDepot.capacity}
                    onChange={e => setNewDepot(v => ({ ...v, capacity: e.target.value }))}
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg px-4 py-2 flex items-center gap-2"
                    onClick={handleAddDepot}
                    disabled={loading}
                  >
                    <FaPlus /> {loading ? "Adding..." : "Add"}
                  </button>
                  <button
                    className="px-4 py-2 rounded-lg border text-gray-500 border-emerald-200 bg-white hover:bg-emerald-50"
                    onClick={() => setShowAdd(false)}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Depot Table */}
          <div className="flex-1 overflow-y-auto px-8 pb-8">
            <div className="bg-white/95 border border-emerald-100 rounded-2xl shadow p-0 overflow-x-auto">
              <table className="min-w-full text-base">
                <thead>
                  <tr className="bg-emerald-50 text-emerald-800">
                    <th className="p-4 text-left font-semibold">Depot</th>
                    <th className="p-4 text-left font-semibold">City</th>
                    <th className="p-4 text-left font-semibold">Lat</th>
                    <th className="p-4 text-left font-semibold">Lon</th>
                    <th className="p-4 text-left font-semibold">Capacity</th>
                    {isAdmin && <th className="p-4 text-left font-semibold">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {dataLoaded ? (
                    filtered.length ? (
                      filtered.map(dep => (
                        <tr key={dep.id} className="border-t hover:bg-emerald-50/60 transition">
                          <td className="p-4 font-medium flex items-center gap-2">
                            <FaWarehouse className="text-emerald-400" /> {dep.name}
                          </td>
                          <td className="p-4">{dep.city}</td>
                          <td className="p-4">{dep.lat}</td>
                          <td className="p-4">{dep.lon}</td>
                          <td className="p-4">{dep.capacity}</td>
                          {isAdmin && (
                            <td className="p-4">
                              <button
                                className="p-2 rounded-lg bg-rose-100 text-rose-700 hover:bg-rose-200 transition"
                                onClick={() => handleRemoveDepot(dep.id)}
                                disabled={loading}
                              >
                                <FaTrash />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} className="p-6 text-center text-gray-500">
                          No depots found.
                        </td>
                      </tr>
                    )
                  ) : (
                    <tr>
                      <td colSpan={isAdmin ? 6 : 5} className="p-6 text-center text-gray-400">
                        Loading depots...
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Status Bar */}
          <div className="bg-emerald-50/80 h-10 flex items-center px-8 border-t border-emerald-100 text-xs text-gray-600">
            {dataLoaded
              ? `${filtered.length} depot${filtered.length !== 1 ? "s" : ""} shown${lastUpdated ? ` • Last updated: ${lastUpdated}` : ""}`
              : "Loading..."}
          </div>
        </div>
      </div>
    </div>
  );
}
