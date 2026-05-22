import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Linking, Platform, ActivityIndicator, Share, Modal, TextInput,
  KeyboardAvoidingView, SafeAreaView,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import type { Href } from "expo-router";
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
import {
  useOrganization, useDeleteOrganization, useUpdateOrganization,
  useOrganizationScans, useStructureScans, useCreateStructureScan,
  useOrganizationIntelligence, useCreateActivity,
  type AccountState,
} from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { ParentPickerModal } from "@/components/organizations/ParentPickerModal";
import { PrimaryActionCard } from "@/components/organizations/PrimaryActionCard";
import { PipelineSummaryRow } from "@/components/organizations/PipelineSummaryRow";
import { IntelligencePulseCard } from "@/components/organizations/IntelligencePulseCard";
import { RelationshipMap } from "@/components/organizations/RelationshipMap";
import { OrgTimelineTabs } from "@/components/organizations/OrgTimelineTabs";
import { CMSEvidenceCard } from "@/components/organizations/CMSEvidenceCard";
import { PainPointsCard } from "@/components/organizations/PainPointsCard";
import { CompetitorLandscapeCard } from "@/components/organizations/CompetitorLandscapeCard";
import { EntryStrategyCard } from "@/components/organizations/EntryStrategyCard";

type TabId = "overview" | "contacts" | "hierarchy" | "activity";

const TABS: { id: TabId; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { id: "overview", label: "Overview", icon: "home" },
  { id: "contacts", label: "Contacts", icon: "users" },
  { id: "hierarchy", label: "Hierarchy", icon: "git-branch" },
  { id: "activity", label: "Activity", icon: "activity" },
];

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

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role } = useAuth();
  const isAdmin = role === "OWNER" || role === "ADMIN";

  const { data: org, isLoading, refetch } = useOrganization(id);
  const { data: intelligence, isLoading: intelligenceLoading } = useOrganizationIntelligence(id);
  const deleteOrg = useDeleteOrganization();
  const updateOrg = useUpdateOrganization(id);
  const { data: scansData } = useOrganizationScans(id);
  const orgScans = scansData?.organizationScans || [];
  const { data: structureScansData } = useStructureScans(id);
  const structureScans = structureScansData?.structureScans || [];
  const createStructureScan = useCreateStructureScan();
  const logActivity = useCreateActivity();

  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [structureScanCreating, setStructureScanCreating] = useState(false);
  const [activityModal, setActivityModal] = useState<{ type: string; label: string } | null>(null);
  const [activityNote, setActivityNote] = useState("");

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

  const contactsCount = intelligence?.contacts?.length ?? org.contacts?.length ?? 0;
  const openOppsCount = intelligence?.openOpportunities?.length ?? 0;
  const openTasksData = (intelligence as any)?.openTasksCount ?? 0;

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

  const logOrgActivity = (activityType: string) => {
    const label = activityType.replace(/_/g, " ").toLowerCase();
    setActivityNote("");
    setActivityModal({ type: activityType, label });
  };

  const submitOrgActivity = () => {
    if (!activityModal || !activityNote.trim()) return;
    logActivity.mutate({
      organizationId: id,
      type: activityModal.type,
      subject: activityNote.trim(),
      occurredAt: new Date().toISOString(),
    });
    setActivityModal(null);
    setActivityNote("");
  };

  const primaryActionHandler = () => {
    if (!intelligence?.primaryAction) {
      logOrgActivity("CALL");
      return;
    }
    const type = intelligence.primaryAction.type;
    if (type === "CAPTURE_CONTACT") {
      router.push(`/capture/new?organizationId=${id}` as Href);
    } else if (type === "ADVANCE_STAGE" || type === "CLOSE_DEAL") {
      const firstOpp = intelligence?.openOpportunities?.[0];
      if (firstOpp) router.push(`/opportunity/${firstOpp.id}`);
      else logOrgActivity("NOTE");
    } else if (type === "SCHEDULE_MEETING") {
      logOrgActivity("MEETING");
    } else if (type === "FOLLOW_UP" || type === "REACTIVATE") {
      logOrgActivity("CALL");
    } else if (type === "ENGAGE_STAKEHOLDER") {
      logOrgActivity("EMAIL");
    } else {
      logOrgActivity("NOTE");
    }
  };

  const tabBadge = (tab: TabId): number | null => {
    if (tab === "contacts") return contactsCount > 0 ? contactsCount : null;
    if (tab === "activity") return openOppsCount > 0 ? openOppsCount : null;
    return null;
  };

  return (
    <>
      <Stack.Screen options={{
        title: org.name,
        headerRight: () => (
          <TouchableOpacity onPress={handleDelete} style={{ marginRight: 4 }}>
            <Feather name="trash-2" size={18} color={COLORS.red} />
          </TouchableOpacity>
        ),
      }} />

      <SafeAreaView style={styles.safe}>
        {/* ── Identity Card ── */}
        <View style={styles.identityCard}>
          <View style={styles.identityTop}>
            <View style={[styles.orgIcon, { backgroundColor: typeColor + "20" }]}>
              <Feather name="briefcase" size={20} color={typeColor} />
            </View>
            <View style={styles.identityText}>
              <Text style={styles.orgName} numberOfLines={1}>{org.name}</Text>
              {org.legalName && org.legalName !== org.name && (
                <Text style={styles.orgLegal} numberOfLines={1}>{org.legalName}</Text>
              )}
            </View>
            <View style={[styles.stateBadge, { backgroundColor: stateColor + "18", borderColor: stateColor + "55" }]}>
              <View style={[styles.stateDot, { backgroundColor: stateColor }]} />
              <Text style={[styles.stateLabel, { color: stateColor }]}>{stateLabel}</Text>
            </View>
          </View>

          {/* Badge row */}
          <View style={styles.badgeRow}>
            <Badge label={typeLabel} color={typeColor} />
            {structLabel && structColor && <Badge label={structLabel} color={structColor} />}
            {vertLabel && vertColor && <Badge label={vertLabel} color={vertColor} />}
            {org.tags?.slice(0, 2).map((tag: any) => (
              <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
            ))}
          </View>

          {/* Quick action pills */}
          <View style={styles.pillRow}>
            <TouchableOpacity
              style={[styles.pill, { borderColor: COLORS.emerald + "55" }]}
              onPress={() => router.push(`/organization/${id}/edit`)}
              activeOpacity={0.8}
            >
              <Feather name="edit-2" size={12} color={COLORS.emerald} />
              <Text style={[styles.pillText, { color: COLORS.emerald }]}>Edit</Text>
            </TouchableOpacity>
            {org.parentOrg ? (
              <TouchableOpacity
                style={[styles.pill, { borderColor: COLORS.blue + "55" }]}
                onPress={() => router.push(`/organization/${org.parentOrg.id}`)}
                activeOpacity={0.8}
              >
                <Feather name="arrow-up-circle" size={12} color={COLORS.blue} />
                <Text style={[styles.pillText, { color: COLORS.blue }]} numberOfLines={1}>
                  {org.parentOrg.name.length > 14 ? "Parent" : org.parentOrg.name}
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.pill, { borderColor: COLORS.blue + "55" }]}
                onPress={() => setParentPickerOpen(true)}
                activeOpacity={0.8}
              >
                <Feather name="link-2" size={12} color={COLORS.blue} />
                <Text style={[styles.pillText, { color: COLORS.blue }]}>Set Parent</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.pill, { borderColor: COLORS.textDim + "44" }]}
              onPress={() => router.push(`/org-scan/new?targetOrganizationId=${id}`)}
              activeOpacity={0.8}
            >
              <Feather name="image" size={12} color={COLORS.textMuted} />
              <Text style={[styles.pillText, { color: COLORS.textMuted }]}>Enrich</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pill, { borderColor: COLORS.textDim + "44" }]}
              onPress={() => Share.share({ message: `${org.name} — Opportunity OS`, title: org.name })}
              activeOpacity={0.8}
            >
              <Feather name="share-2" size={12} color={COLORS.textMuted} />
              <Text style={[styles.pillText, { color: COLORS.textMuted }]}>Share</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tab Bar ── */}
        <View style={styles.tabBar}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            const badge = tabBadge(tab.id);
            return (
              <TouchableOpacity
                key={tab.id}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {tab.label}
                </Text>
                {badge !== null && (
                  <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                    <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>
                      {badge}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Tab Content ── */}
        <ScrollView
          style={styles.tabContent}
          contentContainerStyle={styles.tabContentInner}
          showsVerticalScrollIndicator={false}
          key={activeTab}
        >
          {activeTab === "overview" && (
            <OverviewTab
              org={org}
              id={id}
              intelligence={intelligence}
              intelligenceLoading={intelligenceLoading}
              isAdmin={isAdmin}
              vertLabel={vertLabel}
              router={router}
              primaryActionHandler={primaryActionHandler}
            />
          )}
          {activeTab === "contacts" && (
            <ContactsTab
              org={org}
              id={id}
              intelligence={intelligence}
              intelligenceLoading={intelligenceLoading}
              router={router}
            />
          )}
          {activeTab === "hierarchy" && (
            <HierarchyTab
              org={org}
              id={id}
              intelligence={intelligence}
              rollup={rollup}
              hasChildren={hasChildren}
              childLabel={childLabel}
              parentLabel={parentLabel}
              orgScans={orgScans}
              structureScans={structureScans}
              structureScanCreating={structureScanCreating}
              onStructureScan={handleStructureScan}
              onOpenParentPicker={() => setParentPickerOpen(true)}
              router={router}
            />
          )}
          {activeTab === "activity" && (
            <ActivityTab
              id={id}
              onRequestActivity={() => logOrgActivity("NOTE")}
              onRequestTask={() => logOrgActivity("FOLLOW_UP")}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      <ParentPickerModal
        visible={parentPickerOpen}
        currentOrgId={id}
        currentParentId={org.parentOrganizationId}
        onSelect={handleSetParent}
        onClose={() => setParentPickerOpen(false)}
      />

      <Modal
        visible={activityModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActivityModal(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.actModalBackdrop}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setActivityModal(null)} />
          <View style={styles.actModalCard}>
            <Text style={styles.actModalTitle}>Log {activityModal?.label}</Text>
            <TextInput
              style={styles.actModalInput}
              value={activityNote}
              onChangeText={setActivityNote}
              placeholder="Add a note or subject…"
              placeholderTextColor={COLORS.textDim}
              multiline
              numberOfLines={3}
              autoFocus
            />
            <View style={styles.actModalActions}>
              <TouchableOpacity style={styles.actModalCancel} onPress={() => setActivityModal(null)}>
                <Text style={styles.actModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actModalSave, !activityNote.trim() && { opacity: 0.5 }]}
                onPress={submitOrgActivity}
                disabled={!activityNote.trim() || logActivity.isPending}
              >
                <Text style={styles.actModalSaveText}>{logActivity.isPending ? "Saving…" : "Log"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function OverviewTab({ org, id, intelligence, intelligenceLoading, isAdmin, vertLabel, router, primaryActionHandler }: any) {
  return (
    <View style={tabStyles.container}>
      <SectionHeader title="Primary Action" />
      <PrimaryActionCard
        action={intelligence?.primaryAction}
        loading={intelligenceLoading}
        onPress={primaryActionHandler}
      />

      <View style={tabStyles.spacer} />
      <SectionHeader title="Account Intelligence" />
      {intelligenceLoading ? (
        <View style={tabStyles.loader}>
          <ActivityIndicator size="small" color={COLORS.emerald} />
        </View>
      ) : intelligence ? (
        <IntelligencePulseCard
          health={intelligence.health}
          risk={intelligence.risk}
          gapsCount={intelligence.coverageGaps.length}
          focus={vertLabel}
          orgId={org.vertical === "healthcare" ? id : undefined}
        />
      ) : (
        <View style={tabStyles.fallback}>
          <Feather name="activity" size={16} color={COLORS.textDim} />
          <Text style={tabStyles.fallbackText}>
            Intelligence not yet available. Log activities to generate insights.
          </Text>
        </View>
      )}

      <View style={tabStyles.spacer} />
      <SectionHeader
        title={`Pipeline${intelligence?.openOpportunities?.length ? ` (${intelligence.openOpportunities.length})` : ""}`}
        action={{ label: "New Opp", onPress: () => router.push(`/opportunity/new?organizationId=${id}`) }}
      />
      {intelligenceLoading ? (
        <View style={tabStyles.loader}>
          <ActivityIndicator size="small" color={COLORS.blue} />
        </View>
      ) : (
        <PipelineSummaryRow
          opportunities={intelligence?.openOpportunities || []}
          onPressOpp={(oppId: string) => router.push(`/opportunity/${oppId}`)}
        />
      )}

      {org.vertical === "healthcare" && (
        <>
          <View style={tabStyles.spacer} />
          <SectionHeader title="Healthcare Intelligence" />
          <CMSEvidenceCard orgId={id} />
          <PainPointsCard orgId={id} isAdmin={isAdmin} />
          <CompetitorLandscapeCard orgId={id} isAdmin={isAdmin} />
          <EntryStrategyCard orgId={id} isAdmin={isAdmin} />
        </>
      )}
    </View>
  );
}

function ContactsTab({ org, id, intelligence, intelligenceLoading, router }: any) {
  return (
    <View style={tabStyles.container}>
      <SectionHeader
        title={`Contacts${intelligence?.contacts?.length ? ` (${intelligence.contacts.length})` : ""}`}
        action={{ label: "Add", onPress: () => router.push(`/capture/new?organizationId=${id}`) }}
      />
      {intelligenceLoading ? (
        <View style={tabStyles.loader}>
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
          onPressContact={(cid: string) => router.push(`/contact/${cid}`)}
          onAddContact={() => router.push(`/capture/new?organizationId=${id}`)}
          onClassifyContacts={() => router.push(`/contacts?organizationId=${id}&unclassified=1`)}
        />
      )}
    </View>
  );
}

function HierarchyTab({
  org, id, rollup, hasChildren, childLabel, parentLabel,
  orgScans, structureScans, structureScanCreating,
  onStructureScan, onOpenParentPicker, router,
}: any) {
  const scanCount = orgScans.length + structureScans.length;
  return (
    <View style={tabStyles.container}>
      {/* Rollup stats */}
      {hasChildren && (
        <>
          <SectionHeader title={`Network (${rollup.totalDescendants || rollup.childCount} ${childLabel})`} />
          <View style={tabStyles.statsGrid}>
            {([
              { icon: "git-branch", value: rollup.totalDescendants || rollup.childCount, label: childLabel },
              { icon: "users", value: rollup.totalContacts || 0, label: "Contacts" },
              { icon: "trending-up", value: rollup.openOpportunities || 0, label: "Open Opps", color: COLORS.blue },
              { icon: "check-circle", value: rollup.wonOpportunities || 0, label: "Won Opps", color: COLORS.emerald },
              rollup.pipelineValue > 0 ? { icon: "dollar-sign", value: formatCurrency(rollup.pipelineValue), label: "Pipeline", color: COLORS.amber } : null,
              rollup.wonValue > 0 ? { icon: "award", value: formatCurrency(rollup.wonValue), label: "Won Value", color: COLORS.emerald } : null,
            ] as any[]).filter(Boolean).map((s: any) => (
              <View key={s.label} style={tabStyles.statCard}>
                <Feather name={s.icon} size={13} color={s.color || COLORS.emerald} />
                <Text style={[tabStyles.statValue, s.color ? { color: s.color } : null]}>{s.value}</Text>
                <Text style={tabStyles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>
          <View style={tabStyles.spacer} />
        </>
      )}

      {/* Hierarchy tree */}
      <SectionHeader title="Org Tree" />
      <Card>
        <View style={tabStyles.hierarchyRow}>
          <Feather name="arrow-up-circle" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
          <View style={{ flex: 1 }}>
            <Text style={tabStyles.hierarchyLabel}>{parentLabel}</Text>
            {org.parentOrg ? (
              <TouchableOpacity onPress={() => router.push(`/organization/${org.parentOrg.id}`)}>
                <Text style={tabStyles.hierarchyLink}>{org.parentOrg.name}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={tabStyles.hierarchyNone}>None</Text>
            )}
          </View>
          <TouchableOpacity style={tabStyles.hierarchyAction} onPress={onOpenParentPicker}>
            <Feather name={org.parentOrg ? "edit-2" : "plus"} size={14} color={COLORS.emerald} />
            <Text style={tabStyles.hierarchyActionText}>{org.parentOrg ? "Change" : "Set"}</Text>
          </TouchableOpacity>
        </View>

        {org.ultimateParentOrg && (
          <View style={[tabStyles.hierarchyRow, tabStyles.hierarchyDivider]}>
            <Feather name="home" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={tabStyles.hierarchyLabel}>Ultimate Parent</Text>
              <TouchableOpacity onPress={() => router.push(`/organization/${org.ultimateParentOrg.id}`)}>
                <Text style={tabStyles.hierarchyLink}>{org.ultimateParentOrg.name}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {org.children?.length > 0 && (
          <View style={[tabStyles.hierarchyRow, tabStyles.hierarchyDivider]}>
            <Feather name="git-branch" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={tabStyles.hierarchyLabel}>{childLabel} ({org.children.length})</Text>
              {org.children.map((child: any) => (
                <TouchableOpacity key={child.id} onPress={() => router.push(`/organization/${child.id}`)} style={{ marginTop: 6 }}>
                  <Text style={tabStyles.hierarchyLink}>
                    {child.name}
                    {child.accountStructureType && (
                      <Text style={tabStyles.hierarchyLinkSub}>
                        {" · "}{ACCOUNT_STRUCTURE_LABELS[child.accountStructureType] ?? child.accountStructureType}
                      </Text>
                    )}
                  </Text>
                  {child.city && (
                    <Text style={tabStyles.childLocation}>{[child.city, child.state].filter(Boolean).join(", ")}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </Card>

      {/* Account Profile */}
      <View style={tabStyles.spacer} />
      <SectionHeader title="Account Profile" />
      <Card>
        {([
          { icon: "layers", label: "Decision Level", value: org.primaryDecisionLevel ? DECISION_LEVEL_LABELS[org.primaryDecisionLevel] : null },
          { icon: "flag", label: "Strategic Tier", value: org.strategicTier },
          { icon: "file-text", label: "MSA Status", value: org.msaStatus },
          { icon: "zap", label: "Priority Tier", value: org.systemPriorityTier },
          { icon: "compass", label: "Expansion Strategy", value: org.expansionStrategy },
          { icon: "bar-chart", label: "Expansion Maturity", value: org.expansionMaturity },
          { icon: "tag", label: "Sub-Vertical", value: org.subVertical },
          rollup.lastActivityDate ? { icon: "clock", label: "Last Activity", value: formatDate(rollup.lastActivityDate) } : null,
        ] as any[]).filter((f): f is any => !!f && !!f.value).map(({ icon, label, value }: any) => (
          <View key={label} style={tabStyles.infoRow}>
            <View style={tabStyles.infoIcon}>
              <Feather name={icon} size={14} color={COLORS.textMuted} />
            </View>
            <View style={tabStyles.infoContent}>
              <Text style={tabStyles.infoLabel}>{label}</Text>
              <Text style={tabStyles.infoValue}>{value}</Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Contact Details */}
      <View style={tabStyles.spacer} />
      <SectionHeader title="Contact Details" />
      <Card>
        {([
          { icon: "globe", label: "Website", value: org.website, href: org.website },
          { icon: "phone", label: "Phone", value: org.phone, href: org.phone ? `tel:${org.phone}` : null },
          { icon: "mail", label: "Email", value: org.email, href: org.email ? `mailto:${org.email}` : null },
          { icon: "map-pin", label: "Location", value: [org.addressLine1, org.city, org.state, org.zip].filter(Boolean).join(", ") || null, href: null },
          { icon: "tag", label: "Industry", value: org.industry, href: null },
        ] as any[]).filter(f => f.value).map(({ icon, label, value, href }: any) => (
          <TouchableOpacity
            key={label}
            style={tabStyles.infoRow}
            onPress={() => href && Linking.openURL(href)}
            disabled={!href}
          >
            <View style={tabStyles.infoIcon}>
              <Feather name={icon} size={14} color={COLORS.textMuted} />
            </View>
            <View style={tabStyles.infoContent}>
              <Text style={tabStyles.infoLabel}>{label}</Text>
              <Text style={[tabStyles.infoValue, !!href && tabStyles.infoValueLink]}>{value}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </Card>

      {/* Scans */}
      <View style={tabStyles.spacer} />
      <View style={tabStyles.scansHeader}>
        <Text style={tabStyles.sectionTitle}>{scanCount > 0 ? `Scans (${scanCount})` : "Scans"}</Text>
        <TouchableOpacity
          style={tabStyles.scanBtn}
          onPress={onStructureScan}
          disabled={structureScanCreating}
        >
          {structureScanCreating
            ? <ActivityIndicator size="small" color={COLORS.blue} />
            : <Feather name="git-branch" size={12} color={COLORS.blue} />}
          <Text style={tabStyles.scanBtnText}>Scan Structure</Text>
        </TouchableOpacity>
      </View>
      {scanCount === 0 && (
        <Text style={tabStyles.noScansText}>No scans yet. Use Scan Structure to analyze org hierarchy.</Text>
      )}
      {orgScans.slice(0, 3).map((scan: any) => (
        <TouchableOpacity
          key={scan.id}
          style={tabStyles.scanRow}
          onPress={() => router.push(`/org-scan/${scan.id}`)}
          activeOpacity={0.75}
        >
          <Feather name="image" size={14} color={COLORS.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={tabStyles.scanTitle} numberOfLines={1}>{scan.parsedBusinessName || "Pending OCR"}</Text>
            <Text style={tabStyles.scanMeta}>{scan.reviewStatus.replace("_", " ")} · {formatDate(scan.createdAt)}</Text>
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
            style={tabStyles.scanRow}
            onPress={() => router.push(`/org-scan/structure/${scan.id}`)}
            activeOpacity={0.75}
          >
            <Feather name="git-branch" size={14} color={COLORS.textDim} />
            <View style={{ flex: 1 }}>
              <Text style={tabStyles.scanTitle} numberOfLines={1}>{scan.suggestedParentName || "Structure Analysis"}</Text>
              <Text style={tabStyles.scanMeta}>{formatDate(scan.createdAt)}</Text>
            </View>
            <Badge label={statusLabel} color={statusColor} />
          </TouchableOpacity>
        );
      })}

      {/* Notes */}
      {org.notes?.length > 0 && (
        <>
          <View style={tabStyles.spacer} />
          <SectionHeader title="Notes" />
          {org.notes.slice(0, 3).map((n: any) => (
            <Card key={n.id} style={{ marginBottom: 8 }} padding={12}>
              <Text style={tabStyles.noteBody} numberOfLines={4}>{n.body}</Text>
              <Text style={tabStyles.noteDate}>{formatDate(n.createdAt)}</Text>
            </Card>
          ))}
        </>
      )}
    </View>
  );
}

function ActivityTab({ id, onRequestActivity, onRequestTask }: { id: string; onRequestActivity?: () => void; onRequestTask?: () => void }) {
  return (
    <View style={tabStyles.container}>
      <OrgTimelineTabs
        organizationId={id}
        onRequestActivity={onRequestActivity}
        onRequestTask={onRequestTask}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  identityCard: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    gap: 8,
  },
  identityTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  orgIcon: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  identityText: {
    flex: 1,
    gap: 1,
  },
  orgName: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: COLORS.text,
    lineHeight: 22,
  },
  orgLegal: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
  },
  stateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    flexShrink: 0,
  },
  stateDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  stateLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  pillRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.navyCard,
    borderWidth: 1,
  },
  pillText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.navyCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    paddingHorizontal: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 11,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: COLORS.emerald,
  },
  tabLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textDim,
  },
  tabLabelActive: {
    fontFamily: "Inter_600SemiBold",
    color: COLORS.text,
  },
  tabBadge: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeActive: {
    backgroundColor: COLORS.emerald + "33",
  },
  tabBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 9,
    color: COLORS.textDim,
  },
  tabBadgeTextActive: {
    color: COLORS.emerald,
  },
  tabContent: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  tabContentInner: {
    paddingBottom: 100,
  },
  actModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  actModalCard: {
    width: "100%",
    backgroundColor: COLORS.navySurface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    gap: 14,
  },
  actModalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: COLORS.text,
    textTransform: "capitalize",
  },
  actModalInput: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.navy,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  actModalActions: {
    flexDirection: "row",
    gap: 10,
  },
  actModalCancel: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
  },
  actModalCancelText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.textDim,
  },
  actModalSave: {
    flex: 2,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: COLORS.emerald,
    alignItems: "center",
  },
  actModalSaveText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.navy,
  },
});

const tabStyles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  spacer: {
    height: 20,
  },
  loader: {
    paddingVertical: 28,
    alignItems: "center",
  },
  fallback: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.navySurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 16,
  },
  fallbackText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textDim,
    flex: 1,
    lineHeight: 18,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
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
    minWidth: 84,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: COLORS.emerald,
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textDim,
    textAlign: "center",
  },
  hierarchyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 12,
  },
  hierarchyDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.navyBorder + "66",
  },
  hierarchyLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 4,
  },
  hierarchyLink: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.blue,
  },
  hierarchyLinkSub: {
    fontFamily: "Inter_400Regular",
    color: COLORS.textMuted,
    fontSize: 13,
  },
  hierarchyNone: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textDim,
    fontStyle: "italic",
  },
  hierarchyAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 12,
  },
  hierarchyActionText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.emerald,
  },
  childLocation: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 1,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder + "88",
  },
  infoIcon: {
    width: 28,
    alignItems: "center",
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 2,
  },
  infoValue: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.text,
  },
  infoValueLink: {
    color: COLORS.blue,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  scansHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  scanBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: COLORS.navyCard,
    borderWidth: 1,
    borderColor: COLORS.blue + "44",
  },
  scanBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.blue,
  },
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
  scanTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 2,
  },
  scanMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
  },
  noScansText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textDim,
    fontStyle: "italic",
    marginVertical: 8,
  },
  noteBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 19,
  },
  noteDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 6,
  },
});
