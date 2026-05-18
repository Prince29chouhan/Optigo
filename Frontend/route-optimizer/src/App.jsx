import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import RoutePlanner from "./pages/RoutePlanner";
import LiveTracking from "./pages/LiveTracking";
import Emissions from "./pages/Emissions";
import Settings from "./pages/Settings";
import AdminDashboard from "./pages/AdminPage";
import Depots from "./pages/Depots";
import ProtectedRoute from "./components/ProtectedRoute";
import { Toaster } from "react-hot-toast";

function App() {
  return (
    <Router>
      <Toaster position="top-center" reverseOrder={false} />
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route
          path="/plan"
          element={
            <ProtectedRoute>
              <RoutePlanner />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tracking"
          element={
            <ProtectedRoute>
              <LiveTracking />
            </ProtectedRoute>
          }
        />
        <Route
          path="/emissions"
          element={
            <ProtectedRoute>
              <Emissions />
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Settings />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/depots"
          element={
            <ProtectedRoute>
              <Depots />
            </ProtectedRoute>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
