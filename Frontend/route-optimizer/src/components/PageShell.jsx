import { useNavigate } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import { useAuth } from "../context/AuthContext";
import Logo from "../assets/logo.png";

/** Standard page frame: topbar with stats, sidebar, scrollable content area. */
export default function PageShell({ title, subtitle, stats = [], actions, children }) {
  const navigate = useNavigate();
  const { user } = useAuth();

  const initials =
    (user?.fullName || "")
      .split(" ")
      .map((part) => part[0])
      .filter(Boolean)
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";

  return (
    <div className="flex flex-col h-screen font-sans bg-gradient-to-br from-emerald-100 via-emerald-50 to-white">
      <Topbar
        logoSrc={Logo}
        appName="OptiGo"
        stats={stats}
        showLiveIndicator={false}
        userInitials={initials}
        onHomeClick={() => navigate("/plan")}
        onMapClick={() => navigate("/tracking")}
        onProfileClick={() => navigate("/settings")}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-8">
          <div className="max-w-7xl mx-auto px-5 md:px-8 pt-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-emerald-900">{title}</h1>
                {subtitle && <p className="text-sm text-gray-600 mt-1">{subtitle}</p>}
              </div>
              {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
