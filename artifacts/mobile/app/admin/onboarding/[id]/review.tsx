import React, { useState, useEffect, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, FlatList,
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
  reason?: string;
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
  "dashboards", "warningFlags",
];

const CLIENT_TYPE_OPTIONS = ["SINGLE_USER", "SMALL_TEAM", "ENTERPRISE"] as const;

const SECTION_META: Record<string, { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string }> = {
  vertical:          { label: "Vertical",            icon: "layers",         color: COLORS.amber },
  subVertical:       { label: "Sub-Vertical",         icon: "git-branch",     color: COLORS.amber },
  clientType:        { label: "Client Type",          icon: "user",           color: COLORS.cyan },
  serviceLines:      { label: "Service Lines",        icon: "briefcase",      color: COLORS.emerald },
  pipelineTemplates: { label: "Pipeline Templates",   icon: "git-merge",      color: COLORS.blue },
  contactRoles:      { label: "Contact Roles",        icon: "users",          color: COLORS.purple },
  suggestedTags:     { label: "Suggested Tags",       icon: "tag",            color: COLORS.textDim },
  addOns:            { label: "Add-Ons",              icon: "plus-square",    color: COLORS.cyan },
  dashboards:        { label: "Dashboards",           icon: "monitor",        color: COLORS.blue },
  warningFlags:      { label: "Warning Flags",        icon: "alert-triangle", color: COLORS.red },
};

function decisionColor(action?: DecisionAction): string {
  if (action === "approved") return COLORS.emerald;
  if (action === "edited")   return COLORS.amber;
  if (action === "rejected") return COLORS.red;
  return COLORS.textDim;
}

function decisionLabel(action?: DecisionAction): string {
  if (action === "approved") return "Approved";
  if (action === "edited")   return "Edited";
  if (action === "rejected") return "Rejected";
  return "Pending";
}

function valuePreview(value: unknown): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value
      .slice(0, 4)
      .map(v => {
        if (typeof v === "object" && v !== null) {
          const obj = v as Record<string, unknown>;
          return String(obj.label ?? obj.key ?? obj.name ?? "?");
        }
        return String(v);
      })
      .join(", ") + (value.length > 4 ? ` +${value.length - 4}` : "");
  }
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return String(obj.label ?? obj.key ?? obj.value ?? JSON.stringify(value));
  }
  return String(value);
}

function normalizeArrayItems(rawValue: unknown): Array<{ key: string; label: string }> {
  if (!Array.isArray(rawValue)) return [];
  return rawValue.map(v => {
    if (typeof v === "object" && v !== null) {
      const obj = v as Record<string, unknown>;
      return {
        key: String(obj.key ?? obj.id ?? obj.value ?? "?"),
        label: String(obj.label ?? obj.name ?? obj.key ?? "?"),
      };
    }
    return { key: String(v), label: String(v) };
  });
}

interface RejectModalProps {
  sectionLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

const REJECT_REASONS = [
  "Wrong vertical or sub-vertical",
  "Incorrect service lines selected",
  "Pipeline template mismatch",
  "Add-ons not applicable",
  "Client name or contact info wrong",
  "Confidence score too low — needs human review",
  "Missing required information",
  "Other",
];

function RejectModal({ sectionLabel, onClose, onConfirm }: RejectModalProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const canConfirm = selectedReason !== null;
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reject: {sectionLabel}</Text>
              <TouchableOpacity onPress={onClose}>
                <Feather name="x" size={20} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>Select a rejection reason (required):</Text>
            <ScrollView style={styles.itemList} keyboardShouldPersistTaps="handled">
              {REJECT_REASONS.map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.segmentRow, selectedReason === r && styles.segmentRowActive]}
                  onPress={() => setSelectedReason(r)}
                >
                  <Feather
                    name={selectedReason === r ? "check-circle" : "circle"}
                    size={15}
                    color={selectedReason === r ? COLORS.red : COLORS.textDim}
                  />
                  <Text style={[styles.segmentRowText, selectedReason === r && { color: COLORS.red }]}>{r}</Text>
                </TouchableOpacity>
              ))}
              <Text style={[styles.modalHint, { marginTop: 12 }]}>Additional notes (optional):</Text>
              <TextInput
                style={styles.reasonInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="Any extra context for this rejection…"
                placeholderTextColor={COLORS.textDim}
                multiline
                textAlignVertical="top"
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.rejectConfirmBtn, !canConfirm && styles.btnDisabled]}
                onPress={() => {
                  const full = notes.trim() ? `${selectedReason}: ${notes.trim()}` : selectedReason!;
                  onConfirm(full);
                  onClose();
                }}
                disabled={!canConfirm}
              >
                <Feather name="x-circle" size={14} color={COLORS.navyDark} />
                <Text style={styles.rejectConfirmBtnText}>Confirm Rejection</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

interface ConfigItem {
  id?: string;
  key: string;
  label?: string;
  name?: string;
}

const CONFIG_SINGLE_SELECT = new Set(["vertical"]);
const CONFIG_MULTI_SELECT = new Set(["serviceLines", "pipelineTemplates", "addOns"]);

function getConfigEndpoint(key: string): string | null {
  if (key === "vertical") return "/admin/onboarding/config/verticals";
  if (key === "serviceLines") return "/admin/onboarding/config/service-lines";
  if (key === "pipelineTemplates") return "/admin/onboarding/config/pipeline-templates";
  if (key === "addOns") return "/admin/onboarding/config/add-on-types";
  return null;
}

function extractConfigItems(data: unknown, key: string): ConfigItem[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  if (key === "vertical") return (d.verticals ?? []) as ConfigItem[];
  if (key === "serviceLines") return (d.serviceLines ?? []) as ConfigItem[];
  if (key === "pipelineTemplates") return (d.pipelineTemplates ?? []) as ConfigItem[];
  if (key === "addOns") return (d.addOnTypes ?? []) as ConfigItem[];
  return [];
}

interface EditModalProps {
  sectionKey: string;
  currentValue: unknown;
  onClose: () => void;
  onSave: (value: unknown) => void;
}

function EditModal({ sectionKey, currentValue, onClose, onSave }: EditModalProps) {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const isClientType = sectionKey === "clientType";
  const isSingleSelect = CONFIG_SINGLE_SELECT.has(sectionKey);
  const isMultiSelect = CONFIG_MULTI_SELECT.has(sectionKey);
  const isConfigBacked = isSingleSelect || isMultiSelect;
  const isArray = Array.isArray(currentValue) && !isConfigBacked;
  const isString = typeof currentValue === "string" && !isClientType;

  const configEndpoint = getConfigEndpoint(sectionKey);

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["reviewEditConfig", sectionKey],
    queryFn: () => adminFetch(configEndpoint!),
    enabled: isAdminAuthenticated && isConfigBacked && !!configEndpoint,
    staleTime: 60_000,
  });

  const configItems = useMemo(() => extractConfigItems(configData, sectionKey), [configData, sectionKey]);

  // Single-select: selected item ID/key
  const currentObj = typeof currentValue === "object" && currentValue !== null && !Array.isArray(currentValue)
    ? (currentValue as Record<string, unknown>)
    : null;
  const [selectedId, setSelectedId] = useState<string | null>(
    String(currentObj?.id ?? currentObj?.key ?? "")
  );

  // Multi-select: selected item IDs
  const currentIds = useMemo(() => {
    if (!Array.isArray(currentValue)) return new Set<string>();
    return new Set((currentValue as Array<Record<string, unknown>>).map(v => String(v.id ?? v.key ?? "")));
  }, [currentValue]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(currentIds);

  // Client type
  const [selectedType, setSelectedType] = useState<string>(
    isClientType
      ? String((currentValue as Record<string, unknown>)?.value ?? currentValue ?? "SMALL_TEAM")
      : "SMALL_TEAM"
  );

  // Free text array
  const [items, setItems] = useState<Array<{ key: string; label: string }>>(
    isArray ? normalizeArrayItems(currentValue) : []
  );
  const [newItemText, setNewItemText] = useState("");

  // Plain string value
  const [textValue, setTextValue] = useState(isString ? String(currentValue ?? "") : "");

  function removeItem(key: string) {
    setItems(prev => prev.filter(i => i.key !== key));
  }

  function addItem() {
    const trimmed = newItemText.trim();
    if (!trimmed) return;
    setItems(prev => [...prev, { key: trimmed.toLowerCase().replace(/\s+/g, "_"), label: trimmed }]);
    setNewItemText("");
  }

  function toggleMultiSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSave() {
    if (isClientType) {
      onSave({ value: selectedType, confidence: 1.0 });
    } else if (isSingleSelect) {
      const found = configItems.find(i => String(i.id ?? i.key) === selectedId);
      if (found) {
        onSave({ id: found.id, key: found.key, label: found.label ?? found.name, confidence: 1.0 });
      } else {
        onSave(currentValue);
      }
    } else if (isMultiSelect) {
      const selected = configItems.filter(i => selectedIds.has(String(i.id ?? i.key)));
      onSave(selected.map(i => ({ id: i.id, key: i.key, label: i.label ?? i.name, confidence: 1.0 })));
    } else if (isArray) {
      onSave(items);
    } else {
      onSave(textValue);
    }
    onClose();
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit: {SECTION_META[sectionKey]?.label ?? sectionKey}</Text>
              <TouchableOpacity onPress={onClose}>
                <Feather name="x" size={20} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>

            {isClientType ? (
              <View style={styles.segmentWrap}>
                <Text style={styles.modalHint}>Select client account type:</Text>
                {CLIENT_TYPE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.segmentRow, selectedType === opt && styles.segmentRowActive]}
                    onPress={() => setSelectedType(opt)}
                  >
                    <Feather
                      name={selectedType === opt ? "check-circle" : "circle"}
                      size={16}
                      color={selectedType === opt ? COLORS.amber : COLORS.textDim}
                    />
                    <Text style={[styles.segmentRowText, selectedType === opt && styles.segmentRowTextActive]}>
                      {opt.replace(/_/g, " ")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : isConfigBacked ? (
              configLoading ? (
                <View style={styles.configLoadingRow}>
                  <ActivityIndicator color={COLORS.amber} />
                  <Text style={styles.configLoadingText}>Loading options…</Text>
                </View>
              ) : configItems.length === 0 ? (
                <Text style={styles.emptyItemsText}>No options available from config.</Text>
              ) : isSingleSelect ? (
                <FlatList
                  data={configItems}
                  keyExtractor={i => String(i.id ?? i.key)}
                  style={styles.itemList}
                  renderItem={({ item }) => {
                    const id = String(item.id ?? item.key);
                    const active = selectedId === id;
                    return (
                      <TouchableOpacity
                        style={[styles.configPickerRow, active && styles.configPickerRowActive]}
                        onPress={() => setSelectedId(id)}
                      >
                        <Feather
                          name={active ? "check-circle" : "circle"}
                          size={16}
                          color={active ? COLORS.amber : COLORS.textDim}
                        />
                        <Text style={[styles.configPickerLabel, active && styles.configPickerLabelActive]}>
                          {String(item.label ?? item.name ?? item.key)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              ) : (
                <FlatList
                  data={configItems}
                  keyExtractor={i => String(i.id ?? i.key)}
                  style={styles.itemList}
                  renderItem={({ item }) => {
                    const id = String(item.id ?? item.key);
                    const active = selectedIds.has(id);
                    return (
                      <TouchableOpacity
                        style={[styles.configPickerRow, active && styles.configPickerRowActive]}
                        onPress={() => toggleMultiSelect(id)}
                      >
                        <Feather
                          name={active ? "check-square" : "square"}
                          size={16}
                          color={active ? COLORS.emerald : COLORS.textDim}
                        />
                        <Text style={[styles.configPickerLabel, active && { color: COLORS.emerald }]}>
                          {String(item.label ?? item.name ?? item.key)}
                        </Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              )
            ) : isArray ? (
              <View>
                <Text style={styles.modalHint}>Add or remove items:</Text>
                <FlatList
                  data={items}
                  keyExtractor={i => i.key}
                  style={styles.itemList}
                  renderItem={({ item }) => (
                    <View style={styles.itemRow}>
                      <Text style={styles.itemRowLabel} numberOfLines={1}>{item.label}</Text>
                      <TouchableOpacity onPress={() => removeItem(item.key)}>
                        <Feather name="x" size={14} color={COLORS.red} />
                      </TouchableOpacity>
                    </View>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.emptyItemsText}>No items — add some below</Text>
                  }
                />
                <View style={styles.addItemRow}>
                  <TextInput
                    style={styles.addItemInput}
                    value={newItemText}
                    onChangeText={setNewItemText}
                    placeholder={`Add ${SECTION_META[sectionKey]?.label ?? "item"}…`}
                    placeholderTextColor={COLORS.textDim}
                    onSubmitEditing={addItem}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
                    <Feather name="plus" size={16} color={COLORS.navyDark} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={styles.modalHint}>Enter value:</Text>
                <TextInput
                  style={styles.editInput}
                  value={textValue}
                  onChangeText={setTextValue}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={COLORS.textDim}
                />
              </View>
            )}

            <TouchableOpacity style={styles.saveEditBtn} onPress={handleSave}>
              <Text style={styles.saveEditBtnText}>Save Changes</Text>
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
  const [rejectKey, setRejectKey] = useState<string | null>(null);
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

  function setDecision(key: string, action: DecisionAction, value?: unknown, reason?: string) {
    const d: Decision = { action, ...(value !== undefined ? { value } : {}), ...(reason ? { reason } : {}) };
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
            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.pageHint}>
              Review each section. Approve, edit, or reject (with a reason). All rejections must be resolved before provisioning.
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
                      <Feather name={meta.icon} size={16} color={meta.color} />
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

                  {decision?.action === "rejected" && decision.reason && (
                    <View style={styles.rejectReasonRow}>
                      <Feather name="message-square" size={11} color={COLORS.red} />
                      <Text style={styles.rejectReasonText} numberOfLines={2}>
                        {String(decision.reason)}
                      </Text>
                    </View>
                  )}

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
                      onPress={() => setRejectKey(key)}
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
                  Some sections are rejected. Resolve all rejections before provisioning.
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.provisionBtn, (hasRejected || !canProvision) && styles.provisionBtnDisabled]}
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

      {rejectKey && rec && (
        <RejectModal
          sectionLabel={SECTION_META[rejectKey]?.label ?? rejectKey}
          onClose={() => setRejectKey(null)}
          onConfirm={(reason) => setDecision(rejectKey, "rejected", undefined, reason)}
        />
      )}

      {editKey && rec && (
        <EditModal
          sectionKey={editKey}
          currentValue={decisions[editKey]?.action === "edited" ? decisions[editKey].value : rec[editKey]}
          onClose={() => setEditKey(null)}
          onSave={(value) => setDecision(editKey, "edited", value)}
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

  pageHint: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 16, lineHeight: 18 },

  card: { backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  cardIcon: { width: 30, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  decisionBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  decisionBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  cardValue: { color: COLORS.text, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10, lineHeight: 18 },

  rejectReasonRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 6,
    marginBottom: 10, padding: 8, borderRadius: 8,
    backgroundColor: COLORS.red + "0d", borderWidth: 1, borderColor: COLORS.red + "33",
  },
  rejectReasonText: { color: COLORS.red, fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },

  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder, paddingVertical: 7,
  },
  actionBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  warningBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.red + "44", backgroundColor: COLORS.red + "11", marginBottom: 12,
  },
  warningText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  provisionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 14,
  },
  provisionBtnDisabled: { opacity: 0.4 },
  provisionBtnText: { color: COLORS.navyDark, fontSize: 15, fontFamily: "Inter_700Bold" },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 12, padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.red + "44", backgroundColor: COLORS.red + "11",
  },
  errorText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  modalOverlay: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-end" },
  modalWrap: { width: "100%" },
  modalSheet: {
    backgroundColor: COLORS.navyCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: "90%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  modalTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_700Bold" },
  modalHint: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 12, lineHeight: 18 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  cancelBtn: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingVertical: 12, alignItems: "center",
  },
  cancelBtnText: { color: COLORS.textDim, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rejectConfirmBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: COLORS.red, borderRadius: 10, paddingVertical: 12,
  },
  rejectConfirmBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_700Bold" },
  btnDisabled: { opacity: 0.4 },

  reasonInput: {
    backgroundColor: COLORS.navyDark, color: COLORS.text, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 13, fontFamily: "Inter_400Regular", minHeight: 100, textAlignVertical: "top",
  },

  segmentWrap: { gap: 8, marginBottom: 4 },
  segmentRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder, backgroundColor: COLORS.navyDark,
  },
  segmentRowActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "11" },
  segmentRowText: { color: COLORS.textDim, fontSize: 13, fontFamily: "Inter_500Medium" },
  segmentRowTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },

  configLoadingRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 16, justifyContent: "center" },
  configLoadingText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  configPickerRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyDark, marginBottom: 6,
  },
  configPickerRowActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "11" },
  configPickerLabel: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  configPickerLabelActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },

  itemList: { maxHeight: 200, marginBottom: 8 },
  itemRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyDark, marginBottom: 6,
  },
  itemRowLabel: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1, marginRight: 8 },
  emptyItemsText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", padding: 16 },
  addItemRow: { flexDirection: "row", gap: 8, marginBottom: 4 },
  addItemInput: {
    flex: 1, backgroundColor: COLORS.navyDark, color: COLORS.text, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.navyBorder, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 13, fontFamily: "Inter_400Regular",
  },
  addItemBtn: { backgroundColor: COLORS.amber, borderRadius: 8, padding: 8, alignItems: "center", justifyContent: "center" },

  editInput: {
    backgroundColor: COLORS.navyDark, color: COLORS.text, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  saveEditBtn: {
    backgroundColor: COLORS.amber, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 12,
  },
  saveEditBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_700Bold" },
});
