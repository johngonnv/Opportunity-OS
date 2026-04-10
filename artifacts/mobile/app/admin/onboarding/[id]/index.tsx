import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

interface ProvisioningStep {
  id: string;
  stepKey: string;
  status: string;
  errorMessage: string | null;
  completedAt: string | null;
}

interface SessionData {
  session: {
    id: string;
    status: string;
    clientType: string;
    intakePayload: Record<string, unknown>;
    normalizedRecommendation: Record<string, unknown> | null;
    appliedConfig: Record<string, unknown> | null;
    adminDecisions: Record<string, unknown> | null;
    grokConfidence: number | null;
    grokModelVersion: string | null;
    notes: string | null;
    createdWorkspaceId: string | null;
    createdFromPresetId: string | null;
    createdAt: string;
    updatedAt: string;
    normalizedAt: string | null;
    lockedAt: string | null;
  };
  steps: ProvisioningStep[];
}

interface AuditEntry {
  id: string;
  workspaceId: string;
  changedByUserId: string | null;
  changedAt: string;
  action: string;
  objectType: string | null;
  objectId: string | null;
  newValue: Record<string, unknown> | null;
}

interface AuditData {
  entries: AuditEntry[];
}

function statusColor(s: string): string {
  switch (s) {
    case "INTAKE": return COLORS.textDim;
    case "AWAITING_RECOMMENDATION":
    case "NORMALIZING": return COLORS.cyan;
    case "REVIEW": return COLORS.amber;
    case "LOCKED": return COLORS.amber;
    case "PROVISIONING": return COLORS.blue;
    case "PROVISIONED": return COLORS.emerald;
    case "FAILED": return COLORS.red;
    default: return COLORS.textDim;
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "INTAKE": return "Intake";
    case "AWAITING_RECOMMENDATION": return "Awaiting AI";
    case "NORMALIZING": return "Normalizing";
    case "REVIEW": return "Review";
    case "LOCKED": return "Locked";
    case "PROVISIONING": return "Provisioning";
    case "PROVISIONED": return "Provisioned";
    case "FAILED": return "Failed";
    default: return s;
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function KVRow({ label, value }: { label: string; value?: unknown }) {
  if (value == null || value === "") return null;
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>
        {typeof value === "object" ? JSON.stringify(value) : String(value)}
      </Text>
    </View>
  );
}

interface SavePresetModalProps {
  onClose: () => void;
  onSave: (name: string, description: string) => void;
  isSaving: boolean;
}

function SavePresetModal({ onClose, onSave, isSaving }: SavePresetModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Save as Preset</Text>
              <TouchableOpacity onPress={onClose}>
                <Feather name="x" size={20} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Create a reusable preset from this session's configuration so future clients can skip the intake form.
            </Text>
            <TextInput
              style={styles.modalInput}
              value={name}
              onChangeText={setName}
              placeholder="Preset name, e.g. Healthcare Enterprise"
              placeholderTextColor={COLORS.textDim}
              autoFocus
            />
            <TextInput
              style={[styles.modalInput, { marginTop: 10, minHeight: 72, textAlignVertical: "top" }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Short description (optional)"
              placeholderTextColor={COLORS.textDim}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.savePresetBtn, (!name.trim() || isSaving) && styles.btnDisabled]}
                onPress={() => onSave(name.trim(), description.trim())}
                disabled={!name.trim() || isSaving}
              >
                {isSaving ? <ActivityIndicator size="small" color={COLORS.navyDark} /> : (
                  <>
                    <Feather name="package" size={14} color={COLORS.navyDark} />
                    <Text style={styles.savePresetBtnText}>Save Preset</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [showConfig, setShowConfig] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<SessionData>({
    queryKey: ["adminOnboardingSession", id],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${id}`),
    enabled: isAdminAuthenticated && !!id,
  });

  const { data: auditData } = useQuery<AuditData>({
    queryKey: ["adminOnboardingAudit", id],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${id}/audit`),
    enabled: isAdminAuthenticated && !!id && showAudit,
  });

  const regenMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/admin/onboarding/sessions/${id}/recommend`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] });
      router.push(`/admin/onboarding/${id}/recommend` as Href);
    },
  });

  const savePresetMutation = useMutation({
    mutationFn: ({ name, description }: { name: string; description: string }) =>
      adminFetch("/admin/onboarding/presets", {
        method: "POST",
        body: JSON.stringify({ sessionId: id, name, description }),
      }),
    onSuccess: () => {
      setShowSavePreset(false);
      qc.invalidateQueries({ queryKey: ["adminOnboardingPresets"] });
    },
  });

  const session = data?.session;
  const steps = data?.steps ?? [];
  const sc = statusColor(session?.status ?? "");
  const intake = session?.intakePayload as Record<string, unknown> ?? {};

  function getNavTarget(): Href | null {
    if (!session) return null;
    switch (session.status) {
      case "INTAKE": return `/admin/onboarding/${id}/recommend` as Href;
      case "REVIEW": return `/admin/onboarding/${id}/review` as Href;
      case "LOCKED": return `/admin/onboarding/${id}/provision` as Href;
      case "PROVISIONING": return `/admin/onboarding/${id}/provision` as Href;
      case "PROVISIONED": return `/admin/onboarding/${id}/provision` as Href;
      case "FAILED": return `/admin/onboarding/${id}/provision` as Href;
      default: return null;
    }
  }

  const navTarget = getNavTarget();

  const completedSteps = steps.filter(s => s.status === "COMPLETED").length;
  const failedSteps = steps.filter(s => s.status === "FAILED").length;

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Onboarding", href: "/admin/onboarding" as Href },
        { label: String(intake.clientName ?? "Session") },
      ]} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={refetch}
            tintColor={COLORS.amber}
          />
        }
      >
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>
        ) : !session ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={28} color={COLORS.red} />
            <Text style={styles.stateText}>Session not found.</Text>
          </View>
        ) : (
          <>
            <View style={styles.headerCard}>
              <View style={styles.headerTop}>
                <View>
                  <Text style={styles.clientName}>{String(intake.clientName ?? "Unnamed Client")}</Text>
                  <Text style={styles.clientMeta}>{session.clientType} · Created {fmtDate(session.createdAt)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: sc + "22", borderColor: sc + "44" }]}>
                  <Text style={[styles.statusBadgeText, { color: sc }]}>{statusLabel(session.status)}</Text>
                </View>
              </View>

              {session.grokConfidence != null && (
                <View style={styles.confRow}>
                  <Feather name="cpu" size={12} color={COLORS.textDim} />
                  <Text style={styles.confText}>
                    AI confidence: {Math.round(session.grokConfidence * 100)}%
                    {session.grokModelVersion ? ` · ${session.grokModelVersion}` : ""}
                  </Text>
                </View>
              )}

              {steps.length > 0 && (
                <View style={styles.stepsRow}>
                  <Text style={styles.stepsText}>
                    {completedSteps}/{steps.length} steps completed
                    {failedSteps > 0 ? ` · ${failedSteps} failed` : ""}
                  </Text>
                  <View style={styles.miniBar}>
                    <View style={[styles.miniBarFill, {
                      width: `${steps.length > 0 ? Math.round(completedSteps / steps.length * 100) : 0}%`,
                      backgroundColor: failedSteps > 0 ? COLORS.red : COLORS.emerald,
                    }]} />
                  </View>
                </View>
              )}
            </View>

            {navTarget && (
              <TouchableOpacity
                style={[styles.primaryAction, regenMutation.isPending && { opacity: 0.7 }]}
                onPress={() => {
                  if (session.status === "INTAKE") {
                    regenMutation.mutate();
                  } else {
                    router.push(navTarget);
                  }
                }}
                disabled={regenMutation.isPending}
              >
                {regenMutation.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.navyDark} />
                ) : (
                  <Feather name="arrow-right-circle" size={18} color={COLORS.navyDark} />
                )}
                <Text style={styles.primaryActionText}>
                  {session.status === "INTAKE" ? (regenMutation.isPending ? "Generating…" : "Generate Recommendation") :
                   session.status === "REVIEW" ? "Go to Review" :
                   session.status === "LOCKED" ? "Start Provisioning" :
                   session.status === "PROVISIONED" ? "View Provisioning" :
                   session.status === "FAILED" ? "Retry Provisioning" :
                   "Continue →"}
                </Text>
              </TouchableOpacity>
            )}

            <View style={styles.actionsGrid}>
              {session.status === "INTAKE" && (
                <TouchableOpacity
                  style={styles.gridBtn}
                  onPress={() => router.push(`/admin/onboarding/new?editId=${id}` as Href)}
                >
                  <Feather name="edit-3" size={14} color={COLORS.textDim} />
                  <Text style={[styles.gridBtnText, { color: COLORS.textDim }]}>Edit Intake</Text>
                </TouchableOpacity>
              )}
              {(session.status === "AWAITING_RECOMMENDATION" || session.status === "NORMALIZING" || session.status === "REVIEW") && (
                <TouchableOpacity
                  style={styles.gridBtn}
                  onPress={() => router.push(`/admin/onboarding/${id}/recommend` as Href)}
                >
                  <Feather name="eye" size={14} color={COLORS.cyan} />
                  <Text style={[styles.gridBtnText, { color: COLORS.cyan }]}>View Recommendation</Text>
                </TouchableOpacity>
              )}
              {session.status === "REVIEW" && (
                <TouchableOpacity
                  style={[styles.gridBtn, regenMutation.isPending && styles.gridBtnDisabled]}
                  onPress={() => regenMutation.mutate()}
                  disabled={regenMutation.isPending}
                >
                  {regenMutation.isPending ? (
                    <ActivityIndicator size="small" color={COLORS.amber} />
                  ) : (
                    <Feather name="refresh-cw" size={14} color={COLORS.amber} />
                  )}
                  <Text style={[styles.gridBtnText, { color: COLORS.amber }]}>Re-generate</Text>
                </TouchableOpacity>
              )}
              {session.status === "REVIEW" && (
                <TouchableOpacity
                  style={styles.gridBtn}
                  onPress={() => router.push(`/admin/onboarding/${id}/review` as Href)}
                >
                  <Feather name="check-square" size={14} color={COLORS.amber} />
                  <Text style={[styles.gridBtnText, { color: COLORS.amber }]}>Review Decisions</Text>
                </TouchableOpacity>
              )}
              {session.status === "PROVISIONED" && (
                <TouchableOpacity
                  style={styles.gridBtn}
                  onPress={() => setShowSavePreset(true)}
                >
                  <Feather name="package" size={14} color={COLORS.purple} />
                  <Text style={[styles.gridBtnText, { color: COLORS.purple }]}>Save as Preset</Text>
                </TouchableOpacity>
              )}
              {session.status === "FAILED" && (
                <TouchableOpacity
                  style={styles.gridBtn}
                  onPress={() => router.push(`/admin/onboarding/${id}/provision` as Href)}
                >
                  <Feather name="rotate-ccw" size={14} color={COLORS.red} />
                  <Text style={[styles.gridBtnText, { color: COLORS.red }]}>Retry Provisioning</Text>
                </TouchableOpacity>
              )}
              {session.createdWorkspaceId && (
                <TouchableOpacity
                  style={styles.gridBtn}
                  onPress={() => router.push(`/admin/workspaces/${session.createdWorkspaceId}` as Href)}
                >
                  <Feather name="home" size={14} color={COLORS.emerald} />
                  <Text style={[styles.gridBtnText, { color: COLORS.emerald }]}>View Workspace</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.sectionLabel}>Intake Data</Text>
            <View style={styles.infoCard}>
              {Object.entries(intake).map(([k, v]) => (
                <KVRow key={k} label={k} value={v} />
              ))}
              {session.notes ? <KVRow label="notes" value={session.notes} /> : null}
            </View>

            {session.appliedConfig && (
              <>
                <TouchableOpacity
                  style={styles.collapsibleHeader}
                  onPress={() => setShowConfig(o => !o)}
                >
                  <Text style={styles.sectionLabel}>Applied Config</Text>
                  <Feather name={showConfig ? "chevron-up" : "chevron-down"} size={16} color={COLORS.textDim} />
                </TouchableOpacity>
                {showConfig && (
                  <View style={styles.infoCard}>
                    {Object.entries(session.appliedConfig).map(([k, v]) => (
                      <KVRow key={k} label={k} value={v} />
                    ))}
                  </View>
                )}
              </>
            )}

            {steps.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>Provisioning Steps</Text>
                <View style={styles.stepsCard}>
                  {steps.map(step => (
                    <View key={step.id} style={styles.stepRow}>
                      <Feather
                        name={step.status === "COMPLETED" ? "check-circle" : step.status === "FAILED" ? "x-circle" : "circle"}
                        size={14}
                        color={step.status === "COMPLETED" ? COLORS.emerald : step.status === "FAILED" ? COLORS.red : COLORS.textDim}
                      />
                      <Text style={[
                        styles.stepLabel,
                        step.status === "FAILED" && { color: COLORS.red },
                      ]}>
                        {step.stepKey.replace(/_/g, " ")}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            <TouchableOpacity
              style={[styles.collapsibleHeader, { marginTop: 16 }]}
              onPress={() => setShowAudit(o => !o)}
            >
              <Text style={styles.sectionLabel}>Audit Trail</Text>
              <Feather name={showAudit ? "chevron-up" : "chevron-down"} size={16} color={COLORS.textDim} />
            </TouchableOpacity>

            {showAudit && (
              <View style={styles.auditList}>
                {(auditData?.entries ?? []).length === 0 ? (
                  <Text style={styles.emptyText}>No audit entries yet.</Text>
                ) : (
                  (auditData?.entries ?? []).map(e => (
                    <View key={e.id} style={styles.auditRow}>
                      <Text style={styles.auditAction}>{e.action}</Text>
                      <Text style={styles.auditDate}>{fmtDate(e.changedAt)}</Text>
                    </View>
                  ))
                )}
              </View>
            )}

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>

      {showSavePreset && (
        <SavePresetModal
          onClose={() => setShowSavePreset(false)}
          onSave={(name, description) => savePresetMutation.mutate({ name, description })}
          isSaving={savePresetMutation.isPending}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  center: { alignItems: "center", paddingTop: 60, gap: 12 },
  stateText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },

  headerCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 16, marginBottom: 14,
  },
  headerTop: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    marginBottom: 10,
  },
  clientName: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  clientMeta: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBadge: {
    borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  confRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 10 },
  confText: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },
  stepsRow: { gap: 4 },
  stepsText: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  miniBar: { height: 4, backgroundColor: COLORS.navyDark, borderRadius: 2, overflow: "hidden" },
  miniBarFill: { height: "100%", borderRadius: 2 },

  primaryAction: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 10, backgroundColor: COLORS.amber, borderRadius: 12,
    paddingVertical: 14, marginBottom: 10,
  },
  primaryActionText: { color: COLORS.navyDark, fontSize: 15, fontFamily: "Inter_700Bold" },

  actionsGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20,
  },
  gridBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyCard, paddingHorizontal: 12, paddingVertical: 8,
  },
  gridBtnDisabled: { opacity: 0.5 },
  gridBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  sectionLabel: {
    color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8,
  },
  collapsibleHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  infoCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 14, gap: 2, marginBottom: 4,
  },
  kvRow: { marginBottom: 8 },
  kvLabel: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 },
  kvValue: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  stepsCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 14, gap: 10,
  },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepLabel: { color: COLORS.text, fontSize: 12, fontFamily: "Inter_400Regular" },

  auditList: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 14,
  },
  auditRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  auditAction: { color: COLORS.text, fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  auditDate: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_400Regular" },
  emptyText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },

  modalOverlay: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-end" },
  modalWrap: { width: "100%" },
  modalSheet: {
    backgroundColor: COLORS.navyCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20,
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_700Bold" },
  modalHint: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 14, lineHeight: 18 },
  modalInput: {
    backgroundColor: COLORS.navyDark, color: COLORS.text, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingVertical: 12, alignItems: "center",
  },
  cancelBtnText: { color: COLORS.textDim, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  savePresetBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: COLORS.amber, borderRadius: 10, paddingVertical: 12,
  },
  savePresetBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_700Bold" },
  btnDisabled: { opacity: 0.4 },
});
