import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import { getBaseUrl } from "./useApi";

const ADMIN_TOKEN_KEY = "oos_admin_token";

let _adminToken: string | null = null;

export function getAdminToken(): string | null {
  return _adminToken;
}

export function setAdminToken(token: string | null) {
  _adminToken = token;
}

async function storeAdminToken(token: string) {
  _adminToken = token;
  if (Platform.OS === "web") {
    try { localStorage.setItem(ADMIN_TOKEN_KEY, token); } catch {}
  } else {
    await AsyncStorage.setItem(ADMIN_TOKEN_KEY, token);
  }
}

async function loadAdminToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    try { return localStorage.getItem(ADMIN_TOKEN_KEY); } catch { return null; }
  }
  return AsyncStorage.getItem(ADMIN_TOKEN_KEY);
}

async function clearAdminToken() {
  _adminToken = null;
  if (Platform.OS === "web") {
    try { localStorage.removeItem(ADMIN_TOKEN_KEY); } catch {}
  } else {
    await AsyncStorage.removeItem(ADMIN_TOKEN_KEY);
  }
}

export interface AdminUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isPlatformAdmin: boolean;
  platformRole: string | null;
}

export function useAdminAuth() {
  const [adminToken, setAdminTokenState] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  const isAdminAuthenticated = !!adminToken && !!adminUser;

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const token = await loadAdminToken();
        if (!token || cancelled) {
          setIsAdminLoading(false);
          return;
        }
        _adminToken = token;
        const base = getBaseUrl();
        const res = await fetch(`${base}/admin/me`, {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
        if (!res.ok || cancelled) {
          await clearAdminToken();
          if (!cancelled) setIsAdminLoading(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setAdminTokenState(token);
          setAdminUser(data.user);
          setIsAdminLoading(false);
        }
      } catch {
        if (!cancelled) {
          await clearAdminToken();
          setIsAdminLoading(false);
        }
      }
    }
    init();
    return () => { cancelled = true; };
  }, []);

  const adminLogin = useCallback(async (email: string, password: string): Promise<void> => {
    const base = getBaseUrl();
    const res = await fetch(`${base}/admin/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Login failed.");
    }
    const data = await res.json();
    await storeAdminToken(data.token);
    setAdminTokenState(data.token);
    setAdminUser(data.user);
  }, []);

  const adminLogout = useCallback(async () => {
    await clearAdminToken();
    setAdminTokenState(null);
    setAdminUser(null);
  }, []);

  return { adminToken, adminUser, isAdminAuthenticated, isAdminLoading, adminLogin, adminLogout };
}

export async function adminFetch(path: string, options?: RequestInit) {
  const base = getBaseUrl();
  const url = `${base}${path}`;
  const token = getAdminToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    headers: { ...headers, ...(options?.headers as Record<string, string> || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || body.message || `HTTP ${res.status}`);
  }
  return res.json();
}
