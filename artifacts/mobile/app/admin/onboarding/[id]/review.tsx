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

interface ProgressData {
  totalItems:    number;
  required:      number;
  resolved:      number;
  blocking:      number;
  blockingItems: Array<{ id: string; label: string; group_key: string; status: string }>;
}

interface PreviewData {
  pipelineCount:     number;
  savedViewCount:    number;
  tagCount:          number;
  contactRoleCount:  number;
  defaultTaskCount:  number;
  alertRuleCount:    number;
  addOnCount:        number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const GROUP_META: Record<string, { label: string; icon: React.ComponentProps<typeof Feather>["name"]; color: string; helperText: string }> = {
  classification:   { label: "Classification",    icon: "layers",          color: COLORS.amber,   helperText: "Core business classification — vertical, sub-vertical, and account type" },
  businessModel:    { label: "Business Model",     icon: "briefcase",       color: COLORS.emerald, helperText: "Revenue streams and service lines that define how the client generates revenue" },
  marketStrategy:   { label: "Market Strategy",    icon: "target",          color: COLORS.cyan,    helperText: "Target facilities and buyer roles that define who they sell to and where" },
  executionLayer:   { label: "Execution Layer",    icon: "git-merge",       color: COLORS.blue,    helperText: "Sales motions and pipeline templates that drive execution" },
  intelligenceLayer:{ label: "Intelligence Layer", icon: "eye",             color: COLORS.purple,  helperText: "Competitive landscape and pain points for sales intelligence" },
  tagging:          { label: "Tagging",            icon: "tag",             color: COLORS.amber,   helperText: "Suggested tags to classify this workspace in the master database" },
  addOns:           { label: "Add-Ons",            icon: "plus-square",     color: COLORS.cyan,    helperText: "Enabled modules — govcon and other specialized capabilities" },
  riskWarnings:     { label: "Risk / Warnings",    icon: "alert-triangle",  color: COLORS.red,     helperText: "Warning flags from AI that may block successful execution" },
};

const GROUP_ORDER = [
  "classification", "businessModel", "marketStrategy", "executionLayer",
  "intelligenceLayer", "tagging", "addOns", "riskWarnings",
];

const CONFIG_SINGLE_SELECT  = new Set(["vertical", "subVertical"]);
const CONFIG_MULTI_SELECT   = new Set(["serviceLines", "pipelineTemplates", "addOns"]);
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

const EMS_VERTICAL_TOKENS = ["ems", "emergency", "ambulance", "paramedic", "medical", "healthcare", "health"];

function isEmsVertical(vertical: string | null | undefined): boolean {
  if (!vertical) return false;
  const v = vertical.toLowerCase();
  return EMS_VERTICAL_TOKENS.some(t => v.includes(t));
}

const EMS_PRESETS: Partial<Record<string, string[]>> = {
  targetFacilities: [
    "Hospitals", "Skilled Nursing Facilities", "Assisted Living Facilities",
    "Home Health Agencies", "Dialysis Centers", "Physician Groups",
    "Urgent Care Centers", "Long-Term Acute Care",
  ],
  buyerRoles: [
    "Director of Operations", "VP of Sales", "Chief Medical Officer",
    "Clinical Supervisor", "Revenue Cycle Manager", "Marketing Director",
    "Discharge Planner", "Case Manager",
  ],
  salesMotions: [
    "Direct facility outreach", "Referral network expansion",
    "Event-based selling", "Account management", "Clinical education sessions",
    "Medical director partnership",
  ],
  competitors: [
    "AMR (American Medical Response)", "Global Medical Response",
    "Priority Ambulance", "Air Methods", "Med-Trans Corporation",
    "Rural/Metro Medical Services",
  ],
  painPoints: [
    "Poor patient outcomes tracking", "Lack of referral network visibility",
    "Manual billing processes", "Low reactivation rates with discharged patients",
    "No follow-up tracking post-transport", "Insufficient case manager relationships",
  ],
  warningFlags: [
    "No hospital relationships identified",
    "No case managers mapped in target facilities",
    "GovCon exposure — compliance module not enabled",
    "Territory coverage gaps in target market",
    "High competitor saturation — AMR/GMR dominant",
    "Insufficient referral network diversity",
    "No win/loss tracking in current workflow",
  ],
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function bandColor(band: ConfidenceBand): string {
  if (band === "HIGH")   return COLORS.emerald;
  if (band === "MEDIUM") return COLORS.amber;
  return COLORS.red;
}

function confidenceBand(score: number): ConfidenceBand {
  if (score >= 0.8) return "HIGH";
  if (score >= 0.5) return "MEDIUM";
  return "LOW";
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
  sessionVertical?: string | null;
}

function EditModal({ item, onClose, onSave, sessionVertical }: EditModalProps) {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const { item_key } = item;
  const currentValue = item.final_value_json ?? item.suggested_value_json;

  const isClientType    = item_key === "clientType";
  const isSingleSelect  = CONFIG_SINGLE_SELECT.has(item_key);
  const isMultiSelect   = CONFIG_MULTI_SELECT.has(item_key);
  const isAddOns        = item_key === "addOns";
  const isConfigBacked  = isSingleSelect || isMultiSelect;
  const isFreeArray     = !isConfigBacked && !isClientType && item_key !== "suggestedTags";
  const isTags          = item_key === "suggestedTags";
  const showEmsPresets  = isFreeArray && isEmsVertical(sessionVertical) && !!(EMS_PRESETS[item_key]);

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

  // Multi-select uses an ordered array (not a Set) to support reordering
  const initialOrderedIds = useMemo<string[]>(() => {
    if (!Array.isArray(currentValue)) return [];
    return (currentValue as Array<Record<string, unknown>>).map(v => String(v.id ?? v.key ?? ""));
  }, [currentValue]);
  const [orderedIds, setOrderedIds] = useState<string[]>(initialOrderedIds);

  // GovCon invisible toggle (only relevant for addOns item)
  const [govconInvisible, setGovconInvisible] = useState<boolean>(() => {
    if (!Array.isArray(currentValue)) return false;
    const govcon = (currentValue as Array<Record<string, unknown>>).find(v => v.key === "govcon");
    return govcon?.invisible === true;
  });

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
    setOrderedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function reorderMultiId(idx: number, dir: "up" | "down") {
    setOrderedIds(prev => {
      const n = [...prev];
      const swap = dir === "up" ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= n.length) return prev;
      [n[idx], n[swap]] = [n[swap], n[idx]];
      return n;
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
      // Preserve ordering and include govcon invisible flag when applicable
      val = orderedIds
        .map(oid => configItems.find(i => String(i.id ?? i.key) === oid))
        .filter(Boolean)
        .map(i => {
          const base = { id: i!.id, key: i!.key, label: i!.label ?? i!.name };
          if (isAddOns && i!.key === "govcon") {
            return { ...base, invisible: govconInvisible };
          }
          return base;
        });
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
              <View>
                {/* Selected items section with reorder */}
                {orderedIds.length > 0 ? (
                  <View style={{ marginBottom: 8 }}>
                    <Text style={[s.sheetHint, { marginBottom: 6 }]}>Selected (drag to reorder):</Text>
                    {orderedIds.map((oid, idx) => {
                      const ci = configItems.find(x => String(x.id ?? x.key) === oid);
                      const label = ci ? String(ci.label ?? ci.name ?? ci.key) : oid;
                      const isGovcon = (ci?.key ?? oid) === "govcon";
                      return (
                        <View key={oid} style={s.chipRow}>
                          <View style={s.reorderBtns}>
                            <TouchableOpacity onPress={() => reorderMultiId(idx, "up")} disabled={idx === 0}>
                              <Feather name="arrow-up" size={12} color={idx === 0 ? COLORS.navyBorder : COLORS.textDim} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => reorderMultiId(idx, "down")} disabled={idx === orderedIds.length - 1}>
                              <Feather name="arrow-down" size={12} color={idx === orderedIds.length - 1 ? COLORS.navyBorder : COLORS.textDim} />
                            </TouchableOpacity>
                          </View>
                          <Text style={[s.chipText, { color: COLORS.emerald }]} numberOfLines={1}>{label}</Text>
                          {isAddOns && isGovcon ? (
                            <TouchableOpacity
                              style={[s.govconToggle, govconInvisible && s.govconToggleActive]}
                              onPress={() => setGovconInvisible(v => !v)}
                            >
                              <Feather name={govconInvisible ? "eye-off" : "eye"} size={11} color={govconInvisible ? COLORS.amber : COLORS.textDim} />
                              <Text style={[s.govconToggleText, govconInvisible && { color: COLORS.amber }]}>
                                {govconInvisible ? "Invisible" : "Visible"}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                          <TouchableOpacity onPress={() => toggleMultiId(oid)}>
                            <Feather name="x" size={13} color={COLORS.red} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                <Text style={[s.sheetHint, { marginBottom: 4 }]}>
                  {orderedIds.length === 0 ? "Select options:" : "Add more:"}
                </Text>
                {configItems
                  .filter(ci => !orderedIds.includes(String(ci.id ?? ci.key)))
                  .map(ci => {
                    const cid = String(ci.id ?? ci.key);
                    return (
                      <TouchableOpacity
                        key={cid}
                        style={s.optionRow}
                        onPress={() => toggleMultiId(cid)}
                      >
                        <Feather name="plus-circle" size={16} color={COLORS.textDim} />
                        <Text style={s.optionText}>{String(ci.label ?? ci.name ?? ci.key)}</Text>
                      </TouchableOpacity>
                    );
                  })
                }
                {configItems.filter(ci => !orderedIds.includes(String(ci.id ?? ci.key))).length === 0 && orderedIds.length > 0 ? (
                  <Text style={s.emptyText}>All available options selected</Text>
                ) : null}
              </View>
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
                {showEmsPresets ? (
                  <View style={s.presetsSection}>
                    <View style={s.presetsHeader}>
                      <Feather name="zap" size={12} color={COLORS.cyan} />
                      <Text style={s.presetsTitle}>EMS Quick-Add</Text>
                    </View>
                    <View style={s.presetsChips}>
                      {(EMS_PRESETS[item_key] ?? []).map(preset => {
                        const alreadyAdded = freeItems.includes(preset);
                        return (
                          <TouchableOpacity
                            key={preset}
                            style={[s.presetChip, alreadyAdded && s.presetChipAdded]}
                            onPress={() => {
                              if (!alreadyAdded) setFreeItems(p => [...p, preset]);
                            }}
                            disabled={alreadyAdded}
                          >
                            {alreadyAdded
                              ? <Feather name="check" size={11} color={COLORS.emerald} />
                              : <Feather name="plus" size={11} color={COLORS.cyan} />}
                            <Text style={[s.presetChipText, alreadyAdded && s.presetChipTextAdded]} numberOfLines={1}>
                              {preset}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
                <Text style={s.sheetHint}>Add, remove, or reorder {item.label.toLowerCase()}:</Text>
                {freeItems.map((fi, idx) => (
                  <View key={idx} style={s.chipRow}>
                    <View style={s.reorderBtns}>
                      <TouchableOpacity
                        onPress={() => {
                          if (idx === 0) return;
                          setFreeItems(p => { const n = [...p]; [n[idx-1], n[idx]] = [n[idx], n[idx-1]]; return n; });
                        }}
                        disabled={idx === 0}
                      >
                        <Feather name="arrow-up" size={12} color={idx === 0 ? COLORS.navyBorder : COLORS.textDim} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (idx === freeItems.length - 1) return;
                          setFreeItems(p => { const n = [...p]; [n[idx], n[idx+1]] = [n[idx+1], n[idx]]; return n; });
                        }}
                        disabled={idx === freeItems.length - 1}
                      >
                        <Feather name="arrow-down" size={12} color={idx === freeItems.length - 1 ? COLORS.navyBorder : COLORS.textDim} />
                      </TouchableOpacity>
                    </View>
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
  const canAct       = sessionStatus === "REVIEW";
  const hasFinal     = item.final_value_json != null;
  const hasSuggested = item.suggested_value_json != null;
  const needsInput   = !hasSuggested && !hasFinal;
  // "Edited from AI" when admin changed the value: final exists, suggested exists, and they differ
  const isEditedFromAI = hasFinal && hasSuggested &&
    JSON.stringify(item.final_value_json) !== JSON.stringify(item.suggested_value_json);
  const isLowBand    = item.confidence_band === "LOW";

  const reviewedAtLabel = item.reviewed_at
    ? new Date(item.reviewed_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;
  const reviewedByShort = item.reviewed_by_user_id
    ? item.reviewed_by_user_id.slice(0, 8)
    : "admin";

  return (
    <View style={[
      s.itemCard,
      item.status === "REJECTED" && s.itemCardRejected,
      isLowBand && s.itemCardLow,
    ]}>
      <View style={s.itemCardTop}>
        <View style={s.itemCardMeta}>
          <Text style={s.itemLabel}>
            {item.label}
            {item.is_required ? <Text style={s.required}> *</Text> : null}
          </Text>
          <View style={s.itemBadges}>
            {!item.is_required ? (
              <View style={s.optionalBadge}>
                <Text style={s.optionalBadgeText}>OPTIONAL</Text>
              </View>
            ) : null}
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

      {/* AI Suggestion row — always visible */}
      <View style={s.suggestedRow}>
        <Text style={s.suggestedLabel}>AI Suggestion:</Text>
        <Text style={s.suggestedValue} numberOfLines={2}>
          {hasSuggested ? valuePreview(item.suggested_value_json) : "None"}
        </Text>
      </View>

      {/* Final Value row — always visible */}
      <View style={s.finalRow}>
        <Text style={s.finalLabel}>Final Value:</Text>
        <Text style={[s.finalValue, !hasFinal && s.finalValueEmpty]} numberOfLines={2}>
          {hasFinal ? valuePreview(item.final_value_json) : "Not finalized"}
        </Text>
        {isEditedFromAI ? (
          <View style={s.editedBadge}>
            <Text style={s.editedBadgeText}>Edited from AI</Text>
          </View>
        ) : null}
      </View>

      {/* Last reviewed by / at */}
      {item.status !== "PENDING" && reviewedAtLabel ? (
        <Text style={s.reviewedAtText}>
          Last reviewed by {reviewedByShort}… on {reviewedAtLabel}
        </Text>
      ) : null}

      {item.status === "REJECTED" && item.rejection_reason ? (
        <View style={s.rejectionBox}>
          <Feather name="alert-circle" size={12} color={COLORS.red} />
          <Text style={s.rejectionText} numberOfLines={2}>{item.rejection_reason}</Text>
        </View>
      ) : null}

      {canAct ? (
        needsInput ? (
          <View style={s.needsInputSection}>
            <View style={s.needsInputChip}>
              <Feather name="alert-circle" size={12} color={COLORS.amber} />
              <Text style={s.needsInputChipText}>Needs Input</Text>
            </View>
            <Text style={s.needsInputHint}>AI could not confidently determine this. Admin input required.</Text>
            <TouchableOpacity style={s.editBtn} onPress={onEdit}>
              <Feather name="edit-2" size={13} color={COLORS.amber} />
              <Text style={s.editBtnText}>Provide Value</Text>
            </TouchableOpacity>
          </View>
        ) : (
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
        )
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
  const totalRequired = items.filter(i => i.is_required).length;
  // Only count required items that are resolved (approved/edited with a non-null final value)
  const resolvedCount = items.filter(i =>
    i.is_required &&
    (i.status === "APPROVED" || i.status === "EDITED") &&
    i.final_value_json !== null
  ).length;
  const allDone = totalRequired > 0 && resolvedCount >= totalRequired;

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
            <Text style={s.groupProgress}>{resolvedCount}/{totalRequired}</Text>
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

// ─── OnboardingProvisioningPreview ────────────────────────────────────────────

function OnboardingProvisioningPreview({ sessionId }: { sessionId: string }) {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const { data, isLoading } = useQuery<PreviewData>({
    queryKey: ["provisionPreview", sessionId],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${sessionId}/provision-preview`),
    enabled: isAdminAuthenticated && !!sessionId,
    staleTime: 15_000,
  });

  if (isLoading) return null;
  if (!data) return null;

  const previewItems: Array<{ icon: React.ComponentProps<typeof Feather>["name"]; label: string; count: number; color: string }> = [
    { icon: "git-merge",   label: "Pipelines",     count: data.pipelineCount,    color: COLORS.blue },
    { icon: "eye",         label: "Saved Views",   count: data.savedViewCount,   color: COLORS.cyan },
    { icon: "tag",         label: "Tags",          count: data.tagCount,         color: COLORS.amber },
    { icon: "users",       label: "Contact Roles", count: data.contactRoleCount, color: COLORS.purple },
    { icon: "check-square",label: "Tasks",         count: data.defaultTaskCount, color: COLORS.textDim },
    { icon: "bell",        label: "Alerts",        count: data.alertRuleCount,   color: COLORS.red },
    { icon: "plus-square", label: "Add-Ons",       count: data.addOnCount,       color: COLORS.cyan },
  ];

  return (
    <View style={s.previewCard}>
      <View style={s.previewCardHeader}>
        <Feather name="package" size={13} color={COLORS.cyan} />
        <Text style={s.previewCardTitle}>Provisioning Preview</Text>
        <Text style={s.previewCardSub}>What will be created</Text>
      </View>
      <View style={s.previewGrid}>
        {previewItems.map(pi => (
          <View key={pi.label} style={s.previewGridItem}>
            <Feather name={pi.icon} size={14} color={pi.color} />
            <Text style={s.previewGridCount}>{pi.count}</Text>
            <Text style={s.previewGridLabel} numberOfLines={1}>{pi.label}</Text>
          </View>
        ))}
      </View>
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

  const { data: progressData } = useQuery<ProgressData>({
    queryKey: ["adminOnboardingProgress", id],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${id}/progress`),
    enabled: isAdminAuthenticated && !!id,
    staleTime: 5_000,
  });

  const rebuildMutation = useMutation({
    mutationFn: () => adminFetch(`/admin/onboarding/sessions/${id}/rebuild-items`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] }),
  });

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["adminOnboardingSession", id] });
    qc.invalidateQueries({ queryKey: ["adminOnboardingProgress", id] });
    qc.invalidateQueries({ queryKey: ["provisionPreview", id] });
  }

  const approveMutation = useMutation({
    mutationFn: (itemId: string) =>
      adminFetch(`/admin/onboarding/sessions/${id}/items/${itemId}/approve`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: invalidateAll,
    onError: (e) => Alert.alert("Error", String(e)),
  });

  const editMutation = useMutation({
    mutationFn: ({ itemId, finalValue }: { itemId: string; finalValue: unknown }) =>
      adminFetch(`/admin/onboarding/sessions/${id}/items/${itemId}/edit`, {
        method: "POST",
        body: JSON.stringify({ finalValue }),
      }),
    onSuccess: invalidateAll,
    onError: (e) => Alert.alert("Error", String(e)),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ itemId, rejectionReason }: { itemId: string; rejectionReason: string }) =>
      adminFetch(`/admin/onboarding/sessions/${id}/items/${itemId}/reject`, {
        method: "POST",
        body: JSON.stringify({ rejectionReason }),
      }),
    onSuccess: invalidateAll,
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

  const sessionVertical = useMemo(() => {
    const rec = session?.normalizedRecommendation;
    if (rec) {
      const v = rec.vertical as Record<string, unknown> | null | undefined;
      const sv = rec.subVertical as Record<string, unknown> | null | undefined;
      const vertStr = v ? String(v.key ?? v.label ?? "") : "";
      const subVertStr = sv ? String(sv.key ?? sv.label ?? "") : "";
      if (vertStr || subVertStr) return [vertStr, subVertStr].filter(Boolean).join(" ");
    }
    const intake = session?.intakePayload;
    if (intake?.industryDescription) return String(intake.industryDescription);
    return null;
  }, [session]);

  const grouped = useMemo(() => {
    const map: Record<string, ReviewItem[]> = {};
    for (const item of reviewItems) {
      if (!map[item.group_key]) map[item.group_key] = [];
      map[item.group_key].push(item);
    }
    return map;
  }, [reviewItems]);

  // Use /progress endpoint data; fall back to client-side counts while loading.
  // Fallback mirrors server logic: resolved = required + (APPROVED|EDITED) + non-null final;
  // blocking = required + (PENDING | REJECTED with no final | APPROVED/EDITED with no final).
  const resolvedCount  = progressData?.resolved ?? reviewItems.filter(i =>
    i.is_required &&
    (i.status === "APPROVED" || i.status === "EDITED") &&
    i.final_value_json !== null
  ).length;
  const requiredCount  = progressData?.required  ?? reviewItems.filter(i => i.is_required).length;
  const blockingCount  = progressData?.blocking  ?? reviewItems.filter(i =>
    i.is_required && (
      i.status === "PENDING" ||
      (i.status === "REJECTED" && i.final_value_json == null) ||
      ((i.status === "APPROVED" || i.status === "EDITED") && i.final_value_json == null)
    )
  ).length;
  const blockingItems  = progressData?.blockingItems ?? reviewItems
    .filter(i =>
      i.is_required && (
        i.status === "PENDING" ||
        (i.status === "REJECTED" && i.final_value_json == null) ||
        ((i.status === "APPROVED" || i.status === "EDITED") && i.final_value_json == null)
      )
    )
    .map(i => ({ id: i.id, label: i.label, group_key: i.group_key, status: i.status }));
  const progressPct    = requiredCount > 0 ? resolvedCount / requiredCount : 0;
  const canLock        = session?.status === "REVIEW" && blockingCount === 0 && !lockMutation.isPending;
  const hasRec         = !!session?.normalizedRecommendation;
  const hasItems       = reviewItems.length > 0;

  React.useEffect(() => {
    if (!isLoading && hasRec && !hasItems && session?.status === "REVIEW" && !rebuildMutation.isPending) {
      rebuildMutation.mutate();
    }
  }, [isLoading, hasRec, hasItems, session?.status]);

  const breadcrumbs: { label: string; href?: Href }[] = [
    { label: "Onboarding", href: "/admin/onboarding" as Href },
    { label: (session?.intakePayload?.clientName as string) ?? "Session", href: `/admin/onboarding/${id}` as Href },
    { label: "Review" },
  ];

  return (
    <View style={s.container}>
      <AdminHeader breadcrumbs={breadcrumbs} />

      {/* Review Header */}
      {!isLoading && session ? (
        <View style={s.reviewHeader}>
          <View style={s.reviewHeaderLeft}>
            <Text style={s.reviewHeaderClient} numberOfLines={1}>
              {(session.intakePayload?.clientName as string) ?? "Unknown Client"}
            </Text>
            <View style={s.reviewHeaderPills}>
              {session.intakePayload?.verticalLabel || session.intakePayload?.vertical ? (
                <View style={s.clientPill}>
                  <Text style={s.clientPillText}>
                    {String(session.intakePayload?.verticalLabel ?? session.intakePayload?.vertical ?? "").toUpperCase()}
                  </Text>
                </View>
              ) : null}
              {session.intakePayload?.clientType ? (
                <View style={[s.clientPill, { backgroundColor: COLORS.cyan + "22", borderColor: COLORS.cyan }]}>
                  <Text style={[s.clientPillText, { color: COLORS.cyan }]}>
                    {String(session.intakePayload.clientType).replace(/_/g, " ")}
                  </Text>
                </View>
              ) : null}
              {session.status === "REVIEW" ? (
                <View style={[s.clientPill, { backgroundColor: COLORS.amber + "22", borderColor: COLORS.amber }]}>
                  <Text style={[s.clientPillText, { color: COLORS.amber }]}>IN REVIEW</Text>
                </View>
              ) : null}
            </View>
          </View>
          {session.grokConfidence != null ? (
            <View style={[s.confBadge, { borderColor: bandColor(confidenceBand(session.grokConfidence)) }]}>
              <Text style={[s.confBadgeLabel, { color: bandColor(confidenceBand(session.grokConfidence)) }]}>
                {Math.round(session.grokConfidence * 100)}%
              </Text>
              <Text style={s.confBadgeSub}>AI Confidence</Text>
            </View>
          ) : null}
        </View>
      ) : null}

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
                {resolvedCount} of {requiredCount} required items resolved
                {blockingCount > 0 ? ` · ${blockingCount} blocking` : ""}
              </Text>
            </View>

            {/* Blocking items list above groups */}
            {blockingItems.length > 0 ? (
              <View style={s.blockersSection}>
                <View style={s.blockersSectionHeader}>
                  <Feather name="alert-circle" size={13} color={COLORS.red} />
                  <Text style={s.blockersSectionTitle}>Blocking items — must resolve before provisioning</Text>
                </View>
                {blockingItems.map(b => (
                  <View key={b.id} style={s.blockerRow}>
                    <View style={s.blockerDot} />
                    <Text style={s.blockerRowText} numberOfLines={1}>
                      {GROUP_META[b.group_key]?.label ?? b.group_key}: {b.label}
                    </Text>
                    <View style={[s.statusBadge, { backgroundColor: COLORS.red + "22", borderColor: COLORS.red }]}>
                      <Text style={[s.statusBadgeText, { color: COLORS.red }]}>{b.status}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

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

            {/* Provisioning Preview — shows what will be created */}
            {session?.status === "REVIEW" && id ? (
              <OnboardingProvisioningPreview sessionId={id} />
            ) : null}

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
          {blockingCount > 0 ? (
            <View style={s.footerBlockers}>
              <Feather name="alert-circle" size={12} color={COLORS.red} />
              <Text style={s.footerBlockerText} numberOfLines={1}>
                {blockingCount} item{blockingCount > 1 ? "s" : ""} blocking — see list above
              </Text>
            </View>
          ) : (
            <View style={s.footerBlockers}>
              <Feather name="check-circle" size={12} color={COLORS.emerald} />
              <Text style={[s.footerBlockerText, { color: COLORS.emerald }]}>All required items resolved</Text>
            </View>
          )}
          <View style={s.footerActions}>
            <TouchableOpacity
              style={s.footerBackBtn}
              onPress={() => router.back()}
            >
              <Feather name="arrow-left" size={14} color={COLORS.textDim} />
              <Text style={s.footerBackBtnText}>Back</Text>
            </TouchableOpacity>
            <View style={s.footerAutosaveHint}>
              <Feather name="check" size={11} color={COLORS.emerald} />
              <Text style={s.footerAutosaveText}>Auto-saved</Text>
            </View>
            <TouchableOpacity
              style={[s.lockBtn, !canLock && s.btnDisabled]}
              disabled={!canLock}
              onPress={() => {
                Alert.alert(
                  "Apply & Provision?",
                  "This locks the review and immediately starts workspace provisioning. You cannot edit the review after this step.",
                  [
                    { text: "Cancel", style: "cancel" },
                    { text: "Apply & Provision", style: "destructive", onPress: () => lockMutation.mutate() },
                  ]
                );
              }}
            >
              {lockMutation.isPending
                ? <ActivityIndicator color={COLORS.navyDark} size="small" />
                : <Feather name="lock" size={14} color={COLORS.navyDark} />}
              <Text style={s.lockBtnText}>Apply & Provision</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {editItem ? (
        <EditModal
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={value => editMutation.mutate({ itemId: editItem.id, finalValue: value })}
          sessionVertical={sessionVertical}
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
  itemCardLow:        { borderColor: COLORS.amber + "88" },
  itemCardTop:        { marginBottom: 6 },
  itemCardMeta:       { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  itemLabel:          { color: COLORS.text, fontSize: 13, fontWeight: "600", flex: 1, marginRight: 8 },
  required:           { color: COLORS.amber },
  itemBadges:         { flexDirection: "row", gap: 6 },
  bandBadge:          { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  bandBadgeText:      { fontSize: 10, fontWeight: "700" },
  statusBadge:        { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  statusBadgeText:    { fontSize: 10, fontWeight: "700" },
  suggestedRow:       { flexDirection: "row", alignItems: "flex-start", gap: 4, marginBottom: 3 },
  suggestedLabel:     { color: COLORS.textDim, fontSize: 11, fontWeight: "700", minWidth: 82, paddingTop: 1 },
  suggestedValue:     { color: COLORS.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
  finalRow:           { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 6 },
  finalLabel:         { color: COLORS.amber, fontSize: 11, fontWeight: "700", minWidth: 82, paddingTop: 1 },
  finalValue:         { color: COLORS.text, fontSize: 12, flex: 1, lineHeight: 17 },
  finalValueEmpty:    { color: COLORS.textDim, fontStyle: "italic" },
  editedBadge:        { backgroundColor: COLORS.amber + "22", borderWidth: 1, borderColor: COLORS.amber + "66", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  editedBadgeText:    { color: COLORS.amber, fontSize: 9, fontWeight: "700" },
  reviewedAtText:     { color: COLORS.textDim, fontSize: 10, fontStyle: "italic", marginBottom: 6 },
  needsInputSection:  { gap: 6, marginTop: 4 },
  needsInputChip:     { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", backgroundColor: COLORS.amber + "22", borderWidth: 1, borderColor: COLORS.amber + "88", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  needsInputChipText: { color: COLORS.amber, fontSize: 11, fontWeight: "700" },
  needsInputHint:     { color: COLORS.textDim, fontSize: 11, lineHeight: 15 },
  rejectionBox:       { flexDirection: "row", gap: 6, alignItems: "flex-start", backgroundColor: COLORS.red + "11", borderRadius: 6, padding: 8, marginBottom: 8 },
  rejectionText:      { color: COLORS.red, fontSize: 11, flex: 1 },

  previewCard:        { backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1, borderColor: COLORS.cyan + "44", padding: 14, marginTop: 8, marginBottom: 8 },
  previewCardHeader:  { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  previewCardTitle:   { color: COLORS.text, fontSize: 13, fontWeight: "700", flex: 1 },
  previewCardSub:     { color: COLORS.textDim, fontSize: 11 },
  previewGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  previewGridItem:    { alignItems: "center", gap: 3, width: "22%", paddingVertical: 8, backgroundColor: COLORS.navySurface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder },
  previewGridCount:   { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  previewGridLabel:   { color: COLORS.textDim, fontSize: 9, fontWeight: "600", textAlign: "center" },

  presetsSection:     { borderWidth: 1, borderColor: COLORS.cyan + "44", borderRadius: 10, padding: 10, marginBottom: 10 },
  presetsHeader:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  presetsTitle:       { color: COLORS.cyan, fontSize: 12, fontWeight: "700" },
  presetsChips:       { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  presetChip:         { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: COLORS.cyan + "18", borderWidth: 1, borderColor: COLORS.cyan + "55", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 },
  presetChipAdded:    { backgroundColor: COLORS.emerald + "18", borderColor: COLORS.emerald + "55" },
  presetChipText:     { color: COLORS.cyan, fontSize: 11, fontWeight: "600", maxWidth: 160 },
  presetChipTextAdded:{ color: COLORS.emerald },

  blockersSection:       { backgroundColor: COLORS.red + "11", borderRadius: 10, borderWidth: 1, borderColor: COLORS.red + "44", padding: 12, marginBottom: 14 },
  blockersSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  blockersSectionTitle:  { color: COLORS.red, fontSize: 12, fontWeight: "700", flex: 1 },
  blockerRow:            { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 5 },
  blockerDot:            { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.red },
  blockerRowText:        { color: COLORS.text, fontSize: 12, flex: 1 },

  optionalBadge:         { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderColor: COLORS.textDim + "66", backgroundColor: COLORS.textDim + "11" },
  optionalBadgeText:     { fontSize: 9, fontWeight: "700", color: COLORS.textDim, letterSpacing: 0.5 },

  govconToggle:          { flexDirection: "row", alignItems: "center", gap: 3, borderWidth: 1, borderColor: COLORS.navyBorder, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 3 },
  govconToggleActive:    { borderColor: COLORS.amber + "88", backgroundColor: COLORS.amber + "11" },
  govconToggleText:      { color: COLORS.textDim, fontSize: 10, fontWeight: "600" },

  itemActions:        { flexDirection: "row", gap: 8 },
  approveBtn:         { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: COLORS.emerald, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  approveBtnText:     { color: COLORS.navyDark, fontSize: 12, fontWeight: "700" },
  approvedIndicator:  { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  approvedText:       { color: COLORS.emerald, fontSize: 12, fontWeight: "600" },
  editBtn:            { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: COLORS.amber + "66", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  editBtnText:        { color: COLORS.amber, fontSize: 12, fontWeight: "600" },
  rejectBtn2:         { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: COLORS.red + "66", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  rejectBtnText2:     { color: COLORS.red, fontSize: 12, fontWeight: "600" },

  footer:             { paddingHorizontal: 16, paddingVertical: 12, paddingBottom: Platform.OS === "ios" ? 28 : 12, backgroundColor: COLORS.navyMid, borderTopWidth: 1, borderColor: COLORS.navyBorder },
  footerBlockers:     { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10 },
  footerBlockerText:  { color: COLORS.red, fontSize: 12, flex: 1 },
  footerActions:      { flexDirection: "row", alignItems: "center", gap: 8 },
  footerBackBtn:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder },
  footerBackBtnText:  { color: COLORS.textDim, fontSize: 13 },
  footerAutosaveHint: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 10 },
  footerAutosaveText: { color: COLORS.emerald, fontSize: 11, fontStyle: "italic" },
  lockBtn:            { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, backgroundColor: COLORS.amber, paddingHorizontal: 12, paddingVertical: 11, borderRadius: 10 },
  lockBtnText:        { color: COLORS.navyDark, fontSize: 13, fontWeight: "700" },

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

  reviewHeader:       { backgroundColor: COLORS.navyCard, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: COLORS.navyBorder, flexDirection: "row", alignItems: "center" },
  reviewHeaderLeft:   { flex: 1 },
  reviewHeaderClient: { color: COLORS.text, fontSize: 16, fontWeight: "700", marginBottom: 6 },
  reviewHeaderPills:  { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  clientPill:         { borderRadius: 5, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: COLORS.amber + "22", borderColor: COLORS.amber },
  clientPillText:     { color: COLORS.amber, fontSize: 10, fontWeight: "700" },
  confBadge:          { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignItems: "center", marginLeft: 12 },
  confBadgeLabel:     { fontSize: 18, fontWeight: "800" },
  confBadgeSub:       { color: COLORS.textDim, fontSize: 10, marginTop: 2 },

  chipRow:            { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: COLORS.navyBorder },
  colorDot:           { width: 12, height: 12, borderRadius: 6 },
  chipText:           { color: COLORS.text, fontSize: 13, flex: 1 },
  reorderBtns:        { gap: 2 },
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
