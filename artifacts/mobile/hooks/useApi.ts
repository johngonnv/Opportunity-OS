import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import { Platform } from "react-native";
import { getApiToken } from "./tokenStore";

export { setApiToken } from "./tokenStore";

function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  if (Platform.OS === "android") return "http://10.0.2.2:8080/api";
  return "http://localhost:8080/api";
}

setBaseUrl(getBaseUrl());

export class ApiError extends Error {
  status: number;
  code: string | undefined;
  existing: Record<string, any> | undefined;
  constructor(message: string, status: number, body: Record<string, any>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.error;
    this.existing = body.existing;
  }
}

async function apiFetch(path: string, options?: RequestInit) {
  const base = getBaseUrl();
  const url = `${base}${path}`;
  const token = getApiToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, {
    headers: { ...headers, ...(options?.headers as Record<string, string> || {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(body.message || body.error || `HTTP ${res.status}`, res.status, body);
  }
  return res.json();
}

function getStorageUrl(objectPath: string): string {
  const base = getBaseUrl();
  return `${base}/storage${objectPath}`;
}

async function uploadImageMultipart(uri: string): Promise<{ objectPath: string; imageUrl: string }> {
  const base = getBaseUrl();
  const url = `${base}/business-cards/upload`;
  const ext = uri.toLowerCase().endsWith(".png") ? "png" : "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";

  const formData = new FormData();

  if (Platform.OS === "web" || uri.startsWith("blob:") || uri.startsWith("data:")) {
    const blobRes = await fetch(uri);
    const blob = await blobRes.blob();
    formData.append("image", blob, `card.${ext}`);
  } else {
    formData.append("image", { uri, name: `card.${ext}`, type: mimeType } as any);
  }

  const token = getApiToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, { method: "POST", body: formData, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: HTTP ${res.status}`);
  }
  return res.json();
}

async function uploadOrgScanMultipart(
  uri: string,
  organizationId?: string,
): Promise<{ id: string; imageUrl: string; scan: Record<string, unknown> }> {
  const base = getBaseUrl();
  const url = `${base}/organization-scans/upload`;
  const ext = uri.toLowerCase().endsWith(".png") ? "png" : "jpg";
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";
  const formData = new FormData();
  if (Platform.OS === "web" || uri.startsWith("blob:") || uri.startsWith("data:")) {
    const blobRes = await fetch(uri);
    const blob = await blobRes.blob();
    formData.append("image", blob, `scan.${ext}`);
  } else {
    formData.append("image", { uri, name: `scan.${ext}`, type: mimeType } as any);
  }
  if (organizationId) formData.append("organizationId", organizationId);
  const token = getApiToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(url, { method: "POST", body: formData, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Upload failed: HTTP ${res.status}`);
  }
  return res.json();
}

export { apiFetch, getBaseUrl, getStorageUrl, uploadImageMultipart, uploadOrgScanMultipart };

export function useDashboard() {
  return useQuery({ queryKey: ["dashboard"], queryFn: () => apiFetch("/reports/dashboard"), staleTime: 30000 });
}

export function useContacts(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["contacts", params], queryFn: () => apiFetch(`/contacts${qs}`) });
}

export function useContact(id: string) {
  return useQuery({ queryKey: ["contact", id], queryFn: () => apiFetch(`/contacts/${id}`), enabled: !!id });
}

export function useOrganizations(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["organizations", params], queryFn: () => apiFetch(`/organizations${qs}`) });
}

export function useOrganization(id: string) {
  return useQuery({ queryKey: ["organization", id], queryFn: () => apiFetch(`/organizations/${id}`), enabled: !!id });
}

export function useOpportunities(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["opportunities", params], queryFn: () => apiFetch(`/opportunities${qs}`) });
}

export function useOpportunity(id: string) {
  return useQuery({ queryKey: ["opportunity", id], queryFn: () => apiFetch(`/opportunities/${id}`), enabled: !!id });
}

export function useTasks(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["tasks", params], queryFn: () => apiFetch(`/tasks${qs}`) });
}

export function useActivities(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["activities", params], queryFn: () => apiFetch(`/activities${qs}`) });
}

export function useBusinessCards(params?: Record<string, string>) {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return useQuery({ queryKey: ["businessCards", params], queryFn: () => apiFetch(`/business-cards${qs}`) });
}

export function usePipelines() {
  return useQuery({ queryKey: ["pipelines"], queryFn: () => apiFetch("/pipelines"), staleTime: 60000 });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: () => apiFetch("/tags"), staleTime: 60000 });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/contacts", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); qc.invalidateQueries({ queryKey: ["contact", id] }); },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/contacts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useCreateOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/organizations", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

export function useUpdateOrganization(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch(`/organizations/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["organizations"] }); qc.invalidateQueries({ queryKey: ["organization", id] }); },
  });
}

export function useDeleteOrganization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/organizations/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["organizations"] }),
  });
}

export function useCreateOpportunity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/opportunities", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opportunities"] }),
  });
}

export function useUpdateOpportunity(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch(`/opportunities/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["opportunities"] }); qc.invalidateQueries({ queryKey: ["opportunity", id] }); },
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/tasks", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useUpdateTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useCreateActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/activities", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["activities"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/notes", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useCreateBusinessCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch("/business-cards", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["businessCards"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useUpdateBusinessCard(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch(`/business-cards/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["businessCards"] }),
  });
}

export function useApproveBusinessCard(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => apiFetch(`/business-cards/${id}/approve`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["businessCards"] }); qc.invalidateQueries({ queryKey: ["contacts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useBulkCreateTasks() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { contactIds: string[]; title: string; description?: string; dueDate?: string; priority?: string }) =>
      apiFetch("/contacts/bulk/tasks", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["contacts"] }); },
  });
}

export function useBulkUpdateTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { contactIds: string[]; tagId: string; action: "add" | "remove" }) =>
      apiFetch("/contacts/bulk/tags", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["contacts"] }); },
  });
}

export function useRejectBusinessCard(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/business-cards/${id}/reject`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["businessCards"] }); qc.invalidateQueries({ queryKey: ["businessCard", id] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
}

export function useWorkspacePipelineViews(workspaceId: string) {
  return useQuery({
    queryKey: ["workspacePipelineViews", workspaceId],
    queryFn: () => apiFetch(`/workspaces/${workspaceId}/pipeline-views`),
    enabled: !!workspaceId,
    staleTime: 30000,
  });
}

export function useWorkspaceMembers(workspaceId: string) {
  return useQuery({
    queryKey: ["workspaceMembers", workspaceId],
    queryFn: () => apiFetch(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId,
    staleTime: 30000,
  });
}

export function useUpdateWorkspacePipelineView(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      apiFetch(`/workspaces/${workspaceId}/pipeline-views/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspacePipelineViews", workspaceId] }),
  });
}

export function useUpdateWorkspaceMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch(`/workspaces/${workspaceId}/members/${userId}`, { method: "PUT", body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] }),
  });
}

export function useRemoveWorkspaceMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] }),
  });
}

export function useInviteWorkspaceMember(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      apiFetch(`/workspaces/${workspaceId}/invites`, { method: "POST", body: JSON.stringify({ email }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] }),
  });
}

export function useOpportunityEmsProfile(opportunityId: string) {
  return useQuery({
    queryKey: ["opportunityEmsProfile", opportunityId],
    queryFn: () => apiFetch(`/opportunities/${opportunityId}/ems-profile`),
    enabled: !!opportunityId,
  });
}

export function useUpsertEmsProfile(opportunityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/opportunities/${opportunityId}/ems-profile`, { method: "PUT", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunity", opportunityId] });
      qc.invalidateQueries({ queryKey: ["opportunityEmsProfile", opportunityId] });
    },
  });
}

export function useOrganizationScans(orgId?: string) {
  const params = orgId ? `?organizationId=${orgId}` : "";
  return useQuery({
    queryKey: ["orgScans", orgId],
    queryFn: () => apiFetch(`/organization-scans${params}`),
    staleTime: 30000,
  });
}

export function useOrganizationScan(id: string) {
  return useQuery({
    queryKey: ["orgScan", id],
    queryFn: () => apiFetch(`/organization-scans/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.processingStatus;
      if (status === "PARSING" || status === "UPLOADED") return 2000;
      return false;
    },
  });
}

export function useParseOrgScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/organization-scans/${id}/parse`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgScan", id] }),
  });
}

export function useMatchOrgScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { latitude?: number; longitude?: number; query?: string }) =>
      apiFetch(`/organization-scans/${id}/match`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgScan", id] }),
  });
}

export function useApproveOrgScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      selectedMatch?: unknown;
      targetOrganizationId?: string;
      forceFields?: string[];
    }) => apiFetch(`/organization-scans/${id}/approve`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgScan", id] });
      qc.invalidateQueries({ queryKey: ["orgScans"] });
      qc.invalidateQueries({ queryKey: ["organizations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRejectOrgScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/organization-scans/${id}/reject`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgScan", id] });
      qc.invalidateQueries({ queryKey: ["orgScans"] });
    },
  });
}

export function useStructureScans(orgId?: string) {
  const params = orgId ? `?organizationId=${orgId}` : "";
  return useQuery({
    queryKey: ["structureScans", orgId],
    queryFn: () => apiFetch(`/structure-scans${params}`),
    staleTime: 30000,
  });
}

export function useStructureScan(id: string) {
  return useQuery({
    queryKey: ["structureScan", id],
    queryFn: () => apiFetch(`/structure-scans/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = (query.state.data as any)?.scanStatus;
      if (
        status === "PENDING" ||
        status === "MASTER_MATCHED" ||
        status === "EXTERNAL_SEARCHED" ||
        status === "LLM_REVIEWED"
      )
        return 2000;
      return false;
    },
  });
}

export function useCreateStructureScan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { organizationId: string }) =>
      apiFetch("/structure-scans", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["structureScans"] });
    },
  });
}

export function useRunStructureScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/structure-scans/${id}/run`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["structureScan", id] });
      qc.invalidateQueries({ queryKey: ["structureScans"] });
    },
  });
}

export function useApproveStructureScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { addToMasterGraph: boolean }) =>
      apiFetch(`/structure-scans/${id}/approve`, { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["structureScan", id] });
      qc.invalidateQueries({ queryKey: ["structureScans"] });
      qc.invalidateQueries({ queryKey: ["organizations"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useRejectStructureScan(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/structure-scans/${id}/reject`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["structureScan", id] });
      qc.invalidateQueries({ queryKey: ["structureScans"] });
    },
  });
}

export type AccountState = "COLD" | "WARMING" | "ACTIVE" | "AT_RISK" | "EXPANDING";

export interface CoverageGap {
  role: string;
  message: string;
  cta: string;
}

export interface OrgPrimaryAction {
  title: string;
  whyNow: string;
  type: "FOLLOW_UP" | "SCHEDULE_MEETING" | "CLOSE_DEAL" | "ENGAGE_STAKEHOLDER" | "REACTIVATE" | "CAPTURE_CONTACT" | "ADVANCE_STAGE";
}

export interface EnrichedOpportunity {
  id: string;
  title: string;
  stage: string;
  stageName: string;
  probability: number;
  valueEstimate: number | null;
  daysInStage: number;
}

export interface EnrichedContact {
  id: string;
  fullName: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  stakeholderRole: string | null;
  influenceLevel: string | null;
  relationshipStrength: number | null;
  relationshipStrengthLabel: string | null;
  isPrimaryRelationship: boolean;
  roleNotes: string | null;
  activityCount: number;
  lastEngagementAt: string | null;
  isOnOpenOpp: boolean;
  hasOverdueTask: boolean;
  computedStrength: number;
  computedStrengthLabel: string;
}

export interface OrgIntelligence {
  accountState: AccountState;
  health: number;
  risk: number;
  coverageGaps: CoverageGap[];
  primaryAction: OrgPrimaryAction;
  openOpportunities: EnrichedOpportunity[];
  contacts: EnrichedContact[];
}

export function useOrganizationIntelligence(id: string) {
  return useQuery<OrgIntelligence>({
    queryKey: ["orgIntelligence", id],
    queryFn: () => apiFetch(`/organizations/${id}/intelligence`),
    enabled: !!id,
    staleTime: 30000,
  });
}

export function usePatchContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch(`/contacts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contact", id] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["orgIntelligence"] });
    },
  });
}

export function useCompleteTask(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(`/tasks/${id}`, { method: "PUT", body: JSON.stringify({ status: "COMPLETED" }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["orgIntelligence"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Healthcare Intelligence hooks
// ---------------------------------------------------------------------------

export interface HealthcareProfile {
  id: string;
  organizationId: string;
  cmsCcn: string | null;
  cmsProviderType: string | null;
  cmsOwnershipType: string | null;
  cmsBedCount: number | null;
  cmsEmergencyServices: boolean | null;
  cmsOverallStarRating: number | null;
  cmsPatientExperienceRating: number | null;
  cmsEdTotalTimeMinutes: number | null;
  cmsEdTimeToAdmitMinutes: number | null;
  cmsEdBoardingTimeMinutes: number | null;
  cmsEdLwbsPercent: number | null;
  cmsCareTransitionRating: number | null;
  cmsVerificationStatus: string | null;
  cmsLastUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PainPoint {
  id: string;
  organizationId: string;
  painPointCategory: string;
  department: string | null;
  painPointStatement: string | null;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  frequency: string | null;
  sourceType: string;
  linkedCmsSignalKey: string | null;
  confidenceScore: number;
  verificationStatus: "SUGGESTED" | "PENDING_REVIEW" | "VERIFIED" | "REJECTED";
  isActive: boolean;
  reviewedByUserId: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Competitor {
  id: string;
  organizationId: string;
  competitorName: string;
  competitorType: string;
  serviceLine: string | null;
  incumbentStatus: string;
  shareOfWalletEstimate: number | null;
  contractStatus: string | null;
  strengths: string[];
  weaknesses: string[];
  painPointsCaused: string[];
  displacementDifficulty: string | null;
  confidenceScore: number;
  verificationStatus: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OpportunityScore {
  overallScore: number;
  dimensions: Record<string, { score: number; weight: number; raw: Record<string, unknown> }>;
  freshness: {
    cmsDataAgeDays: number | null;
    painPointsLastReviewedAt: string | null;
    competitorsLastUpdatedAt: string | null;
    staleSignals: string[];
  };
  scoredAt: string;
}

export interface IntelligenceSummary {
  topPainPoints: Array<{ category: string; statement: string | null; severity: string; confidenceScore: number }>;
  topCompetitors: Array<{ competitorName: string; incumbentStatus: string; displacementDifficulty: string; topWeakness: string | null }>;
  buyerPatterns: string[];
  entryStrategy: string;
  primaryAction: string;
  impactStatement: string;
  computedAt: string;
}

export function useHealthcareProfile(orgId: string) {
  return useQuery<{ profile: HealthcareProfile | null }>({
    queryKey: ["healthcareProfile", orgId],
    queryFn: () => apiFetch(`/organizations/${orgId}/healthcare-profile`),
    enabled: !!orgId,
    staleTime: 60000,
  });
}

export function useOrganizationPainPoints(orgId: string) {
  return useQuery<{ painPoints: PainPoint[] }>({
    queryKey: ["orgPainPoints", orgId],
    queryFn: () => apiFetch(`/organizations/${orgId}/pain-points`),
    enabled: !!orgId,
    staleTime: 30000,
  });
}

export function useOrganizationCompetitors(orgId: string) {
  return useQuery<{ competitors: Competitor[] }>({
    queryKey: ["orgCompetitors", orgId],
    queryFn: () => apiFetch(`/organizations/${orgId}/competitors`),
    enabled: !!orgId,
    staleTime: 30000,
  });
}

export function useOrganizationOpportunityScore(orgId: string) {
  return useQuery<OpportunityScore>({
    queryKey: ["orgOpportunityScore", orgId],
    queryFn: () => apiFetch(`/organizations/${orgId}/opportunity-score`),
    enabled: !!orgId,
    staleTime: 60000,
  });
}

export function useOrganizationIntelligenceSummary(orgId: string) {
  return useQuery<{ summary: IntelligenceSummary; cached: boolean }>({
    queryKey: ["orgIntelligenceSummary", orgId],
    queryFn: () => apiFetch(`/organizations/${orgId}/intelligence-summary`),
    enabled: !!orgId,
    staleTime: 60000,
  });
}

export function useRunCmsSuggestions(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/organizations/${orgId}/healthcare-profile/run-suggestions`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgPainPoints", orgId] });
      qc.invalidateQueries({ queryKey: ["orgIntelligenceSummary", orgId] });
    },
  });
}

export function useApprovePainPoint(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ painPointId, reviewNote }: { painPointId: string; reviewNote?: string }) =>
      apiFetch(`/organizations/${orgId}/pain-points/${painPointId}/approve`, { method: "POST", body: JSON.stringify({ reviewNote: reviewNote ?? null }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgPainPoints", orgId] });
      qc.invalidateQueries({ queryKey: ["orgIntelligenceSummary", orgId] });
      qc.invalidateQueries({ queryKey: ["orgOpportunityScore", orgId] });
    },
  });
}

export function useRejectPainPoint(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ painPointId, reviewNote }: { painPointId: string; reviewNote?: string }) =>
      apiFetch(`/organizations/${orgId}/pain-points/${painPointId}/reject`, { method: "POST", body: JSON.stringify({ reviewNote: reviewNote ?? null }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgPainPoints", orgId] });
      qc.invalidateQueries({ queryKey: ["orgIntelligenceSummary", orgId] });
      qc.invalidateQueries({ queryKey: ["orgOpportunityScore", orgId] });
    },
  });
}

export function useComputeIntelligenceSummary(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch(`/organizations/${orgId}/compute-intelligence-summary`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orgIntelligenceSummary", orgId] });
      qc.invalidateQueries({ queryKey: ["organization", orgId] });
    },
  });
}

export interface CaptureNormalized {
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string;
  email: string;
  emailDomain: string;
}

export interface CaptureDuplicate {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  organizationId: string | null;
  matchReason: "email" | "phone" | "name";
}

export function useCaptureNormalize() {
  return useMutation<
    { normalized: CaptureNormalized; duplicate: CaptureDuplicate | null },
    ApiError,
    { name?: string; firstName?: string; lastName?: string; phone?: string; email?: string }
  >({
    mutationFn: (data) => apiFetch("/capture/normalize", { method: "POST", body: JSON.stringify(data) }),
  });
}

export function useCaptureContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      apiFetch("/capture/contact", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contacts"] });
      qc.invalidateQueries({ queryKey: ["organizations"] });
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}

export function useCapturePlay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { contactId: string; playType: string }) =>
      apiFetch("/capture/play", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["opportunities"] });
      qc.invalidateQueries({ queryKey: ["activities"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
}
