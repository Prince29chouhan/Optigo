// Sidebar.jsx - Role-based Admin Link with logout and mobile menu
import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  TbTruckDelivery,
  TbRoute,
  TbChartLine,
  TbMapPin,
  TbSettings,
  TbBriefcase,
  TbMenu2,
  TbX,
  TbHome,
  TbGridDots,
  TbLogout,
  TbMap,
  TbLeaf,
  TbAlertTriangle
} from "react-icons/tb";

export default function Sidebar({ currentTab = 'planner' }) {
  const [expanded, setExpanded] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // === ADMIN ROLE LOGIC ===
  // Read userRole from localStorage (saved during login)
  const userRole = localStorage.getItem("userRole");

  // Always visible navigation items
  const primaryNavItems = [
    { icon: <TbTruckDelivery size={22} />, label: "Route Planner", path: "/plan", badge: null },
    { icon: <TbMap size={22} />, label: "Live Tracking", path: "/tracking", badge: null },
    { icon: <TbLeaf size={22} />, label: "Emissions", path: "/emissions", badge: null },
    { icon: <TbMapPin size={22} />, label: "Depots & Locations", path: "/depots", badge: null }
  ];

  // Only add Admin menu if the user is admin
  if (userRole === "admin") {
    primaryNavItems.push({
      icon: <TbChartLine size={22} />,
      label: "Admin",
      path: "/admin",
      badge: null
    });
  }

  // For mobile bottom nav, only core pages (no admin even for admin user)
  const bottomNavItems = primaryNavItems.slice(0, 4);

  // Path check
  const isActive = (path) => pathname === path;

  // Handle logout confirmation
  const confirmLogout = () => setShowLogoutConfirm(true);

  // Actual logout logic
  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("userRole");
    localStorage.removeItem("fullName");
    localStorage.removeItem("companyName");
    localStorage.removeItem("email");
    if (typeof logout === "function") logout();
    navigate("/");
    setMoreMenuOpen(false);
    setShowLogoutConfirm(false);
  };

  // Handle resize (for menu state)
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
        setMoreMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Prevent body scroll when overlay menu is open
  useEffect(() => {
    if (mobileMenuOpen || moreMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [mobileMenuOpen, moreMenuOpen]);

  return (
    <>
      {/* DESKTOP SIDEBAR */}
      <div
        className="hidden md:flex flex-col bg-gradient-to-b from-emerald-800 to-emerald-900 text-white py-6 shadow-xl h-full
                transition-all duration-300 relative z-20 border-r border-emerald-700/50"
        style={{ width: expanded ? '16rem' : '5rem' }}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        {/* Navigation section label */}
        {expanded && (
          <div className="px-6 mb-2">
            <span className="text-xs font-medium text-emerald-300 uppercase tracking-wider">
              Navigation
            </span>
          </div>
        )}

        {/* Primary navigation items */}
        <div className="flex flex-col px-3 gap-1 mb-6">
          {primaryNavItems.slice(0, 4).map((item) => (
            <SidebarLink
              key={item.path}
              icon={item.icon}
              label={item.label}
              to={item.path}
              active={isActive(item.path)}
              expanded={expanded}
              badge={item.badge}
            />
          ))}
        </div>

        {/* Resources section label */}
        {userRole === "admin" && expanded && (
          <div className="px-6 mb-2 mt-2">
            <span className="text-xs font-medium text-emerald-300 uppercase tracking-wider">
              Resources
            </span>
          </div>
        )}

        {/* Additional navigation items (Admin) */}
        {userRole === "admin" && (
          <div className="flex flex-col px-3 gap-1">
            <SidebarLink
              icon={<TbChartLine size={22} />}
              label="Admin"
              to="/admin"
              active={isActive("/admin")}
              expanded={expanded}
            />
          </div>
        )}

        {/* Settings and logout at bottom */}
        <div className="mt-auto px-3">
          <div className="border-t border-emerald-700/50 pt-4 mb-2"></div>
          <SidebarLink
            icon={<TbSettings size={22} />}
            label="Settings"
            to="/settings"
            active={isActive("/settings")}
            expanded={expanded}
          />
          <button
            onClick={confirmLogout}
            className={`flex items-center ${expanded ? 'justify-start px-3' : 'justify-center'} h-12 my-1 rounded-lg w-full
                      transition-all duration-200 relative group/item text-emerald-200 hover:bg-red-500/20 hover:text-red-200`}
          >
            <div className="flex-shrink-0">
              <TbLogout size={22} />
            </div>
            {expanded ? (
              <span className="ml-3 text-sm whitespace-nowrap overflow-hidden transition-opacity">
                Logout
              </span>
            ) : (
              <span className="absolute left-full ml-3 px-2 py-1 rounded bg-gray-900 text-xs 
                             text-white whitespace-nowrap opacity-0 group-hover/item:opacity-100 transition-opacity
                             pointer-events-none">
                Logout
              </span>
            )}
          </button>
        </div>

        {/* Collapse toggle button */}
        <button
          className="absolute -right-3 top-12 bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-full p-1.5 text-white shadow-lg 
                    hover:from-emerald-600 hover:to-emerald-700 transition-colors"
          onClick={() => setExpanded(!expanded)}
          style={{ transform: "scale(0.8)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
               fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-around items-center h-16 z-20">
        {bottomNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className="flex flex-col items-center justify-center w-16 py-1 relative"
          >
            <div className={`p-1.5 rounded-full ${isActive(item.path) ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500'}`}>
              {item.icon}
            </div>
            <span className={`text-xs mt-1 ${isActive(item.path) ? 'text-emerald-700 font-medium' : 'text-gray-500'}`}>
              {item.label.split(' ')[0]}
            </span>
            {item.badge && (
              <div className="absolute -top-1 right-1 bg-red-500 text-white 
                          text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {item.badge}
              </div>
            )}
          </Link>
        ))}
        <button
          onClick={() => setMoreMenuOpen(true)}
          className="flex flex-col items-center justify-center w-16 py-1"
        >
          <div className="p-1.5 rounded-full text-gray-500">
            <TbGridDots size={22} />
          </div>
          <span className="text-xs mt-1 text-gray-500">
            More
          </span>
        </button>
      </div>

      {/* MOBILE MORE MENU OVERLAY */}
      {moreMenuOpen && (
        <div className="md:hidden fixed inset-0 bg-black/50 z-30" onClick={() => setMoreMenuOpen(false)}>
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-xl py-4 px-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center px-4 mb-4">
              <div className="flex items-center">
                <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center mr-3">
                  <TbRoute size={18} className="text-white" />
                </div>
                <span className="font-bold text-lg">OptiGo</span>
              </div>
              <button
                onClick={() => setMoreMenuOpen(false)}
                className="p-1 rounded-full bg-gray-100"
              >
                <TbX size={20} />
              </button>
            </div>

            <div className="border-t border-gray-100 mb-2 mt-1"></div>

            {/* All menu items in a grid */}
            <div className="grid grid-cols-4 gap-4 px-4">
              {primaryNavItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreMenuOpen(false)}
                  className="flex flex-col items-center justify-center py-3 relative"
                >
                  <div className={`p-3 rounded-xl mb-2 ${isActive(item.path) ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                    {item.icon}
                  </div>
                  <span className={`text-xs text-center ${isActive(item.path) ? 'text-emerald-700 font-medium' : 'text-gray-600'}`}>
                    {item.label}
                  </span>
                  {item.badge && (
                    <div className="absolute top-0 right-0 bg-red-500 text-white 
                                text-xs rounded-full h-5 w-5 flex items-center justify-center">
                      {item.badge}
                    </div>
                  )}
                </Link>
              ))}

              {/* Settings link */}
              <Link
                to="/settings"
                onClick={() => setMoreMenuOpen(false)}
                className="flex flex-col items-center justify-center py-3 relative"
              >
                <div className={`p-3 rounded-xl mb-2 ${isActive("/settings") ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
                  <TbSettings size={22} />
                </div>
                <span className={`text-xs text-center ${isActive("/settings") ? 'text-emerald-700 font-medium' : 'text-gray-600'}`}>
                  Settings
                </span>
              </Link>
            </div>

            {/* Logout button */}
            <div className="border-t border-gray-100 mt-4 mb-2"></div>
            <div className="flex justify-center px-6 py-3">
              <button
                onClick={confirmLogout}
                className="flex items-center justify-center gap-2 px-6 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors w-full"
              >
                <TbLogout size={18} />
                <span className="font-medium">Logout</span>
              </button>
            </div>
            <div className="h-16"></div>
          </div>
        </div>
      )}

      {/* LOGOUT CONFIRMATION DIALOG */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-center justify-center px-4" onClick={() => setShowLogoutConfirm(false)}>
          <div
            className="bg-white rounded-lg shadow-xl max-w-sm w-full p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center text-amber-500 mb-4">
              <TbAlertTriangle size={24} />
              <h3 className="text-lg font-semibold ml-2 text-gray-800">Confirm Logout</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to logout from OptiGo? Any unsaved changes may be lost.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function SidebarLink({ icon, label, to, active, expanded, badge }) {
  return (
    <Link
      to={to}
      className={`flex items-center ${expanded ? 'justify-start px-3' : 'justify-center'} h-12 my-1 rounded-lg
                transition-all duration-200 relative group/item
                ${active
          ? 'text-white bg-gradient-to-r from-emerald-600 to-emerald-700 shadow-md'
          : 'text-emerald-200 hover:bg-emerald-700/40'}`}
    >
      <div className="flex-shrink-0">
        {icon}
      </div>
      {expanded ? (
        <span className="ml-3 text-sm whitespace-nowrap overflow-hidden transition-opacity">
          {label}
        </span>
      ) : (
        <span className="absolute left-full ml-3 px-2 py-1 rounded bg-gray-900 text-xs 
                       text-white whitespace-nowrap opacity-0 group-hover/item:opacity-100 transition-opacity
                       pointer-events-none z-50">
          {label}
        </span>
      )}
      {badge && (
        <div className={`${expanded ? 'ml-auto' : 'absolute -top-1 -right-1'} bg-red-500 text-white 
                       text-xs rounded-full h-5 w-5 flex items-center justify-center shadow-sm`}>
          {badge}
        </div>
      )}
      {active && (
        <>
          <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-1.5 h-8 bg-white rounded-l-md"></div>
          {expanded && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-emerald-400 rounded-r-md"></div>}
        </>
      )}
    </Link>
  );
}
