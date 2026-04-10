import React, { useState, useMemo } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  KeyboardAvoidingView, Platform, FlatList, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

// ─── Types ─────────────────────────────────────────────────────────────────────

type ReviewStatus = "PENDING" | "APPROVED" | "EDITED" | "REJECTED";
type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

interface ReviewItem {
  id: string;
  session_id: string;
  group_key: string;
  item_key: string;
  label: string;
  suggested_value_json: unknown;
  final_value_json: unknown;
  confidence_band: ConfidenceBand;
  confidence_score: string | null;
  status: ReviewStatus;
  rejection_reason: string | null;
  is_required: boolean;
  sort_order: number;
  reviewed_by_user_id: string | null;
  reviewed_at: string | null;
}

interface SessionData {
  session: {
    id: string;
    status: string;
    intakePayload: Record<string, unknown>;
    normalizedRecommendation: Record<string, unknown> | null;
    grokConfidence: number | null;
  };
  reviewItems: ReviewItem[];
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const GROUP_META: Record<string, { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string; helperText: string }> = {
  classification:   { label: "Classification",    icon: "layers",          color: COLORS.amber,   helperText: "Core vertical, sub-vertical, and account type" },
  businessModel:    { label: "Business Model",     icon: "briefcase",       color: COLORS.emerald, helperText: "Revenue streams and service lines" },
  marketStrategy:   { label: "Market Strategy",    icon: "target",          color: COLORS.cyan,    helperText: "Target facilities and buyer roles" },
  executionLayer:   { label: "Execution Layer",    icon: "git-merge",       color: COLORS.blue,    helperText: "Sales motions and pipeline templates" },
  intelligenceLayer:{ label: "Intelligence Layer", icon: "eye",             color: COLORS.purple,  helperText: "Competitive intel and pain points" },
  tagging:          { label: "Tagging",            icon: "tag",             color: COLORS.amber,   helperText: "Workspace classification tags" },
  addOns:           { label: "Add-Ons",            icon: "plus-square",     color: COLORS.cyan,    helperText: "Enabled specialized modules" },
  riskWarnings:     { label: "Risk / Warnings",    icon: "alert-triangle",  color: COLORS.red,     helperText: "AI-flagged issues to review" },
};

const GROUP_ORDER = [
  "classification", "businessModel", "marketStrategy", "executionLayer",
  "intelligenceLayer", "tagging", "addOns", "riskWarnings",
];

const CONFIG_SINGLE_SELECT = new Set(["vertical", "subVertical"]);
const CONFIG_MULTI_SELECT  = new Set(["serviceLines", "pipelineTemplates", "addOns"]);
const CLIENT_TYPE_OPTIONS  = ["SINGLE_USER", "SMALL_TEAM", "ENTERPRISE"] as const;

const REJECT_REASONS = [
  "Wrong vertical or sub-vertical",
  "Incorrect service lines selected",
  "Pipeline template mismatch",
  "Add-ons not applicable",
  "Confidence score too low — needs human review",
  "Missing required information",
  "Competitor or pain point inaccurate",
  "Other",
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function bandColor(band: ConfidenceBand): string {
  if (band === "HIGH")   return COLORS.emerald;
  if (band === "MEDIUM") return COLORS.amber;
  return COLORS.red;
}

function statusColor(status: ReviewStatus): string {
  if (status === "APPROVED") return COLORS.emerald;
  if (status === "EDITED")   return COLORS.amber;
  if (status === "REJECTED") return COLORS.red;
  return COLORS.textDim;
}

function statusLabel(status: ReviewStatus): string {
  if (status === "APPROVED") return "Approved";
  if (status === "EDITED")   return "Edited";
  if (status === "REJECTED") return "Rejected";
  return "Pending";
}

function valuePreview(value: unknown, maxItems = 4): string {
  if (value == null) return "—";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    const parts = value.slice(0, maxItems).map(v => {
      if (typeof v === "object" && v !== null) {
        const o = v as Record<string, unknown>;
        return String(o.label ?? o.name ?? o.key ?? "?");
      }
      return String(v);
    });
    return parts.join(", ") + (value.length > maxItems ? ` +${value.length - maxItems}` : "");
  }
  if (typeof value === "object" && value !== null) {
    const o = value as Record<string, unknown>;
    return String(o.label ?? o.name ?? o.key ?? o.value ?? JSON.stringify(value));
  }
  return String(value);
}

function normalizeToStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(v => {
    if (typeof v === "object" && v !== null) {
      const o = v as Record<string, unknown>;
      return String(o.label ?? o.name ?? o.key ?? "");
    }
    return String(v);
  }).filter(Boolean);
}

function getConfigEndpoint(itemKey: string): string | null {
  if (itemKey === "vertical")          return "/admin/onboarding/config/verticals";
  if (itemKey === "subVertical")       return "/admin/onboarding/config/sub-verticals";
  if (itemKey === "serviceLines")      return "/admin/onboarding/config/service-lines";
  if (itemKey === "pipelineTemplates") return "/admin/onboarding/config/pipeline-templates";
  if (itemKey === "addOns")            return "/admin/onboarding/config/add-on-types";
  return null;
}

interface ConfigItem { id?: string; key: string; label?: string; name?: string }

function extractConfigItems(data: unknown, itemKey: string): ConfigItem[] {
  if (!data || typeof data !== "object") return [];
  const d = data as Record<string, unknown>;
  if (itemKey === "vertical")          return (d.verticals        ?? []) as ConfigItem[];
  if (itemKey === "subVertical")       return (d.subVerticals     ?? []) as ConfigItem[];
  if (itemKey === "serviceLines")      return (d.serviceLines     ?? []) as ConfigItem[];
  if (itemKey === "pipelineTemplates") return (d.pipelineTemplates ?? []) as ConfigItem[];
  if (itemKey === "addOns")            return (d.addOnTypes       ?? []) as ConfigItem[];
  return [];
}

// ─── RejectModal ───────────────────────────────────────────────────────────────

interface RejectModalProps {
  itemLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

function RejectModal({ itemLabel, onClose, onConfirm }: RejectModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes]       = useState("");

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Reject: {itemLabel}</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>
          <Text style={s.sheetHint}>Select a rejection reason (required):</Text>
          <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled">
            {REJECT_REASONS.map(r => (
              <TouchableOpacity
                key={r}
                style={[s.optionRow, selected === r && s.optionRowActive]}
                onPress={() => setSelected(r)}
              >
                <Feather
                  name={selected === r ? "check-circle" : "circle"}
                  size={15}
                  color={selected === r ? COLORS.red : COLORS.textDim}
                />
                <Text style={[s.optionText, selected === r && { color: COLORS.red }]}>{r}</Text>
              </TouchableOpacity>
            ))}
            <Text style={[s.sheetHint, { marginTop: 12 }]}>Additional notes (optional):</Text>
            <TextInput
              style={s.reasonInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any extra context…"
              placeholderTextColor={COLORS.textDim}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>
          <View style={s.sheetFooter}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.rejectBtn, !selected && s.btnDisabled]}
              disabled={!selected}
              onPress={() => {
                const reason = notes.trim() ? `${selected}: ${notes.trim()}` : selected!;
                onConfirm(reason);
                onClose();
              }}
            >
              <Feather name="x-circle" size={14} color={COLORS.navyDark} />
              <Text style={s.rejectBtnText}>Confirm Rejection</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── EditModal ─────────────────────────────────────────────────────────────────

interface EditModalProps {
  item: ReviewItem;
  onClose: () => void;
  onSave: (value: unknown) => void;
}

function EditModal({ item, onClose, onSave }: EditModalProps) {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const { item_key } = item;
  const currentValue = item.final_value_json ?? item.suggested_value_json;

  const isClientType    = item_key === "clientType";
  const isSingleSelect  = CONFIG_SINGLE_SELECT.has(item_key);
  const isMultiSelect   = CONFIG_MULTI_SELECT.has(item_key);
  const isConfigBacked  = isSingleSelect || isMultiSelect;
  const isFreeArray     = !isConfigBacked && !isClientType && item_key !== "suggestedTags";
  const isTags          = item_key === "suggestedTags";

  const configEndpoint = getConfigEndpoint(item_key);

  const { data: configData, isLoading: configLoading } = useQuery({
    queryKey: ["editConfig", item_key],
    queryFn: () => adminFetch(configEndpoint!),
    enabled: isAdminAuthenticated && isConfigBacked && !!configEndpoint,
    staleTime: 60_000,
  });

  const configItems = useMemo(() => extractConfigItems(configData, item_key), [configData, item_key]);

  const currentObj = typeof currentValue === "object" && currentValue !== null && !Array.isArray(currentValue)
    ? (currentValue as Record<string, unknown>)
    : null;

  const [selectedId, setSelectedId] = useState<string>(
    String(currentObj?.id ?? currentObj?.key ?? "")
  );

  const initialIds = useMemo(() => {
    if (!Array.isArray(currentValue)) return new Set<string>();
    return new Set((currentValue as Array<Record<string, unknown>>).map(v => String(v.id ?? v.key ?? "")));
  }, [currentValue]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(initialIds);

  const [selectedType, setSelectedType] = useState<string>(
    isClientType ? String(currentObj?.value ?? currentValue ?? "SMALL_TEAM") : "SMALL_TEAM"
  );

  const [freeItems, setFreeItems]     = useState<string[]>(normalizeToStringArray(currentValue));
  const [newItemText, setNewItemText] = useState("");

  const [tagList, setTagList] = useState<Array<{ name: string; color: string; category: string }>>(
    Array.isArray(currentValue)
      ? (currentValue as Array<Record<string, unknown>>).map(t => ({
          name:     String(t.name ?? ""),
          color:    String(t.color ?? "#64748B"),
          category: String(t.category ?? "custom"),
        }))
      : []
  );
  const [newTagName, setNewTagName] = useState("");

  function toggleMultiId(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function addFreeItem() {
    const t = newItemText.trim();
    if (!t || freeItems.includes(t)) return;
    setFreeItems(p => [...p, t]);
    setNewItemText("");
  }

  function addTag() {
    const t = newTagName.trim();
    if (!t) return;
    setTagList(p => [...p, { name: t, color: "#64748B", category: "custom" }]);
    setNewTagName("");
  }

  function handleSave() {
    let val: unknown;
    if (isClientType) {
      val = { value: selectedType };
    } else if (isSingleSelect) {
      const found = configItems.find(i => String(i.id ?? i.key) === selectedId);
      val = found ? { id: found.id, key: found.key, label: found.label ?? found.name } : currentValue;
    } else if (isMultiSelect) {
      val = configItems
        .filter(i => selectedIds.has(String(i.id ?? i.key)))
        .map(i => ({ id: i.id, key: i.key, label: i.label ?? i.name }));
    } else if (isTags) {
      val = tagList;
    } else if (isFreeArray) {
      val = freeItems;
    } else {
      val = currentValue;
    }
    onSave(val);
    onClose();
  }

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Edit: {item.label}</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.sheetScroll} keyboardShouldPersistTaps="handled">
            {isClientType ? (
              <View>
                <Text style={s.sheetHint}>Select client account type:</Text>
                {CLIENT_TYPE_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt}
                    style={[s.optionRow, selectedType === opt && s.optionRowActive]}
                    onPress={() => setSelectedType(opt)}
                  >
                    <Feather
                      name={selectedType === opt ? "check-circle" : "circle"}
                      size={16}
                      color={selectedType === opt ? COLORS.amber : COLORS.textDim}
                    />
                    <Text style={[s.optionText, selectedType === opt && { color: COLORS.amber }]}>
                      {opt.replace(/_/g, " ")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : isConfigBacked ? (
              configLoading ? (
                <View style={s.loadingRow}>
                  <ActivityIndicator color={COLORS.amber} />
                  <Text style={s.loadingText}>Loading options…</Text>
                </View>
              ) : configItems.length === 0 ? (
                <Text style={s.emptyText}>No options available.</Text>
              ) : isSingleSelect ? (
                configItems.map(ci => {
                  const cid = String(ci.id ?? ci.key);
                  const active = selectedId === cid;
                  return (
                    <TouchableOpacity
                      key={cid}
                      style={[s.optionRow, active && s.optionRowActive]}
                      onPress={() => setSelectedId(cid)}
                    >
                      <Feather name={active ? "check-circle" : "circle"} size={16} color={active ? COLORS.amber : COLORS.textDim} />
                      <Text style={[s.optionText, active && { color: COLORS.amber }]}>
                        {String(ci.label ?? ci.name ?? ci.key)}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              ) : (
                configItems.map(ci => {
                  const cid = String(ci.id ?? ci.key);
                  const active = selectedIds.has(cid);
                  return (
                    <TouchableOpacity
                      key={cid}
                      style={[s.optionRow, active && s.optionRowActive]}
                      onPress={() => toggleMultiId(cid)}
                    >
                      <Feather name={active ? "check-square" : "square"} size={16} color={active ? COLORS.emerald : COLORS.textDim} />
                      <Text style={[s.optionText, active && { color: COLORS.emerald }]}>
                        {String(ci.label ?? ci.name ?? ci.key)}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )
            ) : isTags ? (
              <View>
                <Text style={s.sheetHint}>Add or remove tags:</Text>
                {tagList.map((t, idx) => (
                  <View key={idx} style={s.chipRow}>
                    <View style={[s.colorDot, { backgroundColor: t.color }]} />
                    <Text style={s.chipText}>{t.name}</Text>
                    <TouchableOpacity onPress={() => setTagList(p => p.filter((_, i) => i !== idx))}>
                      <Feather name="x" size={13} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={s.addRow}>
                  <TextInput
                    style={s.addInput}
                    value={newTagName}
                    onChangeText={setNewTagName}
                    placeholder="Add tag…"
                    placeholderTextColor={COLORS.textDim}
                    onSubmitEditing={addTag}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={s.addBtn} onPress={addTag}>
                    <Feather name="plus" size={16} color={COLORS.navyDark} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View>
                <Text style={s.sheetHint}>Add or remove {item.label.toLowerCase()}:</Text>
                {freeItems.map((fi, idx) => (
                  <View key={idx} style={s.chipRow}>
                    <Feather name="minus" size={13} color={COLORS.textDim} />
                    <Text style={s.chipText} numberOfLines={1}>{fi}</Text>
                    <TouchableOpacity onPress={() => setFreeItems(p => p.filter((_, i) => i !== idx))}>
                      <Feather name="x" size={13} color={COLORS.red} />
                    </TouchableOpacity>
                  </View>
                ))}
                {freeItems.length === 0 && (
                  <Text style={s.emptyText}>No items — add some below</Text>
                )}
                <View style={s.addRow}>
                  <TextInput
                    style={s.addInput}
                    value={newItemText}
                    onChangeText={setNewItemText}
                    placeholder={`Add ${item.label.toLowerCase()}…`}
                    placeholderTextColor={COLORS.textDim}
                    onSubmitEditing={addFreeItem}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={s.addBtn} onPress={addFreeItem}>
                    <Feather name="plus" size={16} color={COLORS.navyDark} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>

          <View style={s.sheetFooter}>
            <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
              <Feather name="save" size={14} color={COLORS.navyDark} />
              <Text style={s.saveBtnText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── ReviewItemCard ────────────────────────────────────────────────────────────

interface ReviewItemCardProps {
  item: ReviewItem;
  sessionStatus: string;
  onApprove: () => void;
  onEdit: () => void;
  onReject: () => void;
}

function ReviewItemCard({ item, sessionStatus, onApprove, onEdit, onReject }: ReviewItemCardProps) {
  const displayValue = item.final_value_json ?? item.suggested_value_json;
  const canAct = sessionStatus === "REVIEW";

  return (
    <View style={[s.itemCard, item.status === "REJECTED" && s.itemCardRejected]}>
      <View style={s.itemCardTop}>
        <View style={s.itemCardMeta}>
          <Text style={s.itemLabel}>
            {item.label}
            {item.is_required ? <Text style={s.required}> *</Text> : null}
          </Text>
          <View style={s.itemBadges}>
            <View style={[s.bandBadge, { borderColor: bandColor(item.confidence_band) }]}>
              <Text style={[s.bandBadgeText, { color: bandColor(item.confidence_band) }]}>
                {item.confidence_band}
              </Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: statusColor(item.status) + "22", borderColor: statusColor(item.status) }]}>
              <Text style={[s.statusBadgeText, { color: statusColor(item.status) }]}>
                {statusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={s.itemValueText} numberOfLines={2}>
        {valuePreview(displayValue)}
      </Text>

      {item.status === "REJECTED" && item.rejection_reason ? (
        <View style={s.rejectionBox}>
          <Feather name="alert-circle" size={12} color={COLORS.red} />
          <Text style={s.rejectionText} numberOfLines={2}>{item.rejection_reason}</Text>
        </View>
      ) : null}

      {canAct ? (
        <View style={s.itemActions}>
          {item.status !== "APPROVED" ? (
            <TouchableOpacity style={s.approveBtn} onPress={onApprove}>
              <Feather name="check" size={13} color={COLORS.navyDark} />
              <Text style={s.approveBtnText}>Approve</Text>
            </TouchableOpacity>
          ) : (
            <View style={s.approvedIndicator}>
              <Feather name="check-circle" size={13} color={COLORS.emerald} />
              <Text style={s.approvedText}>Approved</Text>
            </View>
          )}
          <TouchableOpacity style={s.editBtn} onPress={onEdit}>
            <Feather name="edit-2" size={13} color={COLORS.amber} />
            <Text style={s.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.rejectBtn2} onPress={onReject}>
            <Feather name="x" size={13} color={COLORS.red} />
            <Text style={s.rejectBtnText2}>Reject</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

// ─── ReviewGroupSection ────────────────────────────────────────────────────────

interface ReviewGroupSectionProps {
  groupKey: string;
  items: ReviewItem[];
  sessionStatus: string;
  onApprove: (item: ReviewItem) => void;
  onEdit: (item: ReviewItem) => void;
  onReject: (item: ReviewItem) => void;
}

function ReviewGroupSection({ groupKey, items, sessionStatus, onApprove, onEdit, onReject }: ReviewGroupSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = GROUP_META[groupKey] ?? { label: groupKey, icon: "box" as const, color: COLORS.textDim, helperText: "" };
  const resolvedCount = items.filter(i => i.status === "APPROVED" || i.status === "EDITED").length;
  const totalRequired = items.filter(i => i.is_required).length;
  const allDone = resolvedCount >= totalRequired && totalRequired > 0;

  return (
    <View style={s.groupCard}>
      <TouchableOpacity style={s.groupHeader} onPress={() => setCollapsed(c => !c)} activeOpacity={0.7}>
        <View style={[s.groupIconWrap, { backgroundColor: meta.color + "22" }]}>
          <Feather name={meta.icon} size={16} color={meta.color} />
        </View>
        <View style={s.groupTitleWrap}>
          <Text style={s.groupTitle}>{meta.label}</Text>
          <Text style={s.groupHelper} numberOfLines={1}>{meta.helperText}</Text>
        </View>
        <View style={s.groupProgressWrap}>
          {allDone ? (
            <Feather name="check-circle" size={18} color={COLORS.emerald} />
          ) : (
            <Text style={s.groupProgress}>{resolvedCount}/{items.filter(i => i.is_required).length}</Text>
          )}
          <Feather name={collapsed ? "chevron-right" : "chevron-down"} size={16} color={COLORS.textDim} style={{ marginLeft: 6 }} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View style={s.groupItems}>
          {items.map(item => (
            <ReviewItemCard
              key={item.id}
              item={item}
              sessionStatus={sessionStatus}
              onApprove={() => onApprove(item)}
              onEdit={() => onEdit(item)}
              onReject={() => onReject(item)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function ReviewScreen() {
  const { id }  = useLocalSearchParams<{ id: string }>();
  const router  = useRouter();
  const qc      = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const [editItem,   setEditItem]   = useState<ReviewItem | null>(null);
  const [rejectItem, setRejectItem] = useState<ReviewItem | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery<SessionData>({
    queryKey: ["adminOnboardingSession", id],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${id}`),
    enabled: isAdminAuthenticated && !!id,
    staleTime: 10_000,
  });

  const rebuildMutation = useMutation({
    mutationFn: () => adminFetch(`/admin/onboarding/sessions/${id}/rebuild-items`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] }),
  });

  const approveMutation = useMutation({
    mutationFn: (itemId: string) =>
      adminFetch(`/admin/onboarding/sessions/${id}/items/${itemId}/approve`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] }),
    onError: (e) => Alert.alert("Error", String(e)),
  });

  const editMutation = useMutation({
    mutationFn: ({ itemId, finalValue }: { itemId: string; finalValue: unknown }) =>
      adminFetch(`/admin/onboarding/sessions/${id}/items/${itemId}/edit`, {
        method: "POST",
        body: JSON.stringify({ finalValue }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] }),
    onError: (e) => Alert.alert("Error", String(e)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ itemId, rejectionReason }: { itemId: string; rejectionReason: string }) =>
      adminFetch(`/admin/onboarding/sessions/${id}/items/${itemId}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] }),
    onError: (e) => Alert.alert("Error", String(e)),
  });

  const lockMutation = useMutation({
    mutationFn: () => adminFetch(`/admin/onboarding/sessions/${id}/lock`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] });
      router.replace(`/admin/onboarding/${d.session.id}/provision` as Href);
    },
    onError: (e: unknown) => {
      const msg = (e as { message?: string })?.message ?? String(e);
      Alert.alert("Cannot Lock", msg);
    },
  });

  const session     = data?.session;
  const reviewItems = data?.reviewItems ?? [];

  const grouped = useMemo(() => {
    const map: Record<string, ReviewItem[]> = {};
    for (const item of reviewItems) {
      if (!map[item.group_key]) map[item.group_key] = [];
      map[item.group_key].push(item);
    }
    return map;
  }, [reviewItems]);

  const requiredItems  = reviewItems.filter(i => i.is_required);
  const resolvedItems  = requiredItems.filter(i => i.status === "APPROVED" || i.status === "EDITED");
  const blockingItems  = requiredItems.filter(i => i.status === "PENDING" || (i.status === "REJECTED" && i.final_value_json == null));
  const progressPct    = requiredItems.length > 0 ? resolvedItems.length / requiredItems.length : 0;
  const canLock        = session?.status === "REVIEW" && blockingItems.length === 0 && !lockMutation.isPending;
  const hasRec         = !!session?.normalizedRecommendation;
  const hasItems       = reviewItems.length > 0;

  const breadcrumbs: { label: string; href?: Href }[] = [
    { label: "Onboarding", href: "/admin/onboarding" as Href },
    { label: (session?.intakePayload?.clientName as string) ?? "Session", href: `/admin/onboarding/${id}` as Href },
    { label: "Review" },
  ];

  return (
    <View style={s.container}>
      <AdminHeader breadcrumbs={breadcrumbs} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
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
          <View style={s.center}><ActivityIndicator color={COLORS.amber} size="large" /></View>
        ) : !hasRec ? (
          <View style={s.center}>
            <Feather name="alert-circle" size={32} color={COLORS.amber} />
            <Text style={s.stateTitle}>No Recommendation Yet</Text>
            <Text style={s.stateText}>Generate an AI recommendation before starting review.</Text>
            <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
              <Text style={s.backBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : !hasItems ? (
          <View style={s.center}>
            <Feather name="layers" size={32} color={COLORS.amber} />
            <Text style={s.stateTitle}>Review Not Initialized</Text>
            <Text style={s.stateText}>Build the structured review items from the AI recommendation to begin per-item review.</Text>
            <TouchableOpacity
              style={[s.rebuildBtn, rebuildMutation.isPending && s.btnDisabled]}
              disabled={rebuildMutation.isPending}
              onPress={() => rebuildMutation.mutate()}
            >
              {rebuildMutation.isPending
                ? <ActivityIndicator color={COLORS.navyDark} size="small" />
                : <Feather name="refresh-cw" size={15} color={COLORS.navyDark} />}
              <Text style={s.rebuildBtnText}>Build Review Items</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* Progress banner */}
            <View style={s.progressBanner}>
              <View style={s.progressBarTrack}>
                <View style={[s.progressBarFill, { width: `${Math.round(progressPct * 100)}%` }]} />
              </View>
              <Text style={s.progressLabel}>
                {resolvedItems.length} of {requiredItems.length} required items resolved
                {blockingItems.length > 0 ? ` · ${blockingItems.length} blocking` : ""}
              </Text>
            </View>

            {GROUP_ORDER.filter(gk => grouped[gk]?.length > 0).map(gk => (
              <ReviewGroupSection
                key={gk}
                groupKey={gk}
                items={grouped[gk]}
                sessionStatus={session?.status ?? ""}
                onApprove={item => approveMutation.mutate(item.id)}
                onEdit={item => setEditItem(item)}
                onReject={item => setRejectItem(item)}
              />
            ))}

            {/* Rebuild button (secondary) */}
            {session?.status === "REVIEW" ? (
              <TouchableOpacity
                style={s.rebuildSecondaryBtn}
                onPress={() => {
                  Alert.alert(
                    "Rebuild Review Items?",
                    "This will re-sync items from the AI recommendation. Approved or edited items won't lose their decisions.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { text: "Rebuild", style: "default", onPress: () => rebuildMutation.mutate() },
                    ]
                  );
                }}
              >
                <Feather name="refresh-cw" size={14} color={COLORS.textDim} />
                <Text style={s.rebuildSecondaryText}>Re-sync from Recommendation</Text>
              </TouchableOpacity>
            ) : null}

            <View style={{ height: 120 }} />
          </>
        )}
      </ScrollView>

      {/* Sticky Footer */}
      {hasItems && session?.status === "REVIEW" ? (
        <View style={s.footer}>
          <View style={s.footerInfo}>
            <Text style={s.footerTitle}>{blockingItems.length === 0 ? "Ready to Lock" : `${blockingItems.length} Blocking`}</Text>
            <Text style={s.footerSub}>
              {blockingItems.length === 0
                ? "All required items resolved"
                : blockingItems.slice(0, 2).map(b => b.label).join(", ") + (blockingItems.length > 2 ? ` +${blockingItems.length - 2}` : "")}
            </Text>
          </View>
          <TouchableOpacity
            style={[s.lockBtn, !canLock && s.btnDisabled]}
            disabled={!canLock}
            onPress={() => {
              Alert.alert(
                "Lock & Proceed?",
                "This will finalize all review decisions and initialize provisioning. You cannot edit the review after locking.",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Lock", style: "destructive", onPress: () => lockMutation.mutate() },
                ]
              );
            }}
          >
            {lockMutation.isPending
              ? <ActivityIndicator color={COLORS.navyDark} size="small" />
              : <Feather name="lock" size={15} color={COLORS.navyDark} />}
            <Text style={s.lockBtnText}>Lock & Proceed</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {editItem ? (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={value => editMutation.mutate({ itemId: editItem.id, finalValue: value })}
        />
      ) : null}

      {rejectItem ? (
        <RejectModal
          itemLabel={rejectItem.label}
          onClose={() => setRejectItem(null)}
          onConfirm={reason => rejectMutation.mutate({ itemId: rejectItem.id, rejectionReason: reason })}
        />
      ) : null}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: COLORS.navy },
  scroll:             { flex: 1 },
  scrollContent:      { padding: 16 },
  center:             { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  stateTitle:         { color: COLORS.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  stateText:          { color: COLORS.textDim, fontSize: 14, textAlign: "center", lineHeight: 20 },
  backBtn:            { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder },
  backBtnText:        { color: COLORS.textDim, fontSize: 14 },
  rebuildBtn:         { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, backgroundColor: COLORS.amber, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  rebuildBtnText:     { color: COLORS.navyDark, fontSize: 14, fontWeight: "700" },
  rebuildSecondaryBtn:{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center", marginVertical: 12, padding: 12 },
  rebuildSecondaryText:{ color: COLORS.textDim, fontSize: 13 },

  progressBanner:     { backgroundColor: COLORS.navyCard, borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.navyBorder },
  progressBarTrack:   { height: 6, backgroundColor: COLORS.navyBorder, borderRadius: 3, overflow: "hidden", marginBottom: 8 },
  progressBarFill:    { height: 6, backgroundColor: COLORS.emerald, borderRadius: 3 },
  progressLabel:      { color: COLORS.textDim, fontSize: 12 },

  groupCard:          { backgroundColor: COLORS.navyCard, borderRadius: 12, marginBottom: 14, borderWidth: 1, borderColor: COLORS.navyBorder, overflow: "hidden" },
  groupHeader:        { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  groupIconWrap:      { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  groupTitleWrap:     { flex: 1 },
  groupTitle:         { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  groupHelper:        { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  groupProgressWrap:  { flexDirection: "row", alignItems: "center" },
  groupProgress:      { color: COLORS.amber, fontSize: 13, fontWeight: "600" },
  groupItems:         { paddingHorizontal: 12, paddingBottom: 12, gap: 10 },

  itemCard:           { backgroundColor: COLORS.navySurface, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.navyBorder },
  itemCardRejected:   { borderColor: COLORS.red + "66" },
  itemCardTop:        { marginBottom: 6 },
  itemCardMeta:       { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  itemLabel:          { color: COLORS.text, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 8 },
  required:           { color: COLORS.amber },
  itemBadges:         { flexDirection: "row", gap: 6 },
  bandBadge:          { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  bandBadgeText:      { fontSize: 10, fontWeight: "700" },
  statusBadge:        { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  statusBadgeText:    { fontSize: 10, fontWeight: "700" },
  itemValueText:      { color: COLORS.textDim, fontSize: 12, marginBottom: 8, lineHeight: 18 },
  rejectionBox:       { flexDirection: "row", gap: 6, alignItems: "flex-start", backgroundColor: COLORS.red + "11", borderRadius: 6, padding: 8, marginBottom: 8 },
  rejectionText:      { color: COLORS.red, fontSize: 11, flex: 1 },

  itemActions:        { flexDirection: "row", gap: 8 },
  approveBtn:         { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.emerald, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  approveBtnText:     { color: COLORS.navyDark, fontSize: 12, fontWeight: "700" },
  approvedIndicator:  { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  approvedText:       { color: COLORS.emerald, fontSize: 12, fontWeight: "600" },
  editBtn:            { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: COLORS.amber + "66", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  editBtnText:        { color: COLORS.amber, fontSize: 12, fontWeight: "600" },
  rejectBtn2:         { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: COLORS.red + "66", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  rejectBtnText2:     { color: COLORS.red, fontSize: 12, fontWeight: "600" },

  footer:             { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, paddingBottom: Platform.OS === "ios" ? 28 : 14, backgroundColor: COLORS.navyMid, borderTopWidth: 1, borderColor: COLORS.navyBorder, gap: 12 },
  footerInfo:         { flex: 1 },
  footerTitle:        { color: COLORS.text, fontSize: 13, fontWeight: "700" },
  footerSub:          { color: COLORS.textDim, fontSize: 11, marginTop: 2 },
  lockBtn:            { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.amber, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 10 },
  lockBtnText:        { color: COLORS.navyDark, fontSize: 14, fontWeight: "700" },

  overlay:            { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet:              { backgroundColor: COLORS.navyMid, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "80%", paddingBottom: Platform.OS === "ios" ? 32 : 16 },
  sheetHandle:        { width: 36, height: 4, backgroundColor: COLORS.navyBorder, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 6 },
  sheetHeader:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.navyBorder },
  sheetTitle:         { color: COLORS.text, fontSize: 16, fontWeight: "700" },
  sheetHint:          { color: COLORS.textDim, fontSize: 13, paddingHorizontal: 18, marginTop: 10, marginBottom: 4 },
  sheetScroll:        { paddingHorizontal: 18, marginTop: 8 },
  sheetFooter:        { flexDirection: "row", gap: 10, paddingHorizontal: 18, paddingTop: 14, borderTopWidth: 1, borderColor: COLORS.navyBorder },

  optionRow:          { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: COLORS.navyBorder },
  optionRowActive:    { backgroundColor: COLORS.navySurface, borderRadius: 8, borderBottomWidth: 0, marginBottom: 1 },
  optionText:         { color: COLORS.text, fontSize: 14, flex: 1 },

  chipRow:            { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: COLORS.navyBorder },
  colorDot:           { width: 12, height: 12, borderRadius: 6 },
  chipText:           { color: COLORS.text, fontSize: 13, flex: 1 },
  addRow:             { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginBottom: 8 },
  addInput:           { flex: 1, backgroundColor: COLORS.navySurface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder, color: COLORS.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 8 },
  addBtn:             { backgroundColor: COLORS.amber, borderRadius: 8, width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  loadingRow:         { flexDirection: "row", alignItems: "center", gap: 10, padding: 20 },
  loadingText:        { color: COLORS.textDim, fontSize: 14 },
  emptyText:          { color: COLORS.textDim, fontSize: 13, textAlign: "center", padding: 20 },

  reasonInput:        { backgroundColor: COLORS.navySurface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder, color: COLORS.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 8, minHeight: 72, marginHorizontal: 18, marginTop: 6, marginBottom: 4 },

  cancelBtn:          { flex: 1, borderWidth: 1, borderColor: COLORS.navyBorder, borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  cancelBtnText:      { color: COLORS.textDim, fontSize: 14, fontWeight: "600" },
  saveBtn:            { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.amber, borderRadius: 10, paddingVertical: 12 },
  saveBtnText:        { color: COLORS.navyDark, fontSize: 14, fontWeight: "700" },
  rejectBtn:          { flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.red, borderRadius: 10, paddingVertical: 12 },
  rejectBtnText:      { color: COLORS.navyDark, fontSize: 14, fontWeight: "700" },

  btnDisabled:        { opacity: 0.45 },
});
