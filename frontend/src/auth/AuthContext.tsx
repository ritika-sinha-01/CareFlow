import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiRequest } from "@/lib/api";
import type { PublicUser, SessionPayload, UserRole } from "@/lib/types";

const TOKEN_KEY = "careflow.token";

type AuthContextValue = {
  token: string | null;
  user: PublicUser | null;
  doctor: SessionPayload["doctor"];
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionPayload>;
  register: (input: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }) => Promise<SessionPayload>;
  logout: () => void;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function applySession(session: SessionPayload, token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  return { token, user: session.user, doctor: session.doctor };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<PublicUser | null>(null);
  const [doctor, setDoctor] = useState<SessionPayload["doctor"]>(null);
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    apiRequest<SessionPayload>("/api/auth/me", { token })
      .then((session) => {
        if (cancelled) return;
        setUser(session.user);
        setDoctor(session.doctor);
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setDoctor(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      doctor,
      loading,
      async login(email, password) {
        const session = await apiRequest<SessionPayload>("/api/auth/login", {
          method: "POST",
          body: { email, password },
        });
        const next = applySession(session, session.token!);
        setToken(next.token);
        setUser(next.user);
        setDoctor(next.doctor);
        return session;
      },
      async register(input) {
        const session = await apiRequest<SessionPayload>("/api/auth/register", {
          method: "POST",
          body: input,
        });
        const next = applySession(session, session.token!);
        setToken(next.token);
        setUser(next.user);
        setDoctor(next.doctor);
        return session;
      },
      logout() {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
        setDoctor(null);
      },
      async refresh() {
        if (!token) return;
        const session = await apiRequest<SessionPayload>("/api/auth/me", { token });
        setUser(session.user);
        setDoctor(session.doctor);
      },
    }),
    [token, user, doctor, loading],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function useRole(): UserRole | null {
  return useAuth().user?.role ?? null;
}
