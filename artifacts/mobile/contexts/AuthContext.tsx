import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { setApiToken } from "@/hooks/tokenStore";

const TOKEN_KEY = "oos_auth_token";

export interface AuthUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface AuthWorkspace {
  id: string;
  name: string;
  industryFocus: string | null;
}

export interface AuthPlan {
  id: string;
  name: string;
  slug: string;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
  workspace: AuthWorkspace | null;
  plan: AuthPlan | null;
  role: string;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: AuthUser, workspace: AuthWorkspace, plan: AuthPlan | null) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (user: AuthUser, workspace: AuthWorkspace, plan: AuthPlan | null, role: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function storeToken(token: string) {
  if (Platform.OS === "web") {
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
  } else {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  }
}

async function loadToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function clearToken() {
  setApiToken(null);
  if (Platform.OS === "web") {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
  } else {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
}

export function AuthProvider({ children, baseUrl }: { children: React.ReactNode; baseUrl: string }) {
  const [state, setState] = useState<AuthState>({
    token: null, user: null, workspace: null, plan: null, role: "MEMBER",
    isLoading: true, isAuthenticated: false,
  });

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const token = await loadToken();
        if (!token || cancelled) {
          setState(s => ({ ...s, isLoading: false }));
          return;
        }
        setApiToken(token);
        const res = await fetch(`${baseUrl}/auth/me`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        if (!res.ok || cancelled) {
          await clearToken();
          setState(s => ({ ...s, isLoading: false }));
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setState({
            token, user: data.user, workspace: data.workspace,
            plan: data.plan, role: data.role || "MEMBER",
            isLoading: false, isAuthenticated: true,
          });
        }
      } catch {
        if (!cancelled) {
          setApiToken(null);
          setState(s => ({ ...s, isLoading: false }));
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, [baseUrl]);

  const login = useCallback(async (
    token: string, user: AuthUser, workspace: AuthWorkspace, plan: AuthPlan | null,
  ) => {
    await storeToken(token);
    setApiToken(token);
    setState({ token, user, workspace, plan, role: "OWNER", isLoading: false, isAuthenticated: true });
  }, []);

  const logout = useCallback(async () => {
    await clearToken();
    setState({ token: null, user: null, workspace: null, plan: null, role: "MEMBER", isLoading: false, isAuthenticated: false });
  }, []);

  const updateProfile = useCallback((user: AuthUser, workspace: AuthWorkspace, plan: AuthPlan | null, role: string) => {
    setState(s => ({ ...s, user, workspace, plan, role }));
  }, []);

  return <AuthContext.Provider value={{ ...state, login, logout, updateProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
