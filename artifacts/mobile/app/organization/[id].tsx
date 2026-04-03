import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking, Platform, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import {
  ACCOUNT_STRUCTURE_LABELS, ACCOUNT_STRUCTURE_COLORS,
  VERTICAL_LABELS, VERTICAL_COLORS,
  ORG_TYPE_COLORS, ORG_TYPE_LABELS,
  getVerticalChildLabel, getVerticalParentLabel,
  formatCurrency, DECISION_LEVEL_LABELS,
} from "@/constants/orgLabels";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useOrganization, useDeleteOrganization, useUpdateOrganization, useOrganizationScans, useStructureScans, useCreateStructureScan } from "@/hooks/useApi";
import { ParentPickerModal } from "@/components/organizations/ParentPickerModal";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatCard({ icon, value, label, color }: { icon: any; value: string | number; label: string; color?: string }) {
  return (
    <View style={styles.statCard}>
      <Feather name={icon} size={16} color={color || COLORS.emerald} />
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: org, isLoading, refetch } = useOrganization(id);
  const deleteOrg = useDeleteOrganization();
  const updateOrg = useUpdateOrganization(id);
  const { data: scansData } = useOrganizationScans(id);
  const orgScans = scansData?.organizationScans || [];
  const { data: structureScansData } = useStructureScans(id);
  const structureScans = structureScansData?.structureScans || [];
  const createStructureScan = useCreateStructureScan();
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [structureScanCreating, setStructureScanCreating] = useState(false);

  if (isLoading) return <LoadingSpinner label="Loading organization..." />;
  if (!org) return null;

  const typeColor = ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim;
  const typeLabel = ORG_TYPE_LABELS[org.organizationType] || org.organizationType;
  const structColor = org.accountStructureType ? (ACCOUNT_STRUCTURE_COLORS[org.accountStructureType] || COLORS.textDim) : null;
  const structLabel = org.accountStructureType ? (ACCOUNT_STRUCTURE_LABELS[org.accountStructureType] || org.accountStructureType) : null;
  const vertLabel = org.vertical ? (VERTICAL_LABELS[org.vertical] || org.vertical) : null;
  const vertColor = org.vertical ? (VERTICAL_COLORS[org.vertical] || COLORS.textDim) : null;
  const childLabel = getVerticalChildLabel(org.vertical);
  const parentLabel = getVerticalParentLabel(org.vertical);

  const handleDelete = () => {
    const doDelete = async () => {
      await deleteOrg.mutateAsync(id);
      router.back();
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${org.name}? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert("Delete Organization", `Remove ${org.name}? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleSetParent = async (selected: { id: string; name: string } | null) => {
    await updateOrg.mutateAsync({ parentOrganizationId: selected?.id ?? null });
    refetch();
  };

  const handleStructureScan = async () => {
    setStructureScanCreating(true);
    try {
      const scan = await createStructureScan.mutateAsync({ organizationId: id });
      router.push(`/org-scan/structure/${scan.id}`);
    } catch (err: any) {
      if (Platform.OS === "web") {
        alert(err.message || "Failed to start structure scan.");
      } else {
        Alert.alert("Error", err.message || "Failed to start structure scan.");
      }
    } finally {
      setStructureScanCreating(false);
    }
  };

  const rollup = org.rollup || {};
  const hasChildren = (rollup.childCount ?? 0) > 0;

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Stack.Screen options={{ title: org.name, headerRight: () => (
          <TouchableOpacity onPress={handleDelete} style={{ marginRight: 4 }}>
            <Feather name="trash-2" size={18} color={COLORS.red} />
          </TouchableOpacity>
        )}} />

        {/* Top Summary */}
        <View style={styles.headerSection}>
          <View style={[styles.orgIcon, { backgroundColor: typeColor + "20" }]}>
            <Feather name="briefcase" size={28} color={typeColor} />
          </View>
          <Text style={styles.name}>{org.name}</Text>
          {org.legalName && org.legalName !== org.name && <Text style={styles.legalName}>{org.legalName}</Text>}
          <View style={styles.badgeRow}>
            <Badge label={typeLabel} color={typeColor} />
            {structLabel && structColor && <Badge label={structLabel} color={structColor} />}
            {vertLabel && vertColor && <Badge label={vertLabel} color={vertColor} />}
          </View>
          {org.tags?.length > 0 && (
            <View style={styles.tagsRow}>
              {org.tags.map((tag: any) => (
                <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
              ))}
            </View>
          )}
          {org.regionName && (
            <Text style={styles.regionText}>Region: {org.regionName}</Text>
          )}
          <View style={styles.headerActionsRow}>
            <TouchableOpacity
              style={styles.enrichPhotoBtn}
              onPress={() => router.push(`/org-scan/new?targetOrganizationId=${id}`)}
              activeOpacity={0.8}
            >
              <Feather name="image" size={14} color={COLORS.emerald} />
              <Text style={styles.enrichPhotoBtnText}>Enrich from Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.structureScanBtn}
              onPress={handleStructureScan}
              activeOpacity={0.8}
              disabled={structureScanCreating}
            >
              {structureScanCreating ? (
                <ActivityIndicator size="small" color={COLORS.blue} />
              ) : (
                <Feather name="git-branch" size={14} color={COLORS.blue} />
              )}
              <Text style={styles.structureScanBtnText}>Scan Structure</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Roll-up Stats */}
        {hasChildren && (
          <View style={styles.statsGrid}>
            <StatCard icon="git-branch" value={rollup.totalDescendants || rollup.childCount} label={childLabel} />
            <StatCard icon="users" value={rollup.totalContacts || 0} label="Total Contacts" />
            <StatCard icon="trending-up" value={rollup.openOpportunities || 0} label="Open Opps" color={COLORS.blue} />
            <StatCard icon="check-circle" value={rollup.wonOpportunities || 0} label="Won Opps" color={COLORS.emerald} />
            {rollup.pipelineValue > 0 && (
              <StatCard icon="dollar-sign" value={formatCurrency(rollup.pipelineValue)} label="Pipeline" color={COLORS.amber} />
            )}
            {rollup.wonValue > 0 && (
              <StatCard icon="award" value={formatCurrency(rollup.wonValue)} label="Won Value" color={COLORS.emerald} />
            )}
            {rollup.activePipelineChildCount > 0 && (
              <StatCard icon="activity" value={rollup.activePipelineChildCount} label="Active Pipeline" color={COLORS.blue} />
            )}
            {rollup.closedWonChildCount > 0 && (
              <StatCard icon="target" value={rollup.closedWonChildCount} label="Won Children" color={COLORS.emerald} />
            )}
          </View>
        )}

        {/* Hierarchy Section */}
        <View style={styles.section}>
          <SectionHeader title="Hierarchy" />
          <Card>
            <View style={styles.hierarchyRow}>
              <Feather name="arrow-up-circle" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.hierarchyLabel}>{parentLabel}</Text>
                {org.parentOrg ? (
                  <TouchableOpacity onPress={() => router.push(`/organization/${org.parentOrg.id}`)}>
                    <Text style={styles.hierarchyLink}>{org.parentOrg.name}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.hierarchyNone}>None</Text>
                )}
              </View>
              <TouchableOpacity style={styles.hierarchyAction} onPress={() => setParentPickerOpen(true)}>
                <Feather name={org.parentOrg ? "edit-2" : "plus"} size={14} color={COLORS.emerald} />
                <Text style={styles.hierarchyActionText}>{org.parentOrg ? "Change" : "Set"}</Text>
              </TouchableOpacity>
            </View>

            {org.ultimateParentOrg && (
              <View style={[styles.hierarchyRow, styles.hierarchyDivider]}>
                <Feather name="home" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hierarchyLabel}>Ultimate Parent</Text>
                  <TouchableOpacity onPress={() => router.push(`/organization/${org.ultimateParentOrg.id}`)}>
                    <Text style={styles.hierarchyLink}>{org.ultimateParentOrg.name}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {org.children?.length > 0 && (
              <View style={[styles.hierarchyRow, styles.hierarchyDivider]}>
                <Feather name="git-branch" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hierarchyLabel}>{childLabel} ({org.children.length})</Text>
                  {org.children.map((child: any) => (
                    <TouchableOpacity key={child.id} onPress={() => router.push(`/organization/${child.id}`)} style={{ marginTop: 6 }}>
                      <Text style={styles.hierarchyLink}>
                        {child.name}
                        {child.accountStructureType ? (
                          <Text style={styles.hierarchyLinkSub}> · {ACCOUNT_STRUCTURE_LABELS[child.accountStructureType] ?? child.accountStructureType}</Text>
                        ) : null}
                      </Text>
                      {child.city && <Text style={styles.childLocation}>{[child.city, child.state].filter(Boolean).join(", ")}</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </Card>
        </View>

        {/* Relationship Snapshot */}
        <View style={styles.section}>
          <SectionHeader title="Account Profile" />
          <Card>
            {[
              { icon: "layers", label: "Decision Level", value: org.primaryDecisionLevel ? DECISION_LEVEL_LABELS[org.primaryDecisionLevel] : null },
              { icon: "flag", label: "Strategic Tier", value: org.strategicTier },
              { icon: "file-text", label: "MSA Status", value: org.msaStatus },
              { icon: "zap", label: "Priority Tier", value: org.systemPriorityTier },
              { icon: "compass", label: "Expansion Strategy", value: org.expansionStrategy },
              { icon: "bar-chart", label: "Expansion Maturity", value: org.expansionMaturity },
              { icon: "tag", label: "Sub-Vertical", value: org.subVertical },
            ].filter(f => f.value).map(({ icon, label, value }) => (
              <View key={label} style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Feather name={icon as any} size={14} color={COLORS.textMuted} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={styles.infoValue}>{value}</Text>
                </View>
              </View>
            ))}
            {rollup.lastActivityDate && (
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Feather name="clock" size={14} color={COLORS.textMuted} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>Last Activity (Hierarchy)</Text>
                  <Text style={styles.infoValue}>{formatDate(rollup.lastActivityDate)}</Text>
                </View>
              </View>
            )}
          </Card>
        </View>

        {/* Details */}
        <View style={styles.section}>
          <SectionHeader title="Details" />
          <Card>
            {[
              { icon: "globe", label: "Website", value: org.website, href: org.website },
              { icon: "phone", label: "Phone", value: org.phone, href: org.phone ? `tel:${org.phone}` : null },
              { icon: "mail", label: "Email", value: org.email, href: org.email ? `mailto:${org.email}` : null },
              { icon: "map-pin", label: "Location", value: [org.addressLine1, org.city, org.state, org.zip].filter(Boolean).join(", "), href: null },
              { icon: "tag", label: "Industry", value: org.industry, href: null },
            ].filter(f => f.value).map(({ icon, label, value, href }) => (
              <TouchableOpacity
                key={label}
                style={styles.infoRow}
                onPress={() => href && Linking.openURL(href)}
                disabled={!href}
              >
                <View style={styles.infoIcon}>
                  <Feather name={icon as any} size={14} color={COLORS.textMuted} />
                </View>
                <View style={styles.infoContent}>
                  <Text style={styles.infoLabel}>{label}</Text>
                  <Text style={[styles.infoValue, !!href && styles.infoValueLink]}>{value}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </Card>
        </View>

        {/* Contacts */}
        {org.contacts?.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title={`Contacts (${org.contacts.length}${hasChildren && rollup.totalContacts > org.contacts.length ? ` · ${rollup.totalContacts} total` : ""})`}
            />
            {org.contacts.slice(0, 5).map((c: any) => (
              <TouchableOpacity key={c.id} style={styles.contactCard} onPress={() => router.push(`/contact/${c.id}`)} activeOpacity={0.75}>
                <View style={styles.contactAvatar}>
                  <Text style={styles.contactInitials}>
                    {((c.firstName?.[0] || "") + (c.lastName?.[0] || "")).toUpperCase() || c.fullName?.[0]?.toUpperCase() || "?"}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.contactName}>{c.fullName}</Text>
                  {c.title && <Text style={styles.contactTitle}>{c.title}</Text>}
                </View>
                <Feather name="chevron-right" size={14} color={COLORS.textDim} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Activities */}
        {org.activities?.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Recent Activity" />
            {org.activities.slice(0, 5).map((a: any) => (
              <Card key={a.id} style={{ marginBottom: 6 }} padding={12}>
                <Text style={styles.actSubject}>{a.subject}</Text>
                <Text style={styles.actDate}>{a.type} · {formatDate(a.occurredAt)}</Text>
              </Card>
            ))}
          </View>
        )}

        {/* Tasks */}
        {org.tasks?.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Tasks" />
            {org.tasks.slice(0, 5).map((t: any) => (
              <Card key={t.id} style={{ marginBottom: 6 }} padding={12}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Feather name={t.status === "DONE" ? "check-circle" : "circle"} size={14} color={t.status === "DONE" ? COLORS.emerald : COLORS.textMuted} />
                  <Text style={[styles.actSubject, t.status === "DONE" && { textDecorationLine: "line-through", color: COLORS.textMuted }]}>{t.title}</Text>
                </View>
                {t.dueDate && <Text style={styles.actDate}>Due: {formatDate(t.dueDate)}</Text>}
              </Card>
            ))}
          </View>
        )}

        {/* Logo Scans history */}
        {orgScans.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={`Logo Scans (${orgScans.length})`} />
            {orgScans.slice(0, 3).map((scan: any) => (
              <TouchableOpacity
                key={scan.id}
                style={styles.scanHistoryRow}
                onPress={() => router.push(`/org-scan/${scan.id}`)}
                activeOpacity={0.75}
              >
                <Feather name="image" size={14} color={COLORS.textDim} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actSubject} numberOfLines={1}>
                    {scan.parsedBusinessName || "Pending OCR"}
                  </Text>
                  <Text style={styles.actDate}>
                    {scan.reviewStatus.replace("_", " ")} · {formatDate(scan.createdAt)}
                  </Text>
                </View>
                <Badge
                  label={scan.reviewStatus.replace("_", " ")}
                  color={scan.reviewStatus === "APPROVED" ? COLORS.emerald : scan.reviewStatus === "REJECTED" ? COLORS.red : COLORS.amber}
                />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Structure Scans history */}
        {structureScans.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title={`Structure Scans (${structureScans.length})`} />
            {structureScans.slice(0, 3).map((scan: any) => {
              const statusColor =
                scan.reviewStatus === "APPROVED"
                  ? COLORS.emerald
                  : scan.reviewStatus === "REJECTED"
                  ? COLORS.red
                  : scan.scanStatus === "FAILED"
                  ? COLORS.red
                  : COLORS.amber;
              const statusLabel =
                scan.reviewStatus === "APPROVED"
                  ? "Approved"
                  : scan.reviewStatus === "REJECTED"
                  ? "Rejected"
                  : scan.scanStatus === "COMPLETED"
                  ? "Review Ready"
                  : scan.scanStatus === "FAILED"
                  ? "Failed"
                  : "Running";
              return (
                <TouchableOpacity
                  key={scan.id}
                  style={styles.scanHistoryRow}
                  onPress={() => router.push(`/org-scan/structure/${scan.id}`)}
                  activeOpacity={0.75}
                >
                  <Feather name="git-branch" size={14} color={COLORS.textDim} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actSubject} numberOfLines={1}>
                      {scan.suggestedParentName || "Structure Analysis"}
                    </Text>
                    <Text style={styles.actDate}>
                      {formatDate(scan.createdAt)}
                    </Text>
                  </View>
                  <Badge label={statusLabel} color={statusColor} />
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Notes */}
        {org.notes?.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Notes" />
            {org.notes.slice(0, 5).map((n: any) => (
              <Card key={n.id} style={{ marginBottom: 6 }} padding={12}>
                <Text style={styles.actSubject} numberOfLines={3}>{n.body}</Text>
                <Text style={styles.actDate}>{formatDate(n.createdAt)}</Text>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      <ParentPickerModal
        visible={parentPickerOpen}
        currentOrgId={id}
        currentParentId={org.parentOrganizationId}
        onSelect={handleSetParent}
        onClose={() => setParentPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  headerSection: { alignItems: "center", paddingVertical: 24 },
  orgIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  name: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  legalName: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, justifyContent: "center" },
  regionText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim, marginTop: 6 },
  statsGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20, justifyContent: "center",
  },
  statCard: {
    alignItems: "center", justifyContent: "center", gap: 4,
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingVertical: 12, paddingHorizontal: 14, minWidth: 95,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.emerald },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, textAlign: "center" },
  section: { marginBottom: 20 },
  hierarchyRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12 },
  hierarchyDivider: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder + "66", marginTop: 0, paddingTop: 12 },
  hierarchyLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 4 },
  hierarchyLink: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.blue },
  hierarchyLinkSub: { fontFamily: "Inter_400Regular", color: COLORS.textMuted },
  hierarchyNone: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textDim, fontStyle: "italic" },
  hierarchyAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 12 },
  hierarchyActionText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.emerald },
  childLocation: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 1 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "88" },
  infoIcon: { width: 28, alignItems: "center" },
  infoContent: { flex: 1 },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  infoValueLink: { color: COLORS.blue },
  contactCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.navyCard, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.navyBorder, gap: 10 },
  contactAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.navySurface, alignItems: "center", justifyContent: "center" },
  contactInitials: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald },
  contactName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  contactTitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  actSubject: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  actDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  headerActionsRow: {
    flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap", justifyContent: "center",
  },
  enrichPhotoBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.emeraldMuted, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: COLORS.emerald + "55",
  },
  enrichPhotoBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald },
  structureScanBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.blue + "22", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    borderWidth: 1, borderColor: COLORS.blue + "55",
  },
  structureScanBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.blue },
  scanHistoryRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyCard, borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
});
