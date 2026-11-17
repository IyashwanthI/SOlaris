import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  TOKEN_KEY,
  USER_KEY,
  feedbackStats,
  login as apiLogin,
  register as apiRegister,
  setAuthFailureHandler,
  setToken,
} from "../api.js";

const AppContext = createContext(null);

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AppProvider({ children }) {
  // --- Auth state (backed by localStorage) ---
  const [user, setUser] = useState(loadStoredUser);
  const [authAlert, setAuthAlert] = useState(null); // red banner on forced logout

  // --- App state ---
  const [latencyMs, setLatencyMs] = useState(null);
  const [stats, setStats] = useState({ up: 0, down: 0, precision_pct: 0 });

  // --- Toast ---
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const showToast = useCallback((message, variant = "info") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, variant });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const persistAuth = useCallback((token, userObj) => {
    setToken(token);
    if (userObj) {
      localStorage.setItem(USER_KEY, JSON.stringify(userObj));
      setUser(userObj);
    }
  }, []);

  const logout = useCallback((alertMessage) => {
    setToken(null);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    if (alertMessage) setAuthAlert(alertMessage);
  }, []);

  // Wire the api layer's auth-failure handler to force logout + red banner.
  useEffect(() => {
    setAuthFailureHandler((message) => logout(message));
  }, [logout]);

  const login = useCallback(
    async (email, password) => {
      setAuthAlert(null);
      const data = await apiLogin(email, password);
      persistAuth(data.access_token, data.user);
      return data.user;
    },
    [persistAuth],
  );

  const registerAgent = useCallback(
    async (email, fullName, password) => {
      setAuthAlert(null);
      const data = await apiRegister(email, fullName, password);
      persistAuth(data.access_token, data.user);
      return data.user;
    },
    [persistAuth],
  );

  const refreshStats = useCallback(async () => {
    const s = await feedbackStats();
    setStats(s);
    return s;
  }, []);

  const value = {
    // auth
    user,
    isAuthed: !!user,
    isAdmin: user?.role === "admin",
    login,
    registerAgent,
    logout,
    authAlert,
    setAuthAlert,
    // app
    latencyMs,
    setLatencyMs,
    stats,
    setStats,
    refreshStats,
    // toast
    toast,
    showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
