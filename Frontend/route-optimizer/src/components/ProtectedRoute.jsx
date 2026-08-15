import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/**
 * Gate for authenticated pages. Also enforces role requirements so a driver
 * cannot open an admin-only screen by typing the URL.
 */
const ProtectedRoute = ({ children, roles }) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/plan" replace />;
  }
  return children;
};

export default ProtectedRoute;
