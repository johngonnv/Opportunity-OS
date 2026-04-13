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
// useGovconProfile — search helpers
// ---------------------------------------------------------------------------

export interface PscSuggestion {
  code: string;
  name: string | null;
}

export function useGovconProfile() {
  async function searchNaics(q: string): Promise<NaicsSearchResult[]> {
    const res = await apiFetch(`/govcon/naics-search?q=${encodeURIComponent(q)}`);
    return res.results ?? [];
  }

  async function getPscSuggestionsForNaics(naicsCodes: string[]): Promise<PscSuggestion[]> {
    if (naicsCodes.length === 0) return [];
    const res = await apiFetch(
      `/govcon/psc-suggestions?naics=${encodeURIComponent(naicsCodes.join(","))}`
    );
    return res.results ?? [];
  }

  return { searchNaics, getPscSuggestionsForNaics };
}

// ---------------------------------------------------------------------------
// useGovconActivate — saves the full onboarding form atomically.
// Fails if any required write fails; only marks workspace activated after
// all targets are persisted.
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

    // 1. Save all NAICS targets first — fail hard if any write fails
    for (const n of naics) {
      await apiFetch("/govcon/target-naics", {
        method: "POST",
        body: JSON.stringify({ naicsCode: n.code }),
      });
    }

    // 2. Save all agencies — fail hard if any write fails
    for (const a of agencies) {
      await apiFetch("/govcon/target-agencies", {
        method: "POST",
        body: JSON.stringify({ agencyName: a }),
      });
    }

    // 3. Only mark workspace activated after all targets are persisted
    await apiFetch("/govcon/profile", {
      method: "POST",
      body: JSON.stringify({ roleType, region, teamingNotes, activate: true }),
    });

    // Invalidate profile cache so dashboard reflects new state
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

// ---------------------------------------------------------------------------
// Radar types + hooks
// ---------------------------------------------------------------------------

export interface RadarMatch {
  id: string;
  title: string;
  naicsCode: string | null;
  pscCode: string | null;
  agency: string | null;
  region: string | null;
  primeOrSubFit: "PRIME" | "SUB" | "BOTH" | "UNKNOWN" | null;
  summary: string | null;
  solicitationNumber: string | null;
  estimatedValue: string | null;
  responseDeadline: string | null;
  opportunityScore: number;
  matchReasons: string[];
  recommendedAction: string;
  breakdown: {
    pscScore: number;
    naicsScore: number;
    regionScore: number;
    agencyScore: number;
    primeSubScore: number;
  };
}

export interface RadarResponse {
  matches: RadarMatch[];
  totalOpportunities: number;
  matched: number;
  highFit: number;
}

export function useGovconRadar(minScore = 0, limit = 20) {
  return useQuery<RadarResponse>({
    queryKey: ["govcon-radar", minScore, limit],
    queryFn: () => apiFetch(`/govcon/radar?minScore=${minScore}&limit=${limit}`),
    staleTime: 120_000,
  });
}

export interface ActionFeedItem {
  type: string;
  icon: string;
  title: string;
  description: string;
  action: string;
  route: string;
  priority: number;
}

export function useGovconActionFeed() {
  return useQuery<{ items: ActionFeedItem[] }>({
    queryKey: ["govcon-action-feed"],
    queryFn: () => apiFetch("/govcon/action-feed"),
    staleTime: 120_000,
  });
}

export interface RadarSummary {
  matchedOpportunities: number;
  highFit: number;
  totalOpportunities: number;
  topMatches: {
    id: string;
    title: string;
    agency: string | null;
    opportunityScore: number;
    matchReasons: string[];
    recommendedAction: string;
    estimatedValue: string | null;
    responseDeadline: string | null;
  }[];
  highFitOrgs: {
    id: string;
    name: string;
    naicsCode: string;
    naicsTitle: string | null;
  }[];
  needsReview: {
    id: string;
    name: string;
    naicsCode: string;
    confidenceScore: string | null;
  }[];
}

export function useGovconRadarSummary() {
  return useQuery<RadarSummary>({
    queryKey: ["govcon-radar-summary"],
    queryFn: () => apiFetch("/govcon/radar-summary"),
    staleTime: 120_000,
  });
}

export interface NaicsDiagnostics {
  coveragePercent: number;
  targetAlignmentPercent: number;
  classifiedOrgs: number;
  totalOrgs: number;
  alignedOrgs: number;
  topNaics: { code: string; title: string | null; orgCount: number; isTargeted: boolean }[];
  gaps: { code: string }[];
  recommendations: string[];
}

export function useNaicsDiagnostics() {
  return useQuery<NaicsDiagnostics>({
    queryKey: ["govcon-naics-diagnostics"],
    queryFn: () => apiFetch("/govcon/naics-diagnostics"),
    staleTime: 120_000,
  });
}

export interface PscDiagnostics {
  coveragePercent: number;
  targetAlignmentPercent: number;
  classifiedOrgs: number;
  totalOrgs: number;
  alignedOrgs: number;
  topPsc: { code: string; name: string | null; orgCount: number; isTargeted: boolean }[];
  gaps: { code: string }[];
  recommendations: string[];
}

export function usePscDiagnostics() {
  return useQuery<PscDiagnostics>({
    queryKey: ["govcon-psc-diagnostics"],
    queryFn: () => apiFetch("/govcon/psc-diagnostics"),
    staleTime: 120_000,
  });
}
