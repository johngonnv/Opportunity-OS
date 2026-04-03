import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, TextInput, Alert, Modal, FlatList,
} from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MasterOrg {
  id: string;
  canonicalName: string;
  normalizedName: string;
  websiteDomain: string | null;
  sourceType: string;
  sourceConfidence: number;
  placeIds: string[];
  aliases: string[];
  headquartersAddress: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
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

type TabKey = "details" | "relationships" | "siblings" | "scan-history";

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

function DetailsTab({ org, orgId }: { org: MasterOrg; orgId: string }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [canonicalName, setCanonicalName] = useState(org.canonicalName);
  const [websiteDomain, setWebsiteDomain] = useState(org.websiteDomain ?? "");
  const [aliasesText, setAliasesText] = useState((org.aliases ?? []).join(", "));
  const [headquartersAddress, setHeadquartersAddress] = useState(org.headquartersAddress ?? "");
  const [notes, setNotes] = useState(org.notes ?? "");
  const [sourceType, setSourceType] = useState(org.sourceType);

  function cancelEdit() {
    setCanonicalName(org.canonicalName);
    setWebsiteDomain(org.websiteDomain ?? "");
    setAliasesText((org.aliases ?? []).join(", "));
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
      const aliases = aliasesText.split(",").map(s => s.trim()).filter(Boolean);
      await adminFetch(`/admin/master-organizations/${orgId}`, {
        method: "PUT",
        body: JSON.stringify({
          canonicalName: canonicalName.trim(),
          websiteDomain: websiteDomain.trim() || null,
          aliases,
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

            <Text style={styles.fieldLabel}>Normalized Name (auto-generated from Canonical Name)</Text>
            <View style={styles.readonlyField}>
              <Text style={styles.readonlyText}>{org.normalizedName}</Text>
            </View>

            <Text style={styles.fieldLabel}>Website Domain</Text>
            <TextInput style={styles.input} value={websiteDomain} onChangeText={setWebsiteDomain} autoCapitalize="none" keyboardType="url" />

            <Text style={styles.fieldLabel}>Aliases (comma-separated)</Text>
            <TextInput style={[styles.input, styles.textArea]} value={aliasesText} onChangeText={setAliasesText} multiline />

            <Text style={styles.fieldLabel}>Headquarters Address</Text>
            <TextInput style={styles.input} value={headquartersAddress} onChangeText={setHeadquartersAddress} autoCapitalize="words" />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} multiline numberOfLines={4} />

            <Text style={styles.fieldLabel}>Source Type</Text>
            <View style={styles.sourceRow}>
              {["MANUAL", "SEED", "WORKSPACE_APPROVED"].map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sourceBtn, sourceType === s && styles.sourceBtnActive]}
                  onPress={() => setSourceType(s)}
                >
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
            <FieldRow label="Normalized Name" value={org.normalizedName} muted />
            <FieldRow label="Website Domain" value={org.websiteDomain ?? "—"} />
            <FieldRow label="Source Type" value={org.sourceType} />
            <FieldRow label="Confidence" value={`${(org.sourceConfidence * 100).toFixed(0)}%`} />
            <FieldRow label="Aliases" value={org.aliases?.length > 0 ? org.aliases.join(", ") : "—"} />
            <FieldRow label="Headquarters" value={org.headquartersAddress ?? "—"} />
            <FieldRow label="Notes" value={org.notes ?? "—"} />
            <FieldRow label="Created" value={new Date(org.createdAt).toLocaleDateString()} muted />
            <FieldRow label="Updated" value={new Date(org.updatedAt).toLocaleDateString()} muted />
          </View>
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
    <>
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
    </>
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MasterOrgDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabKey>("details");

  const { data, isLoading } = useQuery({
    queryKey: ["adminMasterOrg", id],
    queryFn: () => adminFetch(`/admin/master-organizations/${id}`),
    enabled: isAdminAuthenticated && !!id,
  });

  const org: MasterOrg | undefined = data;

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
              router.replace("/admin/master-organizations" as Href);
            } catch (err) {
              Alert.alert("Error", err instanceof Error ? err.message : String(err));
            }
          },
        },
      ]
    );
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: "details", label: "Details" },
    { key: "relationships", label: "Relationships" },
    { key: "siblings", label: "Siblings" },
    { key: "scan-history", label: "Scan History" },
  ];

  if (isLoading || !org) {
    return (
      <View style={styles.container}>
        <AdminHeader
          breadcrumbs={[
            { label: "Master Organizations", href: "/admin/master-organizations" },
            { label: "Loading…" },
          ]}
        />
        <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AdminHeader
        breadcrumbs={[
          { label: "Master Organizations", href: "/admin/master-organizations" },
          { label: org.canonicalName },
        ]}
      />

      <View style={styles.orgHeader}>
        <View style={styles.orgHeaderLeft}>
          <Text style={styles.orgHeaderName} numberOfLines={2}>{org.canonicalName}</Text>
          {org.websiteDomain && (
            <Text style={styles.orgHeaderDomain}>{org.websiteDomain}</Text>
          )}
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <Text style={styles.deleteBtnText}>Delete</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabsScrollContainer}
        contentContainerStyle={styles.tabsContainer}
      >
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.tabBody}>
        {activeTab === "details" && <DetailsTab org={org} orgId={id} />}
        {activeTab === "relationships" && <RelationshipsTab orgId={id} />}
        {activeTab === "siblings" && <SiblingsTab orgId={id} />}
        {activeTab === "scan-history" && <ScanHistoryTab orgId={id} />}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

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
});
