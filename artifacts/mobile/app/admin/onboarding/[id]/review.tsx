import React, { useState, useEffect } from "react";
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

type DecisionAction = "approved" | "edited" | "rejected";

interface Decision {
  action: DecisionAction;
  value?: unknown;
}

interface SessionData {
  session: {
    id: string;
    status: string;
    clientType: string;
    intakePayload: Record<string, unknown>;
    normalizedRecommendation: Record<string, unknown> | null;
    adminDecisions: Record<string, Decision> | null;
    grokConfidence: number | null;
  };
}

const SECTION_KEYS = [
  "vertical", "subVertical", "clientType", "serviceLines",
  "pipelineTemplates", "contactRoles", "suggestedTags", "addOns",
];

const SECTION_META: Record<string, { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string }> = {
  vertical: { label: "Vertical", icon: "layers", color: COLORS.amber },
  subVertical: { label: "Sub-Vertical", icon: "git-branch", color: COLORS.amber },
  clientType: { label: "Client Type", icon: "user", color: COLORS.cyan },
  serviceLines: { label: "Service Lines", icon: "briefcase", color: COLORS.emerald },
  pipelineTemplates: { label: "Pipeline Templates", icon: "git-merge", color: COLORS.blue },
  contactRoles: { label: "Contact Roles", icon: "users", color: COLORS.purple },
  suggestedTags: { label: "Suggested Tags", icon: "tag", color: COLORS.textDim },
  addOns: { label: "Add-Ons", icon: "plus-square", color: COLORS.cyan },
};

function decisionColor(action?: DecisionAction): string {
  if (action === "approved") return COLORS.emerald;
  if (action === "edited") return COLORS.amber;
  if (action === "rejected") return COLORS.red;
  return COLORS.textDim;
}

function decisionLabel(action?: DecisionAction): string {
  if (action === "approved") return "Approved";
  if (action === "edited") return "Edited";
  if (action === "rejected") return "Rejected";
  return "Pending";
}

function valuePreview(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .slice(0, 3)
      .map(v => {
        if (typeof v === "object" && v !== null) {
          const obj = v as Record<string, unknown>;
          return String(obj.label ?? obj.key ?? obj.name ?? "?");
        }
        return String(v);
      })
      .join(", ") + (value.length > 3 ? ` +${value.length - 3}` : "");
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return String(obj.label ?? obj.key ?? obj.value ?? JSON.stringify(value));
  }
  return String(value);
}

interface EditModalProps {
  sectionKey: string;
  currentValue: unknown;
  onClose: () => void;
  onSave: (value: string) => void;
}

function EditModal({ sectionKey, currentValue, onClose, onSave }: EditModalProps) {
  const [text, setText] = useState(
    typeof currentValue === "object"
      ? JSON.stringify(currentValue, null, 2)
      : String(currentValue ?? "")
  );

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edit {SECTION_META[sectionKey]?.label ?? sectionKey}
              </Text>
              <TouchableOpacity onPress={onClose}>
                <Feather name="x" size={20} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
            <Text style={styles.editHint}>
              Edit the JSON value below. Arrays of objects must preserve the same shape.
            </Text>
            <TextInput
              style={styles.editInput}
              value={text}
              onChangeText={setText}
              multiline
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.saveEditBtn}
              onPress={() => { onSave(text); onClose(); }}
            >
              <Text style={styles.saveEditBtnText}>Save Edit</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default function ReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});

  const { data, isLoading, refetch, isRefetching } = useQuery<SessionData>({
    queryKey: ["adminOnboardingSession", id],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${id}`),
    enabled: isAdminAuthenticated && !!id,
  });

  useEffect(() => {
    if (data?.session.adminDecisions && Object.keys(decisions).length === 0) {
      setDecisions(data.session.adminDecisions as Record<string, Decision>);
    }
  }, [data?.session.adminDecisions]);

  const saveMutation = useMutation({
    mutationFn: (patch: Record<string, Decision>) =>
      adminFetch(`/admin/onboarding/sessions/${id}/decisions`, {
        method: "PATCH",
        body: JSON.stringify({ decisions: patch }),
      }),
  });

  const lockMutation = useMutation({
    mutationFn: () =>
      adminFetch(`/admin/onboarding/sessions/${id}/lock`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] });
      router.replace(`/admin/onboarding/${d.session.id}/provision` as Href);
    },
  });

  const session = data?.session;
  const rec = session?.normalizedRecommendation as Record<string, unknown> | null;

  function getDecision(key: string): Decision | undefined {
    return decisions[key];
  }

  function setDecision(key: string, action: DecisionAction, value?: unknown) {
    const d = { action, ...(value !== undefined ? { value } : {}) };
    const updated = { ...decisions, [key]: d };
    setDecisions(updated);
    saveMutation.mutate(updated);
  }

  const hasRejected = SECTION_KEYS.some(k => decisions[k]?.action === "rejected");
  const canProvision = session?.status === "REVIEW" && !lockMutation.isPending;

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Onboarding", href: "/admin/onboarding" as Href },
        { label: session?.intakePayload?.clientName as string ?? "Session", href: `/admin/onboarding/${id}` as Href },
        { label: "Review" },
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
        ) : !rec ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={28} color={COLORS.amber} />
            <Text style={styles.stateText}>No recommendation available. Generate one first.</Text>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => router.back()}
            >
              <Text style={styles.backBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.pageHint}>
              Review each section of the AI recommendation. Approve, edit, or reject each one, then apply the configuration.
            </Text>

            {SECTION_KEYS.filter(k => rec[k] != null).map(key => {
              const meta = SECTION_META[key] ?? { label: key, icon: "box" as const, color: COLORS.textDim };
              const decision = getDecision(key);
              const dc = decisionColor(decision?.action);
              const rawValue = rec[key];
              const displayValue = decision?.action === "edited" ? decision.value : rawValue;

              return (
                <View key={key} style={[styles.card, { borderColor: dc + "44" }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.cardIcon, { backgroundColor: meta.color + "18" }]}>
                      <Feather name={meta.icon as any} size={16} color={meta.color} />
                    </View>
                    <Text style={[styles.cardTitle, { color: meta.color }]}>{meta.label}</Text>
                    <View style={[styles.decisionBadge, { backgroundColor: dc + "22" }]}>
                      <Text style={[styles.decisionBadgeText, { color: dc }]}>
                        {decisionLabel(decision?.action)}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.cardValue} numberOfLines={3}>
                    {valuePreview(displayValue)}
                  </Text>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      style={[styles.actionBtn, decision?.action === "approved" && { backgroundColor: COLORS.emerald + "22", borderColor: COLORS.emerald }]}
                      onPress={() => setDecision(key, "approved")}
                      disabled={saveMutation.isPending}
                    >
                      <Feather name="check" size={14} color={COLORS.emerald} />
                      <Text style={[styles.actionBtnText, { color: COLORS.emerald }]}>Approve</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, decision?.action === "edited" && { backgroundColor: COLORS.amber + "22", borderColor: COLORS.amber }]}
                      onPress={() => setEditKey(key)}
                      disabled={saveMutation.isPending}
                    >
                      <Feather name="edit-2" size={14} color={COLORS.amber} />
                      <Text style={[styles.actionBtnText, { color: COLORS.amber }]}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, decision?.action === "rejected" && { backgroundColor: COLORS.red + "22", borderColor: COLORS.red }]}
                      onPress={() => setDecision(key, "rejected")}
                      disabled={saveMutation.isPending}
                    >
                      <Feather name="x" size={14} color={COLORS.red} />
                      <Text style={[styles.actionBtnText, { color: COLORS.red }]}>Reject</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            {hasRejected && (
              <View style={styles.warningBox}>
                <Feather name="alert-triangle" size={14} color={COLORS.red} />
                <Text style={styles.warningText}>
                  Some sections are rejected. "Apply and Provision" is disabled until all rejections are resolved.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.provisionBtn,
                (hasRejected || !canProvision) && styles.provisionBtnDisabled,
              ]}
              onPress={() => lockMutation.mutate()}
              disabled={hasRejected || !canProvision || lockMutation.isPending}
            >
              {lockMutation.isPending ? (
                <ActivityIndicator size="small" color={COLORS.navyDark} />
              ) : (
                <>
                  <Feather name="zap" size={16} color={COLORS.navyDark} />
                  <Text style={styles.provisionBtnText}>Apply and Provision</Text>
                </>
              )}
            </TouchableOpacity>

            {lockMutation.isError && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={COLORS.red} />
                <Text style={styles.errorText}>
                  {String((lockMutation.error as Error)?.message ?? "Failed to lock session")}
                </Text>
              </View>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {editKey && rec && (
        <EditModal
          sectionKey={editKey}
          currentValue={decisions[editKey]?.action === "edited" ? decisions[editKey].value : rec[editKey]}
          onClose={() => setEditKey(null)}
          onSave={(text) => {
            try {
              const parsed = JSON.parse(text);
              setDecision(editKey, "edited", parsed);
            } catch {
              setDecision(editKey, "edited", text);
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  center: { alignItems: "center", paddingTop: 60, gap: 12 },
  stateText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  backBtn: { borderRadius: 20, borderWidth: 1, borderColor: COLORS.amber, paddingHorizontal: 16, paddingVertical: 8 },
  backBtnText: { color: COLORS.amber, fontSize: 13, fontFamily: "Inter_600SemiBold" },

  pageHint: {
    color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular",
    marginBottom: 16, lineHeight: 18,
  },

  card: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    padding: 14, marginBottom: 10,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  cardIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  decisionBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  decisionBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  cardValue: { color: COLORS.text, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 12, lineHeight: 18 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingVertical: 7,
  },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  warningBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    padding: 12, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.red + "44", backgroundColor: COLORS.red + "11", marginBottom: 12,
  },
  warningText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  provisionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 14,
  },
  provisionBtnDisabled: { opacity: 0.4 },
  provisionBtnText: { color: COLORS.navyDark, fontSize: 15, fontFamily: "Inter_700Bold" },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.red + "44", backgroundColor: COLORS.red + "11",
  },
  errorText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-end" },
  modalWrap: { width: "100%" },
  modalSheet: {
    backgroundColor: COLORS.navyCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
  },
  modalTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_700Bold" },
  editHint: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 },
  editInput: {
    backgroundColor: COLORS.navyDark, color: COLORS.text, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 12, fontFamily: "Inter_400Regular", minHeight: 160,
    textAlignVertical: "top",
  },
  saveEditBtn: {
    backgroundColor: COLORS.amber, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 12,
  },
  saveEditBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_700Bold" },
});
