import React, { useState, useCallback, useRef } from "react";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, Alert, Modal, FlatList,
  Dimensions, type NativeSyntheticEvent, type NativeScrollEvent,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { getReviewSession } from "@/stores/adminReviewSession";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MasterOrgAlias {
  id: string;
  aliasName: string;
  normalizedAliasName: string;
  aliasType: string;
  createdAt: string;
}

interface HealthcareOverlay {
  facilityType: string | null;
  licensedBeds: number | null;
  traumaLevel: string | null;
  systemType: string | null;
  ownershipModel: string | null;
  careSetting: string | null;
}

interface GovconOverlay {
  uei: string | null;
  cageCode: string | null;
  naicsCodes: string[];
  primeOrSub: string | null;
  contractVehicles: string[];
  agencyAlignment: string | null;
}

interface MasterOrg {
  id: string;
  canonicalName: string;
  displayName: string | null;
  normalizedName: string;
  websiteDomain: string | null;
  industry: "HEALTHCARE" | "GOVCON" | "GENERAL_BUSINESS" | null;
  subVertical: string | null;
  accountStructureType: "ENTERPRISE" | "REGIONAL" | "FACILITY" | "SUB_FACILITY" | "GENERAL_ORG" | null;
  isStandalone: boolean;
  confidenceScore: number;
  sourceType: string;
  sourceConfidence: number;
  validationStatus: "UNVALIDATED" | "PARTIALLY_VALIDATED" | "VALIDATED" | "REQUIRES_REVIEW";
  placeIds: string[];
  aliases: string[];
  aliasRecords: MasterOrgAlias[];
  adminFlags: string[];
  headquartersAddress: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  notes: string | null;
  structureLastScannedAt: string | null;
  structureLastReviewedAt: string | null;
  healthcareOverlay: HealthcareOverlay | null;
  govconOverlay: GovconOverlay | null;
  createdAt: string;
  updatedAt: string;
}

interface QualitySignal {
  label: string;
  weight: number;
  earned: boolean;
}

interface QualityScore {
  score: number;
  maxScore: number;
  signals: QualitySignal[];
}

interface MasterRel {
  id: string;
  parentMasterOrganizationId: string;
  childMasterOrganizationId: string;
  relationshipType: string;
  confidenceScore: number;
  evidenceSummary: string | null;
  reviewStatus: string;
  childName?: string;
  parentName?: string;
}

interface StructureScan {
  id: string;
  organizationName: string;
  organizationId: string;
  workspaceName: string;
  workspaceId: string;
  initiatedByEmail: string | null;
  suggestedParentName: string | null;
  suggestedStructureType: string | null;
  confidenceScore: number | null;
  evidenceSummary: string | null;
  addToMasterGraph: boolean;
  updatedAt: string;
}

type TabKey = "details" | "relationships" | "siblings" | "overlays" | "scan-history";

const REL_TYPES = ["SUBSIDIARY", "REGIONAL", "DBA", "AFFILIATED"] as const;
type RelType = typeof REL_TYPES[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function RelTypeBadge({ type }: { type: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    SUBSIDIARY: { bg: "#0D1F2E", text: "#60BFFF" },
    REGIONAL: { bg: "#1A2D0D", text: COLORS.emerald },
    DBA: { bg: "#2D1B00", text: COLORS.amber },
    AFFILIATED: { bg: "#1A1A2E", text: "#8B8BFF" },
  };
  const c = colors[type] ?? colors.SUBSIDIARY;
  return (
    <View style={[styles.relTypeBadge, { backgroundColor: c.bg }]}>
      <Text style={[styles.relTypeBadgeText, { color: c.text }]}>{type}</Text>
    </View>
  );
}

function FieldRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={[styles.fieldValue, muted && styles.fieldValueMuted]}>{value}</Text>
    </View>
  );
}

// ─── RelTypeSelector Modal ────────────────────────────────────────────────────

function RelTypePickerModal({
  visible,
  current,
  onSelect,
  onClose,
}: {
  visible: boolean;
  current: string;
  onSelect: (type: RelType) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <View style={styles.pickerContent}>
          <Text style={styles.pickerTitle}>Change Relationship Type</Text>
          {REL_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.pickerItem, current === t && styles.pickerItemActive]}
              onPress={() => { onSelect(t); onClose(); }}
            >
              <RelTypeBadge type={t} />
              <Text style={[styles.pickerItemText, current === t && styles.pickerItemTextActive]}>
                {t === current ? "✓ " : ""}{t}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── AddRelModal (shared for child or parent) ─────────────────────────────────

function AddRelModal({
  visible,
  onClose,
  excludeId,
  mode,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  excludeId: string;
  mode: "child" | "parent";
  onConfirm: (orgId: string, orgName: string, relType: RelType) => Promise<void>;
}) {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [relType, setRelType] = useState<RelType>("SUBSIDIARY");
  const [saving, setSaving] = useState(false);

  function handleSearchChange(text: string) {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }

  const { data: searchData } = useQuery({
    queryKey: ["adminMasterOrgsSearch", debouncedSearch],
    queryFn: () => {
      const qs = debouncedSearch ? `?search=${encodeURIComponent(debouncedSearch)}&limit=20` : "?limit=20";
      return adminFetch(`/admin/master-organizations${qs}`);
    },
    enabled: isAdminAuthenticated && visible,
  });

  const searchResults = (searchData?.masterOrganizations ?? []).filter((o: MasterOrg) => o.id !== excludeId);

  function reset() {
    setSearchQuery("");
    setDebouncedSearch("");
    setSelectedId(null);
    setSelectedName(null);
    setRelType("SUBSIDIARY");
    setSaving(false);
  }

  async function handleConfirm() {
    if (!selectedId || !selectedName) return;
    setSaving(true);
    try {
      await onConfirm(selectedId, selectedName, relType);
      reset();
      onClose();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => { reset(); onClose(); }}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {mode === "child" ? "Add Child Organization" : "Add Parent Organization"}
            </Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.modalSearch}
            placeholder="Search organizations…"
            placeholderTextColor={COLORS.textDim}
            value={searchQuery}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoFocus
          />

          {selectedId && (
            <View style={styles.selectedOrg}>
              <Text style={styles.selectedOrgLabel}>Selected: </Text>
              <Text style={styles.selectedOrgName} numberOfLines={1}>{selectedName}</Text>
            </View>
          )}

          <FlatList
            data={searchResults.slice(0, 10)}
            keyExtractor={(i: MasterOrg) => i.id}
            style={styles.searchList}
            renderItem={({ item }: { item: MasterOrg }) => (
              <TouchableOpacity
                style={[styles.searchItem, selectedId === item.id && styles.searchItemSelected]}
                onPress={() => { setSelectedId(item.id); setSelectedName(item.canonicalName); }}
              >
                <Text style={styles.searchItemName}>{item.canonicalName}</Text>
                {item.websiteDomain && (
                  <Text style={styles.searchItemDomain}>{item.websiteDomain}</Text>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {debouncedSearch ? "No results." : "Search for an organization above."}
              </Text>
            }
          />

          <Text style={styles.relTypeLabel}>Relationship Type</Text>
          <View style={styles.relTypeRow}>
            {REL_TYPES.map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.relTypeBtn, relType === t && styles.relTypeBtnActive]}
                onPress={() => setRelType(t)}
              >
                <Text style={[styles.relTypeBtnText, relType === t && styles.relTypeBtnTextActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, (!selectedId || saving) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selectedId || saving}
          >
            {saving
              ? <ActivityIndicator size="small" color={COLORS.navyDark} />
              : <Text style={styles.confirmBtnText}>
                  {mode === "child" ? "Add as Child" : "Add as Parent"}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Details Tab ──────────────────────────────────────────────────────────────

const TOGGLEABLE_FLAGS = ["needs_revalidation", "standalone"] as const;
const ALL_FLAGS = [
  "duplicate_suspect", "structure_not_run", "structure_unresolved",
  "missing_parent", "missing_ultimate_parent", "low_confidence",
  "needs_revalidation", "domain_conflict", "standalone",
];

function scoreColor(score: number): string {
  if (score >= 75) return COLORS.emerald;
  if (score >= 50) return COLORS.amber;
  return COLORS.red;
}

const INDUSTRY_OPTIONS = ["HEALTHCARE", "GOVCON", "GENERAL_BUSINESS"] as const;
const ACCOUNT_STRUCTURE_OPTIONS = ["ENTERPRISE", "REGIONAL", "FACILITY", "SUB_FACILITY", "GENERAL_ORG"] as const;
const VALIDATION_STATUS_OPTIONS = ["UNVALIDATED", "PARTIALLY_VALIDATED", "VALIDATED", "REQUIRES_REVIEW"] as const;

function validationStatusColor(s: string): string {
  if (s === "VALIDATED") return COLORS.emerald;
  if (s === "PARTIALLY_VALIDATED") return COLORS.amber;
  if (s === "REQUIRES_REVIEW") return COLORS.red;
  return COLORS.textDim;
}

function industryColor(i: string | null): string {
  if (i === "HEALTHCARE") return "#60BFFF";
  if (i === "GOVCON") return COLORS.amber;
  return COLORS.textDim;
}

function DetailsTab({ org, orgId }: { org: MasterOrg; orgId: string }) {
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flagsSaving, setFlagsSaving] = useState(false);

  const [canonicalName, setCanonicalName] = useState(org.canonicalName);
  const [displayName, setDisplayName] = useState(org.displayName ?? "");
  const [normalizedNameEdit, setNormalizedNameEdit] = useState(org.normalizedName);
  const [websiteDomain, setWebsiteDomain] = useState(org.websiteDomain ?? "");
  const [industry, setIndustry] = useState<string | null>(org.industry ?? null);
  const [subVertical, setSubVertical] = useState(org.subVertical ?? "");
  const [accountStructureType, setAccountStructureType] = useState<string | null>(org.accountStructureType ?? null);
  const [isStandalone, setIsStandalone] = useState(org.isStandalone);
  const [validationStatus, setValidationStatus] = useState(org.validationStatus ?? "UNVALIDATED");
  const [city, setCity] = useState(org.city ?? "");
  const [state, setState] = useState(org.state ?? "");
  const [country, setCountry] = useState(org.country ?? "");
  const [headquartersAddress, setHeadquartersAddress] = useState(org.headquartersAddress ?? "");
  const [notes, setNotes] = useState(org.notes ?? "");
  const [sourceType, setSourceType] = useState(org.sourceType);

  const { data: qualityData } = useQuery<QualityScore>({
    queryKey: ["adminMasterOrgQuality", orgId],
    queryFn: () => adminFetch(`/admin/master-organizations/${orgId}/quality-score`),
    enabled: isAdminAuthenticated && !!orgId,
  });

  const currentFlags: string[] = org.adminFlags ?? [];

  async function toggleFlag(flag: string) {
    const newFlags = currentFlags.includes(flag)
      ? currentFlags.filter(f => f !== flag)
      : [...currentFlags, flag];
    setFlagsSaving(true);
    try {
      await adminFetch(`/admin/master-organizations/${orgId}/admin-flags`, {
        method: "PATCH",
        body: JSON.stringify({ flags: newFlags }),
      });
      qc.invalidateQueries({ queryKey: ["adminMasterOrg", orgId] });
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setFlagsSaving(false);
    }
  }

  function cancelEdit() {
    setCanonicalName(org.canonicalName);
    setDisplayName(org.displayName ?? "");
    setNormalizedNameEdit(org.normalizedName);
    setWebsiteDomain(org.websiteDomain ?? "");
    setIndustry(org.industry ?? null);
    setSubVertical(org.subVertical ?? "");
    setAccountStructureType(org.accountStructureType ?? null);
    setIsStandalone(org.isStandalone);
    setValidationStatus(org.validationStatus ?? "UNVALIDATED");
    setCity(org.city ?? "");
    setState(org.state ?? "");
    setCountry(org.country ?? "");
    setHeadquartersAddress(org.headquartersAddress ?? "");
    setNotes(org.notes ?? "");
    setSourceType(org.sourceType);
    setEditing(false);
  }

  async function handleSave() {
    if (!canonicalName.trim()) {
      Alert.alert("Validation", "Canonical name is required.");
      return;
    }
    setSaving(true);
    try {
      await adminFetch(`/admin/master-organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({
          canonicalName: canonicalName.trim(),
          displayName: displayName.trim() || null,
          normalizedName: normalizedNameEdit.trim() || undefined,
          websiteDomain: websiteDomain.trim() || null,
          industry: industry || null,
          subVertical: subVertical.trim() || null,
          accountStructureType: accountStructureType || null,
          isStandalone,
          validationStatus,
          city: city.trim() || null,
          state: state.trim() || null,
          country: country.trim() || null,
          headquartersAddress: headquartersAddress.trim() || null,
          notes: notes.trim() || null,
          sourceType,
        }),
      });
      qc.invalidateQueries({ queryKey: ["adminMasterOrg", orgId] });
      qc.invalidateQueries({ queryKey: ["adminMasterOrgs"] });
      setEditing(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled">
      <View style={styles.detailCard}>
        <View style={styles.detailCardHeader}>
          <Text style={styles.detailCardTitle}>Organization Details</Text>
          {!editing && (
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        {editing ? (
          <View style={styles.editForm}>
            <Text style={styles.fieldLabel}>Canonical Name *</Text>
            <TextInput style={styles.input} value={canonicalName} onChangeText={setCanonicalName} autoCapitalize="words" />

            <Text style={styles.fieldLabel}>Display Name (shown in UI)</Text>
            <TextInput style={styles.input} value={displayName} onChangeText={setDisplayName} autoCapitalize="words" placeholder="Defaults to canonical name" placeholderTextColor={COLORS.textDim} />

            <Text style={styles.fieldLabel}>Normalized Name (auto-generated if blank)</Text>
            <TextInput style={styles.input} value={normalizedNameEdit} onChangeText={setNormalizedNameEdit} autoCapitalize="none" placeholder="Auto-generated" placeholderTextColor={COLORS.textDim} />

            <Text style={styles.fieldLabel}>Website Domain</Text>
            <TextInput style={styles.input} value={websiteDomain} onChangeText={setWebsiteDomain} autoCapitalize="none" keyboardType="url" />

            <Text style={styles.fieldLabel}>Industry</Text>
            <View style={styles.sourceRow}>
              {([null, ...INDUSTRY_OPTIONS] as Array<null | typeof INDUSTRY_OPTIONS[number]>).map(i => (
                <TouchableOpacity key={i ?? "NONE"} style={[styles.sourceBtn, industry === i && styles.sourceBtnActive]} onPress={() => setIndustry(i)}>
                  <Text style={[styles.sourceBtnText, industry === i && styles.sourceBtnTextActive]}>{i ?? "None"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Account Structure Type</Text>
            <View style={styles.sourceRow}>
              {([null, ...ACCOUNT_STRUCTURE_OPTIONS] as Array<null | typeof ACCOUNT_STRUCTURE_OPTIONS[number]>).map(a => (
                <TouchableOpacity key={a ?? "NONE"} style={[styles.sourceBtn, accountStructureType === a && styles.sourceBtnActive]} onPress={() => setAccountStructureType(a)}>
                  <Text style={[styles.sourceBtnText, accountStructureType === a && styles.sourceBtnTextActive]}>{a ?? "None"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Validation Status</Text>
            <View style={styles.sourceRow}>
              {VALIDATION_STATUS_OPTIONS.map(v => (
                <TouchableOpacity key={v} style={[styles.sourceBtn, validationStatus === v && styles.sourceBtnActive]} onPress={() => setValidationStatus(v)}>
                  <Text style={[styles.sourceBtnText, validationStatus === v && styles.sourceBtnTextActive]}>{v.replace(/_/g, " ")}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Is Standalone (no parent expected)</Text>
            <TouchableOpacity style={[styles.sourceBtn, isStandalone && styles.sourceBtnActive]} onPress={() => setIsStandalone(s => !s)}>
              <Text style={[styles.sourceBtnText, isStandalone && styles.sourceBtnTextActive]}>{isStandalone ? "Yes — Standalone" : "No"}</Text>
            </TouchableOpacity>

            <Text style={styles.fieldLabel}>Sub Vertical</Text>
            <TextInput style={styles.input} value={subVertical} onChangeText={setSubVertical} autoCapitalize="words" placeholder="e.g. Acute Care, Prime Contractor" placeholderTextColor={COLORS.textDim} />

            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>City</Text>
                <TextInput style={styles.input} value={city} onChangeText={setCity} autoCapitalize="words" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>State</Text>
                <TextInput style={styles.input} value={state} onChangeText={setState} autoCapitalize="characters" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Country</Text>
            <TextInput style={styles.input} value={country} onChangeText={setCountry} autoCapitalize="words" />

            <Text style={styles.fieldLabel}>Headquarters Address</Text>
            <TextInput style={styles.input} value={headquartersAddress} onChangeText={setHeadquartersAddress} autoCapitalize="words" />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline numberOfLines={4} />

            <Text style={styles.fieldLabel}>Source Type</Text>
            <View style={styles.sourceRow}>
              {["MANUAL", "SEED", "WORKSPACE_APPROVED"].map(s => (
                <TouchableOpacity key={s} style={[styles.sourceBtn, sourceType === s && styles.sourceBtnActive]} onPress={() => setSourceType(s)}>
                  <Text style={[styles.sourceBtnText, sourceType === s && styles.sourceBtnTextActive]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit} disabled={saving}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                {saving
                  ? <ActivityIndicator size="small" color={COLORS.navyDark} />
                  : <Text style={styles.saveBtnText}>Save Changes</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.readonlyFields}>
            <FieldRow label="Canonical Name" value={org.canonicalName} />
            {org.displayName && <FieldRow label="Display Name" value={org.displayName} />}
            <FieldRow label="Normalized Name" value={org.normalizedName} muted />
            <FieldRow label="Website Domain" value={org.websiteDomain ?? "—"} />
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {org.industry && (
                <View style={[styles.sourceBtn, { borderColor: industryColor(org.industry) }]}>
                  <Text style={[styles.sourceBtnText, { color: industryColor(org.industry) }]}>{org.industry}</Text>
                </View>
              )}
              {org.accountStructureType && (
                <View style={[styles.sourceBtn, { borderColor: COLORS.textDim }]}>
                  <Text style={styles.sourceBtnText}>{org.accountStructureType}</Text>
                </View>
              )}
              {org.isStandalone && (
                <View style={[styles.sourceBtn, { borderColor: COLORS.emerald }]}>
                  <Text style={[styles.sourceBtnText, { color: COLORS.emerald }]}>STANDALONE</Text>
                </View>
              )}
              <View style={[styles.sourceBtn, { borderColor: validationStatusColor(org.validationStatus) }]}>
                <Text style={[styles.sourceBtnText, { color: validationStatusColor(org.validationStatus) }]}>
                  {org.validationStatus.replace(/_/g, " ")}
                </Text>
              </View>
            </View>
            {org.subVertical && <FieldRow label="Sub Vertical" value={org.subVertical} />}
            {(org.city || org.state) && <FieldRow label="Location" value={[org.city, org.state, org.country].filter(Boolean).join(", ")} />}
            <FieldRow label="Headquarters" value={org.headquartersAddress ?? "—"} />
            <FieldRow label="Confidence" value={`${Math.round((org.confidenceScore ?? 0) * 100)}% (source: ${Math.round(org.sourceConfidence * 100)}%)`} />
            <FieldRow label="Source Type" value={org.sourceType} />
            <FieldRow label="Named Aliases" value={(org.aliasRecords ?? []).length > 0 ? (org.aliasRecords ?? []).map(a => a.aliasName).join(", ") : "—"} />
            <FieldRow label="Notes" value={org.notes ?? "—"} />
            {org.structureLastScannedAt && <FieldRow label="Last Structure Scan" value={new Date(org.structureLastScannedAt).toLocaleDateString()} muted />}
            <FieldRow label="Created" value={new Date(org.createdAt).toLocaleDateString()} muted />
            <FieldRow label="Updated" value={new Date(org.updatedAt).toLocaleDateString()} muted />
          </View>
        )}
      </View>

      {/* Quality Score Card */}
      {qualityData && (
        <View style={styles.qualityCard}>
          <View style={styles.qualityCardHeader}>
            <Text style={styles.qualityCardTitle}>Data Quality Score</Text>
            <Text style={[styles.qualityScore, { color: scoreColor(qualityData.score) }]}>
              {qualityData.score}/{qualityData.maxScore}
            </Text>
          </View>
          <View style={styles.qualityBar}>
            <View style={[
              styles.qualityBarFill,
              {
                width: `${(qualityData.score / qualityData.maxScore) * 100}%` as any,
                backgroundColor: scoreColor(qualityData.score),
              }
            ]} />
          </View>
          <View style={styles.signalsList}>
            {qualityData.signals.map((s, i) => (
              <View key={i} style={styles.signalRow}>
                <Text style={[styles.signalDot, { color: s.earned ? COLORS.emerald : COLORS.textDim }]}>
                  {s.earned ? "●" : "○"}
                </Text>
                <Text style={[styles.signalLabel, !s.earned && styles.signalLabelMuted]}>
                  {s.label}
                </Text>
                <Text style={[styles.signalWeight, { color: s.earned ? COLORS.emerald : COLORS.textDim }]}>
                  +{s.weight}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Admin Flags */}
      <View style={styles.flagsCard}>
        <View style={styles.flagsCardHeader}>
          <Text style={styles.flagsCardTitle}>Admin Flags</Text>
          {flagsSaving && <ActivityIndicator size="small" color={COLORS.amber} />}
        </View>
        <View style={styles.flagsGrid}>
          {ALL_FLAGS.map(flag => {
            const isSet = currentFlags.includes(flag);
            const isToggleable = (TOGGLEABLE_FLAGS as readonly string[]).includes(flag);
            return (
              <TouchableOpacity
                key={flag}
                style={[
                  styles.flagChip,
                  isSet && styles.flagChipActive,
                  !isToggleable && styles.flagChipReadonly,
                ]}
                onPress={() => isToggleable ? toggleFlag(flag) : undefined}
                activeOpacity={isToggleable ? 0.7 : 1}
                disabled={!isToggleable || flagsSaving}
              >
                <Text style={[
                  styles.flagChipText,
                  isSet && styles.flagChipTextActive,
                  !isToggleable && !isSet && styles.flagChipTextMuted,
                ]}>
                  {flag.replace(/_/g, " ")}
                </Text>
                {!isToggleable && (
                  <Text style={styles.flagChipReadonlyMark}> ⊘</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.flagsHint}>
          Toggleable: needs_revalidation, standalone. Other flags are read-only indicators.
        </Text>
      </View>
    </ScrollView>
  );
}

// ─── Overlays Tab ─────────────────────────────────────────────────────────────

function OverlaysTab({ org, orgId }: { org: MasterOrg; orgId: string }) {
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [editingHC, setEditingHC] = useState(false);
  const [editingGC, setEditingGC] = useState(false);
  const [savingHC, setSavingHC] = useState(false);
  const [savingGC, setSavingGC] = useState(false);

  const hc = org.healthcareOverlay;
  const gc = org.govconOverlay;

  const [facilityType, setFacilityType] = useState(hc?.facilityType ?? "");
  const [licensedBeds, setLicensedBeds] = useState(hc?.licensedBeds?.toString() ?? "");
  const [traumaLevel, setTraumaLevel] = useState(hc?.traumaLevel ?? "");
  const [systemType, setSystemType] = useState(hc?.systemType ?? "");
  const [ownershipModel, setOwnershipModel] = useState(hc?.ownershipModel ?? "");
  const [careSetting, setCareSetting] = useState(hc?.careSetting ?? "");

  const [uei, setUei] = useState(gc?.uei ?? "");
  const [cageCode, setCageCode] = useState(gc?.cageCode ?? "");
  const [naicsCodes, setNaicsCodes] = useState((gc?.naicsCodes ?? []).join(", "));
  const [primeOrSub, setPrimeOrSub] = useState(gc?.primeOrSub ?? "");
  const [contractVehicles, setContractVehicles] = useState((gc?.contractVehicles ?? []).join(", "));
  const [agencyAlignment, setAgencyAlignment] = useState(gc?.agencyAlignment ?? "");

  async function saveHealthcare() {
    setSavingHC(true);
    try {
      await adminFetch(`/admin/master-organizations/${orgId}/healthcare-overlay`, {
        method: "PUT",
        body: JSON.stringify({
          facilityType: facilityType.trim() || null,
          licensedBeds: licensedBeds ? parseInt(licensedBeds) : null,
          traumaLevel: traumaLevel.trim() || null,
          systemType: systemType.trim() || null,
          ownershipModel: ownershipModel.trim() || null,
          careSetting: careSetting.trim() || null,
        }),
      });
      qc.invalidateQueries({ queryKey: ["adminMasterOrg", orgId] });
      setEditingHC(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setSavingHC(false);
    }
  }

  async function saveGovcon() {
    setSavingGC(true);
    try {
      await adminFetch(`/admin/master-organizations/${orgId}/govcon-overlay`, {
        method: "PUT",
        body: JSON.stringify({
          uei: uei.trim() || null,
          cageCode: cageCode.trim() || null,
          naicsCodes: naicsCodes.split(",").map(s => s.trim()).filter(Boolean),
          primeOrSub: primeOrSub.trim() || null,
          contractVehicles: contractVehicles.split(",").map(s => s.trim()).filter(Boolean),
          agencyAlignment: agencyAlignment.trim() || null,
        }),
      });
      qc.invalidateQueries({ queryKey: ["adminMasterOrg", orgId] });
      setEditingGC(false);
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setSavingGC(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent} keyboardShouldPersistTaps="handled">
      {/* Healthcare Overlay */}
      <View style={styles.detailCard}>
        <View style={styles.detailCardHeader}>
          <Text style={[styles.detailCardTitle, { color: "#60BFFF" }]}>Healthcare Overlay</Text>
          {!editingHC && (
            <TouchableOpacity style={[styles.editBtn, { borderColor: "#60BFFF" }]} onPress={() => setEditingHC(true)}>
              <Text style={[styles.editBtnText, { color: "#60BFFF" }]}>{hc ? "Edit" : "Add"}</Text>
            </TouchableOpacity>
          )}
        </View>
        {editingHC ? (
          <View style={styles.editForm}>
            <Text style={styles.fieldLabel}>Facility Type</Text>
            <TextInput style={styles.input} value={facilityType} onChangeText={setFacilityType} placeholder="e.g. Acute Care Hospital" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>Licensed Beds</Text>
            <TextInput style={styles.input} value={licensedBeds} onChangeText={setLicensedBeds} keyboardType="numeric" placeholder="0" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>Trauma Level</Text>
            <TextInput style={styles.input} value={traumaLevel} onChangeText={setTraumaLevel} placeholder="e.g. Level I, Level II" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>System Type</Text>
            <TextInput style={styles.input} value={systemType} onChangeText={setSystemType} placeholder="e.g. IDN, Regional System" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>Ownership Model</Text>
            <TextInput style={styles.input} value={ownershipModel} onChangeText={setOwnershipModel} placeholder="e.g. Non-profit, For-profit, Government" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>Care Setting</Text>
            <TextInput style={styles.input} value={careSetting} onChangeText={setCareSetting} placeholder="e.g. Inpatient, Outpatient" placeholderTextColor={COLORS.textDim} />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingHC(false)} disabled={savingHC}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, savingHC && styles.saveBtnDisabled]} onPress={saveHealthcare} disabled={savingHC}>
                {savingHC ? <ActivityIndicator size="small" color={COLORS.navyDark} /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : hc ? (
          <View style={styles.readonlyFields}>
            {hc.facilityType && <FieldRow label="Facility Type" value={hc.facilityType} />}
            {hc.licensedBeds != null && <FieldRow label="Licensed Beds" value={String(hc.licensedBeds)} />}
            {hc.traumaLevel && <FieldRow label="Trauma Level" value={hc.traumaLevel} />}
            {hc.systemType && <FieldRow label="System Type" value={hc.systemType} />}
            {hc.ownershipModel && <FieldRow label="Ownership Model" value={hc.ownershipModel} />}
            {hc.careSetting && <FieldRow label="Care Setting" value={hc.careSetting} />}
          </View>
        ) : (
          <Text style={styles.emptyText}>No healthcare data yet. Tap Add to fill in.</Text>
        )}
      </View>

      {/* GovCon Overlay */}
      <View style={styles.detailCard}>
        <View style={styles.detailCardHeader}>
          <Text style={[styles.detailCardTitle, { color: COLORS.amber }]}>GovCon Overlay</Text>
          {!editingGC && (
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditingGC(true)}>
              <Text style={styles.editBtnText}>{gc ? "Edit" : "Add"}</Text>
            </TouchableOpacity>
          )}
        </View>
        {editingGC ? (
          <View style={styles.editForm}>
            <Text style={styles.fieldLabel}>UEI</Text>
            <TextInput style={styles.input} value={uei} onChangeText={setUei} autoCapitalize="characters" placeholder="Unique Entity Identifier" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>CAGE Code</Text>
            <TextInput style={styles.input} value={cageCode} onChangeText={setCageCode} autoCapitalize="characters" placeholder="5-char CAGE code" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>NAICS Codes (comma-separated)</Text>
            <TextInput style={styles.input} value={naicsCodes} onChangeText={setNaicsCodes} placeholder="e.g. 541512, 541519" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>Prime or Sub</Text>
            <View style={styles.sourceRow}>
              {[null, "PRIME", "SUB", "BOTH"].map(v => (
                <TouchableOpacity key={v ?? "NONE"} style={[styles.sourceBtn, primeOrSub === (v ?? "") && styles.sourceBtnActive]} onPress={() => setPrimeOrSub(v ?? "")}>
                  <Text style={[styles.sourceBtnText, primeOrSub === (v ?? "") && styles.sourceBtnTextActive]}>{v ?? "None"}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>Contract Vehicles (comma-separated)</Text>
            <TextInput style={styles.input} value={contractVehicles} onChangeText={setContractVehicles} placeholder="e.g. GSA MAS, SEWP V" placeholderTextColor={COLORS.textDim} />
            <Text style={styles.fieldLabel}>Agency Alignment</Text>
            <TextInput style={styles.input} value={agencyAlignment} onChangeText={setAgencyAlignment} placeholder="e.g. DHS, DoD, HHS" placeholderTextColor={COLORS.textDim} />
            <View style={styles.editActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingGC(false)} disabled={savingGC}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, savingGC && styles.saveBtnDisabled]} onPress={saveGovcon} disabled={savingGC}>
                {savingGC ? <ActivityIndicator size="small" color={COLORS.navyDark} /> : <Text style={styles.saveBtnText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : gc ? (
          <View style={styles.readonlyFields}>
            {gc.uei && <FieldRow label="UEI" value={gc.uei} />}
            {gc.cageCode && <FieldRow label="CAGE Code" value={gc.cageCode} />}
            {gc.naicsCodes?.length > 0 && <FieldRow label="NAICS Codes" value={gc.naicsCodes.join(", ")} />}
            {gc.primeOrSub && <FieldRow label="Prime or Sub" value={gc.primeOrSub} />}
            {gc.contractVehicles?.length > 0 && <FieldRow label="Contract Vehicles" value={gc.contractVehicles.join(", ")} />}
            {gc.agencyAlignment && <FieldRow label="Agency Alignment" value={gc.agencyAlignment} />}
          </View>
        ) : (
          <Text style={styles.emptyText}>No GovCon data yet. Tap Add to fill in.</Text>
        )}
      </View>
    </ScrollView>
  );
}

// ─── Relationships Tab ────────────────────────────────────────────────────────

function RelationshipsTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [addChildVisible, setAddChildVisible] = useState(false);
  const [addParentVisible, setAddParentVisible] = useState(false);
  const [editingRelId, setEditingRelId] = useState<string | null>(null);
  const [editingRelType, setEditingRelType] = useState<string>("");

  const { data, isLoading } = useQuery({
    queryKey: ["adminMasterOrgRels", orgId],
    queryFn: () => adminFetch(`/admin/master-organizations/${orgId}/relationships`),
    enabled: isAdminAuthenticated && !!orgId,
  });

  const childRels: MasterRel[] = data?.childRelationships ?? [];
  const parentRels: MasterRel[] = data?.parentRelationships ?? [];

  async function handleAddChild(childId: string, childName: string, relType: RelType) {
    await adminFetch(`/admin/master-organizations/${orgId}/relationships`, {
      method: "POST",
      body: JSON.stringify({ childMasterOrganizationId: childId, relationshipType: relType }),
    });
    qc.invalidateQueries({ queryKey: ["adminMasterOrgRels", orgId] });
    qc.invalidateQueries({ queryKey: ["adminMasterOrgs"] });
  }

  async function handleAddParent(parentId: string, parentName: string, relType: RelType) {
    await adminFetch(`/admin/master-organizations/${parentId}/relationships`, {
      method: "POST",
      body: JSON.stringify({ childMasterOrganizationId: orgId, relationshipType: relType }),
    });
    qc.invalidateQueries({ queryKey: ["adminMasterOrgRels", orgId] });
    qc.invalidateQueries({ queryKey: ["adminMasterOrgs"] });
  }

  async function handleChangeRelType(relId: string, newType: RelType) {
    try {
      await adminFetch(`/admin/master-organization-relationships/${relId}`, {
        method: "PUT",
        body: JSON.stringify({ relationshipType: newType }),
      });
      qc.invalidateQueries({ queryKey: ["adminMasterOrgRels", orgId] });
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteRel(relId: string, orgName: string) {
    Alert.alert(
      "Remove Relationship",
      `Remove relationship with "${orgName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await adminFetch(`/admin/master-organization-relationships/${relId}`, { method: "DELETE" });
              qc.invalidateQueries({ queryKey: ["adminMasterOrgRels", orgId] });
              qc.invalidateQueries({ queryKey: ["adminMasterOrgs"] });
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : String(err));
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>;
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.tabContent}>
        {/* Parent Relationships */}
        <View style={styles.relSection}>
          <View style={styles.relSectionHeader}>
            <Text style={styles.relSectionTitle}>Parent Organizations ({parentRels.length})</Text>
            <TouchableOpacity style={styles.addRelBtn} onPress={() => setAddParentVisible(true)}>
              <Text style={styles.addRelBtnText}>+ Add Parent</Text>
            </TouchableOpacity>
          </View>
          {parentRels.length === 0 ? (
            <Text style={styles.emptyText}>No parent relationships — this is a root organization.</Text>
          ) : (
            parentRels.map(rel => (
              <RelCard
                key={rel.id}
                rel={rel}
                orgName={rel.parentName ?? rel.parentMasterOrganizationId}
                onChangeType={() => { setEditingRelId(rel.id); setEditingRelType(rel.relationshipType); }}
                onDelete={() => handleDeleteRel(rel.id, rel.parentName ?? rel.parentMasterOrganizationId)}
              />
            ))
          )}
        </View>

        {/* Child Relationships */}
        <View style={styles.relSection}>
          <View style={styles.relSectionHeader}>
            <Text style={styles.relSectionTitle}>Child Organizations ({childRels.length})</Text>
            <TouchableOpacity style={styles.addRelBtn} onPress={() => setAddChildVisible(true)}>
              <Text style={styles.addRelBtnText}>+ Add Child</Text>
            </TouchableOpacity>
          </View>
          {childRels.length === 0 ? (
            <Text style={styles.emptyText}>No child relationships yet.</Text>
          ) : (
            childRels.map(rel => (
              <RelCard
                key={rel.id}
                rel={rel}
                orgName={rel.childName ?? rel.childMasterOrganizationId}
                onChangeType={() => { setEditingRelId(rel.id); setEditingRelType(rel.relationshipType); }}
                onDelete={() => handleDeleteRel(rel.id, rel.childName ?? rel.childMasterOrganizationId)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <AddRelModal
        visible={addChildVisible}
        onClose={() => setAddChildVisible(false)}
        excludeId={orgId}
        mode="child"
        onConfirm={handleAddChild}
      />

      <AddRelModal
        visible={addParentVisible}
        onClose={() => setAddParentVisible(false)}
        excludeId={orgId}
        mode="parent"
        onConfirm={handleAddParent}
      />

      <RelTypePickerModal
        visible={!!editingRelId}
        current={editingRelType}
        onSelect={(newType) => editingRelId && handleChangeRelType(editingRelId, newType)}
        onClose={() => setEditingRelId(null)}
      />
    </View>
  );
}

function RelCard({
  rel, orgName, onChangeType, onDelete,
}: {
  rel: MasterRel;
  orgName: string;
  onChangeType: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.relCard}>
      <View style={styles.relInfo}>
        <Text style={styles.relName}>{orgName}</Text>
        <View style={styles.relMeta}>
          <TouchableOpacity onPress={onChangeType} style={styles.relTypeTouchable}>
            <RelTypeBadge type={rel.relationshipType} />
            <Text style={styles.editTypeHint}>✎</Text>
          </TouchableOpacity>
          <Text style={styles.relConf}>{(rel.confidenceScore * 100).toFixed(0)}% conf</Text>
        </View>
        {rel.evidenceSummary ? (
          <Text style={styles.relEvidence} numberOfLines={2}>{rel.evidenceSummary}</Text>
        ) : null}
      </View>
      <TouchableOpacity style={styles.deleteRelBtn} onPress={onDelete}>
        <Text style={styles.deleteRelBtnText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Siblings Tab ─────────────────────────────────────────────────────────────

function SiblingsTab({ orgId }: { orgId: string }) {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["adminMasterOrgRels", orgId],
    queryFn: () => adminFetch(`/admin/master-organizations/${orgId}/relationships`),
    enabled: isAdminAuthenticated && !!orgId,
  });

  const parentRels: MasterRel[] = data?.parentRelationships ?? [];

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>;
  }

  if (parentRels.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>
          This is a root organization — no parent to derive siblings from.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {parentRels.map(parentRel => (
        <SiblingGroup
          key={parentRel.id}
          parentId={parentRel.parentMasterOrganizationId}
          parentName={parentRel.parentName ?? parentRel.parentMasterOrganizationId}
          currentOrgId={orgId}
          router={router}
        />
      ))}
    </ScrollView>
  );
}

function SiblingGroup({
  parentId, parentName, currentOrgId, router,
}: {
  parentId: string;
  parentName: string;
  currentOrgId: string;
  router: ReturnType<typeof useRouter>;
}) {
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading } = useQuery({
    queryKey: ["adminMasterOrgRels", parentId],
    queryFn: () => adminFetch(`/admin/master-organizations/${parentId}/relationships`),
    enabled: isAdminAuthenticated && !!parentId,
  });

  const siblings: MasterRel[] = (data?.childRelationships ?? []).filter(
    (r: MasterRel) => r.childMasterOrganizationId !== currentOrgId
  );

  return (
    <View style={styles.siblingsSection}>
      <TouchableOpacity onPress={() => router.push(`/admin/master-organizations/${parentId}` as Href)}>
        <Text style={styles.siblingParentName}>↑ {parentName}</Text>
      </TouchableOpacity>
      <Text style={styles.relSectionTitle}>Siblings ({siblings.length})</Text>
      {isLoading ? (
        <ActivityIndicator color={COLORS.amber} size="small" />
      ) : siblings.length === 0 ? (
        <Text style={styles.emptyText}>No other children of this parent yet.</Text>
      ) : (
        siblings.map(sib => (
          <TouchableOpacity
            key={sib.id}
            style={styles.siblingCard}
            onPress={() => router.push(`/admin/master-organizations/${sib.childMasterOrganizationId}` as Href)}
          >
            <Text style={styles.siblingName}>{sib.childName ?? sib.childMasterOrganizationId}</Text>
            <RelTypeBadge type={sib.relationshipType} />
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

// ─── Scan History Tab ─────────────────────────────────────────────────────────

function ScanHistoryTab({ orgId }: { orgId: string }) {
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading } = useQuery({
    queryKey: ["adminMasterOrgScanHistory", orgId],
    queryFn: () => adminFetch(`/admin/master-organizations/${orgId}/scan-history`),
    enabled: isAdminAuthenticated && !!orgId,
  });

  const scans: StructureScan[] = data?.scans ?? [];

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>;
  }

  if (scans.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No approved structure scans linked to this organization yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.relSectionTitle}>Approved Scans ({scans.length})</Text>
      {scans.map(scan => (
        <View key={scan.id} style={styles.scanCard}>
          <View style={styles.scanCardHeader}>
            <Text style={styles.scanOrgName}>{scan.organizationName}</Text>
            {scan.addToMasterGraph && (
              <View style={styles.promotedBadge}>
                <Text style={styles.promotedBadgeText}>PROMOTED</Text>
              </View>
            )}
          </View>
          <Text style={styles.scanWorkspace}>{scan.workspaceName}</Text>
          {scan.suggestedParentName && (
            <Text style={styles.scanSuggestedParent}>
              Suggested parent: {scan.suggestedParentName}
            </Text>
          )}
          {scan.suggestedStructureType && (
            <Text style={styles.scanMeta}>Structure type: {scan.suggestedStructureType}</Text>
          )}
          {scan.confidenceScore != null && (
            <Text style={styles.scanMeta}>Confidence: {(scan.confidenceScore * 100).toFixed(0)}%</Text>
          )}
          {scan.evidenceSummary && (
            <Text style={styles.scanEvidence} numberOfLines={3}>{scan.evidenceSummary}</Text>
          )}
          {scan.initiatedByEmail && (
            <Text style={styles.scanInitiator}>By: {scan.initiatedByEmail}</Text>
          )}
          <Text style={styles.scanDate}>
            Approved {new Date(scan.updatedAt).toLocaleDateString()}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Sub-components used in main screen ───────────────────────────────────────

const SOURCE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  MANUAL: { bg: "#1A2340", text: COLORS.textMuted },
  WORKSPACE_APPROVED: { bg: "#0D2B1A", text: COLORS.emerald },
  SEED: { bg: "#1A1A2E", text: "#8B8BFF" },
};

function SourcePill({ sourceType }: { sourceType: string }) {
  const c = SOURCE_BADGE_COLORS[sourceType] ?? SOURCE_BADGE_COLORS.MANUAL;
  return (
    <View style={[reviewStyles.pill, { backgroundColor: c.bg }]}>
      <Text style={[reviewStyles.pillText, { color: c.text }]}>
        {sourceType.replace(/_/g, " ")}
      </Text>
    </View>
  );
}

function ConfidencePill({ score }: { score: number }) {
  const pct = Math.round((score ?? 0) * 100);
  const color = pct >= 75 ? COLORS.emerald : pct >= 50 ? COLORS.amber : COLORS.red;
  return (
    <View style={[reviewStyles.pill, { backgroundColor: color + "22" }]}>
      <Text style={[reviewStyles.pillText, { color }]}>{pct}% conf</Text>
    </View>
  );
}

function ValidationPill({ status }: { status: string }) {
  const color = validationStatusColorMap(status);
  return (
    <View style={[reviewStyles.pill, { backgroundColor: color + "22" }]}>
      <Text style={[reviewStyles.pillText, { color }]}>
        {status.replace(/_/g, " ")}
      </Text>
    </View>
  );
}

function validationStatusColorMap(s: string): string {
  if (s === "VALIDATED") return COLORS.emerald;
  if (s === "PARTIALLY_VALIDATED") return COLORS.amber;
  if (s === "REQUIRES_REVIEW") return COLORS.red;
  return COLORS.textDim;
}

interface QuickActionBtnProps {
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}
function QuickActionBtn({ label, color, onPress, disabled }: QuickActionBtnProps) {
  return (
    <TouchableOpacity
      style={[reviewStyles.qaBtn, { borderColor: color + "55", backgroundColor: color + "11" }, disabled && reviewStyles.qaBtnDisabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[reviewStyles.qaBtnText, { color }, disabled && { opacity: 0.4 }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TABS: { key: TabKey; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "relationships", label: "Relationships" },
  { key: "siblings", label: "Siblings" },
  { key: "overlays", label: "Overlays" },
  { key: "scan-history", label: "Scan History" },
];

export default function MasterOrgDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const router = useRouter();
  const qc = useQueryClient();

  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [pagerWidth, setPagerWidth] = useState(Dimensions.get("window").width);
  const [pagerHeight, setPagerHeight] = useState(0);
  const [quickActionSaving, setQuickActionSaving] = useState(false);
  const pagerRef = useRef<ScrollView>(null);
  const tabsScrollRef = useRef<ScrollView>(null);
  const ignoreNextScrollEvent = useRef(false);

  const session = getReviewSession();
  const sessionIds = session?.orgIds ?? [];
  const sessionIndex = id ? sessionIds.indexOf(id) : -1;
  const posInSet = sessionIndex >= 0 ? sessionIndex + 1 : 0;
  const totalInSet = sessionIds.length;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["adminMasterOrg", id],
    queryFn: () => adminFetch(`/admin/master-organizations/${id}`),
    enabled: isAdminAuthenticated && !!id,
    retry: false,
  });

  const org: MasterOrg | undefined = data;

  function goToTabIndex(idx: number) {
    const clamped = Math.max(0, Math.min(idx, TABS.length - 1));
    setActiveTabIndex(clamped);
    ignoreNextScrollEvent.current = true;
    pagerRef.current?.scrollTo({ x: clamped * pagerWidth, animated: true });
    tabsScrollRef.current?.scrollTo({ x: Math.max(0, clamped * 90 - 40), animated: true });
    setTimeout(() => { ignoreNextScrollEvent.current = false; }, 500);
  }

  function handlePageScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (ignoreNextScrollEvent.current) return;
    if (pagerWidth <= 0) return;
    const page = Math.round(e.nativeEvent.contentOffset.x / pagerWidth);
    const clamped = Math.max(0, Math.min(page, TABS.length - 1));
    setActiveTabIndex(clamped);
    tabsScrollRef.current?.scrollTo({ x: Math.max(0, clamped * 90 - 40), animated: true });
  }

  function navigateToOrg(targetId: string) {
    router.replace(`/admin/master-organizations/${targetId}` as Href);
  }

  function goToPrevOrg() {
    if (sessionIndex > 0) navigateToOrg(sessionIds[sessionIndex - 1]);
  }

  function goToNextOrg() {
    if (sessionIndex >= 0 && sessionIndex < sessionIds.length - 1) {
      navigateToOrg(sessionIds[sessionIndex + 1]);
    }
  }

  function goToNextUnresolved() {
    if (sessionIndex < 0 || sessionIds.length === 0) return;
    for (let i = sessionIndex + 1; i < sessionIds.length; i++) {
      navigateToOrg(sessionIds[i]);
      return;
    }
    Alert.alert("End of List", "No more organizations in the current filtered set.");
  }

  async function handleDelete() {
    Alert.alert(
      "Delete Master Organization",
      `Permanently delete "${org?.canonicalName}"? This will also remove all its relationships.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await adminFetch(`/admin/master-organizations/${id}`, { method: "DELETE" });
              qc.invalidateQueries({ queryKey: ["adminMasterOrgs"] });
              if (sessionIndex >= 0 && sessionIndex < sessionIds.length - 1) {
                navigateToOrg(sessionIds[sessionIndex + 1]);
              } else {
                router.replace("/admin/(tabs)/master-organizations" as Href);
              }
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : String(err));
            }
          },
        },
      ]
    );
  }

  async function quickAction(action: () => Promise<void>) {
    setQuickActionSaving(true);
    try { await action(); } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : String(err));
    } finally { setQuickActionSaving(false); }
  }

  async function doApprove() {
    await adminFetch(`/admin/master-organizations/${id}/validation-status`, {
      method: "PATCH",
      body: JSON.stringify({ validationStatus: "VALIDATED" }),
    });
    await qc.invalidateQueries({ queryKey: ["adminMasterOrg", id] });
    qc.invalidateQueries({ queryKey: ["adminMasterOrgs"] });
    goToNextUnresolved();
  }

  async function doFlag() {
    await adminFetch(`/admin/master-organizations/${id}/validation-status`, {
      method: "PATCH",
      body: JSON.stringify({ validationStatus: "REQUIRES_REVIEW" }),
    });
    await qc.invalidateQueries({ queryKey: ["adminMasterOrg", id] });
    qc.invalidateQueries({ queryKey: ["adminMasterOrgs"] });
  }

  async function doMarkDuplicate() {
    const currentFlags = org?.adminFlags ?? [];
    if (currentFlags.includes("duplicate_suspect")) {
      Alert.alert("Already Flagged", "This org is already flagged as a duplicate suspect.");
      return;
    }
    await adminFetch(`/admin/master-organizations/${id}/admin-flags`, {
      method: "PATCH",
      body: JSON.stringify({ flags: [...currentFlags, "duplicate_suspect"] }),
    });
    qc.invalidateQueries({ queryKey: ["adminMasterOrg", id] });
  }

  async function doStructureScan() {
    await adminFetch(`/admin/master-organizations/${id}/structure-scan`, { method: "POST" });
    qc.invalidateQueries({ queryKey: ["adminMasterOrg", id] });
    Alert.alert("Structure Scan", "Scan initiated. Results will appear in the Scan History tab.");
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[
          { label: "Master Organizations", href: "/admin/(tabs)/master-organizations" },
          { label: "Loading…" },
        ]} />
        <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  if (isError || !org) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[
          { label: "Master Organizations", href: "/admin/(tabs)/master-organizations" },
          { label: "Not Found" },
        ]} />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Organization not found or could not be loaded.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.replace("/admin/(tabs)/master-organizations" as Href)}>
            <Text style={styles.backBtnText}>← Back to Master Organizations</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isDuplicateFlagged = (org.adminFlags ?? []).includes("duplicate_suspect");

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Master Organizations", href: "/admin/(tabs)/master-organizations" },
        { label: org.canonicalName },
      ]} />

      {/* ── Sticky Review Header ── */}
      <View style={reviewStyles.reviewHeader}>
        <View style={reviewStyles.reviewHeaderLeft}>
          <Text style={reviewStyles.reviewOrgName} numberOfLines={1}>{org.canonicalName}</Text>
          {org.websiteDomain && (
            <Text style={reviewStyles.reviewDomain} numberOfLines={1}>{org.websiteDomain}</Text>
          )}
          <View style={reviewStyles.pillRow}>
            <SourcePill sourceType={org.sourceType} />
            <ConfidencePill score={org.confidenceScore} />
            <ValidationPill status={org.validationStatus} />
            {posInSet > 0 && (
              <View style={reviewStyles.positionPill}>
                <Text style={reviewStyles.positionText}>{posInSet} / {totalInSet}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={reviewStyles.reviewHeaderRight}>
          {posInSet > 0 && (
            <View style={reviewStyles.navRow}>
              <TouchableOpacity
                style={[reviewStyles.navArrow, sessionIndex <= 0 && reviewStyles.navArrowOff]}
                onPress={goToPrevOrg}
                disabled={sessionIndex <= 0}
              >
                <Text style={[reviewStyles.navArrowText, sessionIndex <= 0 && { opacity: 0.3 }]}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[reviewStyles.navArrow, sessionIndex >= sessionIds.length - 1 && reviewStyles.navArrowOff]}
                onPress={goToNextOrg}
                disabled={sessionIndex >= sessionIds.length - 1}
              >
                <Text style={[reviewStyles.navArrowText, sessionIndex >= sessionIds.length - 1 && { opacity: 0.3 }]}>›</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity style={reviewStyles.deletePill} onPress={handleDelete}>
            <Text style={reviewStyles.deletePillText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Tab Bar (stays visible, synced with swipe) ── */}
      <ScrollView
        ref={tabsScrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScrollContainer}
        contentContainerStyle={styles.tabsContainer}
      >
        {TABS.map((tab, idx) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTabIndex === idx && styles.tabActive]}
            onPress={() => goToTabIndex(idx)}
          >
            <Text style={[styles.tabText, activeTabIndex === idx && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Swipeable Pager ── */}
      <View
        style={styles.tabBody}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setPagerWidth(width);
          setPagerHeight(height);
        }}
      >
        {pagerHeight > 0 && (
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            scrollEventThrottle={16}
            decelerationRate="fast"
            onMomentumScrollEnd={handlePageScrollEnd}
            style={{ width: pagerWidth, height: pagerHeight }}
            contentContainerStyle={{ height: pagerHeight }}
          >
            <View style={{ width: pagerWidth, height: pagerHeight }}>
              <DetailsTab org={org} orgId={id!} />
            </View>
            <View style={{ width: pagerWidth, height: pagerHeight }}>
              <RelationshipsTab orgId={id!} />
            </View>
            <View style={{ width: pagerWidth, height: pagerHeight }}>
              <SiblingsTab orgId={id!} />
            </View>
            <View style={{ width: pagerWidth, height: pagerHeight }}>
              <OverlaysTab org={org} orgId={id!} />
            </View>
            <View style={{ width: pagerWidth, height: pagerHeight }}>
              <ScanHistoryTab orgId={id!} />
            </View>
          </ScrollView>
        )}
      </View>

      {/* ── Quick Action Bar ── */}
      <View style={reviewStyles.qaBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={reviewStyles.qaBarContent}
          keyboardShouldPersistTaps="handled"
        >
          <QuickActionBtn
            label="✓ Approve"
            color={COLORS.emerald}
            onPress={() => quickAction(doApprove)}
            disabled={quickActionSaving || org.validationStatus === "VALIDATED"}
          />
          <QuickActionBtn
            label="⚑ Flag"
            color={COLORS.red}
            onPress={() => quickAction(doFlag)}
            disabled={quickActionSaving || org.validationStatus === "REQUIRES_REVIEW"}
          />
          <QuickActionBtn
            label="⊘ Duplicate"
            color={COLORS.amber}
            onPress={() => quickAction(doMarkDuplicate)}
            disabled={quickActionSaving || isDuplicateFlagged}
          />
          <QuickActionBtn
            label="⟳ Scan"
            color="#60BFFF"
            onPress={() => quickAction(doStructureScan)}
            disabled={quickActionSaving}
          />
          {posInSet > 0 && (
            <QuickActionBtn
              label="→ Next"
              color={COLORS.textMuted}
              onPress={goToNextUnresolved}
              disabled={sessionIndex >= sessionIds.length - 1}
            />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  backBtn: {
    marginTop: 16,
    backgroundColor: COLORS.navyCard,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  backBtnText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },

  orgHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyMid,
    gap: 12,
  },
  orgHeaderLeft: { flex: 1 },
  orgHeaderName: { color: COLORS.text, fontSize: 17, fontFamily: "Inter_700Bold", marginBottom: 2 },
  orgHeaderDomain: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  deleteBtn: {
    borderWidth: 1,
    borderColor: COLORS.red,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  deleteBtnText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_500Medium" },

  tabsScrollContainer: {
    flexGrow: 0,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyMid,
  },
  tabsContainer: { flexDirection: "row", paddingHorizontal: 4 },
  tab: { paddingVertical: 12, paddingHorizontal: 16, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.amber },
  tabText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  tabTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  tabBody: { flex: 1 },
  tabContent: { padding: 16, paddingBottom: 48 },

  // Details Tab
  detailCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginBottom: 16,
  },
  detailCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  detailCardTitle: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase" },
  editBtn: {
    borderWidth: 1,
    borderColor: COLORS.emerald,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  editBtnText: { color: COLORS.emerald, fontSize: 12, fontFamily: "Inter_500Medium" },

  readonlyFields: { gap: 12 },
  fieldRow: { gap: 2 },
  fieldLabel: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_500Medium", textTransform: "uppercase", letterSpacing: 0.5 },
  fieldValue: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_400Regular" },
  fieldValueMuted: { color: COLORS.textDim, fontSize: 13 },

  editForm: { gap: 10 },
  input: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  readonlyField: {
    backgroundColor: COLORS.navyDark,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  readonlyText: { color: COLORS.textDim, fontSize: 14, fontFamily: "Inter_400Regular" },
  sourceRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  sourceBtn: {
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sourceBtnActive: { borderColor: COLORS.amber, backgroundColor: "#2D1B00" },
  sourceBtnText: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  sourceBtnTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  editActions: { flexDirection: "row", gap: 10, marginTop: 8 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  cancelBtnText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
  saveBtn: {
    flex: 2,
    backgroundColor: COLORS.emerald,
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_700Bold" },

  // Relationships Tab
  relSection: { marginBottom: 20 },
  relSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  relSectionTitle: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  addRelBtn: {
    borderWidth: 1,
    borderColor: COLORS.emerald,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  addRelBtnText: { color: COLORS.emerald, fontSize: 12, fontFamily: "Inter_500Medium" },
  relCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    marginBottom: 8,
  },
  relInfo: { flex: 1, gap: 4 },
  relName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" },
  relMeta: { flexDirection: "row", alignItems: "center", gap: 8 },
  relTypeTouchable: { flexDirection: "row", alignItems: "center", gap: 4 },
  editTypeHint: { color: COLORS.textDim, fontSize: 11 },
  relConf: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular" },
  relEvidence: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic" },
  relTypeBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  relTypeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  deleteRelBtn: {
    marginLeft: 10,
    padding: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FF4D4D33",
  },
  deleteRelBtnText: { color: COLORS.red, fontSize: 14 },

  // Type Picker Modal
  pickerContent: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 16,
    width: 280,
  },
  pickerTitle: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 12 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  pickerItemActive: { backgroundColor: "#0D2B1A" },
  pickerItemText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  pickerItemTextActive: { color: COLORS.emerald, fontFamily: "Inter_600SemiBold" },

  // Add Rel Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 16,
    width: "90%",
    maxHeight: "80%",
  },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  modalTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  modalClose: { color: COLORS.textMuted, fontSize: 18, padding: 4 },
  modalSearch: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 10,
  },
  selectedOrg: { flexDirection: "row", alignItems: "center", marginBottom: 8, paddingHorizontal: 4 },
  selectedOrgLabel: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  selectedOrgName: { color: COLORS.emerald, fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  searchList: { maxHeight: 160, marginBottom: 12 },
  searchItem: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 10,
    marginBottom: 6,
  },
  searchItemSelected: { borderColor: COLORS.emerald, backgroundColor: "#0D2B1A" },
  searchItemName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_400Regular" },
  searchItemDomain: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  relTypeLabel: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 8 },
  relTypeRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  relTypeBtn: {
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  relTypeBtnActive: { borderColor: COLORS.emerald, backgroundColor: "#0D2B1A" },
  relTypeBtnText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  relTypeBtnTextActive: { color: COLORS.emerald, fontFamily: "Inter_600SemiBold" },
  confirmBtn: {
    backgroundColor: COLORS.emerald,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  confirmBtnDisabled: { opacity: 0.5 },
  confirmBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_700Bold" },

  // Siblings Tab
  siblingsSection: { marginBottom: 20 },
  siblingParentName: {
    color: COLORS.amber,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
  },
  siblingCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  siblingName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },

  // Scan History Tab
  scanCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginBottom: 10,
    gap: 4,
  },
  scanCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  scanOrgName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  scanWorkspace: { color: COLORS.emerald, fontSize: 12, fontFamily: "Inter_500Medium" },
  scanSuggestedParent: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  scanMeta: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular" },
  scanEvidence: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic", marginTop: 4 },
  scanInitiator: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },
  scanDate: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  promotedBadge: {
    backgroundColor: "#0D2B1A",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: COLORS.emerald,
  },
  promotedBadgeText: { color: COLORS.emerald, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },

  // Quality Score Card
  qualityCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginBottom: 14,
  },
  qualityCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  qualityCardTitle: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase" },
  qualityScore: { fontSize: 18, fontFamily: "Inter_700Bold" },
  qualityBar: {
    height: 6,
    backgroundColor: COLORS.navySurface,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 12,
  },
  qualityBarFill: { height: "100%", borderRadius: 3 },
  signalsList: { gap: 6 },
  signalRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  signalDot: { fontSize: 12, width: 14 },
  signalLabel: { flex: 1, color: COLORS.text, fontSize: 12, fontFamily: "Inter_400Regular" },
  signalLabelMuted: { color: COLORS.textDim },
  signalWeight: { fontSize: 12, fontFamily: "Inter_600SemiBold", width: 28, textAlign: "right" },

  // Admin Flags Card
  flagsCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginBottom: 14,
  },
  flagsCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  flagsCardTitle: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase" },
  flagsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  flagChip: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  flagChipActive: {
    borderColor: COLORS.amber,
    backgroundColor: "#2D1B0022",
  },
  flagChipReadonly: { opacity: 0.6 },
  flagChipText: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_500Medium" },
  flagChipTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  flagChipTextMuted: { color: COLORS.textDim },
  flagChipReadonlyMark: { color: COLORS.textDim, fontSize: 10 },
  flagsHint: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular", fontStyle: "italic" },
});

// ─── Review mode styles ────────────────────────────────────────────────────────

const reviewStyles = StyleSheet.create({
  reviewHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    backgroundColor: "#0D1525",
    gap: 10,
  },
  reviewHeaderLeft: { flex: 1, gap: 3 },
  reviewHeaderRight: { alignItems: "flex-end", gap: 8 },
  reviewOrgName: {
    color: COLORS.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    lineHeight: 20,
  },
  reviewDomain: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  pill: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  pillText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  positionPill: {
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    backgroundColor: COLORS.navyBorder,
  },
  positionText: { color: COLORS.textDim, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  navRow: { flexDirection: "row", gap: 4 },
  navArrow: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyCard,
    alignItems: "center",
    justifyContent: "center",
  },
  navArrowOff: { opacity: 0.35 },
  navArrowText: { color: COLORS.text, fontSize: 20, lineHeight: 24, fontFamily: "Inter_600SemiBold" },
  deletePill: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.red + "55",
    backgroundColor: COLORS.red + "11",
    alignItems: "center",
    justifyContent: "center",
  },
  deletePillText: { color: COLORS.red, fontSize: 14, fontFamily: "Inter_600SemiBold" },

  qaBar: {
    borderTopWidth: 1,
    borderTopColor: COLORS.navyBorder,
    backgroundColor: "#0D1525",
    paddingVertical: 8,
  },
  qaBarContent: {
    paddingHorizontal: 14,
    gap: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  qaBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  qaBtnDisabled: { opacity: 0.5 },
  qaBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
