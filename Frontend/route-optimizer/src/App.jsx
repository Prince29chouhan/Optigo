import { BrowserRouter as Router, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import LoginPage from "./pages/LoginPage";
import RoutePlanner from "./pages/RoutePlanner";
import LiveTracking from "./pages/LiveTracking";
import Emissions from "./pages/Emissions";
import Settings from "./pages/Settings";
import AdminDashboard from "./pages/AdminPage";
import Depots from "./pages/Depots";
import Orders from "./pages/Orders";
import Vehicles from "./pages/Vehicles";
import Reports from "./pages/Reports";
import ProtectedRoute from "./components/ProtectedRoute";
import { SettingsProvider } from "./context/SettingsContext";

const protectedRoutes = [
  { path: "/plan", element: <RoutePlanner /> },
  { path: "/orders", element: <Orders /> },
  { path: "/vehicles", element: <Vehicles /> },
  { path: "/depots", element: <Depots /> },
  { path: "/tracking", element: <LiveTracking /> },
  { path: "/reports", element: <Reports /> },
  { path: "/emissions", element: <Emissions /> },
  { path: "/settings", element: <Settings /> },
  { path: "/admin", element: <AdminDashboard />, roles: ["admin"] },
];

function App() {
  return (
    <Router>
      <SettingsProvider>
        <Toaster position="top-center" reverseOrder={false} />
        <Routes>
          <Route path="/" element={<LoginPage />} />
          {protectedRoutes.map(({ path, element, roles }) => (
            <Route
              key={path}
              path={path}
              element={<ProtectedRoute roles={roles}>{element}</ProtectedRoute>}
            />
          ))}
          <Route path="*" element={<Navigate to="/plan" replace />} />
        </Routes>
      </SettingsProvider>
    </Router>
  );
}

export default App;
