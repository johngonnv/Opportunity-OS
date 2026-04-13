import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getApiToken } from "./tokenStore";
import { Platform } from "react-native";

function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  if (Platform.OS === "android") return "http://10.0.2.2:8080/api";
  return "http://localhost:8080/api";
}

async function apiFetch(path: string, options?: RequestInit) {
  const base = getBaseUrl();
  const token = getApiToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    headers: { ...headers, ...(options?.headers as Record<string, string> || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.message || body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GovconProfile {
  id: string;
  workspaceId: string;
  roleType: "PRIME" | "SUB" | "BOTH";
  region: string | null;
  teamingNotes: string | null;
  gagcActivatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TargetNaics {
  id: string;
  naicsCode: string;
  priorityWeight: number;
  title: string | null;
  description: string | null;
}

export interface TargetPsc {
  id: string;
  pscCode: string;
  priorityWeight: number;
  name: string | null;
}

export interface TargetAgency {
  id: string;
  workspaceId: string;
  agencyName: string;
  createdAt: string;
}

export interface GovconProfileData {
  profile: GovconProfile | null;
  targetNaics: TargetNaics[];
  targetPsc: TargetPsc[];
  targetAgencies: TargetAgency[];
}

export interface NaicsSearchResult {
  code: string;
  title: string;
  description: string | null;
}

// ---------------------------------------------------------------------------
// useGovconProfileData — fetch workspace GAGC profile + targets
// ---------------------------------------------------------------------------

export function useGovconProfileData() {
  return useQuery<GovconProfileData>({
    queryKey: ["govcon-profile"],
    queryFn: () => apiFetch("/govcon/profile"),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// useGovconProfile — contains searchNaics helper (not a hook, but returned by hook)
// ---------------------------------------------------------------------------

export function useGovconProfile() {
  async function searchNaics(q: string): Promise<NaicsSearchResult[]> {
    const res = await apiFetch(`/govcon/naics-search?q=${encodeURIComponent(q)}`);
    return res.results ?? [];
  }

  return { searchNaics };
}

// ---------------------------------------------------------------------------
// useGovconActivate — saves the full onboarding form in one go
// ---------------------------------------------------------------------------

interface ActivatePayload {
  naics: NaicsSearchResult[];
  region: string;
  roleType: "PRIME" | "SUB" | "BOTH";
  teamingNotes: string;
  agencies: string[];
}

export function useGovconActivate() {
  const qc = useQueryClient();

  async function activate(payload: ActivatePayload) {
    const { naics, region, roleType, teamingNotes, agencies } = payload;

    // 1. Upsert govcon profile and mark as activated
    await apiFetch("/govcon/profile", {
      method: "POST",
      body: JSON.stringify({ roleType, region, teamingNotes, activate: true }),
    });

    // 2. Save each NAICS code
    const naicsPromises = naics.map(n =>
      apiFetch("/govcon/target-naics", {
        method: "POST",
        body: JSON.stringify({ naicsCode: n.code }),
      })
    );

    // 3. Save each agency
    const agencyPromises = agencies.map(a =>
      apiFetch("/govcon/target-agencies", {
        method: "POST",
        body: JSON.stringify({ agencyName: a }),
      })
    );

    await Promise.allSettled([...naicsPromises, ...agencyPromises]);

    // Invalidate profile cache
    await qc.invalidateQueries({ queryKey: ["govcon-profile"] });
  }

  return { activate };
}

// ---------------------------------------------------------------------------
// useAddTargetNaics
// ---------------------------------------------------------------------------

export function useAddTargetNaics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { naicsCode: string; priorityWeight?: number }) =>
      apiFetch("/govcon/target-naics", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["govcon-profile"] }),
  });
}

// ---------------------------------------------------------------------------
// useRemoveTargetNaics
// ---------------------------------------------------------------------------

export function useRemoveTargetNaics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (naicsCode: string) =>
      apiFetch(`/govcon/target-naics/${naicsCode}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["govcon-profile"] }),
  });
}

// ---------------------------------------------------------------------------
// useAddTargetAgency / useRemoveTargetAgency
// ---------------------------------------------------------------------------

export function useAddTargetAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (agencyName: string) =>
      apiFetch("/govcon/target-agencies", { method: "POST", body: JSON.stringify({ agencyName }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["govcon-profile"] }),
  });
}

export function useRemoveTargetAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/govcon/target-agencies/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["govcon-profile"] }),
  });
}
