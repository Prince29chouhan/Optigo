import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isTokenExpired, setUnauthorizedHandler } from "../lib/api";

const AuthContext = createContext(null);

const AUTH_KEYS = ["token", "userRole", "fullName", "email", "companyName", "userId"];

const clearAuthStorage = () => {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem("session_only");
  sessionStorage.removeItem("session_active");
};

const readLocalUser = () => {
  const token = localStorage.getItem("token");
  if (!token) return null;

  // An expired JWT is the same as being signed out — without this check every
  // request 401s and the UI shows errors instead of the login screen.
  if (isTokenExpired(token)) {
    clearAuthStorage();
    return null;
  }

  // "Remember me" off: sessionStorage holds a flag the browser clears on close.
  const sessionOnly = localStorage.getItem("session_only") === "1";
  if (sessionOnly && !sessionStorage.getItem("session_active")) {
    clearAuthStorage();
    return null;
  }

  return {
    token,
    id: localStorage.getItem("userId") || "",
    role: localStorage.getItem("userRole") || "driver",
    fullName: localStorage.getItem("fullName") || "",
    email: localStorage.getItem("email") || "",
    companyName: localStorage.getItem("companyName") || "",
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readLocalUser);

  const logout = useCallback(() => {
    clearAuthStorage();
    localStorage.removeItem("lastPlan");
    setUser(null);
  }, []);

  const refreshUser = useCallback(() => setUser(readLocalUser()), []);

  // A 401 from any endpoint (expired or revoked token) signs the user out.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearAuthStorage();
      setUser(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  // Keep tabs in sync: signing out in one tab signs out the others.
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === "token") refreshUser();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshUser]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      canManage: user?.role === "admin" || user?.role === "planner",
      logout,
      refreshUser,
      setUser,
    }),
    [user, logout, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    // Defensive: components must not crash if rendered outside the provider.
    return {
      user: null,
      isAuthenticated: false,
      isAdmin: false,
      canManage: false,
      logout: () => {},
      refreshUser: () => {},
      setUser: () => {},
    };
  }
  return context;
};
