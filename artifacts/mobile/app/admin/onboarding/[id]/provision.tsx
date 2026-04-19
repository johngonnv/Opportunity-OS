import React, { useEffect, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

type StepStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "SKIPPED";

interface ProvisioningStep {
  id: string;
  sessionId: string;
  stepKey: string;
  status: StepStatus;
  startedAt: string | null;
  completedAt: string | null;
  errorMessage: string | null;
  result: Record<string, unknown> | null;
  attemptCount: number;
}

interface SessionData {
  session: {
    id: string;
    status: string;
    clientType: string;
    intakePayload: Record<string, unknown>;
    createdWorkspaceId: string | null;
  };
  steps: ProvisioningStep[];
}

const STEP_LABELS: Record<string, string> = {
  CREATE_WORKSPACE: "Create Workspace",
  ASSIGN_PLAN: "Assign Plan",
  CREATE_MEMBERSHIPS: "Create Memberships",
  APPLY_VERTICAL_CONFIG: "Apply Vertical Config",
  ENABLE_SERVICE_LINES: "Enable Service Lines",
  ENABLE_ADD_ONS: "Enable Add-Ons",
  PUBLISH_PIPELINE_TEMPLATES: "Publish Pipeline Templates",
  SEED_CONTACT_ROLES: "Seed Contact Roles",
  SEED_TAGS: "Seed Tags",
  SEED_SAVED_VIEWS: "Seed Saved Views",
  SEED_DEFAULT_TASKS: "Seed Default Tasks",
  SEED_ALERTS: "Seed Alerts",
  CREATE_LAUNCH_CHECKLIST: "Create Launch Checklist",
  SEND_INVITE_EMAILS: "Send Invite Emails",
  RECORD_AUDIT_ENTRY: "Record Audit Entry",
  SNAPSHOT_HEALTH_BASELINE: "Snapshot Health Baseline",
};

const STEP_ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  CREATE_WORKSPACE: "home",
  ASSIGN_PLAN: "credit-card",
  CREATE_MEMBERSHIPS: "users",
  APPLY_VERTICAL_CONFIG: "sliders",
  ENABLE_SERVICE_LINES: "briefcase",
  ENABLE_ADD_ONS: "plus-square",
  PUBLISH_PIPELINE_TEMPLATES: "git-merge",
  SEED_CONTACT_ROLES: "user-check",
  SEED_TAGS: "tag",
  SEED_SAVED_VIEWS: "bookmark",
  SEED_DEFAULT_TASKS: "list",
  SEED_ALERTS: "bell",
  CREATE_LAUNCH_CHECKLIST: "check-square",
  SEND_INVITE_EMAILS: "mail",
  RECORD_AUDIT_ENTRY: "file-text",
  SNAPSHOT_HEALTH_BASELINE: "activity",
};

function stepStatusColor(s: StepStatus): string {
  switch (s) {
    case "COMPLETED": return COLORS.emerald;
    case "IN_PROGRESS": return COLORS.cyan;
    case "FAILED": return COLORS.red;
    case "SKIPPED": return COLORS.textDim;
    default: return COLORS.navyBorder;
  }
}

function stepStatusIcon(s: StepStatus): React.ComponentProps<typeof Feather>["name"] {
  switch (s) {
    case "COMPLETED": return "check-circle";
    case "IN_PROGRESS": return "loader";
    case "FAILED": return "x-circle";
    case "SKIPPED": return "minus-circle";
    default: return "circle";
  }
}

export default function ProvisionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const prevStatus = useRef<string | undefined>(undefined);

  const { data, isLoading, refetch, isRefetching } = useQuery<SessionData>({
    queryKey: ["adminOnboardingSession", id],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${id}`),
    enabled: isAdminAuthenticated && !!id,
    refetchInterval: (query) => {
      const d = (query.state.data as SessionData | undefined);
      const status = d?.session?.status;
      return (status === "LOCKED" || status === "PROVISIONING") ? 2000 : false;
    },
  });

  const provisionMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/admin/onboarding/sessions/${id}/provision`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] });
    },
  });

  const retryMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/admin/onboarding/sessions/${id}/retry`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] });
    },
  });

  const session = data?.session;
  const steps = data?.steps ?? [];

  const isProvisioning = session?.status === "PROVISIONING" || session?.status === "LOCKED";
  const isProvisioned = session?.status === "PROVISIONED";
  const isFailed = session?.status === "FAILED";
  const hasFailed = steps.some(s => s.status === "FAILED");

  const completedCount = steps.filter(s => s.status === "COMPLETED").length;
  const totalCount = steps.length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  useEffect(() => {
    if (session?.status && prevStatus.current !== session.status) {
      prevStatus.current = session.status;
    }
  }, [session?.status]);

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Onboarding", href: "/admin/onboarding" as Href },
        { label: session?.intakePayload?.clientName as string ?? "Session", href: `/admin/onboarding/${id}` as Href },
        { label: "Provisioning" },
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
        ) : (
          <>
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, {
                  backgroundColor: isProvisioned ? COLORS.emerald :
                    isFailed ? COLORS.red :
                    isProvisioning ? COLORS.cyan : COLORS.amber,
                }]} />
                <Text style={[styles.statusText, {
                  color: isProvisioned ? COLORS.emerald :
                    isFailed ? COLORS.red :
                    isProvisioning ? COLORS.cyan : COLORS.amber,
                }]}>
                  {session?.status?.replace(/_/g, " ") ?? "—"}
                </Text>
                {isProvisioning && <ActivityIndicator size="small" color={COLORS.cyan} style={{ marginLeft: 8 }} />}
              </View>

              {totalCount > 0 && (
                <View style={styles.progressWrap}>
                  <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
                  </View>
                  <Text style={styles.progressText}>{completedCount} / {totalCount} steps</Text>
                </View>
              )}

              {isProvisioned && session?.createdWorkspaceId && (
                <View style={styles.provisionedActions}>
                  <TouchableOpacity
                    style={styles.workspaceBtn}
                    onPress={() => router.push(`/admin/workspaces/${session.createdWorkspaceId}` as Href)}
                  >
                    <Feather name="external-link" size={14} color={COLORS.emerald} />
                    <Text style={styles.workspaceBtnText}>View Workspace</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.launchDay1Btn}
                    onPress={() => router.push(`/workspace/${session.createdWorkspaceId}/launch` as Href)}
                  >
                    <Feather name="zap" size={14} color={COLORS.navyDark} />
                    <Text style={styles.launchDay1BtnText}>Initialize Day 1 & Launch</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {session?.status === "LOCKED" && (
              <View style={styles.autoStartBanner}>
                <ActivityIndicator size="small" color={COLORS.cyan} />
                <Text style={styles.autoStartText}>
                  Provisioning is starting automatically… this screen updates live.
                </Text>
              </View>
            )}

            {isFailed && (
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => retryMutation.mutate()}
                disabled={retryMutation.isPending}
              >
                {retryMutation.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.amber} />
                ) : (
                  <>
                    <Feather name="refresh-cw" size={16} color={COLORS.amber} />
                    <Text style={styles.retryBtnText}>Retry Failed Steps</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {(provisionMutation.isError || retryMutation.isError) && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={COLORS.red} />
                <Text style={styles.errorText}>
                  {String((provisionMutation.error || retryMutation.error as Error)?.message ?? "An error occurred")}
                </Text>
              </View>
            )}

            {steps.length > 0 && (
              <View style={styles.timeline}>
                {steps.map((step, idx) => {
                  const isLast = idx === steps.length - 1;
                  const sc = stepStatusColor(step.status);
                  const si = stepStatusIcon(step.status);
                  return (
                    <View key={step.id} style={styles.timelineRow}>
                      <View style={styles.timelineLeft}>
                        <View style={[styles.timelineIconWrap, { backgroundColor: sc + "22", borderColor: sc + "55" }]}>
                          {step.status === "IN_PROGRESS" ? (
                            <ActivityIndicator size="small" color={sc} />
                          ) : (
                            <Feather name={si} size={14} color={sc} />
                          )}
                        </View>
                        {!isLast && <View style={[styles.timelineLine, { backgroundColor: sc + "33" }]} />}
                      </View>
                      <View style={styles.timelineContent}>
                        <View style={styles.timelineHeader}>
                          <Feather name={STEP_ICONS[step.stepKey] ?? "box"} size={13} color={COLORS.textDim} />
                          <Text style={styles.timelineLabel}>
                            {STEP_LABELS[step.stepKey] ?? step.stepKey}
                          </Text>
                          {step.attemptCount > 1 && (
                            <View style={styles.attemptBadge}>
                              <Text style={styles.attemptBadgeText}>×{step.attemptCount}</Text>
                            </View>
                          )}
                        </View>
                        {step.status === "FAILED" && step.errorMessage && (
                          <Text style={styles.errorMsg} numberOfLines={2}>{step.errorMessage}</Text>
                        )}
                        {step.status === "COMPLETED" && step.result && Object.keys(step.result).length > 0 && (
                          <Text style={styles.resultMsg} numberOfLines={1}>
                            {Object.entries(step.result).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(" · ")}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {steps.length === 0 && !isLoading && (
              <View style={styles.center}>
                <Feather name="loader" size={28} color={COLORS.textDim} />
                <Text style={styles.stateText}>No provisioning steps yet.</Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  center: { alignItems: "center", paddingTop: 60, gap: 12 },
  stateText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },

  statusCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 16, marginBottom: 14,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.8 },

  progressWrap: { gap: 6 },
  progressBar: {
    height: 6, backgroundColor: COLORS.navyDark, borderRadius: 3, overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: COLORS.emerald, borderRadius: 3 },
  progressText: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },

  provisionedActions: {
    marginTop: 14, gap: 10,
  },
  workspaceBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
  },
  workspaceBtnText: { color: COLORS.emerald, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  launchDay1Btn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.amber, borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 20, alignSelf: "stretch",
  },
  launchDay1BtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_700Bold" },

  autoStartBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.cyan + "11", borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.cyan + "55",
    paddingVertical: 12, paddingHorizontal: 14, marginBottom: 14,
  },
  autoStartText: { color: COLORS.cyan, fontSize: 13, flex: 1 },

  retryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, borderWidth: 1, borderColor: COLORS.amber + "55",
    backgroundColor: COLORS.amber + "11", paddingVertical: 13, marginBottom: 14,
  },
  retryBtnText: { color: COLORS.amber, fontSize: 14, fontFamily: "Inter_600SemiBold" },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginBottom: 14, padding: 12, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.red + "44", backgroundColor: COLORS.red + "11",
  },
  errorText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  timeline: { gap: 0 },
  timelineRow: { flexDirection: "row", gap: 12 },
  timelineLeft: { alignItems: "center", width: 32 },
  timelineIconWrap: {
    width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center",
    borderWidth: 1,
  },
  timelineLine: { flex: 1, width: 2, minHeight: 16, marginVertical: 2 },
  timelineContent: {
    flex: 1, paddingBottom: 16, paddingTop: 4,
  },
  timelineHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  timelineLabel: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  attemptBadge: {
    backgroundColor: COLORS.amber + "22", borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  attemptBadgeText: { color: COLORS.amber, fontSize: 10, fontFamily: "Inter_700Bold" },
  errorMsg: { color: COLORS.red, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  resultMsg: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
});
