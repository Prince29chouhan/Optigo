// RoutePlanner.jsx - Enhanced design with Tailwind v4 and imported Topbar
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  FaSave,
  FaPaperPlane,
  FaFilePdf,
  FaRoute,
  FaLeaf,
  FaGasPump,
  FaClock,
  FaCoins,
  FaChevronUp,
  FaMapMarkedAlt,
  FaRoad
} from "react-icons/fa";
import { TbTruckDelivery, TbChartLine, TbRoad, TbMapPin, TbHome, TbMap } from "react-icons/tb";
import Topbar from "../components/Topbar";
import Sidebar from "../components/Sidebar";
import RouteForm from "../components/RouteForm";
import LeafletMap from "../components/LeafletMap";
import Logo from "../assets/logo.png";

function fmtTime(minutes) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} m` : `${m} m`;
}

export default function RoutePlanner() {
  const [routeResult, setRouteResult] = useState(null);
  const [mobileFormOpen, setMobileFormOpen] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentTab, setCurrentTab] = useState('planner');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setTimeout(() => setMapLoaded(true), 800);
    return () => clearTimeout(timer);
  }, []);

  // Derive real user initials from localStorage
  const fullName = localStorage.getItem('fullName') || '';
  const userInitials = fullName
    .split(' ')
    .map(n => n[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  // Topbar stats — populated from GNN API response when available
  const km   = routeResult?.total_distance_km  ?? null;
  const fuel = routeResult?.estimated_fuel_l   ?? null;
  const co2  = routeResult?.co2_kg             ?? null;
  const cost = routeResult?.estimated_cost_gbp ?? null;
  const time = fmtTime(routeResult?.estimated_time_min);

  const routeStats = [
    {
      icon: <TbRoad className="text-emerald-600" size={18} />,
      label: "Distance",
      value: km != null ? `${km} km` : "—"
    },
    {
      icon: <FaClock className="text-amber-500" size={18} />,
      label: "Drive Time",
      value: time
    },
    {
      icon: <FaGasPump className="text-blue-500" size={18} />,
      label: "Fuel",
      value: fuel != null ? `${fuel} L` : "—"
    },
    {
      icon: <FaLeaf className="text-green-600" size={18} />,
      label: "CO₂",
      value: co2 != null ? `${co2} kg` : "—"
    },
    {
      icon: <FaCoins className="text-amber-600" size={18} />,
      label: "Est. Cost",
      value: cost != null ? `£${cost}` : "—"
    }
  ];

  return (
    /* 🌿 Page wrapper with enhanced green gradient background */
    <div className="flex flex-col h-screen font-sans select-none
                    bg-gradient-to-br from-emerald-100 via-emerald-50 to-white
                    [background-image:radial-gradient(circle_at_15%_15%,rgba(16,185,129,.25)_0%,transparent_55%),
                                     radial-gradient(circle_at_85%_75%,rgba(5,150,105,.2)_0%,transparent_45%)]">

      {/* Use the new Topbar component */}
      <Topbar
        logoSrc={Logo}
        appName="OptiGo"
        stats={routeStats}
        showLiveIndicator={true}
        userInitials={userInitials}
        isDarkMode={isDarkMode}
        onDarkModeToggle={() => setIsDarkMode(!isDarkMode)}
        onHomeClick={() => navigate('/plan')}
        onMapClick={() => navigate('/tracking')}
        onProfileClick={() => navigate('/settings')}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Import the Sidebar as a separate component */}
        <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

        {/* ── Main content area ── */}
        <div className="flex flex-1 flex-col md:flex-row overflow-hidden relative">
          
          {/* ── Plan Form (desktop) ── */}
          <aside className="hidden md:block w-[380px] bg-emerald-50
                          overflow-y-auto border-emerald-100 z-10">
            <RouteForm onResult={result => {
              setRouteResult(result);
              if (result) localStorage.setItem('lastRoute', JSON.stringify(result));
              if (window.innerWidth < 768) setMobileFormOpen(false);
            }} />
          </aside>

          {/* ── Main map container ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Map area */}
            <div className={`relative flex-1 transition-opacity duration-1000 
                          ${mapLoaded ? 'opacity-100' : 'opacity-0'}`}>
              <LeafletMap route={routeResult?.route || []} />
              
              {/* 📍 Route waypoints overlay */}
              {routeResult && routeResult.route?.length > 0 && (
                <div className="absolute top-6 right-10 z-20 bg-emerald-50/90 backdrop-blur-sm
                               rounded-lg shadow-lg p-3 max-w-[240px] border border-emerald-200">
                  <h4 className="font-medium text-sm text-emerald-800 mb-2 flex items-center gap-2">
                    <FaRoute className="text-emerald-600" /> Route Waypoints
                  </h4>
                  <div className="text-xs font-medium text-gray-600 space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                      <span>From: {routeResult.route[0].depot}</span>
                    </div>
                    {routeResult.route.length > 2 && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <div className="w-3 h-3 rounded-full bg-blue-400"></div>
                        <span>{routeResult.route.length - 2} intermediate stop{routeResult.route.length > 3 ? 's' : ''}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500"></div>
                      <span>To: {routeResult.route[routeResult.route.length - 1].depot}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Enhanced Empty state with better positioning */}
              {!routeResult && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center p-8 bg-white/80 backdrop-blur-sm rounded-2xl 
                                shadow-lg border border-emerald-200 max-w-sm mx-4">
                    <div className="flex flex-col items-center space-y-4">
                      {/* Animated icon */}
                      <div className="relative">
                        <TbMap size={64} className="text-emerald-400 animate-pulse" />
                        <div className="absolute -top-2 -right-2">
                          <FaRoute size={24} className="text-emerald-600" />
                        </div>
                      </div>
                      
                      {/* Message */}
                      <div className="space-y-2">
                        <h3 className="text-lg font-bold text-emerald-800">
                          Ready to Plan Your Route?
                        </h3>
                        <p className="text-sm text-emerald-600 leading-relaxed">
                          Get started by adding your pickup and delivery locations. 
                          We'll optimize the best route for you!
                        </p>
                      </div>
                      
                      {/* CTA for mobile */}
                      <button
                        onClick={() => setMobileFormOpen(true)}
                        className="md:hidden bg-emerald-600 text-white px-6 py-3 rounded-full 
                                 font-medium text-sm shadow-lg hover:bg-emerald-700 
                                 transition-all flex items-center gap-2"
                      >
                        <FaRoute size={16} />
                        Plan Route Now
                      </button>
                      
                      {/* Instructions for desktop */}
                      <div className="hidden md:block text-xs text-emerald-500 
                                    bg-emerald-50 px-3 py-2 rounded-lg">
                        👈 Use the form on the left to get started
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Live status bar */}
            <div className="flex justify-between bg-emerald-50/80 backdrop-blur-md
                          h-12 items-center px-6 border-t border-emerald-100">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                  <span className="text-xs font-medium text-gray-600">Live Tracking</span>
                </div>
                <div className="text-xs text-gray-500">Last updated: Just now</div>
              </div>
              <div className="text-xs font-medium text-gray-600">
                {routeResult ? '1 route active' : 'No active routes'}
              </div>
            </div>
          </div>

          {/* ── Route Summary (desktop) ── */}
          {routeResult && (
            <aside className="hidden md:block w-[380px] bg-emerald-50/50 p-8 
                             overflow-y-auto border-l border-emerald-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-emerald-600 text-white">
                  <TbChartLine size={20} />
                </div>
                <h3 className="text-xl font-bold text-gray-800">Route Details</h3>
              </div>
              
              {/* Route type badge */}
              <div className="mb-6">
                {{
                  greenest: <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-200 text-emerald-800 text-xs font-medium"><FaLeaf /> Eco-Friendly Route</span>,
                  fastest:  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-200 text-blue-800 text-xs font-medium"><FaClock size={12}/> Fastest Route</span>,
                  cheapest: <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200 text-amber-800 text-xs font-medium"><FaCoins size={12}/> Cheapest Route</span>,
                }[routeResult?.preference] ?? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-200 text-emerald-800 text-xs font-medium"><FaLeaf /> Optimised Route</span>
                )}
              </div>

              <SummaryList km={km} time={time} fuel={fuel} co2={co2} cost={cost} />

              {/* Route timeline */}
              <div className="my-8">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Estimated Timeline</h4>
                <TimeLine routeResult={routeResult} />
              </div>
              
              <ActionButtons />
            </aside>
          )}

          {/* 📱 Mobile floating controls - Positioned higher and with better spacing */}
          <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30 md:hidden flex gap-3">
            <ActionFab onClick={() => setMobileFormOpen(true)} icon={<FaRoute />} text="Plan" />
            {routeResult && (
              <ActionFab onClick={() => setMobileSummaryOpen(true)} icon={<TbChartLine />} text="Summary" />
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile slide-up drawers ── */}
      {mobileFormOpen && (
        <MobileDrawer title="Plan Your Route" onClose={() => setMobileFormOpen(false)}>
          <RouteForm onResult={result => {
            setRouteResult(result);
            if (result) localStorage.setItem('lastRoute', JSON.stringify(result));
            setMobileFormOpen(false);
          }} />
        </MobileDrawer>
      )}
      
      {mobileSummaryOpen && routeResult && (
        <MobileDrawer title="Route Summary" onClose={() => setMobileSummaryOpen(false)}>
          <div className="mb-4">
            {{
              greenest: <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-200 text-emerald-800 text-xs font-medium"><FaLeaf /> Eco-Friendly Route</span>,
              fastest:  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-200 text-blue-800 text-xs font-medium"><FaClock size={12}/> Fastest Route</span>,
              cheapest: <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-200 text-amber-800 text-xs font-medium"><FaCoins size={12}/> Cheapest Route</span>,
            }[routeResult?.preference] ?? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-200 text-emerald-800 text-xs font-medium"><FaLeaf /> Optimised Route</span>
            )}
          </div>
          <SummaryList km={km} time={time} fuel={fuel} co2={co2} cost={cost} />
          <div className="my-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Timeline</h4>
            <TimeLine routeResult={routeResult} />
          </div>
          <div className="space-y-3 mt-6">
            <PrimaryBtn icon={<FaSave />} text="Save Route" primary={true} />
            <PrimaryBtn icon={<FaPaperPlane />} text="Send to Driver" />
          </div>
        </MobileDrawer>
      )}
    </div>
  );
}

/* —————————————————————————————————————————— */
/* Enhanced presentational components */
function StatCard({ icon, label, value }) {
  return (
    <div className="bg-white/80 rounded-lg px-3 py-2 shadow-sm 
                   flex flex-col border border-emerald-100 transition-all duration-300
                   hover:shadow-md hover:translate-y-[-1px]">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-medium text-emerald-700">{label}</span>
        {icon}
      </div>
      <span className="text-sm font-bold text-emerald-900">{value}</span>
    </div>
  );
}

/* Compact stat component (not used in this version) */
function CompactStat({ icon, label, value }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <div className="flex flex-col">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-sm font-bold text-gray-800">{value}</span>
      </div>
    </div>
  );
}

function ActionFab({ onClick, icon, text }) {
  return (
    <button
      onClick={onClick}
      className="bg-emerald-600 text-white px-5 py-3 rounded-full shadow-lg
               active:scale-95 transition-all flex items-center gap-2
               hover:bg-emerald-700 border border-emerald-500"
    >
      {icon} <span className="font-medium">{text}</span>
    </button>
  );
}

function SummaryList({ km, time, fuel, co2, cost }) {
  return (
    <div className="space-y-4 text-gray-800">
      <SummaryItem icon={<TbRoad className="text-emerald-600" />}   label="Distance"      value={km   != null ? `${km} km`  : "—"} />
      <SummaryItem icon={<FaClock className="text-amber-500" />}    label="Drive Time"    value={time} />
      <SummaryItem icon={<FaGasPump className="text-blue-500" />}   label="Fuel Estimate" value={fuel != null ? `${fuel} L` : "—"} />
      <SummaryItem icon={<FaLeaf className="text-green-600" />}     label="CO₂ Emissions" value={co2  != null ? `${co2} kg` : "—"} />
      <SummaryItem icon={<FaCoins className="text-amber-600" />}    label="Est. Cost"     value={cost != null ? `£${cost}`  : "—"} />
    </div>
  );
}

function SummaryItem({ icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-emerald-100">
      <div className="flex items-center gap-3">
        {icon}
        <span className="font-medium text-emerald-800">{label}</span>
      </div>
      <span className="font-semibold text-emerald-900">{value}</span>
    </div>
  );
}

function ActionButtons() {
  return (
    <div className="space-y-3">
      <PrimaryBtn icon={<FaSave />} text="Save Route" primary={true} />
      <PrimaryBtn icon={<FaPaperPlane />} text="Send to Driver" />
      <PrimaryBtn icon={<FaFilePdf />} text="Export PDF" />
    </div>
  );
}

function PrimaryBtn({ icon, text, primary = false }) {
  return (
    <button className={`w-full py-3 rounded-lg flex items-center justify-center gap-2
                      ${primary
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-emerald-100 text-emerald-800 hover:bg-emerald-200"}
                      transition-all duration-200 shadow-sm hover:shadow font-medium`}>
      {icon} {text}
    </button>
  );
}

function MobileDrawer({ title, onClose, children }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-emerald-50 rounded-t-3xl p-6 shadow-2xl
                   max-h-[90vh] overflow-y-auto z-50 animate-slideUp">
      <div className="flex flex-col items-center mb-6">
        <div className="w-12 h-1 bg-emerald-200 rounded-full mb-4"></div>
        <div className="flex justify-between items-center w-full">
          <h2 className="text-lg font-bold text-emerald-800">{title}</h2>
          <button onClick={onClose} className="text-emerald-600 p-2">
            <FaChevronUp />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function TimeLine({ routeResult }) {
  if (!routeResult?.route?.length) return null;

  const depots = routeResult.route;
  const totalMin = routeResult.estimated_time_min || 0;
  const segMin = depots.length > 1 ? Math.round(totalMin / (depots.length - 1)) : 0;

  const startHour = 9; // assume 09:00 departure
  const items = depots.map((stop, i) => {
    const minutesIn = i * segMin;
    const d = new Date(2000, 0, 1, startHour, minutesIn);
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const label = i === 0
      ? `Departure from ${stop.depot}`
      : i === depots.length - 1
        ? `Arrival at ${stop.depot}`
        : `Via ${stop.depot}`;
    return { time: timeStr, text: label, active: i === 1 && depots.length > 2 };
  });

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:top-2 before:bottom-2
                   before:left-2 before:w-0.5 before:bg-emerald-300">
      {items.map((item, i) => (
        <TimeLineItem key={i} time={item.time} text={item.text} active={item.active} />
      ))}
    </div>
  );
}

function TimeLineItem({ time, text, active = false }) {
  return (
    <div className="relative">
      <div className={`absolute -left-9 top-0 w-4 h-4 rounded-full 
                     ${active ? 'bg-emerald-500 ring-4 ring-emerald-200' : 'bg-emerald-300'}`}></div>
      <div className="flex flex-col">
        <span className={`text-xs ${active ? 'font-bold text-emerald-600' : 'font-medium text-emerald-600'}`}>
          {time}
        </span>
        <span className={`text-sm ${active ? 'font-medium' : 'font-normal'} text-emerald-800`}>
          {text}
        </span>
      </div>
    </div>
  );
}

// Add to your CSS (for animations)
/*
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.animate-slideUp {
  animation: slideUp 0.3s ease-out forwards;
}
*/