import React, { useState, useCallback, useRef, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  ActivityIndicator, TextInput, ScrollView, Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import { COLORS } from "@/constants/colors";
import { getApiToken } from "@/hooks/tokenStore";
import { useAuth } from "@/contexts/AuthContext";

// ── Constants ─────────────────────────────────────────────────────────────────

const INDIGO = "#6366f1";

function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  if (Platform.OS === "android") return "http://10.0.2.2:8080/api";
  return "http://localhost:8080/api";
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportType = "organizations" | "contacts";
type Phase =
  | "source"
  | "uploading"
  | "analyzing"
  | "hierarchy"
  | "review"
  | "contacts"
  | "enriching"
  | "seo"
  | "saving"
  | "summary";
type RowStatus = "ready" | "warning" | "error";

interface MappedRow {
  _rowStatus: RowStatus;
  _rowIssues: string[];
  _suggestedParentName?: string;
  _tags?: string[];
  [key: string]: unknown;
}

interface AnalyzeResult {
  sessionToken: string;
  importType: ImportType;
  totalRows: number;
  ready: number;
  warnings: number;
  errors: number;
  rows: MappedRow[];
}

interface SkippedDuplicate {
  name: string;
  existingOrganizationId: string;
}

interface PlaceholderContact {
  id: string;
  fullName: string;
  title: string;
  orgName: string;
}

interface CommitResult {
  created: number;
  skipped: number;
  skippedDuplicates: SkippedDuplicate[];
  errors: number;
  errorDetails: string[];
  placeholderContacts?: PlaceholderContact[];
}

interface HierarchyGroup {
  systemName: string;
  rowNames: string[];
}

interface TagsByRow {
  rowName: string;
  suggestedTags: string[];
}

interface SuggestedContact {
  fullName: string;
  title: string;
  abbr: string;
  dept: string;
  phone?: string;
  linkedinUrl?: string;
  source: string;
}

interface OrgContactSuggestion {
  orgName: string;
  orgType: string;
  city: unknown;
  state: unknown;
  suggestedContacts: SuggestedContact[];
}

interface OrgEnrichmentField {
  key: string;
  label: string;
  value: string;
  confidence: number;
  source: string;
}

interface OrgEnrichment {
  orgName: string;
  fields: OrgEnrichmentField[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(s: RowStatus) {
  if (s === "ready") return COLORS.emerald;
  if (s === "warning") return COLORS.amber;
  return COLORS.red;
}

function displayName(row: MappedRow, importType: ImportType): string {
  if (importType === "organizations") {
    return (row.name as string) || "—";
  }
  return (row.fullName as string) || [(row.firstName as string), (row.lastName as string)].filter(Boolean).join(" ") || "—";
}

function displaySub(row: MappedRow, importType: ImportType): string {
  if (importType === "organizations") {
    const parts = [(row.city as string), (row.state as string)].filter(Boolean);
    return [row.organizationType as string, parts.join(", ")].filter(Boolean).join(" · ");
  }
  return [(row.title as string), (row.organizationName as string)].filter(Boolean).join(" · ");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Progress messages ─────────────────────────────────────────────────────────

const UPLOAD_MESSAGES = [
  "Uploading file…",
  "Reading spreadsheet…",
  "Preparing data…",
];

const ANALYZE_MESSAGES = [
  "Sending to Grok AI…",
  "Analyzing columns…",
  "Mapping fields intelligently…",
  "Detecting organization types…",
  "Validating records…",
  "Almost done…",
];

// ── ProgressView ──────────────────────────────────────────────────────────────

function ProgressView({ phase }: { phase: "uploading" | "analyzing" }) {
  const [msgIdx, setMsgIdx] = useState(0);
  const messages = phase === "uploading" ? UPLOAD_MESSAGES : ANALYZE_MESSAGES;

  React.useEffect(() => {
    const interval = setInterval(() => {
      setMsgIdx((i) => (i + 1) % messages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [messages]);

  return (
    <View style={pv.wrap}>
      <View style={pv.iconWrap}>
        <ActivityIndicator size="large" color={INDIGO} />
      </View>
      <Text style={pv.msg}>{messages[msgIdx]}</Text>
      <Text style={pv.sub}>
        {phase === "uploading" ? "Reading your file…" : "Grok AI is mapping columns to the CRM schema…"}
      </Text>
    </View>
  );
}

// ── EditRowModal ──────────────────────────────────────────────────────────────

function EditRowModal({
  visible,
  row,
  importType,
  onSave,
  onClose,
}: {
  visible: boolean;
  row: MappedRow | null;
  importType: ImportType;
  onSave: (updated: MappedRow) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<MappedRow | null>(null);

  React.useEffect(() => {
    if (row) setDraft({ ...row });
  }, [row]);

  if (!draft) return null;

  const orgFields: Array<{ key: string; label: string }> = [
    { key: "name", label: "Facility Name" },
    { key: "organizationType", label: "Type" },
    { key: "addressLine1", label: "Address" },
    { key: "city", label: "City" },
    { key: "state", label: "State" },
    { key: "zip", label: "Zip" },
    { key: "phone", label: "Phone" },
    { key: "email", label: "Email" },
    { key: "website", label: "Website" },
    { key: "notes", label: "Notes" },
  ];

  const contactFields: Array<{ key: string; label: string }> = [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "fullName", label: "Full Name" },
    { key: "title", label: "Title" },
    { key: "department", label: "Department" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "organizationName", label: "Organization" },
    { key: "notes", label: "Notes" },
  ];

  const fields = importType === "organizations" ? orgFields : contactFields;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={em.overlay}>
        <View style={em.sheet}>
          <View style={em.head}>
            <Text style={em.title}>Edit Record</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={em.body} keyboardShouldPersistTaps="handled">
            {fields.map(({ key, label }) => (
              <View key={key} style={em.fieldRow}>
                <Text style={em.label}>{label}</Text>
                <TextInput
                  style={em.input}
                  value={(draft[key] as string | undefined) ?? ""}
                  onChangeText={(v) => setDraft((d) => d ? { ...d, [key]: v } : d)}
                  placeholderTextColor={COLORS.textDim}
                  placeholder={`Enter ${label.toLowerCase()}…`}
                  multiline={key === "notes"}
                />
              </View>
            ))}
          </ScrollView>
          <View style={em.footer}>
            <TouchableOpacity style={em.cancelBtn} onPress={onClose}>
              <Text style={em.cancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={em.saveBtn}
              onPress={() => {
                const updated = { ...draft, _rowStatus: "ready" as RowStatus, _rowIssues: [] };
                onSave(updated);
                onClose();
              }}
            >
              <Feather name="check" size={14} color={COLORS.white} />
              <Text style={em.saveTxt}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── RowCard ───────────────────────────────────────────────────────────────────

function RowCard({
  row,
  index,
  importType,
  onEdit,
  onToggleExclude,
  excluded,
  selectedTags,
  onTagToggle,
}: {
  row: MappedRow;
  index: number;
  importType: ImportType;
  onEdit: () => void;
  onToggleExclude: () => void;
  excluded: boolean;
  selectedTags?: string[];
  onTagToggle?: (tag: string) => void;
}) {
  const sc = statusColor(row._rowStatus);
  const name = displayName(row, importType);
  const sub = displaySub(row, importType);
  const addr = importType === "organizations" ? (row.addressLine1 as string | undefined) : undefined;
  const hasTags = importType === "organizations" && Array.isArray(row._tags) && (row._tags as string[]).length > 0;

  return (
    <View style={[rc.card, excluded && rc.excludedCard]}>
      <View style={rc.left}>
        <TouchableOpacity onPress={onToggleExclude} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather
            name={excluded ? "square" : "check-square"}
            size={17}
            color={excluded ? COLORS.textDim : COLORS.emerald}
          />
        </TouchableOpacity>
      </View>

      <View style={rc.middle}>
        <View style={rc.nameRow}>
          <Text style={[rc.name, excluded && rc.excludedText]} numberOfLines={1}>{name}</Text>
          <View style={[rc.badge, { backgroundColor: sc + "22" }]}>
            <Text style={[rc.badgeTxt, { color: sc }]}>{row._rowStatus}</Text>
          </View>
        </View>
        {sub ? <Text style={[rc.sub, excluded && rc.excludedText]} numberOfLines={1}>{sub}</Text> : null}
        {addr ? (
          <View style={rc.addrRow}>
            <Feather name="map-pin" size={9} color={COLORS.textDim} />
            <Text style={rc.addrTxt} numberOfLines={1}>
              {[addr, row.city as string, row.state as string].filter(Boolean).join(", ")}
              {row.zip ? " " + (row.zip as string) : ""}
            </Text>
          </View>
        ) : null}
        {hasTags && (
          <View style={rc.tagsRow}>
            {(row._tags as string[]).map((tag) => {
              const active = selectedTags ? selectedTags.includes(tag) : true;
              return (
                <TouchableOpacity
                  key={tag}
                  onPress={() => onTagToggle?.(tag)}
                  style={[rc.tagChip, active ? rc.tagChipActive : rc.tagChipInactive]}
                >
                  <Text style={[rc.tagTxt, { color: active ? INDIGO : COLORS.textDim }]}>
                    {tag}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {row._rowIssues && (row._rowIssues as string[]).length > 0 && (
          <View style={rc.issueRow}>
            <Feather name="alert-circle" size={11} color={COLORS.amber} />
            <Text style={rc.issueTxt} numberOfLines={2}>{(row._rowIssues as string[]).join("; ")}</Text>
          </View>
        )}
        {row._rowStatus === "warning" && importType === "organizations" && !addr && (
          <Text style={rc.grokNote}>Grok will fill in missing address and contact details during enrichment.</Text>
        )}
      </View>

      <TouchableOpacity style={rc.editBtn} onPress={onEdit}>
        <Feather name="edit-2" size={14} color={COLORS.textMuted} />
      </TouchableOpacity>
    </View>
  );
}

// ── HierarchyPhase ────────────────────────────────────────────────────────────

function HierarchyPhase({
  groups,
  rowCount,
  onAccept,
  onSkip,
}: {
  groups: HierarchyGroup[];
  rowCount: number;
  onAccept: (groups: HierarchyGroup[]) => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [accepted, setAccepted] = useState<Set<string>>(
    new Set(groups.map((g) => g.systemName)),
  );

  const toggle = (name: string) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Org Hierarchy", headerBackVisible: false }} />

      <View style={hp.banner}>
        <View style={hp.bannerIcon}>
          <Feather name="cpu" size={13} color={COLORS.white} />
        </View>
        <Text style={hp.bannerTxt}>
          {groups.length > 0
            ? `Grok detected ${groups.length} parent system${groups.length !== 1 ? "s" : ""} across ${rowCount} rows`
            : "No multi-facility hierarchies detected in this import"}
        </Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {groups.length === 0 ? (
          <View style={hp.emptyCard}>
            <Feather name="check-circle" size={28} color={COLORS.emerald} />
            <Text style={hp.emptyTitle}>All records look standalone</Text>
            <Text style={hp.emptySub}>No shared parent systems were found. Tap Continue to proceed to review.</Text>
          </View>
        ) : (
          groups.map((group) => {
            const isOn = accepted.has(group.systemName);
            return (
              <View key={group.systemName} style={hp.groupCard}>
                <View style={hp.groupHeader}>
                  <View style={hp.groupIconWrap}>
                    <Feather name="layers" size={13} color={INDIGO} />
                  </View>
                  <Text style={hp.groupSystemName} numberOfLines={1}>{group.systemName}</Text>
                  <Text style={hp.groupCount}>{group.rowNames.length} orgs</Text>
                  <TouchableOpacity
                    onPress={() => toggle(group.systemName)}
                    style={[hp.toggleBtn, isOn ? hp.toggleBtnOn : hp.toggleBtnOff]}
                  >
                    <Text style={[hp.toggleTxt, { color: isOn ? INDIGO : COLORS.textDim }]}>
                      {isOn ? "Apply" : "Skip"}
                    </Text>
                  </TouchableOpacity>
                </View>
                {group.rowNames.map((rowName, i) => (
                  <View key={i} style={hp.rowName}>
                    <View style={hp.rowDot} />
                    <Text style={hp.rowNameTxt} numberOfLines={1}>{rowName}</Text>
                  </View>
                ))}
                {isOn && (
                  <View style={hp.suggestionNote}>
                    <Feather name="info" size={11} color={INDIGO} />
                    <Text style={hp.suggestionNoteTxt}>
                      "{group.systemName}" will be saved as suggested parent system
                    </Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <View style={[hp.footer, { paddingBottom: insets.bottom + 8 }]}>
        {groups.length > 0 && (
          <View style={hp.footerTop}>
            <TouchableOpacity
              style={hp.acceptAllBtn}
              onPress={() => setAccepted(new Set(groups.map((g) => g.systemName)))}
            >
              <Feather name="check-square" size={13} color={INDIGO} />
              <Text style={hp.acceptAllTxt}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={hp.skipAllBtn} onPress={onSkip}>
              <Text style={hp.skipAllTxt}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          style={hp.continueBtn}
          onPress={() => onAccept(groups.filter((g) => accepted.has(g.systemName)))}
        >
          <Text style={hp.continueTxt}>
            {accepted.size > 0 ? `Apply ${accepted.size} Hierarch${accepted.size !== 1 ? "ies" : "y"}` : "Continue to Review"}
          </Text>
          <Feather name="arrow-right" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── ContactsPhase ─────────────────────────────────────────────────────────────

const CSUITE_ABBRS = new Set(["CEO", "COO", "CFO", "CMO", "CNO", "CIO"]);
const CLINICAL_ABBRS = new Set(["CNO", "CMO", "DON", "DED", "DCM"]);
const contactFilterKey = (workspaceId: string) => `@bulk_contact_filter_v1:${workspaceId}`;

type ContactFilter = "all" | "csuite" | "clinical";

function matchesFilter(abbr: string, filter: ContactFilter): boolean {
  if (filter === "all") return true;
  if (filter === "csuite") return CSUITE_ABBRS.has(abbr);
  return CLINICAL_ABBRS.has(abbr);
}

function ContactsPhase({
  orgSuggestions,
  onConfirm,
  onSkip,
}: {
  orgSuggestions: OrgContactSuggestion[];
  onConfirm: (contacts: { fullName: string; title: string; dept: string; orgName: string }[]) => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { workspace } = useAuth();
  const storageKey = contactFilterKey(workspace?.id ?? "default");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<ContactFilter | null>(null);
  const [scopeMode, setScopeMode] = useState<"all" | "chosen">("all");
  const [chosenOrgs, setChosenOrgs] = useState<Set<number>>(new Set());

  // Compute which org indices a bulk action targets
  const targetIndices = (scope: "all" | "chosen", chosen: Set<number>): number[] => {
    if (scope === "all" || chosen.size === 0) return orgSuggestions.map((_, i) => i);
    return Array.from(chosen);
  };

  // Apply a filter to target orgs.
  // "all" scope: replaces entire selection with matching keys across all orgs.
  // "chosen" scope: merges — only modifies keys in target orgs, leaving other orgs untouched.
  const applyFilter = (filter: ContactFilter) => {
    const targets = targetIndices(scopeMode, chosenOrgs);
    const isChosenScope = scopeMode === "chosen" && chosenOrgs.size > 0;

    if (isChosenScope) {
      setSelected((prev) => {
        const next = new Set(prev);
        targets.forEach((oi) => {
          // Clear existing selections for this org, then add matching ones
          orgSuggestions[oi]?.suggestedContacts.forEach((c, ri) => {
            const key = `${oi}-${ri}`;
            if (matchesFilter(c.abbr, filter)) next.add(key);
            else next.delete(key);
          });
        });
        return next;
      });
    } else {
      // All-orgs scope: build a fresh set (replaces everything)
      const next = new Set<string>();
      targets.forEach((oi) => {
        orgSuggestions[oi]?.suggestedContacts.forEach((c, ri) => {
          if (matchesFilter(c.abbr, filter)) next.add(`${oi}-${ri}`);
        });
      });
      setSelected(next);
    }

    setActiveFilter(filter);
    AsyncStorage.setItem(storageKey, filter).catch(() => {});
  };

  const clearAll = () => {
    setSelected(new Set());
    setActiveFilter(null);
    AsyncStorage.removeItem(storageKey).catch(() => {});
  };

  // On mount, restore and pre-apply last-used filter across all orgs
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((val) => {
      if (val !== "all" && val !== "csuite" && val !== "clinical") return;
      const filter = val as ContactFilter;
      const next = new Set<string>();
      orgSuggestions.forEach((org, oi) => {
        org.suggestedContacts.forEach((c, ri) => {
          if (
            filter === "all" ||
            (filter === "csuite" && CSUITE_ABBRS.has(c.abbr)) ||
            (filter === "clinical" && CLINICAL_ABBRS.has(c.abbr))
          ) {
            next.add(`${oi}-${ri}`);
          }
        });
      });
      setSelected(next);
      setActiveFilter(filter);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleOrgAllNone = (oi: number) => {
    const orgKeys = orgSuggestions[oi]?.suggestedContacts.map((_, ri) => `${oi}-${ri}`) ?? [];
    const allOn = orgKeys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOn) orgKeys.forEach((k) => next.delete(k));
      else orgKeys.forEach((k) => next.add(k));
      return next;
    });
  };

  const toggleChosenOrg = (oi: number) => {
    setChosenOrgs((prev) => {
      const next = new Set(prev);
      if (next.has(oi)) next.delete(oi); else next.add(oi);
      return next;
    });
  };

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const buildContacts = () => {
    const result: { fullName: string; title: string; dept: string; orgName: string; phone?: string; linkedinUrl?: string }[] = [];
    orgSuggestions.forEach((org, oi) => {
      org.suggestedContacts.forEach((contact, ri) => {
        if (selected.has(`${oi}-${ri}`)) {
          result.push({
            fullName: contact.fullName,
            title: contact.title,
            dept: contact.dept,
            orgName: org.orgName as string,
            phone: contact.phone,
            linkedinUrl: contact.linkedinUrl,
          });
        }
      });
    });
    return result;
  };

  const scopeLabel = scopeMode === "all"
    ? `All ${orgSuggestions.length} org${orgSuggestions.length !== 1 ? "s" : ""}`
    : chosenOrgs.size > 0 ? `${chosenOrgs.size} org${chosenOrgs.size !== 1 ? "s" : ""}` : "Choose orgs";

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Contact Suggestions", headerBackVisible: false }} />

      {/* Banner */}
      <View style={cp.banner}>
        <View style={cp.bannerIcon}>
          <Feather name="cpu" size={13} color={COLORS.white} />
        </View>
        <Text style={cp.bannerTxt}>
          Grok suggests key decision-maker roles — select any to create placeholder contacts
        </Text>
        {selected.size > 0 && (
          <View style={cp.selectedPill}>
            <Text style={cp.selectedPillTxt}>{selected.size}</Text>
          </View>
        )}
      </View>

      {/* Quick-select toolbar */}
      <View style={cp.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={cp.filterScroll}>
          {(["all", "csuite", "clinical"] as ContactFilter[]).map((f) => {
            const labels: Record<ContactFilter, string> = { all: "Select All", csuite: "C-Suite", clinical: "Clinical" };
            const isActive = activeFilter === f;
            return (
              <TouchableOpacity
                key={f}
                style={[cp.filterPill, isActive && cp.filterPillActive]}
                onPress={() => applyFilter(f)}
              >
                <Text style={[cp.filterPillTxt, isActive && cp.filterPillTxtActive]}>{labels[f]}</Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={cp.filterPillClear} onPress={clearAll}>
            <Text style={cp.filterPillClearTxt}>Clear</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Scope picker */}
      <View style={cp.scopeRow}>
        <Text style={cp.scopeLabel}>Apply to</Text>
        <TouchableOpacity
          style={[cp.scopePill, scopeMode === "all" && cp.scopePillActive]}
          onPress={() => setScopeMode("all")}
        >
          <Text style={[cp.scopePillTxt, scopeMode === "all" && cp.scopePillTxtActive]}>
            All {orgSuggestions.length} org{orgSuggestions.length !== 1 ? "s" : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[cp.scopePill, scopeMode === "chosen" && cp.scopePillActive]}
          onPress={() => setScopeMode("chosen")}
        >
          <Text style={[cp.scopePillTxt, scopeMode === "chosen" && cp.scopePillTxtActive]}>
            {scopeLabel}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {orgSuggestions.map((org, oi) => {
          const orgKeys = org.suggestedContacts.map((_, ri) => `${oi}-${ri}`);
          const allOrgOn = orgKeys.length > 0 && orgKeys.every((k) => selected.has(k));
          const isChosen = chosenOrgs.has(oi);
          return (
            <View key={oi} style={{ marginBottom: 20 }}>
              <View style={cp.orgHeader}>
                {scopeMode === "chosen" && (
                  <TouchableOpacity
                    onPress={() => toggleChosenOrg(oi)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <View style={[cp.orgScopeBox, isChosen && cp.orgScopeBoxActive]}>
                      {isChosen && <Feather name="check" size={9} color={COLORS.emerald} />}
                    </View>
                  </TouchableOpacity>
                )}
                <View style={cp.orgIcon}>
                  <Feather name="home" size={12} color={COLORS.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={cp.orgName} numberOfLines={1}>{org.orgName as string}</Text>
                  <Text style={cp.orgMeta}>{org.orgType}{org.city ? ` · ${org.city}, ${org.state}` : ""}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => toggleOrgAllNone(oi)}
                  hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
                  style={cp.orgToggleBtn}
                >
                  <Text style={cp.orgToggleTxt}>{allOrgOn ? "None" : "All"}</Text>
                </TouchableOpacity>
              </View>

              {org.suggestedContacts.map((contact, ri) => {
                const key = `${oi}-${ri}`;
                const isOn = selected.has(key);
                const isTemplate = contact.source === "role_template";
                return (
                  <TouchableOpacity
                    key={ri}
                    style={[cp.roleCard, isOn && cp.roleCardActive]}
                    onPress={() => toggle(key)}
                  >
                    <View style={[cp.checkbox, isOn && cp.checkboxActive]}>
                      {isOn && <Feather name="check" size={10} color={COLORS.emerald} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      {isTemplate ? (
                        <>
                          <Text style={cp.roleName}>{contact.title}</Text>
                          <Text style={cp.roleDept}>{contact.dept} · Placeholder — add real name after import</Text>
                        </>
                      ) : (
                        <>
                          <Text style={cp.roleName}>{contact.fullName}</Text>
                          <Text style={cp.roleDept}>{contact.title} · {contact.dept}</Text>
                          {contact.phone ? <Text style={cp.roleDetail}>{contact.phone}</Text> : null}
                          {contact.linkedinUrl ? (
                            <Text style={cp.roleDetail} numberOfLines={1}>{contact.linkedinUrl.replace("https://www.", "")}</Text>
                          ) : null}
                        </>
                      )}
                    </View>
                    <View style={[cp.abbrChip, isTemplate && { opacity: 0.5 }]}>
                      <Text style={cp.abbrTxt}>{contact.abbr}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          );
        })}
        <Text style={cp.disclaimer}>
          Verified contacts come from public sources via Grok web search. Role placeholders have no pre-filled data — add real names after import.
        </Text>
      </ScrollView>

      <View style={[cp.footer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={cp.footerTop}>
          <TouchableOpacity style={cp.addBtn} onPress={() => onConfirm(buildContacts())} disabled={selected.size === 0}>
            <Feather name="user-plus" size={13} color={selected.size > 0 ? INDIGO : COLORS.textDim} />
            <Text style={[cp.addTxt, { color: selected.size > 0 ? INDIGO : COLORS.textDim }]}>
              {selected.size > 0 ? `Add ${selected.size} Contact${selected.size !== 1 ? "s" : ""}` : "None selected"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={cp.skipBtn} onPress={onSkip}>
            <Text style={cp.skipTxt}>Skip</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={cp.continueBtn} onPress={() => onConfirm(buildContacts())}>
          <Feather name="arrow-right" size={16} color={COLORS.white} />
          <Text style={cp.continueTxt}>
            {selected.size > 0 ? `Continue with ${selected.size} Contact${selected.size !== 1 ? "s" : ""}` : "Continue"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── SeoPhase ──────────────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 85 ? COLORS.emerald : pct >= 70 ? COLORS.amber : COLORS.red;
  return (
    <View style={spf.barWrap}>
      <View style={[spf.barFill, { width: `${pct}%` as unknown as number, backgroundColor: color + "99" }]} />
      <Text style={[spf.barLabel, { color }]}>{pct}%</Text>
    </View>
  );
}

function SeoPhase({
  orgEnrichments,
  emptyOrgs,
  orgCount,
  onAccept,
  onSkip,
}: {
  orgEnrichments: OrgEnrichment[];
  emptyOrgs: string[];
  orgCount: number;
  onAccept: (accepted: { orgName: string; fields: OrgEnrichmentField[] }[]) => void;
  onSkip: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [emptyDismissed, setEmptyDismissed] = useState(false);
  const [emptyExpanded, setEmptyExpanded] = useState(false);

  const buildKey = (oi: number, fi: number) => `${oi}-${fi}`;

  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = new Set<string>();
    orgEnrichments.forEach((org, oi) => {
      org.fields.forEach((_, fi) => s.add(buildKey(oi, fi)));
    });
    return s;
  });

  const totalFields = orgEnrichments.reduce((n, o) => n + o.fields.length, 0);

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    const all = new Set<string>();
    orgEnrichments.forEach((org, oi) => org.fields.forEach((_, fi) => all.add(buildKey(oi, fi))));
    setSelected(all);
  };

  const clearAll = () => setSelected(new Set());

  const buildAccepted = () => {
    return orgEnrichments
      .map((org, oi) => ({
        orgName: org.orgName,
        fields: org.fields.filter((_, fi) => selected.has(buildKey(oi, fi))),
      }))
      .filter((o) => o.fields.length > 0);
  };

  if (orgEnrichments.length === 0) {
    return (
      <View style={[s.screen, { paddingBottom: insets.bottom }]}>
        <Stack.Screen options={{ title: "Web Enrichment", headerBackVisible: false }} />
        <View style={sp.banner}>
          <View style={sp.bannerIcon}><Feather name="cpu" size={13} color={COLORS.white} /></View>
          <Text style={sp.bannerTxt}>Grok scanned {orgCount} org{orgCount !== 1 ? "s" : ""} across 5 public sources</Text>
        </View>
        <View style={[s.center, { flex: 1 }]}>
          <View style={sp.emptyCard}>
            <Feather name="check-circle" size={28} color={COLORS.emerald} />
            <Text style={sp.emptyTitle}>No new data found</Text>
            <Text style={sp.emptySub}>Public sources didn't return enrichable fields for these orgs. You can still complete the import.</Text>
          </View>
        </View>
        <View style={[sp.footer, { paddingBottom: insets.bottom + 8 }]}>
          <TouchableOpacity style={sp.completeBtn} onPress={() => onAccept([])}>
            <Feather name="upload" size={16} color={COLORS.white} />
            <Text style={sp.completeTxt}>Complete Import</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Web Enrichment", headerBackVisible: false }} />

      <View style={sp.banner}>
        <View style={sp.bannerIcon}><Feather name="cpu" size={13} color={COLORS.white} /></View>
        <Text style={sp.bannerTxt}>
          Grok found {totalFields} enrichable field{totalFields !== 1 ? "s" : ""} across {orgEnrichments.length} org{orgEnrichments.length !== 1 ? "s" : ""} — select which to apply
        </Text>
        {selected.size > 0 && (
          <View style={cp.selectedPill}>
            <Text style={cp.selectedPillTxt}>{selected.size}</Text>
          </View>
        )}
      </View>

      <View style={sp.toolbar}>
        <TouchableOpacity style={sp.toolbarBtn} onPress={selectAll}>
          <Feather name="check-square" size={12} color={INDIGO} />
          <Text style={sp.toolbarTxt}>Apply All</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sp.toolbarBtn} onPress={clearAll}>
          <Feather name="square" size={12} color={COLORS.textDim} />
          <Text style={[sp.toolbarTxt, { color: COLORS.textDim }]}>Clear</Text>
        </TouchableOpacity>
        <Text style={sp.toolbarCount}>{selected.size}/{totalFields} selected</Text>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        {orgEnrichments.map((org, oi) => (
          <View key={oi} style={sp.orgCard}>
            <View style={sp.orgHeader}>
              <View style={sp.orgIcon}><Feather name="home" size={12} color={COLORS.textMuted} /></View>
              <Text style={sp.orgName} numberOfLines={1}>{org.orgName}</Text>
              <Text style={sp.orgFieldCount}>{org.fields.length} field{org.fields.length !== 1 ? "s" : ""}</Text>
            </View>
            {org.fields.map((field, fi) => {
              const key = buildKey(oi, fi);
              const isOn = selected.has(key);
              return (
                <TouchableOpacity
                  key={fi}
                  style={[sp.fieldRow, isOn && sp.fieldRowActive]}
                  onPress={() => toggle(key)}
                >
                  <View style={[spf.checkbox, isOn && spf.checkboxActive]}>
                    {isOn && <Feather name="check" size={10} color={COLORS.emerald} />}
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <View style={spf.fieldTop}>
                      <Text style={spf.fieldLabel}>{field.label}</Text>
                      <View style={spf.sourceBadge}>
                        <Text style={spf.sourceTxt} numberOfLines={1}>{field.source}</Text>
                      </View>
                    </View>
                    <Text style={spf.fieldValue} numberOfLines={1}>{field.value}</Text>
                    <ConfidenceBar value={field.confidence} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}

        {emptyOrgs.length > 0 && !emptyDismissed && (
          <View style={sp.emptyWarnCard}>
            <View style={sp.emptyWarnHeader}>
              <View style={sp.emptyWarnIcon}><Feather name="alert-circle" size={13} color={COLORS.amber} /></View>
              <Text style={sp.emptyWarnTitle}>
                {emptyOrgs.length} org{emptyOrgs.length !== 1 ? "s" : ""} had no public data found
              </Text>
              <TouchableOpacity style={sp.emptyWarnDismiss} onPress={() => setEmptyDismissed(true)}>
                <Feather name="x" size={14} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
            <Text style={sp.emptyWarnBody}>
              Grok couldn't find enrichable data for {emptyOrgs.length === 1 ? "this org" : "these orgs"} from public sources. You may want to manually look up NPI numbers or verify contact details.
            </Text>
            <TouchableOpacity style={sp.emptyWarnToggle} onPress={() => setEmptyExpanded((v) => !v)}>
              <Text style={sp.emptyWarnToggleTxt}>{emptyExpanded ? "Hide list" : "Show list"}</Text>
              <Feather name={emptyExpanded ? "chevron-up" : "chevron-down"} size={12} color={INDIGO} />
            </TouchableOpacity>
            {emptyExpanded && (
              <View style={sp.emptyWarnList}>
                {emptyOrgs.map((name, i) => (
                  <View key={i} style={sp.emptyWarnRow}>
                    <Feather name="minus" size={10} color={COLORS.textDim} />
                    <Text style={sp.emptyWarnRowTxt} numberOfLines={1}>{name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={sp.noteCard}>
          <Feather name="info" size={14} color={COLORS.amber} />
          <Text style={sp.noteTxt}>
            Selected fields will be written directly to the organization record. Source is recorded for audit.
          </Text>
        </View>
      </ScrollView>

      <View style={[sp.footer, { paddingBottom: insets.bottom + 8 }]}>
        <View style={sp.footerTop}>
          <TouchableOpacity style={sp.skipBtn} onPress={onSkip}>
            <Text style={sp.skipTxt}>Skip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={sp.completeBtn} onPress={() => onAccept(buildAccepted())} disabled={selected.size === 0}>
            <Feather name="upload" size={15} color={COLORS.white} />
            <Text style={sp.completeTxt}>
              {selected.size > 0
                ? `Apply ${selected.size} Field${selected.size !== 1 ? "s" : ""} & Import`
                : "Complete Import"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── BulkImportScreen ──────────────────────────────────────────────────────────

export default function BulkImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [phase, setPhase] = useState<Phase>("source");
  const [importType, setImportType] = useState<ImportType>("organizations");
  const [selectedFile, setSelectedFile] = useState<{ name: string; uri: string; size: number; mimeType: string } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [rows, setRows] = useState<MappedRow[]>([]);
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [editingRow, setEditingRow] = useState<{ row: MappedRow; index: number } | null>(null);

  const [summary, setSummary] = useState<CommitResult | null>(null);

  // ── Enrichment state ──────────────────────────────────────────────────────
  const [hierarchyGroups, setHierarchyGroups] = useState<HierarchyGroup[]>([]);
  const [contactSuggestions, setContactSuggestions] = useState<OrgContactSuggestion[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<{ fullName: string; title: string; dept: string; orgName: string }[]>([]);
  const [seoOrgEnrichments, setSeoOrgEnrichments] = useState<OrgEnrichment[]>([]);
  const [seoEmptyOrgs, setSeoEmptyOrgs] = useState<string[]>([]);

  const sessionTokenRef = useRef<string | null>(null);
  const importStartedAtRef = useRef<string | null>(null);

  // ── File picking ────────────────────────────────────────────────────────────

  const handlePickFile = useCallback(async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "text/plain",
          "application/csv",
          "public.comma-separated-values-text",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "com.microsoft.excel.xls",
          "org.openxmlformats.spreadsheetml.sheet",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setSelectedFile({
        name: asset.name,
        uri: asset.uri,
        size: asset.size ?? 0,
        mimeType: asset.mimeType ?? "application/octet-stream",
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not open file picker.");
    }
  }, []);

  // ── Upload + Analyze + Enrich ─────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (!selectedFile) return;
    setError(null);
    setPhase("uploading");

    try {
      const base = getBaseUrl();
      const token = getApiToken();

      const formData = new FormData();

      if (Platform.OS === "web" || selectedFile.uri.startsWith("blob:")) {
        const resp = await fetch(selectedFile.uri);
        const blob = await resp.blob();
        formData.append("file", blob, selectedFile.name);
      } else {
        formData.append("file", {
          uri: selectedFile.uri,
          name: selectedFile.name,
          type: selectedFile.mimeType,
        } as unknown as Blob);
      }
      formData.append("importType", importType);

      const uploadRes = await fetch(`${base}/bulk-import/upload`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!uploadRes.ok) {
        const body = await uploadRes.json().catch(() => ({}));
        throw new Error(body.error || `Upload failed (${uploadRes.status})`);
      }

      const uploadData = await uploadRes.json();
      sessionTokenRef.current = uploadData.sessionToken;

      setPhase("analyzing");

      const analyzeRes = await fetch(`${base}/bulk-import/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionToken: uploadData.sessionToken }),
      });

      if (!analyzeRes.ok) {
        const body = await analyzeRes.json().catch(() => ({}));
        throw new Error(body.error || `Analysis failed (${analyzeRes.status})`);
      }

      const result: AnalyzeResult = await analyzeRes.json();
      setAnalyzeResult(result);

      // For org imports, fetch enrichment (hierarchy + tags) in parallel
      if (importType === "organizations") {
        const authHeaders = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const enrichBody = JSON.stringify({ sessionToken: uploadData.sessionToken });

        const [hierarchyRes, tagsRes] = await Promise.allSettled([
          fetch(`${base}/bulk-import/enrich`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ sessionToken: uploadData.sessionToken, enrichmentType: "hierarchy" }),
          }),
          fetch(`${base}/bulk-import/enrich`, {
            method: "POST",
            headers: authHeaders,
            body: JSON.stringify({ sessionToken: uploadData.sessionToken, enrichmentType: "tags" }),
          }),
        ]);

        // Apply tag suggestions to rows
        let mappedRows = result.rows;
        if (tagsRes.status === "fulfilled" && tagsRes.value.ok) {
          const tagsData = await tagsRes.value.json().catch(() => null);
          if (tagsData?.rowTags) {
            const tagsByName: Record<string, string[]> = {};
            for (const entry of tagsData.rowTags as TagsByRow[]) {
              if (entry.rowName) tagsByName[entry.rowName as string] = entry.suggestedTags;
            }
            mappedRows = mappedRows.map((r) => ({
              ...r,
              _tags: tagsByName[(r.name as string) ?? ""] ?? [],
            }));
          }
        }

        setRows(mappedRows);
        setExcludedIds(
          new Set(
            mappedRows
              .map((r, i) => (r._rowStatus === "error" ? i : -1))
              .filter((i) => i >= 0),
          ),
        );

        // Check for hierarchy groups
        if (hierarchyRes.status === "fulfilled" && hierarchyRes.value.ok) {
          const hierarchyData = await hierarchyRes.value.json().catch(() => null);
          const groups: HierarchyGroup[] = hierarchyData?.groups ?? [];
          setHierarchyGroups(groups);
          if (groups.length > 0) {
            setPhase("hierarchy");
            return;
          }
        }

        setPhase("review");
      } else {
        setRows(result.rows);
        setExcludedIds(
          new Set(
            result.rows
              .map((r, i) => (r._rowStatus === "error" ? i : -1))
              .filter((i) => i >= 0),
          ),
        );
        setPhase("review");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Import failed. Please try again.");
      setPhase("source");
    }
  }, [selectedFile, importType]);

  // ── Hierarchy accept/skip ─────────────────────────────────────────────────

  const handleHierarchyAccept = useCallback((acceptedGroups: HierarchyGroup[]) => {
    if (acceptedGroups.length > 0) {
      const nameToSystem: Record<string, string> = {};
      for (const group of acceptedGroups) {
        for (const rowName of group.rowNames) {
          nameToSystem[rowName] = group.systemName;
        }
      }
      setRows((prev) =>
        prev.map((r) => {
          const parentName = nameToSystem[r.name as string];
          return parentName ? { ...r, _suggestedParentName: parentName } : r;
        }),
      );
    }
    setPhase("review");
  }, []);

  // ── Tag toggle in review ──────────────────────────────────────────────────

  const handleTagToggle = useCallback((rowIndex: number, tag: string) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== rowIndex) return r;
        const current = (r._tags as string[]) ?? [];
        const next = current.includes(tag)
          ? current.filter((t) => t !== tag)
          : [...current, tag];
        return { ...r, _tags: next };
      }),
    );
  }, []);

  // ── Re-analyze ─────────────────────────────────────────────────────────────

  const handleReanalyze = useCallback(async () => {
    if (!sessionTokenRef.current) {
      setError("Session expired. Please re-upload the file.");
      setPhase("source");
      return;
    }
    setError(null);
    setPhase("analyzing");
    try {
      const base = getBaseUrl();
      const token = getApiToken();

      const analyzeRes = await fetch(`${base}/bulk-import/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionToken: sessionTokenRef.current }),
      });

      if (!analyzeRes.ok) {
        const body = await analyzeRes.json().catch(() => ({}));
        throw new Error(body.error || `Re-analysis failed (${analyzeRes.status})`);
      }

      const result: AnalyzeResult = await analyzeRes.json();
      setAnalyzeResult(result);
      setRows(result.rows);
      setExcludedIds(
        new Set(
          result.rows
            .map((r, i) => (r._rowStatus === "error" ? i : -1))
            .filter((i) => i >= 0),
        ),
      );
      setPhase("review");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Re-analysis failed.");
      setPhase("review");
    }
  }, []);

  // ── From review → contacts ─────────────────────────────────────────────────

  const handleGoToContacts = useCallback(async () => {
    const token = getApiToken();
    const base = getBaseUrl();
    try {
      const enrichRes = await fetch(`${base}/bulk-import/enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionToken: sessionTokenRef.current, enrichmentType: "contacts" }),
      });
      if (enrichRes.ok) {
        const data = await enrichRes.json().catch(() => null);
        if (data?.orgRoles) {
          setContactSuggestions(data.orgRoles as OrgContactSuggestion[]);
        }
      }
    } catch {
      // non-fatal — skip to contacts with empty suggestions
    }
    setPhase("contacts");
  }, []);

  // ── Fetch SEO enrichment and go to SEO phase ─────────────────────────────
  // Called from both contact confirm AND contact skip so SEO always runs.

  const handleGoToSeo = useCallback(async () => {
    const token = getApiToken();
    const base = getBaseUrl();
    setPhase("enriching");
    try {
      const enrichRes = await fetch(`${base}/bulk-import/enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ sessionToken: sessionTokenRef.current, enrichmentType: "seo" }),
      });
      if (enrichRes.ok) {
        const data = await enrichRes.json().catch(() => null);
        if (data?.orgEnrichments) {
          setSeoOrgEnrichments(data.orgEnrichments as OrgEnrichment[]);
        }
        if (Array.isArray(data?.emptyOrgs)) {
          setSeoEmptyOrgs(data.emptyOrgs as string[]);
        }
      }
    } catch {
      // non-fatal — proceed to seo phase with empty enrichments
    }
    setPhase("seo");
  }, []);

  // ── Contacts confirm ──────────────────────────────────────────────────────

  const handleContactsConfirm = useCallback(
    (contacts: { fullName: string; title: string; dept: string; orgName: string }[]) => {
      setSelectedContacts(contacts);
      handleGoToSeo();
    },
    [handleGoToSeo],
  );

  // ── Final commit ──────────────────────────────────────────────────────────

  const handleDoCommit = useCallback(async (seoEnrichments?: { orgName: string; fields: OrgEnrichmentField[] }[]) => {
    const toImport = rows.filter((_, i) => !excludedIds.has(i));
    if (toImport.length === 0) {
      setError("No records selected for import.");
      setPhase("review");
      return;
    }
    setError(null);
    importStartedAtRef.current = new Date().toISOString();
    setPhase("saving");
    try {
      const base = getBaseUrl();
      const token = getApiToken();

      const commitRes = await fetch(`${base}/bulk-import/commit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          sessionToken: sessionTokenRef.current,
          importType,
          rows: toImport,
          suggestedContacts: selectedContacts,
          seoEnrichments: seoEnrichments ?? [],
        }),
      });

      if (!commitRes.ok) {
        const body = await commitRes.json().catch(() => ({}));
        throw new Error(body.error || `Commit failed (${commitRes.status})`);
      }

      const result: CommitResult = await commitRes.json();
      if (importType === "organizations") {
        const params = new URLSearchParams({
          created: String(result.created),
          skipped: String((result.skippedDuplicates ?? []).length),
          errors: String(result.errors),
          importType,
          since: importStartedAtRef.current ?? new Date().toISOString(),
          errorDetails: encodeURIComponent(JSON.stringify(result.errorDetails.slice(0, 5))),
          placeholderContacts: encodeURIComponent(JSON.stringify(result.placeholderContacts ?? [])),
        });
        router.replace(`/capture/import-success?${params.toString()}` as never);
        return;
      }
      setSummary(result);
      setPhase("summary");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed. Please try again.");
      setPhase("review");
    }
  }, [rows, excludedIds, importType, selectedContacts]);

  // ── SEO confirmed — apply accepted enrichments and commit ─────────────────

  const handleSeoDone = useCallback(
    (accepted: { orgName: string; fields: OrgEnrichmentField[] }[]) => {
      handleDoCommit(accepted);
    },
    [handleDoCommit],
  );

  // ── handleCommit — for review screen button (orgs route through enrichment) ─

  const handleCommit = useCallback(() => {
    if (importType === "organizations") {
      handleGoToContacts();
    } else {
      handleDoCommit();
    }
  }, [importType, handleGoToContacts, handleDoCommit]);

  // ── Download error report ─────────────────────────────────────────────────

  const handleDownloadErrors = useCallback(() => {
    const errorRows = rows.filter((r) => r._rowStatus === "error" || r._rowStatus === "warning");
    if (errorRows.length === 0) return;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const headers = importType === "organizations"
        ? ["Name", "Type", "City", "State", "Phone", "Email", "Status", "Issues"]
        : ["Full Name", "Title", "Organization", "Email", "Phone", "Status", "Issues"];
      const dataRows = errorRows.map((r) => {
        if (importType === "organizations") {
          return [
            r.name, r.organizationType, r.city, r.state, r.phone, r.email,
            r._rowStatus, (r._rowIssues as string[]).join("; "),
          ];
        }
        return [
          r.fullName, r.title, r.organizationName, r.email, r.phone,
          r._rowStatus, (r._rowIssues as string[]).join("; "),
        ];
      });
      const csv = [headers, ...dataRows]
        .map((row) => (row as unknown[]).map((c) => `"${c ?? ""}"`).join(","))
        .join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "import_errors.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else {
      setError(`${errorRows.length} row(s) have issues. Download is available on web. Check: ${(errorRows[0]?._rowIssues as string[] | undefined)?.[0] ?? "missing required fields"}`);
    }
  }, [rows, importType]);

  // ── Download template ─────────────────────────────────────────────────────

  const handleDownloadTemplate = useCallback((type: ImportType) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const base = getBaseUrl();
      const token = getApiToken();
      const a = document.createElement("a");
      a.href = `${base}/bulk-import/template/${type}`;
      if (token) {
        fetch(`${base}/bulk-import/template/${type}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
          .then((r) => r.blob())
          .then((blob) => {
            const url = URL.createObjectURL(blob);
            a.href = url;
            a.download = `${type}_template.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          });
      }
    } else {
      const cols = type === "organizations"
        ? "Facility Name, Type, Address, City, State, Zip, Phone, Email, Website"
        : "First Name, Last Name, Title, Department, Email, Phone, Company";
      setError(`Template columns: ${cols}`);
    }
  }, []);

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setPhase("source");
    setSelectedFile(null);
    setAnalyzeResult(null);
    setRows([]);
    setExcludedIds(new Set());
    setSummary(null);
    setError(null);
    sessionTokenRef.current = null;
    setHierarchyGroups([]);
    setContactSuggestions([]);
    setSelectedContacts([]);
    setSeoOrgEnrichments([]);
    setSeoEmptyOrgs([]);
  }, []);

  // ── Render helpers ────────────────────────────────────────────────────────

  const includedCount = rows.length - excludedIds.size;

  // ── Source screen ─────────────────────────────────────────────────────────

  if (phase === "source") {
    return (
      <View style={[s.screen, { paddingBottom: insets.bottom + 16 }]}>
        <Stack.Screen options={{ title: "Bulk Import", headerBackTitle: "Capture" }} />
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={s.subtitle}>Upload a CSV or Excel (.xlsx) file. Grok AI will intelligently map columns to the CRM.</Text>

          {error && (
            <View style={s.errorBox}>
              <Feather name="alert-circle" size={14} color={COLORS.red} />
              <Text style={s.errorTxt}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}>
                <Feather name="x" size={14} color={COLORS.red} />
              </TouchableOpacity>
            </View>
          )}

          <Text style={s.sectionLabel}>Import Type</Text>
          <View style={s.toggleRow}>
            {(["organizations", "contacts"] as ImportType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[s.toggleCard, importType === t && s.toggleCardActive]}
                onPress={() => setImportType(t)}
              >
                <Feather
                  name={t === "organizations" ? "home" : "users"}
                  size={22}
                  color={importType === t ? COLORS.white : COLORS.textMuted}
                />
                <Text style={[s.toggleLabel, importType === t && s.toggleLabelActive]}>
                  {t === "organizations" ? "Organizations\n/ Facilities" : "Contacts"}
                </Text>
                {importType === t && (
                  <View style={s.toggleCheck}>
                    <Feather name="check-circle" size={14} color={COLORS.white} />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={s.sectionLabel}>File</Text>

          {selectedFile ? (
            <View style={s.fileSelected}>
              <Feather name="file-text" size={20} color={INDIGO} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.fileName} numberOfLines={1}>{selectedFile.name}</Text>
                <Text style={s.fileSize}>{formatBytes(selectedFile.size)}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedFile(null)} style={s.removeBtn}>
                <Feather name="x" size={16} color={COLORS.textMuted} />
                <Text style={s.removeTxt}>Remove</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.dropZone, dragActive && s.dropZoneActive]}
              onPress={handlePickFile}
              {...(Platform.OS === "web"
                ? {
                    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); },
                    onDragLeave: () => setDragActive(false),
                    onDrop: async (e: React.DragEvent) => {
                      e.preventDefault();
                      setDragActive(false);
                      const file = e.dataTransfer.files[0];
                      if (!file) return;
                      const url = URL.createObjectURL(file);
                      setSelectedFile({ name: file.name, uri: url, size: file.size, mimeType: file.type });
                    },
                  }
                : {})}
            >
              <Feather name="upload-cloud" size={32} color={dragActive ? INDIGO : COLORS.textDim} />
              <Text style={s.dropTitle}>
                {Platform.OS === "web" ? "Drag & drop or tap to browse" : "Tap to browse"}
              </Text>
              <Text style={s.dropSub}>CSV or Excel (.xlsx) · Max 10 MB · Up to 500 rows</Text>
            </TouchableOpacity>
          )}

          <View style={s.templateRow}>
            <Feather name="download" size={13} color={COLORS.textMuted} />
            <Text style={s.templateLabel}>Download template:</Text>
            <TouchableOpacity onPress={() => handleDownloadTemplate("organizations")}>
              <Text style={s.templateLink}>Organizations</Text>
            </TouchableOpacity>
            <Text style={s.templateDot}>·</Text>
            <TouchableOpacity onPress={() => handleDownloadTemplate("contacts")}>
              <Text style={s.templateLink}>Contacts</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[s.importBtn, (!selectedFile) && s.importBtnDisabled]}
            onPress={handleImport}
            disabled={!selectedFile}
          >
            <Feather name="cpu" size={16} color={COLORS.white} />
            <Text style={s.importBtnTxt}>Analyze with Grok AI</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  // ── Progress screen ───────────────────────────────────────────────────────

  if (phase === "uploading" || phase === "analyzing") {
    return (
      <View style={[s.screen, s.center]}>
        <Stack.Screen options={{ title: "Bulk Import", headerBackVisible: false }} />
        <ProgressView phase={phase} />
      </View>
    );
  }

  // ── Hierarchy screen ──────────────────────────────────────────────────────

  if (phase === "hierarchy") {
    return (
      <HierarchyPhase
        groups={hierarchyGroups}
        rowCount={rows.length}
        onAccept={handleHierarchyAccept}
        onSkip={() => setPhase("review")}
      />
    );
  }

  // ── Review screen ─────────────────────────────────────────────────────────

  if (phase === "review" && analyzeResult) {
    const readyCount = rows.filter((r) => r._rowStatus === "ready" && !excludedIds.has(rows.indexOf(r))).length;
    const warnCount = rows.filter((r) => r._rowStatus === "warning").length;
    const errCount = rows.filter((r) => r._rowStatus === "error").length;

    return (
      <View style={[s.screen, { paddingBottom: insets.bottom }]}>
        <Stack.Screen options={{ title: "Review Import", headerBackVisible: false }} />

        <View style={rv.summary}>
          <View style={rv.summaryItem}>
            <Text style={rv.summaryNum}>{analyzeResult.totalRows}</Text>
            <Text style={rv.summaryLabel}>detected</Text>
          </View>
          <View style={rv.divider} />
          <View style={rv.summaryItem}>
            <Text style={[rv.summaryNum, { color: COLORS.emerald }]}>{analyzeResult.ready}</Text>
            <Text style={rv.summaryLabel}>ready</Text>
          </View>
          <View style={rv.divider} />
          <View style={rv.summaryItem}>
            <Text style={[rv.summaryNum, { color: COLORS.amber }]}>{warnCount}</Text>
            <Text style={rv.summaryLabel}>warnings</Text>
          </View>
          <View style={rv.divider} />
          <View style={rv.summaryItem}>
            <Text style={[rv.summaryNum, { color: COLORS.red }]}>{errCount}</Text>
            <Text style={rv.summaryLabel}>errors</Text>
          </View>
        </View>

        <View style={rv.selectedBar}>
          <Feather name="check-square" size={13} color={COLORS.emerald} />
          <Text style={rv.selectedTxt}>{includedCount} of {rows.length} selected for import</Text>
          {importType === "organizations" && (
            <View style={rv.grokPill}>
              <Feather name="cpu" size={10} color={INDIGO} />
              <Text style={rv.grokPillTxt}>Grok enriched</Text>
            </View>
          )}
        </View>

        {error && (
          <View style={[s.errorBox, { marginHorizontal: 16 }]}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={s.errorTxt}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Feather name="x" size={14} color={COLORS.red} />
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          data={rows}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 180 }}
          renderItem={({ item, index }) => (
            <RowCard
              row={item}
              index={index}
              importType={importType}
              excluded={excludedIds.has(index)}
              selectedTags={(item._tags as string[]) ?? []}
              onTagToggle={(tag) => handleTagToggle(index, tag)}
              onEdit={() => setEditingRow({ row: item, index })}
              onToggleExclude={() => {
                setExcludedIds((prev) => {
                  const next = new Set(prev);
                  if (next.has(index)) next.delete(index);
                  else next.add(index);
                  return next;
                });
              }}
            />
          )}
        />

        <View style={[rv.footer, { paddingBottom: insets.bottom + 8 }]}>
          <View style={rv.footerTop}>
            <TouchableOpacity style={rv.secondaryBtn} onPress={handleReanalyze}>
              <Feather name="refresh-cw" size={13} color={INDIGO} />
              <Text style={rv.secondaryTxt}>Re-process</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rv.secondaryBtn} onPress={handleDownloadErrors}>
              <Feather name="download" size={13} color={COLORS.textMuted} />
              <Text style={[rv.secondaryTxt, { color: COLORS.textMuted }]}>Error Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={rv.secondaryBtn} onPress={handleReset}>
              <Feather name="x" size={13} color={COLORS.textMuted} />
              <Text style={[rv.secondaryTxt, { color: COLORS.textMuted }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[rv.commitBtn, includedCount === 0 && rv.commitBtnDisabled]}
            onPress={handleCommit}
            disabled={includedCount === 0}
          >
            <Feather name="arrow-right" size={16} color={COLORS.white} />
            <Text style={rv.commitTxt}>
              {importType === "organizations"
                ? `Next: Contact Suggestions →`
                : `Import ${includedCount} Record${includedCount !== 1 ? "s" : ""}`}
            </Text>
          </TouchableOpacity>
        </View>

        <EditRowModal
          visible={editingRow !== null}
          row={editingRow?.row ?? null}
          importType={importType}
          onSave={(updated) => {
            if (editingRow === null) return;
            setRows((prev) => prev.map((r, i) => i === editingRow.index ? updated : r));
            setExcludedIds((prev) => {
              const next = new Set(prev);
              next.delete(editingRow.index);
              return next;
            });
          }}
          onClose={() => setEditingRow(null)}
        />
      </View>
    );
  }

  // ── Contacts screen ───────────────────────────────────────────────────────

  if (phase === "contacts") {
    return (
      <ContactsPhase
        orgSuggestions={contactSuggestions}
        onConfirm={handleContactsConfirm}
        onSkip={handleGoToSeo}
      />
    );
  }

  // ── Enriching screen (Grok SEO web search in progress) ───────────────────

  if (phase === "enriching") {
    return (
      <View style={[s.screen, s.center]}>
        <Stack.Screen options={{ title: "Web Enrichment", headerBackVisible: false }} />
        <View style={pv.wrap}>
          <View style={pv.iconWrap}>
            <ActivityIndicator size="large" color={INDIGO} />
          </View>
          <Text style={pv.msg}>Grok is scanning public sources…</Text>
          <Text style={pv.sub}>Searching NPI registry, CMS, Google Maps, and facility websites for each org. This may take up to a minute.</Text>
        </View>
      </View>
    );
  }

  // ── SEO screen ────────────────────────────────────────────────────────────

  if (phase === "seo") {
    return (
      <SeoPhase
        orgEnrichments={seoOrgEnrichments}
        emptyOrgs={seoEmptyOrgs}
        orgCount={includedCount}
        onAccept={handleSeoDone}
        onSkip={() => handleDoCommit([])}
      />
    );
  }

  // ── Saving screen ─────────────────────────────────────────────────────────

  if (phase === "saving") {
    return (
      <View style={[s.screen, s.center]}>
        <Stack.Screen options={{ title: "Saving…", headerBackVisible: false }} />
        <ActivityIndicator size="large" color={INDIGO} />
        <Text style={s.savingTxt}>Saving {includedCount} records…</Text>
      </View>
    );
  }

  // ── Summary screen ────────────────────────────────────────────────────────

  if (phase === "summary" && summary !== null) {
    const dest = importType === "organizations" ? "organizations" : "contacts";
    return (
      <View style={[s.screen, s.center, { paddingHorizontal: 32, paddingBottom: insets.bottom + 16 }]}>
        <Stack.Screen options={{ title: "Import Complete", headerBackVisible: false }} />
        <View style={sum.iconWrap}>
          <Feather name="check-circle" size={52} color={COLORS.emerald} />
        </View>
        <Text style={sum.title}>Import Complete!</Text>
        <View style={sum.statsRow}>
          <View style={sum.stat}>
            <Text style={[sum.statNum, { color: COLORS.emerald }]}>{summary.created}</Text>
            <Text style={sum.statLabel}>Created</Text>
          </View>
          <View style={sum.stat}>
            <Text style={[sum.statNum, { color: COLORS.amber }]}>{(summary.skippedDuplicates ?? []).length}</Text>
            <Text style={sum.statLabel}>Already existed</Text>
          </View>
          <View style={sum.stat}>
            <Text style={[sum.statNum, { color: COLORS.red }]}>{summary.errors}</Text>
            <Text style={sum.statLabel}>Errors</Text>
          </View>
        </View>
        {(summary.skippedDuplicates ?? []).length > 0 && (
          <View style={[sum.errorList, { borderLeftWidth: 3, borderLeftColor: COLORS.amber }]}>
            <Text style={[sum.errorListTitle, { color: COLORS.amber }]}>
              {(summary.skippedDuplicates ?? []).length} {(summary.skippedDuplicates ?? []).length === 1 ? "record" : "records"} already existed and {(summary.skippedDuplicates ?? []).length === 1 ? "was" : "were"} skipped
            </Text>
          </View>
        )}
        {summary.errorDetails.length > 0 && (
          <View style={sum.errorList}>
            <Text style={sum.errorListTitle}>Issues:</Text>
            {summary.errorDetails.slice(0, 5).map((e, i) => (
              <Text key={i} style={sum.errorItem} numberOfLines={2}>• {e}</Text>
            ))}
          </View>
        )}
        <TouchableOpacity
          style={sum.primaryBtn}
          onPress={() => router.push(`/(tabs)/${dest}?from=bulk_import&count=${summary.created}` as never)}
        >
          <Feather name="arrow-right" size={16} color={COLORS.white} />
          <Text style={sum.primaryTxt}>View {importType === "organizations" ? "Organizations" : "Contacts"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={sum.secondaryBtn} onPress={handleReset}>
          <Text style={sum.secondaryTxt}>Import Another File</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return null;
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  center: { justifyContent: "center", alignItems: "center" },
  subtitle: { fontSize: 13, color: COLORS.textMuted, marginBottom: 20, lineHeight: 18 },
  sectionLabel: { fontSize: 11, fontWeight: "700", color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: COLORS.red + "18", borderWidth: 1, borderColor: COLORS.red + "44",
    borderRadius: 8, padding: 10, marginBottom: 14,
  },
  errorTxt: { flex: 1, fontSize: 13, color: COLORS.red, lineHeight: 18 },

  toggleRow: { flexDirection: "row", gap: 12, marginBottom: 20 },
  toggleCard: {
    flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyMid, padding: 16, alignItems: "center", gap: 8,
  },
  toggleCardActive: { borderColor: INDIGO, backgroundColor: INDIGO + "22" },
  toggleLabel: { fontSize: 13, fontWeight: "600", color: COLORS.textMuted, textAlign: "center" },
  toggleLabelActive: { color: COLORS.white },
  toggleCheck: { position: "absolute", top: 8, right: 8 },

  dropZone: {
    borderWidth: 2, borderStyle: "dashed", borderColor: COLORS.navyBorder,
    borderRadius: 12, padding: 32, alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyMid, marginBottom: 14,
  },
  dropZoneActive: { borderColor: INDIGO, backgroundColor: INDIGO + "18" },
  dropTitle: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  dropSub: { fontSize: 12, color: COLORS.textDim, textAlign: "center" },

  fileSelected: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navyMid, borderRadius: 12, borderWidth: 1,
    borderColor: INDIGO + "55", padding: 14, marginBottom: 14, gap: 4,
  },
  fileName: { fontSize: 14, fontWeight: "600", color: COLORS.white },
  fileSize: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  removeBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 8 },
  removeTxt: { fontSize: 12, color: COLORS.textMuted },

  templateRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 24 },
  templateLabel: { fontSize: 12, color: COLORS.textMuted },
  templateLink: { fontSize: 12, color: INDIGO, fontWeight: "600" },
  templateDot: { fontSize: 12, color: COLORS.textDim },

  importBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: INDIGO, borderRadius: 12, paddingVertical: 14,
  },
  importBtnDisabled: { backgroundColor: COLORS.navyBorder, opacity: 0.5 },
  importBtnTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },

  savingTxt: { marginTop: 16, fontSize: 15, color: COLORS.textMuted },
});

const pv = StyleSheet.create({
  wrap: { alignItems: "center", padding: 40, gap: 16 },
  iconWrap: { marginBottom: 8 },
  msg: { fontSize: 17, fontWeight: "700", color: COLORS.white },
  sub: { fontSize: 13, color: COLORS.textMuted, textAlign: "center", lineHeight: 18, maxWidth: 280 },
});

const rv = StyleSheet.create({
  summary: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navyMid, borderBottomWidth: 1, borderColor: COLORS.navyBorder,
    paddingVertical: 14, paddingHorizontal: 20,
  },
  summaryItem: { flex: 1, alignItems: "center" },
  summaryNum: { fontSize: 20, fontWeight: "800", color: COLORS.white },
  summaryLabel: { fontSize: 10, color: COLORS.textDim, marginTop: 2 },
  divider: { width: 1, height: 32, backgroundColor: COLORS.navyBorder },
  selectedBar: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.emerald + "11",
  },
  selectedTxt: { fontSize: 12, color: COLORS.emerald, fontWeight: "600" },
  grokPill: {
    flexDirection: "row", alignItems: "center", gap: 4, marginLeft: "auto",
    backgroundColor: INDIGO + "18", borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: INDIGO + "33",
  },
  grokPillTxt: { fontSize: 10, color: INDIGO, fontWeight: "600" },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.navyDark, borderTopWidth: 1, borderColor: COLORS.navyBorder,
    padding: 16, gap: 10,
  },
  footerTop: { flexDirection: "row", gap: 8 },
  secondaryBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 10, paddingVertical: 9, backgroundColor: COLORS.navyMid,
  },
  secondaryTxt: { fontSize: 12, fontWeight: "600", color: INDIGO },
  commitBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 14,
  },
  commitBtnDisabled: { backgroundColor: COLORS.navyBorder, opacity: 0.5 },
  commitTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },
});

const rc = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: COLORS.navyMid, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, marginBottom: 8, gap: 10,
  },
  excludedCard: { opacity: 0.4 },
  left: { paddingTop: 2 },
  middle: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  name: { fontSize: 14, fontWeight: "600", color: COLORS.white, flexShrink: 1 },
  excludedText: { textDecorationLine: "line-through", color: COLORS.textDim },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeTxt: { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  sub: { fontSize: 12, color: COLORS.textMuted },
  addrRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 },
  addrTxt: { fontSize: 11, color: COLORS.textDim, flex: 1 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  tagChip: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  tagChipActive: { backgroundColor: INDIGO + "18", borderColor: INDIGO + "44" },
  tagChipInactive: { backgroundColor: COLORS.navyDark, borderColor: COLORS.navyBorder },
  tagTxt: { fontSize: 10, fontWeight: "600" },
  issueRow: { flexDirection: "row", alignItems: "flex-start", gap: 4, marginTop: 2 },
  issueTxt: { fontSize: 11, color: COLORS.amber, flex: 1 },
  grokNote: { fontSize: 10, color: COLORS.textDim, marginTop: 3 },
  editBtn: { padding: 4 },
});

const hp = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: INDIGO + "18", borderBottomWidth: 1, borderColor: INDIGO + "33",
  },
  bannerIcon: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  bannerTxt: { flex: 1, fontSize: 12, color: "#a5b4fc", fontWeight: "500" },

  groupCard: {
    backgroundColor: COLORS.navyMid, borderRadius: 12, borderWidth: 1,
    borderColor: INDIGO + "33", padding: 12, marginBottom: 12,
  },
  groupHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8,
  },
  groupIconWrap: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: INDIGO + "18",
    alignItems: "center", justifyContent: "center",
  },
  groupSystemName: { flex: 1, fontSize: 14, fontWeight: "700", color: COLORS.white },
  groupCount: { fontSize: 11, color: COLORS.textDim },
  toggleBtn: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1,
  },
  toggleBtnOn: { backgroundColor: INDIGO + "18", borderColor: INDIGO + "44" },
  toggleBtnOff: { backgroundColor: COLORS.navyDark, borderColor: COLORS.navyBorder },
  toggleTxt: { fontSize: 11, fontWeight: "600" },
  rowName: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 3 },
  rowDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.navyBorder, marginLeft: 4 },
  rowNameTxt: { fontSize: 12, color: COLORS.textMuted, flex: 1 },
  suggestionNote: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8,
    backgroundColor: INDIGO + "10", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5,
  },
  suggestionNoteTxt: { flex: 1, fontSize: 11, color: INDIGO },

  emptyCard: {
    alignItems: "center", backgroundColor: COLORS.navyMid, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, padding: 32, gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: COLORS.white },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: "center", lineHeight: 18 },

  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.navyDark, borderTopWidth: 1, borderColor: COLORS.navyBorder,
    padding: 16, gap: 10,
  },
  footerTop: { flexDirection: "row", gap: 8 },
  acceptAllBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: INDIGO + "44", borderRadius: 10, paddingVertical: 9,
    backgroundColor: INDIGO + "18",
  },
  acceptAllTxt: { fontSize: 12, fontWeight: "600", color: INDIGO },
  skipAllBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.navyBorder, borderRadius: 10, paddingVertical: 9,
    backgroundColor: COLORS.navyMid,
  },
  skipAllTxt: { fontSize: 12, fontWeight: "600", color: COLORS.textMuted },
  continueBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 14,
  },
  continueTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },
});

const cp = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: INDIGO + "18", borderBottomWidth: 1, borderColor: INDIGO + "33",
  },
  bannerIcon: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  bannerTxt: { flex: 1, fontSize: 12, color: "#a5b4fc", fontWeight: "500" },
  selectedPill: {
    backgroundColor: COLORS.emerald + "22", borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.emerald + "44",
  },
  selectedPillTxt: { fontSize: 11, fontWeight: "700", color: COLORS.emerald },

  orgHeader: {
    flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6,
  },
  orgIcon: {
    width: 28, height: 28, borderRadius: 7, backgroundColor: COLORS.navyMid,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    alignItems: "center", justifyContent: "center",
  },
  orgName: { fontSize: 13, fontWeight: "700", color: COLORS.white },
  orgMeta: { fontSize: 11, color: COLORS.textDim },

  roleCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyMid, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 10, marginBottom: 6,
  },
  roleCardActive: { borderColor: COLORS.emerald + "55", backgroundColor: COLORS.emerald + "0A" },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    borderColor: COLORS.navyBorder, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  checkboxActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emerald + "22" },
  roleName: { fontSize: 13, fontWeight: "600", color: COLORS.white },
  roleDept: { fontSize: 11, color: COLORS.textDim, marginTop: 1 },
  roleDetail: { fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  abbrChip: {
    backgroundColor: INDIGO + "18", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3,
    borderWidth: 1, borderColor: INDIGO + "33",
  },
  abbrTxt: { fontSize: 10, fontWeight: "700", color: INDIGO },
  disclaimer: { fontSize: 11, color: COLORS.textDim, textAlign: "center", marginTop: 4 },

  filterRow: {
    borderBottomWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyMid,
  },
  filterScroll: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 9,
  },
  filterPill: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: INDIGO + "33", backgroundColor: INDIGO + "10",
  },
  filterPillActive: { backgroundColor: INDIGO + "28", borderColor: INDIGO + "88" },
  filterPillTxt: { fontSize: 12, fontWeight: "600", color: INDIGO + "99" },
  filterPillTxtActive: { color: INDIGO },
  filterPillClear: {
    borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.navyBorder, backgroundColor: COLORS.navyDark,
  },
  filterPillClearTxt: { fontSize: 12, fontWeight: "600", color: COLORS.textDim },

  scopeRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 7,
    borderBottomWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyDark,
  },
  scopeLabel: { fontSize: 11, color: COLORS.textDim, marginRight: 2 },
  scopePill: {
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.navyBorder, backgroundColor: COLORS.navyMid,
  },
  scopePillActive: { borderColor: INDIGO + "55", backgroundColor: INDIGO + "18" },
  scopePillTxt: { fontSize: 11, fontWeight: "600", color: COLORS.textDim },
  scopePillTxtActive: { color: INDIGO },

  orgToggleBtn: { paddingHorizontal: 6, paddingVertical: 3 },
  orgToggleTxt: { fontSize: 11, fontWeight: "600", color: INDIGO },

  orgScopeBox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
    borderColor: COLORS.navyBorder, alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  orgScopeBoxActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emerald + "22" },

  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.navyDark, borderTopWidth: 1, borderColor: COLORS.navyBorder,
    padding: 16, gap: 10,
  },
  footerTop: { flexDirection: "row", gap: 8 },
  addBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderColor: INDIGO + "44", borderRadius: 10, paddingVertical: 9,
    backgroundColor: INDIGO + "18",
  },
  addTxt: { fontSize: 12, fontWeight: "600" },
  skipBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.navyBorder, borderRadius: 10, paddingVertical: 9,
    backgroundColor: COLORS.navyMid,
  },
  skipTxt: { fontSize: 12, fontWeight: "600", color: COLORS.textMuted },
  continueBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 14,
  },
  continueTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },
});

const sp = StyleSheet.create({
  banner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: INDIGO + "18", borderBottomWidth: 1, borderColor: INDIGO + "33",
  },
  bannerIcon: {
    width: 24, height: 24, borderRadius: 6, backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  bannerTxt: { flex: 1, fontSize: 12, color: "#a5b4fc", fontWeight: "500" },

  toolbar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.navyMid, borderBottomWidth: 1, borderColor: COLORS.navyBorder,
  },
  toolbarBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: INDIGO + "18", borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: INDIGO + "33",
  },
  toolbarTxt: { fontSize: 12, fontWeight: "600", color: INDIGO },
  toolbarCount: { flex: 1, textAlign: "right", fontSize: 11, color: COLORS.textDim },

  orgCard: {
    backgroundColor: COLORS.navyMid, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, marginBottom: 14, overflow: "hidden",
  },
  orgHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderBottomWidth: 1, borderColor: COLORS.navyBorder,
  },
  orgIcon: {
    width: 26, height: 26, borderRadius: 6, backgroundColor: COLORS.navyDark,
    alignItems: "center", justifyContent: "center",
  },
  orgName: { flex: 1, fontSize: 13, fontWeight: "700", color: COLORS.white },
  orgFieldCount: { fontSize: 11, color: COLORS.textDim },
  fieldRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    padding: 10, borderBottomWidth: 1, borderColor: COLORS.navyBorder + "55",
  },
  fieldRowActive: { backgroundColor: COLORS.emerald + "0A" },

  noteCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: COLORS.amber + "12", borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.amber + "33", padding: 12, marginTop: 4,
  },
  noteTxt: { flex: 1, fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },

  emptyWarnCard: {
    backgroundColor: COLORS.amber + "10", borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.amber + "40", padding: 12, marginTop: 4, gap: 8,
  },
  emptyWarnHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  emptyWarnIcon: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: COLORS.amber + "20", alignItems: "center", justifyContent: "center",
  },
  emptyWarnTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: COLORS.amber },
  emptyWarnDismiss: { padding: 2 },
  emptyWarnBody: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  emptyWarnToggle: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  emptyWarnToggleTxt: { fontSize: 12, fontWeight: "600", color: INDIGO },
  emptyWarnList: { gap: 5, paddingTop: 2 },
  emptyWarnRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  emptyWarnRowTxt: { flex: 1, fontSize: 12, color: COLORS.textDim },

  emptyCard: {
    alignItems: "center", backgroundColor: COLORS.navyMid, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, padding: 32, gap: 12,
    margin: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: COLORS.white },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: "center", lineHeight: 18 },

  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.navyDark, borderTopWidth: 1, borderColor: COLORS.navyBorder,
    padding: 16, gap: 10,
  },
  footerTop: { flexDirection: "row", gap: 8 },
  skipBtn: {
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, alignItems: "center",
    justifyContent: "center", backgroundColor: COLORS.navyMid,
  },
  skipTxt: { fontSize: 14, fontWeight: "600", color: COLORS.textMuted },
  completeBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 14,
  },
  completeTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },
});

const spf = StyleSheet.create({
  barWrap: {
    height: 5, borderRadius: 3, backgroundColor: COLORS.navyBorder,
    overflow: "hidden", position: "relative",
    flexDirection: "row", alignItems: "center", marginTop: 2,
  },
  barFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 3 },
  barLabel: { position: "absolute", right: 0, fontSize: 9, fontWeight: "700" },
  checkbox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5,
    borderColor: COLORS.navyBorder, alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 2,
  },
  checkboxActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emerald + "22" },
  fieldTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  fieldLabel: { fontSize: 12, fontWeight: "600", color: COLORS.white, flex: 1 },
  sourceBadge: {
    backgroundColor: INDIGO + "18", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
    borderWidth: 1, borderColor: INDIGO + "33", maxWidth: 120,
  },
  sourceTxt: { fontSize: 9, color: INDIGO, fontWeight: "600" },
  fieldValue: { fontSize: 11, color: COLORS.textMuted },
});

const em = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.navyMid, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "85%" },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 16, borderBottomWidth: 1, borderColor: COLORS.navyBorder,
  },
  title: { fontSize: 16, fontWeight: "700", color: COLORS.white },
  body: { padding: 16 },
  fieldRow: { marginBottom: 12 },
  label: { fontSize: 11, color: COLORS.textDim, fontWeight: "600", marginBottom: 4, textTransform: "uppercase" },
  input: {
    backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 8, padding: 10, color: COLORS.white, fontSize: 14,
  },
  footer: {
    flexDirection: "row", gap: 10, padding: 16,
    borderTopWidth: 1, borderColor: COLORS.navyBorder,
  },
  cancelBtn: {
    flex: 1, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 10, paddingVertical: 12, alignItems: "center",
  },
  cancelTxt: { fontSize: 14, color: COLORS.textMuted, fontWeight: "600" },
  saveBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: INDIGO, borderRadius: 10, paddingVertical: 12,
  },
  saveTxt: { fontSize: 14, color: COLORS.white, fontWeight: "700" },
});

const sum = StyleSheet.create({
  iconWrap: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: "800", color: COLORS.white, marginBottom: 24 },
  statsRow: { flexDirection: "row", gap: 24, marginBottom: 24 },
  stat: { alignItems: "center" },
  statNum: { fontSize: 28, fontWeight: "800" },
  statLabel: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  errorList: {
    width: "100%", backgroundColor: COLORS.navyMid, borderRadius: 10, padding: 12, marginBottom: 24,
  },
  errorListTitle: { fontSize: 12, fontWeight: "700", color: COLORS.red, marginBottom: 6 },
  errorItem: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  primaryBtn: {
    width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 14, marginBottom: 12,
  },
  primaryTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },
  secondaryBtn: { paddingVertical: 10 },
  secondaryTxt: { fontSize: 14, color: INDIGO, fontWeight: "600" },
});
