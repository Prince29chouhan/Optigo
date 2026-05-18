import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
import {
  Mail, Lock, User, Eye, EyeOff, Building, Shield, Truck, Package,
  Route, MapPin, Clock, Globe, Leaf, Recycle
} from "lucide-react";

const API_URL = import.meta.env.VITE_API_BASE || "http://localhost:5000";

const LoginPage = () => {
  const [email, setEmail] = useState(() => localStorage.getItem("rememberedEmail") || "");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [userType, setUserType] = useState("driver");
  const [tab, setTab] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem("rememberedEmail"));

  const navigate = useNavigate();
  const { refreshUser } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (tab === "login") {
        // LOGIN
        const res = await fetch(`${API_URL}/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (res.ok && data.token) {
          localStorage.setItem("token", data.token);
          localStorage.setItem("userRole", data.role);
          localStorage.setItem("fullName", data.fullName || "");
          localStorage.setItem("companyName", data.companyName || "");
          localStorage.setItem("email", data.email || "");
          if (rememberMe) {
            // Persistent login — stays logged in after browser close
            localStorage.setItem("rememberedEmail", email);
            localStorage.removeItem("session_only");
            sessionStorage.removeItem("session_active");
          } else {
            // Session-only login — closing the browser logs the user out
            localStorage.removeItem("rememberedEmail");
            localStorage.setItem("session_only", "1");
            sessionStorage.setItem("session_active", "1");
          }
          refreshUser();
          toast.success("Login successful! Redirecting...");
          setTimeout(() => navigate("/plan"), 1200);
        } else {
          toast.error(data.message || "Login failed.");
        }
      } else {
        // SIGNUP
        const res = await fetch(`${API_URL}/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            fullName,
            companyName,
            userType,
          }),
        });
        const data = await res.json();
        if (res.ok) {
          toast.success("Signup successful! Please login.");
          setTab("login");
        } else {
          toast.error(data.message || "Signup failed.");
        }
      }
    } catch {
      toast.error("Server error. Please try again later.");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-900 via-green-900 to-teal-900 px-4 py-8 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-10 left-1/4 w-2 h-2 bg-green-400/40 rounded-full animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }}></div>
        <div className="absolute top-1/3 right-1/4 w-1 h-1 bg-emerald-400/60 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-1/4 left-1/3 w-3 h-3 bg-teal-400/30 rounded-full animate-bounce" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-20 left-0 text-green-400/20 animate-pulse"><Truck className="w-6 h-6 md:w-8 md:h-8 transform rotate-12" /></div>
        <div className="absolute top-32 right-0 text-emerald-400/20 animate-bounce" style={{ animationDelay: '1s' }}><Truck className="w-4 h-4 md:w-6 md:h-6 transform -rotate-12" /></div>
        <div className="absolute bottom-40 left-10 text-teal-400/20 animate-pulse" style={{ animationDelay: '2s' }}><Package className="w-5 h-5 md:w-7 md:h-7" /></div>
        <div className="absolute top-1/4 left-1/4 w-16 md:w-32 h-0.5 bg-gradient-to-r from-transparent via-green-400/40 to-transparent animate-pulse shadow-lg shadow-green-400/20"></div>
        <div className="absolute top-1/2 right-1/4 w-12 md:w-24 h-0.5 bg-gradient-to-r from-transparent via-emerald-400/40 to-transparent animate-pulse shadow-lg shadow-emerald-400/20" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-1/3 left-1/3 w-20 md:w-40 h-0.5 bg-gradient-to-r from-transparent via-teal-400/40 to-transparent animate-pulse shadow-lg shadow-teal-400/20" style={{ animationDelay: '1.5s' }}></div>
        <div className="absolute top-16 right-20 text-green-400/40 animate-bounce" style={{ animationDelay: '0.5s' }}><MapPin className="w-4 h-4 md:w-5 md:h-5 drop-shadow-lg" /></div>
        <div className="absolute bottom-20 right-32 text-emerald-400/40 animate-pulse" style={{ animationDelay: '2.5s' }}><MapPin className="w-3 h-3 md:w-4 md:h-4 drop-shadow-lg" /></div>
        <div className="absolute top-1/3 left-16 text-teal-400/40 animate-bounce" style={{ animationDelay: '1.2s' }}><MapPin className="w-4 h-4 md:w-6 md:h-6 drop-shadow-lg" /></div>
        <div className="absolute top-1/4 right-1/3 text-green-400/30 animate-spin" style={{ animationDuration: '8s' }}><Leaf className="w-4 h-4 md:w-5 md:h-5" /></div>
        <div className="absolute bottom-1/4 left-1/4 text-emerald-400/30 animate-pulse" style={{ animationDelay: '0.8s' }}><Recycle className="w-3 h-3 md:w-4 md:h-4" /></div>
        <div className="absolute top-3/4 right-1/4 text-teal-400/30 animate-bounce" style={{ animationDelay: '1.8s' }}><Globe className="w-4 h-4 md:w-5 md:h-5" /></div>
      </div>

      {/* Main Container */}
      <div className="flex flex-col lg:flex-row w-full max-w-6xl min-h-[600px] lg:h-[90vh] rounded-2xl lg:rounded-3xl shadow-2xl overflow-hidden bg-white/10 backdrop-blur-xl border border-white/20 relative z-10 transform hover:scale-[1.01] transition-all duration-700 hover:shadow-green-500/20">
        {/* Left Panel */}
        <div className="w-full lg:w-1/2 bg-gradient-to-br from-green-600 via-emerald-600 to-teal-600 text-white flex items-center justify-center p-6 lg:p-8 relative overflow-hidden min-h-[200px] lg:min-h-full">
          <div className="text-center relative z-10 w-full">
            {/* Logo */}
            <div className="mb-4 lg:mb-8 relative">
              <div className="relative w-20 h-20 lg:w-32 lg:h-32 mx-auto">
                <div className="absolute inset-0 bg-white/30 rounded-full animate-ping shadow-2xl shadow-white/20" style={{ animationDuration: '3s' }}></div>
                <div className="absolute inset-1 lg:inset-2 bg-white/20 rounded-full animate-pulse shadow-xl shadow-white/10" style={{ animationDelay: '0.5s' }}></div>
                <div className="relative z-10 w-18 h-18 lg:w-28 lg:h-28 bg-white/95 rounded-full flex items-center justify-center mx-auto shadow-2xl backdrop-blur-sm border border-white/30 hover:scale-110 transition-all duration-500">
                  <img src="logo.png" alt="OptiGo Logo" className="w-16 h-16 lg:w-24 lg:h-24 object-contain" />
                </div>
              </div>
            </div>
            <h1 className="text-2xl lg:text-4xl font-bold mb-2 lg:mb-4 bg-gradient-to-r from-white via-green-100 to-emerald-100 bg-clip-text text-transparent drop-shadow-lg">
              OptiGo
            </h1>
            <p className="text-green-50 mb-4 lg:mb-8 text-sm lg:text-base leading-relaxed font-medium drop-shadow-sm">
              Sustainable logistics, optimized for tomorrow
            </p>
            <div className="flex justify-center space-x-4 lg:space-x-8 text-green-100">
              <div className="text-center group cursor-pointer">
                <div className="w-10 h-10 lg:w-14 lg:h-14 bg-white/20 rounded-full flex items-center justify-center mb-1 lg:mb-2 mx-auto group-hover:bg-white/30 transition-all duration-500 group-hover:scale-125 animate-bounce backdrop-blur-sm border border-white/10 shadow-xl shadow-white/10" style={{ animationDelay: '0.2s' }}>
                  <Route className="w-4 h-4 lg:w-6 lg:h-6 drop-shadow-lg" />
                </div>
                <p className="text-xs lg:text-sm font-semibold drop-shadow-sm">Smart Routes</p>
              </div>
              <div className="text-center group cursor-pointer">
                <div className="w-10 h-10 lg:w-14 lg:h-14 bg-white/20 rounded-full flex items-center justify-center mb-1 lg:mb-2 mx-auto group-hover:bg-white/30 transition-all duration-500 group-hover:scale-125 animate-bounce backdrop-blur-sm border border-white/10 shadow-xl shadow-white/10" style={{ animationDelay: '0.4s' }}>
                  <Clock className="w-4 h-4 lg:w-6 lg:h-6 drop-shadow-lg" />
                </div>
                <p className="text-xs lg:text-sm font-semibold drop-shadow-sm">Real-time</p>
              </div>
              <div className="text-center group cursor-pointer">
                <div className="w-10 h-10 lg:w-14 lg:h-14 bg-white/20 rounded-full flex items-center justify-center mb-1 lg:mb-2 mx-auto group-hover:bg-white/30 transition-all duration-500 group-hover:scale-125 animate-bounce backdrop-blur-sm border border-white/10 shadow-xl shadow-white/10" style={{ animationDelay: '0.6s' }}>
                  <Leaf className="w-4 h-4 lg:w-6 lg:h-6 drop-shadow-lg" />
                </div>
                <p className="text-xs lg:text-sm font-semibold drop-shadow-sm">Eco-Friendly</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel (Form) */}
        <div className="w-full lg:w-1/2 p-6 lg:p-8 flex flex-col justify-center bg-white/95 backdrop-blur-sm relative">
          <div className="mb-4 lg:mb-6 text-center">
            <h2 className="text-2xl lg:text-3xl font-bold text-gray-800 mb-2 bg-gradient-to-r from-green-600 to-emerald-600 bg-clip-text text-transparent">
              {tab === "login" ? "Welcome Back!" : "Join OptiGo"}
            </h2>
            <p className="text-gray-600 text-sm lg:text-base font-medium">
              {tab === "login"
                ? "Continue your sustainable logistics journey"
                : "Start your journey with sustainable logistics"}
            </p>
          </div>

          {/* Tab Switcher */}
          <div className="flex bg-gradient-to-r from-green-100 via-emerald-100 to-teal-100 rounded-xl p-1 mb-4 lg:mb-6 relative transform hover:scale-105 transition-all duration-300 shadow-lg shadow-green-200/50">
            <div
              className={`absolute top-1 bottom-1 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 rounded-lg shadow-xl transition-all duration-500 ease-out transform ${
                tab === "login" ? "left-1 right-1/2" : "left-1/2 right-1"
              }`}
            ></div>
            <button
              type="button"
              onClick={() => setTab("login")}
              className={`flex-1 py-2.5 lg:py-3 text-center font-semibold rounded-lg transition-all duration-300 relative z-10 transform hover:scale-105 text-sm lg:text-base ${
                tab === "login" ? "text-white drop-shadow-sm" : "text-gray-600"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setTab("signup")}
              className={`flex-1 py-2.5 lg:py-3 text-center font-semibold rounded-lg transition-all duration-300 relative z-10 transform hover:scale-105 text-sm lg:text-base ${
                tab === "signup" ? "text-white drop-shadow-sm" : "text-gray-600"
              }`}
            >
              Sign Up
            </button>
          </div>

          {/* FORM */}
          <form className="space-y-3 lg:space-y-4" onSubmit={handleSubmit}>
            {tab === "signup" && (
              <div className="transform animate-pulse">
                <div className="flex space-x-2 lg:space-x-3">
                  <button
                    type="button"
                    onClick={() => setUserType("driver")}
                    className={`flex-1 p-2 lg:p-2.5 rounded-xl border-2 transition-all duration-300 transform hover:scale-105 shadow-lg backdrop-blur-sm ${
                      userType === "driver"
                        ? "border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 text-green-700 shadow-green-200/50"
                        : "border-gray-200 bg-white/80 hover:border-green-300 hover:shadow-green-100/50"
                    }`}
                  >
                    <Truck className="mx-auto mb-1 w-3 h-3 lg:w-4 lg:h-4" />
                    <div className="text-xs font-semibold">Driver</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUserType("admin")}
                    className={`flex-1 p-2 lg:p-2.5 rounded-xl border-2 transition-all duration-300 transform hover:scale-105 shadow-lg backdrop-blur-sm ${
                      userType === "admin"
                        ? "border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 text-green-700 shadow-green-200/50"
                        : "border-gray-200 bg-white/80 hover:border-green-300 hover:shadow-green-100/50"
                    }`}
                  >
                    <Shield className="mx-auto mb-1 w-3 h-3 lg:w-4 lg:h-4" />
                    <div className="text-xs font-semibold">Admin</div>
                  </button>
                </div>
              </div>
            )}

            {/* Full Name for signup */}
            {tab === "signup" && (
              <div className="relative group transform hover:scale-102 transition-all duration-300">
                <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-green-500 transition-all duration-300 z-10 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Full Name"
                  className="w-full pl-10 pr-3 py-2.5 lg:py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none transition-all duration-300 bg-gray-50/80 focus:bg-white focus:shadow-xl shadow-lg backdrop-blur-sm text-sm font-medium hover:border-green-300 hover:shadow-green-100/50"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            )}

            {/* Company Name */}
            <div className="relative group transform hover:scale-102 transition-all duration-300">
              <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-green-500 transition-all duration-300 z-10 w-4 h-4" />
              <input
                type="text"
                placeholder="Company Name"
                className="w-full pl-10 pr-3 py-2.5 lg:py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none transition-all duration-300 bg-gray-50/80 focus:bg-white focus:shadow-xl shadow-lg backdrop-blur-sm text-sm font-medium hover:border-green-300 hover:shadow-green-100/50"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>

            {/* Email */}
            <div className="relative group transform hover:scale-102 transition-all duration-300">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-green-500 transition-all duration-300 z-10 w-4 h-4" />
              <input
                type="email"
                placeholder="Email Address"
                className="w-full pl-10 pr-3 py-2.5 lg:py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none transition-all duration-300 bg-gray-50/80 focus:bg-white focus:shadow-xl shadow-lg backdrop-blur-sm text-sm font-medium hover:border-green-300 hover:shadow-green-100/50"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {/* Password */}
            <div className="relative group transform hover:scale-102 transition-all duration-300">
              <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-green-500 transition-all duration-300 z-10 w-4 h-4" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                className="w-full pl-10 pr-10 py-2.5 lg:py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:outline-none transition-all duration-300 bg-gray-50/80 focus:bg-white focus:shadow-xl shadow-lg backdrop-blur-sm text-sm font-medium hover:border-green-300 hover:shadow-green-100/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-green-500 transition-all duration-300 hover:scale-110 z-10"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Remember Me and Forgot Password for login */}
            {tab === "login" && (
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 text-sm">
                <label className="flex items-center space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={e => setRememberMe(e.target.checked)}
                    className="w-4 h-4 accent-green-500 rounded focus:ring-green-500 transform hover:scale-125 transition-transform duration-200"
                  />
                  <span className="text-gray-600 group-hover:text-gray-800 transition-colors duration-200 font-medium">Remember me</span>
                </label>
                <button
                  type="button"
                  onClick={() => toast("To reset your password, contact your company administrator.", { icon: "🔒" })}
                  className="text-green-500 hover:text-green-600 font-semibold transition-all duration-200 hover:underline transform hover:scale-105 text-left sm:text-right"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 text-white font-semibold py-3 lg:py-4 rounded-xl hover:from-green-700 hover:via-emerald-700 hover:to-teal-700 transition-all duration-300 transform hover:scale-105 hover:shadow-2xl hover:shadow-green-500/30 disabled:opacity-70 disabled:cursor-not-allowed relative overflow-hidden shadow-xl shadow-green-500/20"
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-3">
                  <div className="w-4 h-4 lg:w-5 lg:h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span className="text-sm lg:text-base font-semibold">Processing...</span>
                </div>
              ) : (
                <span className="flex items-center justify-center space-x-3">
                  <span className="text-sm lg:text-base font-semibold">{tab === "login" ? "Sign In" : "Create Account"}</span>
                  <Truck className="w-3 h-3 lg:w-4 lg:h-4 transform group-hover:translate-x-1 transition-transform duration-200" />
                </span>
              )}
            </button>

          </form>

          <div className="mt-4 lg:mt-6 text-center text-sm text-gray-500">
            {tab === "login" ? (
              <p className="font-medium">
                New to OptiGo?{" "}
                <button
                  onClick={() => setTab("signup")}
                  className="text-green-500 hover:text-green-600 font-semibold transition-all duration-200 transform hover:scale-110 underline-offset-2 hover:underline"
                >
                  Sign up today
                </button>
              </p>
            ) : (
              <p className="font-medium">
                Already have an account?{" "}
                <button
                  onClick={() => setTab("login")}
                  className="text-green-500 hover:text-green-600 font-semibold transition-all duration-200 transform hover:scale-110 underline-offset-2 hover:underline"
                >
                  Sign in here
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
