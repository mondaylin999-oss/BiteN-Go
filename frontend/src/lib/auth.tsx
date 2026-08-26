// ===========================================================================
//  auth.tsx — who is signed in, for the whole app.
//
//  The session token lives in localStorage (see lib/api.ts). On boot the app
//  asks the backend "who am I?" once; every screen then reads the answer from
//  this context instead of asking again.
// ===========================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken, type Health, type SessionUser } from "./api";

type AuthState = {
  user: SessionUser | null;
  health: Health | null;
  loading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<SessionUser>;
  register: (input: { name: string; username?: string; email?: string; password: string }) => Promise<SessionUser>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await api.get<Health>("/health");
      setHealth(status);
      setError(null);
    } catch (caught) {
      setHealth(null);
      setError(caught instanceof ApiError ? caught.message : "Cannot reach the BiteN Go server.");
      setUser(null);
      return;
    }

    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const response = await api.get<{ user: SessionUser | null }>("/auth/me");
      setUser(response.user);
    } catch {
      setToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const response = await api.post<{ token: string; user: SessionUser }>("/auth/login", { username, password });
    setToken(response.token);
    setUser(response.user);
    setError(null);
    return response.user;
  }, []);

  const register = useCallback(async (input: { name: string; username?: string; email?: string; password: string }) => {
    const response = await api.post<{ token: string; user: SessionUser }>("/auth/register", input);
    setToken(response.token);
    setUser(response.user);
    setError(null);
    return response.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    void api.post("/auth/logout").catch(() => undefined);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, health, loading, error, login, register, logout, refresh }),
    [user, health, loading, error, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>.");
  return context;
}

/** Where each role lands after logging in. */
export function homePathFor(role: SessionUser["role"]) {
  switch (role) {
    case "admin":
      return "/admin";
    case "agent":
      return "/agent";
    case "driver":
      return "/driver";
    default:
      return "/student";
  }
}
