import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Linking, Platform, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
import {
  useOrganization, useDeleteOrganization, useUpdateOrganization,
  useOrganizationScans, useStructureScans, useCreateStructureScan,
  useOrganizationIntelligence,
  type AccountState,
} from "@/hooks/useApi";
import { ParentPickerModal } from "@/components/organizations/ParentPickerModal";
import { PrimaryActionCard } from "@/components/organizations/PrimaryActionCard";
import { PipelineSummaryRow } from "@/components/organizations/PipelineSummaryRow";
import { IntelligencePulseCard } from "@/components/organizations/IntelligencePulseCard";
import { RelationshipMap } from "@/components/organizations/RelationshipMap";
import { OrgTimelineTabs } from "@/components/organizations/OrgTimelineTabs";

const ACCOUNT_STATE_COLORS: Record<AccountState, string> = {
  COLD: COLORS.textDim,
  WARMING: COLORS.amber,
  ACTIVE: COLORS.emerald,
  AT_RISK: COLORS.red,
  EXPANDING: COLORS.purple,
};

const ACCOUNT_STATE_LABELS: Record<AccountState, string> = {
  COLD: "Cold",
  WARMING: "Warming",
  ACTIVE: "Active",
  AT_RISK: "At Risk",
  EXPANDING: "Expanding",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function CollapseSection({ title, children, defaultOpen = false }: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.collapsibleHeader} onPress={() => setOpen(v => !v)} activeOpacity={0.8}>
        <Text style={styles.collapsibleTitle}>{title}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={16} color={COLORS.textDim} />
      </TouchableOpacity>
      {open && children}
    </View>
  );
}

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: org, isLoading, refetch } = useOrganization(id);
  const { data: intelligence, isLoading: intelligenceLoading } = useOrganizationIntelligence(id);
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

  const accountState = intelligence?.accountState ?? "COLD";
  const stateColor = ACCOUNT_STATE_COLORS[accountState];
  const stateLabel = ACCOUNT_STATE_LABELS[accountState];

  const rollup = org.rollup || {};
  const hasChildren = (rollup.childCount ?? 0) > 0;

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

  const primaryActionHandler = () => {
    if (!intelligence?.primaryAction) return;
    const type = intelligence.primaryAction.type;
    if (type === "CAPTURE_CONTACT") {
      router.push(`/contact/new?organizationId=${id}`);
    } else if (type === "SCHEDULE_MEETING" || type === "FOLLOW_UP") {
      Alert.alert(intelligence.primaryAction.title, intelligence.primaryAction.whyNow);
    } else {
      Alert.alert(intelligence.primaryAction.title, intelligence.primaryAction.whyNow);
    }
  };

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        <Stack.Screen options={{
          title: org.name,
          headerRight: () => (
            <TouchableOpacity onPress={handleDelete} style={{ marginRight: 4 }}>
              <Feather name="trash-2" size={18} color={COLORS.red} />
            </TouchableOpacity>
          ),
        }} />

        {/* ── Hero Header ── */}
        <View style={styles.heroHeader}>
          <View style={styles.heroLeft}>
            <View style={[styles.orgIcon, { backgroundColor: typeColor + "20" }]}>
              <Feather name="briefcase" size={22} color={typeColor} />
            </View>
            <View style={styles.heroText}>
              <Text style={styles.heroName} numberOfLines={2}>{org.name}</Text>
              {org.legalName && org.legalName !== org.name && (
                <Text style={styles.heroLegal} numberOfLines={1}>{org.legalName}</Text>
              )}
            </View>
          </View>
          <View style={[styles.stateBadge, { backgroundColor: stateColor + "18", borderColor: stateColor + "55" }]}>
            <View style={[styles.stateDot, { backgroundColor: stateColor }]} />
            <Text style={[styles.stateLabel, { color: stateColor }]}>{stateLabel}</Text>
          </View>
        </View>

        {/* Type + Vertical Badges */}
        <View style={styles.badgeRow}>
          <Badge label={typeLabel} color={typeColor} />
          {structLabel && structColor && <Badge label={structLabel} color={structColor} />}
          {vertLabel && vertColor && <Badge label={vertLabel} color={vertColor} />}
          {org.tags?.map((tag: any) => (
            <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
          ))}
        </View>

        {/* Enrich Buttons */}
        <View style={styles.toolRow}>
          <TouchableOpacity
            style={styles.toolBtn}
            onPress={() => router.push(`/org-scan/new?targetOrganizationId=${id}`)}
            activeOpacity={0.8}
          >
            <Feather name="image" size={13} color={COLORS.emerald} />
            <Text style={[styles.toolBtnText, { color: COLORS.emerald }]}>Enrich Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolBtn, { borderColor: COLORS.blue + "44" }]}
            onPress={handleStructureScan}
            disabled={structureScanCreating}
            activeOpacity={0.8}
          >
            {structureScanCreating
              ? <ActivityIndicator size="small" color={COLORS.blue} />
              : <Feather name="git-branch" size={13} color={COLORS.blue} />
            }
            <Text style={[styles.toolBtnText, { color: COLORS.blue }]}>Scan Structure</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toolBtn, { borderColor: COLORS.textDim + "44" }]}
            onPress={() => router.push(`/organization/${id}/edit`)}
            activeOpacity={0.8}
          >
            <Feather name="edit-2" size={13} color={COLORS.textDim} />
            <Text style={[styles.toolBtnText, { color: COLORS.textDim }]}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* ── Intelligence: Primary Action ── */}
        <View style={styles.section}>
          <SectionHeader title="Primary Action" />
          <PrimaryActionCard
            action={intelligence?.primaryAction}
            loading={intelligenceLoading}
            onPress={primaryActionHandler}
          />
        </View>

        {/* ── Intelligence Pulse ── */}
        <View style={styles.section}>
          <SectionHeader title="Account Intelligence" />
          {intelligenceLoading ? (
            <View style={styles.pulseLoader}>
              <ActivityIndicator size="small" color={COLORS.emerald} />
            </View>
          ) : intelligence ? (
            <IntelligencePulseCard
              health={intelligence.health}
              risk={intelligence.risk}
              gapsCount={intelligence.coverageGaps.length}
              focus={vertLabel}
            />
          ) : null}
        </View>

        {/* ── Pipeline Summary ── */}
        <View style={styles.section}>
          <SectionHeader
            title={`Pipeline${intelligence?.openOpportunities.length ? ` (${intelligence.openOpportunities.length})` : ""}`}
            action={{ label: "New Opp", onPress: () => router.push(`/opportunity/new?organizationId=${id}`) }}
          />
          {intelligenceLoading ? (
            <View style={styles.pipelineLoader}>
              <ActivityIndicator size="small" color={COLORS.blue} />
            </View>
          ) : (
            <PipelineSummaryRow
              opportunities={intelligence?.openOpportunities || []}
              onPressOpp={(oppId) => router.push(`/opportunity/${oppId}`)}
            />
          )}
        </View>

        {/* ── Relationship Map ── */}
        <View style={styles.section}>
          <SectionHeader
            title={`Contacts${intelligence?.contacts.length ? ` (${intelligence.contacts.length})` : ""}`}
            action={{ label: "Add", onPress: () => router.push(`/contact/new?organizationId=${id}`) }}
          />
          {intelligenceLoading ? (
            <View style={styles.pulseLoader}>
              <ActivityIndicator size="small" color={COLORS.purple} />
            </View>
          ) : (
            <RelationshipMap
              contacts={intelligence?.contacts || org.contacts?.map((c: any) => ({
                ...c,
                activityCount: c.activities?.length || 0,
                lastEngagementAt: null,
                isOnOpenOpp: false,
                hasOverdueTask: false,
                computedStrength: 0,
                computedStrengthLabel: "COLD",
              })) || []}
              gaps={intelligence?.coverageGaps || []}
              onPressContact={(cid) => router.push(`/contact/${cid}`)}
              onAddContact={() => router.push(`/contact/new?organizationId=${id}`)}
            />
          )}
        </View>

        {/* ── Activity + Tasks Timeline ── */}
        <View style={styles.section}>
          <SectionHeader title="Timeline" />
          <OrgTimelineTabs organizationId={id} />
        </View>

        {/* ── Rollup Stats (if parent/hierarchy) ── */}
        {hasChildren && (
          <CollapseSection title={`Hierarchy Rollup (${rollup.totalDescendants || rollup.childCount} ${childLabel})`}>
            <View style={styles.statsGrid}>
              {[
                { icon: "git-branch", value: rollup.totalDescendants || rollup.childCount, label: childLabel },
                { icon: "users", value: rollup.totalContacts || 0, label: "Total Contacts" },
                { icon: "trending-up", value: rollup.openOpportunities || 0, label: "Open Opps", color: COLORS.blue },
                { icon: "check-circle", value: rollup.wonOpportunities || 0, label: "Won Opps", color: COLORS.emerald },
                rollup.pipelineValue > 0 ? { icon: "dollar-sign", value: formatCurrency(rollup.pipelineValue), label: "Pipeline", color: COLORS.amber } : null,
                rollup.wonValue > 0 ? { icon: "award", value: formatCurrency(rollup.wonValue), label: "Won Value", color: COLORS.emerald } : null,
              ].filter(Boolean).map((s: any) => (
                <View key={s.label} style={styles.statCard}>
                  <Feather name={s.icon} size={14} color={s.color || COLORS.emerald} />
                  <Text style={[styles.statValue, s.color ? { color: s.color } : null]}>{s.value}</Text>
                  <Text style={styles.statLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </CollapseSection>
        )}

        {/* ── Hierarchy ── */}
        <CollapseSection title="Hierarchy">
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
        </CollapseSection>

        {/* ── Account Profile ── */}
        <CollapseSection title="Account Profile">
          <Card>
            {[
              { icon: "layers", label: "Decision Level", value: org.primaryDecisionLevel ? DECISION_LEVEL_LABELS[org.primaryDecisionLevel] : null },
              { icon: "flag", label: "Strategic Tier", value: org.strategicTier },
              { icon: "file-text", label: "MSA Status", value: org.msaStatus },
              { icon: "zap", label: "Priority Tier", value: org.systemPriorityTier },
              { icon: "compass", label: "Expansion Strategy", value: org.expansionStrategy },
              { icon: "bar-chart", label: "Expansion Maturity", value: org.expansionMaturity },
              { icon: "tag", label: "Sub-Vertical", value: org.subVertical },
              rollup.lastActivityDate ? { icon: "clock", label: "Last Activity", value: formatDate(rollup.lastActivityDate) } : null,
            ].filter(Boolean).filter((f: any) => f.value).map(({ icon, label, value }: any) => (
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
          </Card>
        </CollapseSection>

        {/* ── Details ── */}
        <CollapseSection title="Contact Details">
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
        </CollapseSection>

        {/* ── Scans ── */}
        {(orgScans.length > 0 || structureScans.length > 0) && (
          <CollapseSection title={`Scans (${orgScans.length + structureScans.length})`}>
            {orgScans.slice(0, 3).map((scan: any) => (
              <TouchableOpacity
                key={scan.id}
                style={styles.scanRow}
                onPress={() => router.push(`/org-scan/${scan.id}`)}
                activeOpacity={0.75}
              >
                <Feather name="image" size={14} color={COLORS.textDim} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.scanTitle} numberOfLines={1}>{scan.parsedBusinessName || "Pending OCR"}</Text>
                  <Text style={styles.scanMeta}>{scan.reviewStatus.replace("_", " ")} · {formatDate(scan.createdAt)}</Text>
                </View>
                <Badge
                  label={scan.reviewStatus.replace("_", " ")}
                  color={scan.reviewStatus === "APPROVED" ? COLORS.emerald : scan.reviewStatus === "REJECTED" ? COLORS.red : COLORS.amber}
                />
              </TouchableOpacity>
            ))}
            {structureScans.slice(0, 3).map((scan: any) => {
              const statusColor = scan.reviewStatus === "APPROVED" ? COLORS.emerald : scan.reviewStatus === "REJECTED" ? COLORS.red : scan.scanStatus === "FAILED" ? COLORS.red : COLORS.amber;
              const statusLabel = scan.reviewStatus === "APPROVED" ? "Approved" : scan.reviewStatus === "REJECTED" ? "Rejected" : scan.scanStatus === "COMPLETED" ? "Review Ready" : scan.scanStatus === "FAILED" ? "Failed" : "Running";
              return (
                <TouchableOpacity
                  key={scan.id}
                  style={styles.scanRow}
                  onPress={() => router.push(`/org-scan/structure/${scan.id}`)}
                  activeOpacity={0.75}
                >
                  <Feather name="git-branch" size={14} color={COLORS.textDim} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scanTitle} numberOfLines={1}>{scan.suggestedParentName || "Structure Analysis"}</Text>
                    <Text style={styles.scanMeta}>{formatDate(scan.createdAt)}</Text>
                  </View>
                  <Badge label={statusLabel} color={statusColor} />
                </TouchableOpacity>
              );
            })}
          </CollapseSection>
        )}

        {/* ── Notes ── */}
        {org.notes?.length > 0 && (
          <View style={styles.section}>
            <SectionHeader title="Notes" />
            {org.notes.slice(0, 3).map((n: any) => (
              <Card key={n.id} style={{ marginBottom: 8 }} padding={12}>
                <Text style={styles.noteBody} numberOfLines={4}>{n.body}</Text>
                <Text style={styles.noteDate}>{formatDate(n.createdAt)}</Text>
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

  heroHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  heroLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
  },
  orgIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  heroText: { flex: 1, gap: 2 },
  heroName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: COLORS.text,
    lineHeight: 26,
  },
  heroLegal: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
  },
  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  stateDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  stateLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },

  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },

  toolRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  toolBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 9,
    backgroundColor: COLORS.navyCard,
    borderWidth: 1,
    borderColor: COLORS.emerald + "44",
  },
  toolBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },

  section: { marginBottom: 20 },

  collapsibleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    marginBottom: 12,
  },
  collapsibleTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  pulseLoader: {
    paddingVertical: 24,
    alignItems: "center",
  },
  pipelineLoader: {
    paddingVertical: 30,
    alignItems: "center",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  statCard: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minWidth: 90,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.emerald },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, textAlign: "center" },

  hierarchyRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12 },
  hierarchyDivider: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder + "66", marginTop: 0, paddingTop: 12 },
  hierarchyLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 4 },
  hierarchyLink: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.blue },
  hierarchyLinkSub: { fontFamily: "Inter_400Regular", color: COLORS.textMuted },
  hierarchyNone: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textDim, fontStyle: "italic" },
  hierarchyAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 12 },
  hierarchyActionText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.emerald },
  childLocation: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 1 },

  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder + "88",
  },
  infoIcon: { width: 28, alignItems: "center" },
  infoContent: { flex: 1 },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  infoValueLink: { color: COLORS.blue },

  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    marginBottom: 8,
  },
  scanTitle: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text, marginBottom: 2 },
  scanMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },

  noteBody: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, lineHeight: 19 },
  noteDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 6 },
});
