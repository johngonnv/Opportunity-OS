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

export { apiFetch, getBaseUrl, getStorageUrl, uploadImageMultipart };

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
