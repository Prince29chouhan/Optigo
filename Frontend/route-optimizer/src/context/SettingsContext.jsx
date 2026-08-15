import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSettings, saveSettings as saveSettingsApi } from "../lib/api";
import {
  formatDistance, formatDuration, formatFuel, formatMoney,
} from "../lib/format";
import { useAuth } from "./AuthContext";

const SettingsContext = createContext(null);

export const DEFAULT_SETTINGS = {
  preferences: {
    theme: "light",
    language: "en",
    timezone: "Europe/London",
    dateFormat: "DD/MM/YYYY",
    distanceUnit: "km",
    fuelUnit: "liters",
    currency: "GBP",
  },
  planning: {
    defaultPreference: "greenest",
    optimizeSequence: true,
    returnToStart: true,
    autoBreaks: true,
    breakMinutes: 45,
    maxDrivingMinutesBeforeBreak: 270,
    defaultServiceMinutes: 15,
    useGnnCorridor: true,   // always on; not user-facing
    defaultVehicleType: "rigid_7_5t",
  },
  notifications: {
    email: { routeUpdates: true, fuelAlerts: true, maintenanceReminders: true, performanceReports: false, systemUpdates: true },
    push: { routeDeviations: true, emergencyAlerts: true, deliveryUpdates: true, trafficAlerts: false },
    sms: { criticalAlerts: false, deliveryConfirmations: false },
  },
  security: { twoFactorAuth: false, sessionTimeoutMinutes: 720, loginNotifications: true },
  data: { routeRetention: "1year", autoBackup: true },
};

const merge = (base, override) => {
  const result = { ...base };
  Object.entries(override || {}).forEach(([key, value]) => {
    result[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? merge(base[key] || {}, value)
        : value;
  });
  return result;
};

export const SettingsProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [settings, setSettings] = useState(() => {
    const cached = localStorage.getItem("optigo.settings");
    return cached ? merge(DEFAULT_SETTINGS, JSON.parse(cached)) : DEFAULT_SETTINGS;
  });
  const [loading, setLoading] = useState(false);

  const applyTheme = useCallback((theme) => {
    const dark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", Boolean(dark));
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, []);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await getSettings();
      const merged = merge(DEFAULT_SETTINGS, data.settings || {});
      setSettings(merged);
      localStorage.setItem("optigo.settings", JSON.stringify(merged));
    } catch {
      // Offline or server hiccup — keep whatever we cached locally.
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { applyTheme(settings.preferences.theme); }, [settings.preferences.theme, applyTheme]);

  const save = useCallback(async (partial) => {
    const optimistic = merge(settings, partial);
    setSettings(optimistic);
    localStorage.setItem("optigo.settings", JSON.stringify(optimistic));
    const response = await saveSettingsApi(partial);
    const confirmed = merge(DEFAULT_SETTINGS, response.settings || optimistic);
    setSettings(confirmed);
    localStorage.setItem("optigo.settings", JSON.stringify(confirmed));
    return confirmed;
  }, [settings]);

  const value = useMemo(() => {
    const { distanceUnit, fuelUnit, currency, dateFormat } = settings.preferences;
    return {
      settings,
      loading,
      reload: load,
      save,
      units: { distanceUnit, fuelUnit, currency, dateFormat },
      fmt: {
        distance: (km, digits) => formatDistance(km, distanceUnit, digits),
        fuel: (litres, digits) => formatFuel(litres, fuelUnit, digits),
        money: (value, digits) => formatMoney(value, currency, digits),
        duration: formatDuration,
      },
    };
  }, [settings, loading, load, save]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    const { distanceUnit, fuelUnit, currency, dateFormat } = DEFAULT_SETTINGS.preferences;
    return {
      settings: DEFAULT_SETTINGS,
      loading: false,
      reload: () => {},
      save: async () => DEFAULT_SETTINGS,
      units: { distanceUnit, fuelUnit, currency, dateFormat },
      fmt: {
        distance: (km, digits) => formatDistance(km, distanceUnit, digits),
        fuel: (litres, digits) => formatFuel(litres, fuelUnit, digits),
        money: (value, digits) => formatMoney(value, currency, digits),
        duration: formatDuration,
      },
    };
  }
  return context;
};
