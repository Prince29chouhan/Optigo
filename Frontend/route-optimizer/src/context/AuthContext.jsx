import { createContext, useContext, useState } from "react";

const AuthContext = createContext();

const AUTH_KEYS = ["token", "userRole", "fullName", "email", "companyName"];

const readLocalUser = () => {
  const token = localStorage.getItem("token");
  if (!token) return null;

  // If the user logged in without "Remember Me", a session_active flag is kept
  // in sessionStorage (which the browser clears on close). If the flag is gone
  // but the token is still in localStorage it means the browser was closed —
  // treat that as a logged-out session.
  const isSessionOnly = localStorage.getItem("session_only") === "1";
  if (isSessionOnly && !sessionStorage.getItem("session_active")) {
    AUTH_KEYS.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem("session_only");
    return null;
  }

  return {
    token,
    role:        localStorage.getItem("userRole")    || "driver",
    fullName:    localStorage.getItem("fullName")    || "",
    email:       localStorage.getItem("email")       || "",
    companyName: localStorage.getItem("companyName") || "",
  };
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readLocalUser);

  const logout = () => {
    AUTH_KEYS.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem("session_only");
    sessionStorage.removeItem("session_active");
    setUser(null);
  };

  // Called after a successful fetch('/login') response that already stored to localStorage
  const refreshUser = () => setUser(readLocalUser());

  return (
    <AuthContext.Provider value={{ user, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
