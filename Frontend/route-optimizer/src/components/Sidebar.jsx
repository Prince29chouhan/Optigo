// Sidebar.jsx — role-aware navigation with logout and mobile menu
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  TbAlertTriangle, TbChartLine, TbGridDots, TbLeaf, TbLogout, TbMap, TbMapPin,
  TbPackage, TbReportAnalytics, TbRoute, TbSettings, TbTruck, TbTruckDelivery, TbX,
} from "react-icons/tb";

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { logout, isAdmin } = useAuth();

  const navItems = [
    { icon: <TbTruckDelivery size={22} />, label: "Route Planner", path: "/plan" },
    { icon: <TbPackage size={22} />, label: "Orders", path: "/orders" },
    { icon: <TbTruck size={22} />, label: "Fleet", path: "/vehicles" },
    { icon: <TbMapPin size={22} />, label: "Depots", path: "/depots" },
    { icon: <TbMap size={22} />, label: "Live Tracking", path: "/tracking" },
    { icon: <TbReportAnalytics size={22} />, label: "Reports", path: "/reports" },
    { icon: <TbLeaf size={22} />, label: "Emissions", path: "/emissions" },
  ];
  if (isAdmin) navItems.push({ icon: <TbChartLine size={22} />, label: "Admin", path: "/admin" });

  const bottomNavItems = navItems.slice(0, 4);
  const isActive = (path) => pathname === path;

  const handleLogout = () => {
    logout();
    setMoreMenuOpen(false);
    setShowLogoutConfirm(false);
    navigate("/");
  };

  useEffect(() => {
    const onResize = () => { if (window.innerWidth >= 768) setMoreMenuOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    document.body.style.overflow = moreMenuOpen ? "hidden" : "auto";
    return () => { document.body.style.overflow = "auto"; };
  }, [moreMenuOpen]);

  return (
    <>
      {/* Desktop rail */}
      <nav
        className="hidden md:flex flex-col bg-gradient-to-b from-emerald-800 to-emerald-900 text-white py-5
                   shadow-xl h-full transition-all duration-300 relative z-20 border-r border-emerald-700/50"
        style={{ width: expanded ? "15rem" : "4.75rem" }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        aria-label="Main navigation"
      >
        <div className="flex flex-col px-3 gap-0.5">
          {navItems.map((item) => (
            <SidebarLink key={item.path} {...item} active={isActive(item.path)} expanded={expanded} />
          ))}
        </div>

        <div className="mt-auto px-3">
          <div className="border-t border-emerald-700/50 pt-3 mb-1" />
          <SidebarLink icon={<TbSettings size={22} />} label="Settings" path="/settings"
            active={isActive("/settings")} expanded={expanded} />
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className={`flex items-center ${expanded ? "justify-start px-3" : "justify-center"} h-12 my-1 rounded-lg
                        w-full transition-colors relative group/item text-emerald-200 hover:bg-red-500/20 hover:text-red-200`}
          >
            <TbLogout size={22} />
            {expanded ? (
              <span className="ml-3 text-sm whitespace-nowrap">Logout</span>
            ) : (
              <span className="absolute left-full ml-3 px-2 py-1 rounded bg-gray-900 text-xs whitespace-nowrap
                               opacity-0 group-hover/item:opacity-100 transition-opacity pointer-events-none z-50">
                Logout
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200
                      flex justify-around items-center h-16 z-20">
        {bottomNavItems.map((item) => (
          <Link key={item.path} to={item.path} className="flex flex-col items-center justify-center w-16 py-1">
            <span className={`p-1.5 rounded-full ${isActive(item.path) ? "bg-emerald-100 text-emerald-700" : "text-gray-500"}`}>
              {item.icon}
            </span>
            <span className={`text-[11px] mt-0.5 ${isActive(item.path) ? "text-emerald-700 font-medium" : "text-gray-500"}`}>
              {item.label.split(" ")[0]}
            </span>
          </Link>
        ))}
        <button onClick={() => setMoreMenuOpen(true)} className="flex flex-col items-center justify-center w-16 py-1">
          <span className="p-1.5 rounded-full text-gray-500"><TbGridDots size={22} /></span>
          <span className="text-[11px] mt-0.5 text-gray-500">More</span>
        </button>
      </div>

      {moreMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMoreMenuOpen(false)}>
          <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl py-4 px-2"
            onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-between items-center px-4 mb-3">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-xl bg-emerald-600 flex items-center justify-center">
                  <TbRoute size={18} className="text-white" />
                </span>
                <span className="font-bold text-lg">OptiGo</span>
              </div>
              <button onClick={() => setMoreMenuOpen(false)} className="p-1 rounded-full bg-gray-100">
                <TbX size={20} />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 px-4">
              {[...navItems, { icon: <TbSettings size={22} />, label: "Settings", path: "/settings" }].map((item) => (
                <Link key={item.path} to={item.path} onClick={() => setMoreMenuOpen(false)}
                  className="flex flex-col items-center justify-center py-3">
                  <span className={`p-3 rounded-xl mb-1.5 ${isActive(item.path) ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>
                    {item.icon}
                  </span>
                  <span className={`text-[11px] text-center ${isActive(item.path) ? "text-emerald-700 font-medium" : "text-gray-600"}`}>
                    {item.label}
                  </span>
                </Link>
              ))}
            </div>

            <div className="border-t border-gray-100 mt-3 pt-3 px-6">
              <button onClick={() => setShowLogoutConfirm(true)}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-red-50 text-red-600 rounded-lg w-full">
                <TbLogout size={18} /> <span className="font-medium">Logout</span>
              </button>
            </div>
            <div className="h-14" />
          </div>
        </div>
      )}

      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center px-4"
          onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center text-amber-500 mb-3">
              <TbAlertTriangle size={22} />
              <h3 className="text-lg font-semibold ml-2 text-gray-800">Confirm logout</h3>
            </div>
            <p className="text-gray-600 mb-5 text-sm">
              You will need to sign in again to plan routes. Unsaved plans are kept on this device.
            </p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarLink({ icon, label, path, active, expanded }) {
  return (
    <Link
      to={path}
      className={`flex items-center ${expanded ? "justify-start px-3" : "justify-center"} h-12 my-0.5 rounded-lg
                  transition-colors relative group/item
                  ${active ? "text-white bg-emerald-600 shadow" : "text-emerald-200 hover:bg-emerald-700/40"}`}
    >
      <span className="shrink-0">{icon}</span>
      {expanded ? (
        <span className="ml-3 text-sm whitespace-nowrap">{label}</span>
      ) : (
        <span className="absolute left-full ml-3 px-2 py-1 rounded bg-gray-900 text-xs text-white whitespace-nowrap
                         opacity-0 group-hover/item:opacity-100 transition-opacity pointer-events-none z-50">
          {label}
        </span>
      )}
    </Link>
  );
}
