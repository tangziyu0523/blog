"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  startTransition,
} from "react";
import type { AuthUser } from "@blog/shared";
import { api, ApiClientError } from "./api";

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function fetchMe(): Promise<AuthUser | null> {
  try {
    return await api<AuthUser>("/me");
  } catch (e) {
    if (e instanceof ApiClientError) return null;
    throw e;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const next = await fetchMe();
    startTransition(() => {
      setUser(next);
      setLoading(false);
    });
  }, []);

  const logout = useCallback(async () => {
    await api<void>("/auth/logout", { method: "POST" });
    startTransition(() => {
      setUser(null);
    });
  }, []);

  // Inlines fetchMe rather than calling refresh(): putting refresh() in the dep
  // array risks a re-run loop, omitting it is a lint error, and the
  // startTransition wrapper is required by react-hooks/set-state-in-effect.
  useEffect(() => {
    fetchMe()
      .then((next) => {
        startTransition(() => {
          setUser(next);
          setLoading(false);
        });
      })
      .catch(() => {
        startTransition(() => {
          setLoading(false);
        });
      });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
