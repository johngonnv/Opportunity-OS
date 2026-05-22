import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert,
  Linking, Platform, ActivityIndicator, Share, Modal, TextInput,
  KeyboardAvoidingView, SafeAreaView, PanResponder, Animated,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import {
  ACCOUNT_STRUCTURE_LABELS, ACCOUNT_STRUCTURE_COLORS,
  VERTICAL_LABELS, VERTICAL_COLORS,
  ORG_TYPE_COLORS, ORG_TYPE_LABELS,
  getVerticalChildLabel,
  formatCurrency,
} from "@/constants/orgLabels";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  useOrganization, useDeleteOrganization, useUpdateOrganization,
  useOrganizationScans, useStructureScans, useCreateStructureScan,
  useOrganizationIntelligence, useCreateActivity,
  useActivities, useTasks, useCompleteTask,
  type AccountState, type EnrichedContact, type EnrichedOpportunity,
} from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { ParentPickerModal } from "@/components/organizations/ParentPickerModal";
import { PrimaryActionCard } from "@/components/organizations/PrimaryActionCard";
import { CMSEvidenceCard } from "@/components/organizations/CMSEvidenceCard";
import { PainPointsCard } from "@/components/organizations/PainPointsCard";
import { CompetitorLandscapeCard } from "@/components/organizations/CompetitorLandscapeCard";
import { EntryStrategyCard } from "@/components/organizations/EntryStrategyCard";

const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#818cf8";

const orgTabMemory = new Map<string, TabId>();

type TabId = "overview" | "contacts" | "hierarchy" | "activity";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "contacts", label: "Contacts" },
  { id: "hierarchy", label: "Hierarchy" },
  { id: "activity", label: "Activity" },
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

const STRUCT_TIER_COLORS: Record<string, string> = {
  enterprise: INDIGO,
  parent: COLORS.emerald,
  regional: COLORS.blue,
  local: COLORS.textDim,
  local_entity: COLORS.textDim,
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateShort(d: string) {
  const dt = new Date(d);
  const diffDays = Math.floor((Date.now() - dt.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function strengthLabel(computedStrength: number): { label: string; color: string } {
  if (computedStrength >= 70) return { label: "HOT", color: COLORS.emerald };
  if (computedStrength >= 35) return { label: "WARM", color: COLORS.amber };
  return { label: "COLD", color: COLORS.textDim };
}

function initials(name: string): string {
  const parts = name.trim().split(" ");
  return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
}

function departmentFromContact(c: EnrichedContact): string | null {
  if (!c.roleNotes) return null;
  const lower = c.roleNotes.toLowerCase();
  if (lower.includes("executive") || lower.includes("chief") || lower.includes("ceo") || lower.includes("cmo") || lower.includes("coo")) return "Executive";
  if (lower.includes("clinical") || lower.includes("medical") || lower.includes("physician")) return "Clinical";
  if (lower.includes("it") || lower.includes("tech") || lower.includes("ehr") || lower.includes("info")) return "IT/Tech";
  if (lower.includes("supply") || lower.includes("procurement") || lower.includes("purchas")) return "Procurement";
  if (lower.includes("nurs")) return "Nursing";
  return null;
}

function deptFromTitle(title: string | null): string | null {
  if (!title) return null;
  const t = title.toLowerCase();
  if (t.includes("chief") || t.includes("president") || t.includes("executive director")) return "Executive";
  if (t.includes("clinical") || t.includes("medical director") || t.includes("physician")) return "Clinical";
  if (t.includes("it ") || t.includes("technology") || t.includes("information") || t.includes("ehr") || t.includes("epic")) return "IT/Tech";
  if (t.includes("supply") || t.includes("procurement") || t.includes("purchasing")) return "Procurement";
  if (t.includes("nurs")) return "Nursing";
  if (t.includes("operat")) return "Operations";
  if (t.includes("financ") || t.includes("cfo")) return "Finance";
  return null;
}

const DEPT_COLORS: Record<string, string> = {
  Executive: INDIGO,
  Clinical: COLORS.amber,
  "IT/Tech": COLORS.blue,
  Procurement: COLORS.emerald,
  Nursing: COLORS.purple,
  Operations: COLORS.cyan,
  Finance: COLORS.textMuted,
};

const ACTIVITY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  CALL: "phone",
  EMAIL: "mail",
  MEETING: "calendar",
  CARD_SCAN: "credit-card",
  NOTE: "file-text",
  FOLLOW_UP: "repeat",
  EVENT: "star",
  INTRO: "user-plus",
};

const ACTIVITY_COLORS: Record<string, string> = {
  CALL: COLORS.emerald,
  EMAIL: COLORS.blue,
  MEETING: INDIGO,
  CARD_SCAN: INDIGO_LIGHT,
  NOTE: COLORS.amber,
  FOLLOW_UP: COLORS.amber,
  EVENT: COLORS.purple,
  INTRO: COLORS.emerald,
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: COLORS.red,
  MEDIUM: COLORS.amber,
  LOW: COLORS.textDim,
};

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { role } = useAuth();
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const { width: screenWidth } = useWindowDimensions();

  const { data: org, isLoading, refetch } = useOrganization(id);
  const { data: intelligence, isLoading: intelligenceLoading } = useOrganizationIntelligence(id);
  const deleteOrg = useDeleteOrganization();
  const updateOrg = useUpdateOrganization(id);
  const { data: scansData } = useOrganizationScans(id);
  const { data: structureScansData } = useStructureScans(id);
  const structureScans = structureScansData?.structureScans || [];
  const createStructureScan = useCreateStructureScan();
  const logActivity = useCreateActivity();

  const initialTabIdx = TABS.findIndex(t => t.id === (orgTabMemory.get(id) ?? "overview"));
  const [activeTab, setActiveTab] = useState<TabId>(() => orgTabMemory.get(id) ?? "overview");
  const activeTabRef = useRef<TabId>(orgTabMemory.get(id) ?? "overview");
  const slideAnim = useRef(new Animated.Value(initialTabIdx >= 0 ? initialTabIdx : 0)).current;
  const tabIndicatorWidth = screenWidth / TABS.length;

  const setActiveTabAndRemember = useCallback((tab: TabId) => {
    const idx = TABS.findIndex(t => t.id === tab);
    orgTabMemory.set(id, tab);
    activeTabRef.current = tab;
    setActiveTab(tab);
    Animated.spring(slideAnim, {
      toValue: idx,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [id, slideAnim]);

  const handleSwipe = useRef<(dx: number) => void>(() => {});
  handleSwipe.current = (dx: number) => {
    const currentIdx = TABS.findIndex(t => t.id === activeTabRef.current);
    if (dx < -50 && currentIdx < TABS.length - 1) {
      setActiveTabAndRemember(TABS[currentIdx + 1].id);
    } else if (dx > 50 && currentIdx > 0) {
      setActiveTabAndRemember(TABS[currentIdx - 1].id);
    }
  };

  const swipePanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dx, dy }) =>
        Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8,
      onPanResponderRelease: (_, { dx }) => handleSwipe.current(dx),
    })
  ).current;
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [structureScanCreating, setStructureScanCreating] = useState(false);
  const [activityModal, setActivityModal] = useState<{ type: string; label: string } | null>(null);
  const [activityNote, setActivityNote] = useState("");
  const [deepIntelOpen, setDeepIntelOpen] = useState(false);

  if (isLoading) return <LoadingSpinner label="Loading organization..." />;
  if (!org) return null;

  const typeColor = ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim;
  const typeLabel = ORG_TYPE_LABELS[org.organizationType] || org.organizationType;
  const structColor = org.accountStructureType ? (ACCOUNT_STRUCTURE_COLORS[org.accountStructureType] || COLORS.textDim) : null;
  const structLabel = org.accountStructureType ? (ACCOUNT_STRUCTURE_LABELS[org.accountStructureType] || org.accountStructureType) : null;
  const vertLabel = org.vertical ? (VERTICAL_LABELS[org.vertical] || org.vertical) : null;
  const vertColor = org.vertical ? (VERTICAL_COLORS[org.vertical] || COLORS.textDim) : null;
  const childLabel = getVerticalChildLabel(org.vertical);

  const accountState = intelligence?.accountState ?? "COLD";
  const stateColor = ACCOUNT_STATE_COLORS[accountState];
  const stateLabel = ACCOUNT_STATE_LABELS[accountState];

  const rollup = org.rollup || {};
  const contacts = intelligence?.contacts || org.contacts?.map((c: any) => ({
    ...c,
    activityCount: c.activities?.length || 0,
    lastEngagementAt: null,
    isOnOpenOpp: false,
    hasOverdueTask: false,
    computedStrength: 0,
    computedStrengthLabel: "COLD",
  })) || [];

  const openOpps: EnrichedOpportunity[] = intelligence?.openOpportunities || [];
  const coverageGaps = intelligence?.coverageGaps || [];
  const pipelineValue = openOpps.reduce((acc: number, o: EnrichedOpportunity) => acc + (o.valueEstimate || 0), 0);
  const childCount = org.children?.length ?? rollup.childCount ?? 0;

  const enrichedAt: string | null = (org as any).enrichedAt ?? null;

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
    if (!intelligence?.primaryAction) { logOrgActivity("CALL"); return; }
    const type = intelligence.primaryAction.type;
    if (type === "CAPTURE_CONTACT") {
      router.push(`/capture/new?organizationId=${id}` as Href);
    } else if (type === "ADVANCE_STAGE" || type === "CLOSE_DEAL") {
      const firstOpp = openOpps[0];
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

      <SafeAreaView style={s.safe}>
        {/* ── Identity Card ── */}
        <View style={[s.identityCard, { borderLeftColor: typeColor }]}>
          <View style={s.identityTop}>
            <View style={[s.orgIconWrap, { backgroundColor: typeColor + "20", borderColor: typeColor + "40" }]}>
              <Text style={s.orgIconEmoji}>{org.vertical === "healthcare" ? "🏥" : "🏢"}</Text>
            </View>
            <View style={s.identityMid}>
              <View style={s.nameRow}>
                <Text style={s.orgName} numberOfLines={1}>{org.name}</Text>
                {enrichedAt && (
                  <View style={s.eyeBadge}>
                    <Feather name="eye" size={8} color={INDIGO_LIGHT} />
                    <Text style={s.eyeBadgeText}>Eye · {new Date(enrichedAt).toLocaleDateString("en-US", { month: "short", d: "numeric", year: "numeric" } as any)}</Text>
                  </View>
                )}
              </View>
              {(org.npi || (org.city && org.state)) && (
                <Text style={s.orgMono}>
                  {org.npi ? `NPI ${org.npi}` : ""}
                  {org.npi && (org.city || org.state) ? " · " : ""}
                  {[org.city, org.state].filter(Boolean).join(", ")}
                </Text>
              )}
              <View style={s.badgeRow}>
                <Badge label={typeLabel} color={typeColor} />
                {structLabel && structColor && <Badge label={structLabel} color={structColor} />}
                {vertLabel && vertColor && <Badge label={vertLabel} color={vertColor} />}
                <View style={[s.stateBadge, { backgroundColor: stateColor + "22", borderColor: stateColor + "44" }]}>
                  <View style={[s.stateDot, { backgroundColor: stateColor }]} />
                  <Text style={[s.stateText, { color: stateColor }]}>{stateLabel}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* 4-column stat strip */}
          <View style={s.statStrip}>
            <View style={s.statCell}>
              <Text style={[s.statVal, { color: COLORS.textMuted }]}>{contacts.length}</Text>
              <Text style={s.statLbl}>Contacts</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCell}>
              <Text style={[s.statVal, { color: INDIGO }]}>{childCount}</Text>
              <Text style={s.statLbl}>Facilities</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCell}>
              <Text style={[s.statVal, { color: COLORS.blue }]}>{openOpps.length}</Text>
              <Text style={s.statLbl}>Deals</Text>
            </View>
            <View style={s.statDivider} />
            <View style={s.statCell}>
              <Text style={[s.statVal, { color: COLORS.amber }]}>{pipelineValue > 0 ? formatCurrency(pipelineValue) : "—"}</Text>
              <Text style={s.statLbl}>Pipeline</Text>
            </View>
          </View>
        </View>

        {/* ── Quick Actions ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.pillScroll} contentContainerStyle={s.pillContent}>
          <TouchableOpacity style={[s.pill, { borderColor: COLORS.emerald + "55" }]} onPress={() => router.push(`/organization/${id}/edit`)} activeOpacity={0.8}>
            <Feather name="edit-2" size={12} color={COLORS.emerald} />
            <Text style={[s.pillTxt, { color: COLORS.emerald }]}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.pill, { borderColor: INDIGO + "55" }]} onPress={() => router.push(`/org-scan/new?targetOrganizationId=${id}`)} activeOpacity={0.8}>
            <Feather name="eye" size={12} color={INDIGO_LIGHT} />
            <Text style={[s.pillTxt, { color: INDIGO_LIGHT }]}>Eye Scan</Text>
          </TouchableOpacity>
          {org.parentOrg ? (
            <TouchableOpacity style={[s.pill, { borderColor: COLORS.blue + "55" }]} onPress={() => router.push(`/organization/${org.parentOrg.id}`)} activeOpacity={0.8}>
              <Feather name="arrow-up-circle" size={12} color={COLORS.blue} />
              <Text style={[s.pillTxt, { color: COLORS.blue }]} numberOfLines={1}>{org.parentOrg.name.length > 14 ? "Parent" : org.parentOrg.name}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.pill, { borderColor: COLORS.blue + "55" }]} onPress={() => setParentPickerOpen(true)} activeOpacity={0.8}>
              <Feather name="link-2" size={12} color={COLORS.blue} />
              <Text style={[s.pillTxt, { color: COLORS.blue }]}>Hierarchy</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.pill, { borderColor: COLORS.textDim + "44" }]} onPress={() => Share.share({ message: `${org.name} — Opportunity OS`, title: org.name })} activeOpacity={0.8}>
            <Feather name="share-2" size={12} color={COLORS.textMuted} />
            <Text style={[s.pillTxt, { color: COLORS.textMuted }]}>Share</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ── Tab Bar ── */}
        <View style={s.tabBar}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <TouchableOpacity
                key={tab.id}
                style={s.tab}
                onPress={() => setActiveTabAndRemember(tab.id)}
                activeOpacity={0.8}
              >
                <Text style={[s.tabLabel, active && s.tabLabelActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
          <Animated.View
            style={[
              s.tabIndicator,
              {
                width: tabIndicatorWidth,
                transform: [{
                  translateX: slideAnim.interpolate({
                    inputRange: [0, TABS.length - 1],
                    outputRange: [0, tabIndicatorWidth * (TABS.length - 1)],
                  }),
                }],
              },
            ]}
          />
        </View>

        {/* ── Tab Content ── */}
        <View style={s.body} {...swipePanResponder.panHandlers}>
        <ScrollView
          style={s.bodyScroll}
          contentContainerStyle={s.bodyInner}
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
              openOpps={openOpps}
              deepIntelOpen={deepIntelOpen}
              onToggleDeepIntel={() => setDeepIntelOpen(v => !v)}
              router={router}
              primaryActionHandler={primaryActionHandler}
              onSeeAllActivity={() => setActiveTabAndRemember("activity")}
            />
          )}
          {activeTab === "contacts" && (
            <ContactsTab
              contacts={contacts}
              coverageGaps={coverageGaps}
              intelligenceLoading={intelligenceLoading}
              orgId={id}
              router={router}
            />
          )}
          {activeTab === "hierarchy" && (
            <HierarchyTab
              org={org}
              id={id}
              contacts={contacts}
              openOpps={openOpps}
              structureScans={structureScans}
              structureScanCreating={structureScanCreating}
              onStructureScan={handleStructureScan}
              onOpenParentPicker={() => setParentPickerOpen(true)}
              router={router}
            />
          )}
          {activeTab === "activity" && (
            <ActivityTab
              orgId={id}
              onLogCall={() => logOrgActivity("CALL")}
              onLogNote={() => logOrgActivity("NOTE")}
              onLogMeeting={() => logOrgActivity("MEETING")}
              onLogTask={() => logOrgActivity("FOLLOW_UP")}
            />
          )}
        </ScrollView>
        </View>
      </SafeAreaView>

      {/* ── FAB ── */}
      {fabOpen && (
        <TouchableOpacity style={s.fabBackdrop} onPress={() => setFabOpen(false)} activeOpacity={1} />
      )}
      <View style={s.fabWrap}>
        {fabOpen && (
          <>
            <View style={s.fabOption}>
              <View style={s.fabLabel}><Text style={s.fabLabelTxt}>Add Contact Manually</Text></View>
              <TouchableOpacity
                style={[s.fabOptionBtn, { backgroundColor: COLORS.emerald }]}
                onPress={() => { setFabOpen(false); router.push(`/capture/new?organizationId=${id}` as Href); }}
                activeOpacity={0.85}
              >
                <Feather name="user-plus" size={16} color="white" />
              </TouchableOpacity>
            </View>
            <View style={s.fabOption}>
              <View style={s.fabLabel}><Text style={s.fabLabelTxt}>Scan Card into this Org</Text></View>
              <TouchableOpacity
                style={[s.fabOptionBtn, { backgroundColor: INDIGO }]}
                onPress={() => { setFabOpen(false); router.push(`/capture/auto?organizationId=${id}` as Href); }}
                activeOpacity={0.85}
              >
                <Feather name="eye" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </>
        )}
        <TouchableOpacity
          style={[s.fab, { backgroundColor: fabOpen ? COLORS.red : INDIGO }]}
          onPress={() => setFabOpen(v => !v)}
          activeOpacity={0.85}
        >
          <Feather name={fabOpen ? "x" : "plus"} size={22} color="white" />
        </TouchableOpacity>
      </View>

      <ParentPickerModal
        visible={parentPickerOpen}
        currentOrgId={id}
        currentParentId={org.parentOrganizationId}
        onSelect={handleSetParent}
        onClose={() => setParentPickerOpen(false)}
      />

      <Modal visible={activityModal !== null} transparent animationType="fade" onRequestClose={() => setActivityModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.actModalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setActivityModal(null)} />
          <View style={s.actModalCard}>
            <Text style={s.actModalTitle}>Log {activityModal?.label}</Text>
            <TextInput
              style={s.actModalInput}
              value={activityNote}
              onChangeText={setActivityNote}
              placeholder="Add a note or subject…"
              placeholderTextColor={COLORS.textDim}
              multiline
              numberOfLines={3}
              autoFocus
            />
            <View style={s.actModalActions}>
              <TouchableOpacity style={s.actModalCancel} onPress={() => setActivityModal(null)}>
                <Text style={s.actModalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.actModalSave, !activityNote.trim() && { opacity: 0.5 }]}
                onPress={submitOrgActivity}
                disabled={!activityNote.trim() || logActivity.isPending}
              >
                <Text style={s.actModalSaveText}>{logActivity.isPending ? "Saving…" : "Log"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function OverviewTab({ org, id, intelligence, intelligenceLoading, isAdmin, openOpps, deepIntelOpen, onToggleDeepIntel, router, primaryActionHandler, onSeeAllActivity }: any) {
  const activitiesQuery = useActivities({ organizationId: id });
  const recentActivities: any[] = ((activitiesQuery.data as any)?.activities || []).slice(0, 2);

  return (
    <View>
      {/* Primary Action */}
      {intelligenceLoading ? (
        <View style={t.loader}><ActivityIndicator size="small" color={COLORS.emerald} /></View>
      ) : (
        <PrimaryActionCard
          action={intelligence?.primaryAction}
          loading={false}
          onPress={primaryActionHandler}
        />
      )}

      {/* Pipeline */}
      <View style={t.sectionHead}>
        <Text style={t.sectionTitle}>Pipeline ({openOpps.length})</Text>
        <TouchableOpacity onPress={() => router.push(`/opportunity/new?organizationId=${id}`)}>
          <Text style={t.sectionAction}>+ New Opp</Text>
        </TouchableOpacity>
      </View>
      {intelligenceLoading ? (
        <View style={t.loader}><ActivityIndicator size="small" color={COLORS.blue} /></View>
      ) : openOpps.length === 0 ? (
        <View style={t.emptyCard}>
          <Feather name="briefcase" size={18} color={COLORS.textDim} />
          <Text style={t.emptyText}>No open opportunities</Text>
        </View>
      ) : (
        openOpps.slice(0, 3).map((opp: EnrichedOpportunity) => (
          <TouchableOpacity key={opp.id} style={t.oppRow} onPress={() => router.push(`/opportunity/${opp.id}`)} activeOpacity={0.8}>
            <View style={[t.oppAccent, { backgroundColor: COLORS.blue }]} />
            <View style={t.oppBody}>
              <Text style={t.oppTitle} numberOfLines={1}>{opp.title}</Text>
              <View style={t.oppMeta}>
                <Text style={t.oppStage}>{opp.stageName}</Text>
                <View style={t.oppBarWrap}>
                  <View style={[t.oppBar, { width: `${Math.min(100, opp.probability)}%` as any, backgroundColor: COLORS.blue }]} />
                </View>
                <Text style={t.oppPct}>{opp.probability}%</Text>
              </View>
            </View>
            {opp.valueEstimate != null && (
              <Text style={t.oppValue}>{formatCurrency(opp.valueEstimate)}</Text>
            )}
          </TouchableOpacity>
        ))
      )}

      {/* Recent Activity */}
      <View style={t.sectionHead}>
        <Text style={t.sectionTitle}>Recent Activity</Text>
        <TouchableOpacity onPress={onSeeAllActivity}>
          <Text style={[t.sectionAction, { color: INDIGO_LIGHT }]}>See all</Text>
        </TouchableOpacity>
      </View>
      {recentActivities.length === 0 ? (
        <View style={t.emptyCard}>
          <Feather name="activity" size={18} color={COLORS.textDim} />
          <Text style={t.emptyText}>No activity logged</Text>
        </View>
      ) : (
        <View style={t.activityGroup}>
          {recentActivities.map((a: any, i: number) => (
            <View key={a.id} style={[t.activityRow, i > 0 && t.activityRowBorder]}>
              <Text style={t.activityIcon}>{
                a.type === "CALL" ? "📞" : a.type === "EMAIL" ? "📧" :
                a.type === "MEETING" ? "🤝" : a.type === "NOTE" ? "📋" : "📌"
              }</Text>
              <View style={{ flex: 1 }}>
                <Text style={t.activityText} numberOfLines={1}>{a.subject || a.type}</Text>
                <Text style={t.activitySub}>{formatDateShort(a.occurredAt)}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Account Intelligence */}
      <View style={t.sectionHead}>
        <Text style={t.sectionTitle}>Account Intelligence</Text>
      </View>
      {intelligenceLoading ? (
        <View style={t.loader}><ActivityIndicator size="small" color={COLORS.emerald} /></View>
      ) : intelligence ? (
        <View style={t.intelCard}>
          <View style={t.intelBars}>
            <View style={{ flex: 1 }}>
              <View style={t.barRow}>
                <Text style={t.barLabel}>Health</Text>
                <Text style={[t.barPct, { color: COLORS.emerald }]}>{intelligence.health}%</Text>
              </View>
              <View style={t.barTrack}>
                <View style={[t.barFill, { width: `${intelligence.health}%` as any, backgroundColor: COLORS.emerald }]} />
              </View>
            </View>
            <View style={{ flex: 1 }}>
              <View style={t.barRow}>
                <Text style={t.barLabel}>Risk</Text>
                <Text style={[t.barPct, { color: COLORS.blue }]}>{intelligence.risk < 30 ? "Low" : intelligence.risk < 60 ? "Med" : "High"}</Text>
              </View>
              <View style={t.barTrack}>
                <View style={[t.barFill, { width: `${intelligence.risk}%` as any, backgroundColor: COLORS.blue }]} />
              </View>
            </View>
            {intelligence.coverageGaps.length > 0 && (
              <View style={t.gapsBadge}>
                <Text style={t.gapsNum}>{intelligence.coverageGaps.length}</Text>
                <Text style={t.gapsLbl}>Gaps</Text>
              </View>
            )}
          </View>
          <View style={t.intelFooter}>
            <Feather name="calendar" size={10} color={COLORS.textDim} />
            <Text style={t.intelFooterTxt}>
              {org.createdAt ? `Added ${formatDate(org.createdAt)}` : ""}
            </Text>
            {(org as any).enrichedAt && (
              <View style={t.viaEyeRow}>
                <Feather name="eye" size={9} color={INDIGO_LIGHT} />
                <Text style={t.viaEyeTxt}>via Opportunity Eye</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <View style={t.emptyCard}>
          <Feather name="activity" size={16} color={COLORS.textDim} />
          <Text style={t.emptyText}>Log activities to generate insights</Text>
        </View>
      )}

      {/* Deep Intel accordion (healthcare) */}
      {org.vertical === "healthcare" && (
        <TouchableOpacity style={t.accordionHeader} onPress={onToggleDeepIntel} activeOpacity={0.8}>
          <Text style={t.accordionTitle}>Healthcare Deep Intel</Text>
          <Feather name={deepIntelOpen ? "chevron-up" : "chevron-down"} size={15} color={COLORS.textDim} />
        </TouchableOpacity>
      )}
      {org.vertical === "healthcare" && deepIntelOpen && (
        <View>
          <CMSEvidenceCard orgId={id} />
          <PainPointsCard orgId={id} isAdmin={isAdmin} />
          <CompetitorLandscapeCard orgId={id} isAdmin={isAdmin} />
          <EntryStrategyCard orgId={id} isAdmin={isAdmin} />
        </View>
      )}
    </View>
  );
}

function ContactsTab({ contacts, coverageGaps, intelligenceLoading, orgId, router }: any) {
  const [activeFilter, setActiveFilter] = useState("All");
  const depts = Array.from(new Set(contacts.map((c: EnrichedContact) => deptFromTitle(c.title)).filter(Boolean))) as string[];
  const filters = ["All", ...depts];

  const filtered = activeFilter === "All" ? contacts : contacts.filter((c: EnrichedContact) => deptFromTitle(c.title) === activeFilter);

  return (
    <View>
      {/* Scan prompt */}
      <View style={t.scanPrompt}>
        <Feather name="eye" size={14} color={INDIGO_LIGHT} />
        <Text style={t.scanPromptTxt} numberOfLines={1}>Scan a business card into this org</Text>
        <TouchableOpacity style={t.scanPromptBtn} onPress={() => router.push(`/capture/auto?organizationId=${orgId}` as Href)} activeOpacity={0.8}>
          <Text style={t.scanPromptBtnTxt}>Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Dept filter pills */}
      {filters.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 6, paddingRight: 4 }}>
          {filters.map(f => {
            const active = f === activeFilter;
            return (
              <TouchableOpacity
                key={f}
                style={[t.deptPill, active && t.deptPillActive]}
                onPress={() => setActiveFilter(f)}
                activeOpacity={0.8}
              >
                <Text style={[t.deptPillTxt, active && t.deptPillTxtActive]}>{f}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Loading */}
      {intelligenceLoading && contacts.length === 0 && (
        <View style={t.loader}><ActivityIndicator size="small" color={COLORS.purple} /></View>
      )}

      {/* Contact cards */}
      {filtered.map((c: EnrichedContact) => {
        const dept = deptFromTitle(c.title);
        const deptColor = dept ? (DEPT_COLORS[dept] || COLORS.textMuted) : COLORS.textMuted;
        const str = strengthLabel(c.computedStrength);
        return (
          <TouchableOpacity
            key={c.id}
            style={t.contactCard}
            onPress={() => router.push(`/contact/${c.id}`)}
            activeOpacity={0.8}
          >
            <View style={[t.contactAvatar, { backgroundColor: str.color + "28" }]}>
              <Text style={[t.contactAvatarTxt, { color: str.color }]}>{initials(c.fullName)}</Text>
            </View>
            <View style={t.contactBody}>
              <View style={t.contactNameRow}>
                <Text style={t.contactName}>{c.fullName}</Text>
              </View>
              <Text style={t.contactTitle} numberOfLines={1}>{c.title || "—"}</Text>
              {dept && (
                <View style={[t.deptTag, { backgroundColor: deptColor + "22" }]}>
                  <Text style={[t.deptTagTxt, { color: deptColor }]}>{dept}</Text>
                </View>
              )}
            </View>
            <View style={t.contactRight}>
              <View style={[t.strengthBadge, { backgroundColor: str.color + "22" }]}>
                <Text style={[t.strengthBadgeTxt, { color: str.color }]}>{str.label}</Text>
              </View>
              <Feather name="chevron-right" size={13} color={COLORS.textDim} />
            </View>
          </TouchableOpacity>
        );
      })}

      {!intelligenceLoading && filtered.length === 0 && (
        <View style={t.emptyCard}>
          <Feather name="users" size={18} color={COLORS.textDim} />
          <Text style={t.emptyText}>{activeFilter === "All" ? "No contacts linked yet" : `No ${activeFilter} contacts`}</Text>
        </View>
      )}

      {/* Coverage gap callout */}
      {coverageGaps.length > 0 && (
        <View style={t.gapCallout}>
          <Text style={t.gapCalloutIcon}>⚠️</Text>
          <View style={{ flex: 1 }}>
            <Text style={t.gapCalloutTitle}>Coverage Gap</Text>
            <Text style={t.gapCalloutTxt} numberOfLines={2}>{coverageGaps[0].message}</Text>
          </View>
          <TouchableOpacity
            style={t.gapCalloutBtn}
            onPress={() => router.push(`/capture/new?organizationId=${orgId}` as Href)}
            activeOpacity={0.8}
          >
            <Text style={t.gapCalloutBtnTxt}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function ChildNode({ c, depth, router }: { c: any; depth: number; router: any }) {
  const [open, setOpen] = useState(depth === 0);
  const hasKids = c.children && c.children.length > 0;
  const sc = STRUCT_TIER_COLORS[c.accountStructureType || c.structure] || COLORS.textDim;
  const structLbl = ACCOUNT_STRUCTURE_LABELS[c.accountStructureType || c.structure] || (c.accountStructureType || c.structure) || "facility";
  return (
    <View>
      <TouchableOpacity
        style={t.childNode}
        onPress={() => hasKids ? setOpen(o => !o) : router.push(`/organization/${c.id}`)}
        activeOpacity={0.8}
      >
        <View style={t.childNodeMain}>
          {hasKids && (
            <Feather
              name={open ? "chevron-down" : "chevron-right"}
              size={11}
              color={sc}
              style={{ marginRight: 4 }}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={t.childNodeName} numberOfLines={1}>{c.name}</Text>
            {c.npi && <Text style={t.childNodeNpi}>NPI {c.npi}</Text>}
          </View>
        </View>
        <View style={t.childNodeRight}>
          <View style={[t.structTag, { backgroundColor: sc + "22" }]}>
            <Text style={[t.structTagTxt, { color: sc }]}>{structLbl}</Text>
          </View>
          <View style={t.childStats}>
            {(c.contacts?.length ?? 0) > 0 && <Text style={t.childStat}>👥 {c.contacts?.length ?? 0}</Text>}
            {(c.openOpportunities?.length ?? 0) > 0 && <Text style={[t.childStat, { color: COLORS.blue }]}>📈 {c.openOpportunities?.length}</Text>}
          </View>
        </View>
      </TouchableOpacity>
      {hasKids && open && (
        <View style={t.childTree}>
          {c.children.map((kid: any) => <ChildNode key={kid.id} c={kid} depth={depth + 1} router={router} />)}
        </View>
      )}
    </View>
  );
}

function HierarchyTab({ org, id, contacts, openOpps, structureScans, structureScanCreating, onStructureScan, onOpenParentPicker, router }: any) {
  const sc = STRUCT_TIER_COLORS[org.accountStructureType] || INDIGO;

  return (
    <View>
      {/* Root node */}
      <View style={t.rootNode}>
        <View style={t.rootNodeTop}>
          <Text style={t.rootNodeEmoji}>{org.vertical === "healthcare" ? "🏥" : "🏢"}</Text>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Text style={t.rootNodeName}>{org.name}</Text>
              <View style={t.rootRootBadge}>
                <Text style={t.rootRootBadgeTxt}>Root · {ACCOUNT_STRUCTURE_LABELS[org.accountStructureType] || "Enterprise"}</Text>
              </View>
            </View>
            {org.npi && <Text style={t.rootNpi}>NPI {org.npi}</Text>}
          </View>
        </View>
        <View style={t.rootStats}>
          {[
            { v: contacts.length, l: "Contacts", c: COLORS.textMuted },
            { v: org.children?.length ?? 0, l: "Facilities", c: INDIGO },
            { v: openOpps.length, l: "Active Deals", c: COLORS.blue },
          ].map((m: any) => (
            <View key={m.l} style={t.rootStatCell}>
              <Text style={[t.rootStatVal, { color: m.c }]}>{m.v}</Text>
              <Text style={t.rootStatLbl}>{m.l}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Legend */}
      {org.children?.length > 0 && (
        <View style={t.legendRow}>
          {Object.entries(STRUCT_TIER_COLORS).slice(0, 3).map(([k, c]: [string, any]) => (
            <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
              <Text style={t.legendTxt}>{k}</Text>
            </View>
          ))}
          <Text style={t.legendHint}>Tap to expand</Text>
        </View>
      )}

      {/* Children tree */}
      {org.children?.length > 0 && (
        <View style={t.childTree}>
          {org.children.map((c: any) => <ChildNode key={c.id} c={c} depth={0} router={router} />)}
        </View>
      )}

      {/* Parent link (if has parent) */}
      {org.parentOrg && (
        <View style={t.parentSection}>
          <Text style={t.subLabel}>Parent Organization</Text>
          <TouchableOpacity style={t.parentRow} onPress={() => router.push(`/organization/${org.parentOrg.id}`)} activeOpacity={0.8}>
            <Feather name="arrow-up-circle" size={16} color={COLORS.blue} />
            <Text style={t.parentName}>{org.parentOrg.name}</Text>
            <Feather name="chevron-right" size={14} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>
      )}

      {/* Add Facility CTA */}
      <TouchableOpacity style={t.addFacilityCta} onPress={onOpenParentPicker} activeOpacity={0.8}>
        <Feather name="plus" size={14} color={COLORS.textDim} />
        <Text style={t.addFacilityTxt}>Add Facility / Sub-Organization</Text>
      </TouchableOpacity>

      {/* Scan prompt */}
      <View style={t.scanPrompt}>
        <Feather name="eye" size={13} color={INDIGO_LIGHT} />
        <Text style={t.scanPromptTxt}>Scan a facility logo to auto-link it here</Text>
        <TouchableOpacity
          style={t.scanPromptBtn}
          onPress={() => router.push(`/org-scan/new?targetOrganizationId=${id}`)}
          activeOpacity={0.8}
        >
          <Text style={t.scanPromptBtnTxt}>Scan</Text>
        </TouchableOpacity>
      </View>

      {/* Structure scan button */}
      <TouchableOpacity
        style={t.structScanBtn}
        onPress={onStructureScan}
        disabled={structureScanCreating}
        activeOpacity={0.8}
      >
        {structureScanCreating
          ? <ActivityIndicator size="small" color={COLORS.blue} />
          : <Feather name="git-branch" size={13} color={COLORS.blue} />}
        <Text style={t.structScanTxt}>Run Structure Scan</Text>
      </TouchableOpacity>

      {/* Structure scan history */}
      {structureScans.slice(0, 2).map((scan: any) => {
        const statusColor = scan.reviewStatus === "APPROVED" ? COLORS.emerald : scan.reviewStatus === "REJECTED" ? COLORS.red : scan.scanStatus === "FAILED" ? COLORS.red : COLORS.amber;
        const statusLabel = scan.reviewStatus === "APPROVED" ? "Approved" : scan.reviewStatus === "REJECTED" ? "Rejected" : scan.scanStatus === "COMPLETED" ? "Review Ready" : scan.scanStatus === "FAILED" ? "Failed" : "Running";
        return (
          <TouchableOpacity key={scan.id} style={t.scanHistoryRow} onPress={() => router.push(`/org-scan/structure/${scan.id}`)} activeOpacity={0.75}>
            <Feather name="git-branch" size={13} color={COLORS.textDim} />
            <View style={{ flex: 1 }}>
              <Text style={t.scanHistoryTitle}>{scan.suggestedParentName || "Structure Analysis"}</Text>
              <Text style={t.scanHistoryMeta}>{formatDate(scan.createdAt)}</Text>
            </View>
            <View style={[t.scanBadge, { backgroundColor: statusColor + "22" }]}>
              <Text style={[t.scanBadgeTxt, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ActivityTab({ orgId, onLogCall, onLogNote, onLogMeeting, onLogTask }: any) {
  const [section, setSection] = useState<"activities" | "tasks">("activities");
  const activitiesQuery = useActivities({ organizationId: orgId });
  const tasksQuery = useTasks({ organizationId: orgId });

  const activities: any[] = (activitiesQuery.data as any)?.activities || [];
  const allTasks: any[] = (tasksQuery.data as any)?.tasks || [];
  const openTasks = allTasks.filter(t => t.status === "OPEN" || t.status === "IN_PROGRESS");

  return (
    <View>
      {/* Quick-log row */}
      <View style={t.quickLogRow}>
        {[
          { l: "+ Call", c: COLORS.emerald, fn: onLogCall },
          { l: "+ Note", c: COLORS.textMuted, fn: onLogNote },
          { l: "+ Meeting", c: INDIGO_LIGHT, fn: onLogMeeting },
          { l: "+ Task", c: COLORS.amber, fn: onLogTask },
        ].map(a => (
          <TouchableOpacity
            key={a.l}
            style={[t.quickLogBtn, { borderColor: a.c + "44", backgroundColor: a.c + "12" }]}
            onPress={a.fn}
            activeOpacity={0.8}
          >
            <Text style={[t.quickLogTxt, { color: a.c }]}>{a.l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Activities/Tasks toggle */}
      <View style={t.sectionToggle}>
        <TouchableOpacity
          style={[t.toggleBtn, section === "activities" && t.toggleBtnActive]}
          onPress={() => setSection("activities")}
          activeOpacity={0.8}
        >
          <Text style={[t.toggleBtnTxt, section === "activities" && t.toggleBtnTxtActive]}>
            Activities ({activities.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[t.toggleBtn, section === "tasks" && t.toggleBtnActive]}
          onPress={() => setSection("tasks")}
          activeOpacity={0.8}
        >
          <Text style={[t.toggleBtnTxt, section === "tasks" && t.toggleBtnTxtActive]}>
            Tasks ({openTasks.length})
          </Text>
        </TouchableOpacity>
      </View>

      {section === "activities" && (
        <View style={{ gap: 8 }}>
          {activitiesQuery.isLoading && <View style={t.loader}><ActivityIndicator size="small" color={COLORS.emerald} /></View>}
          {!activitiesQuery.isLoading && activities.length === 0 && (
            <View style={t.emptyCard}>
              <Feather name="activity" size={18} color={COLORS.textDim} />
              <Text style={t.emptyText}>No activity logged</Text>
            </View>
          )}
          {activities.slice(0, 20).map((a: any) => {
            const icon = ACTIVITY_ICONS[a.type] || "activity";
            const color = ACTIVITY_COLORS[a.type] || COLORS.textMuted;
            return (
              <View key={a.id} style={t.actEntry}>
                <View style={[t.actEntryIcon, { backgroundColor: color + "20", borderColor: color + "44" }]}>
                  <Feather name={icon} size={14} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <Text style={t.actEntryText} numberOfLines={2}>{a.subject || a.type}</Text>
                    <View style={[t.actTypeBadge, { backgroundColor: color + "22" }]}>
                      <Text style={[t.actTypeTxt, { color }]}>{a.type}</Text>
                    </View>
                  </View>
                  {a.contact && <Text style={t.actContactTxt}>with {a.contact.fullName}</Text>}
                  <Text style={t.actDateTxt}>{formatDateShort(a.occurredAt)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {section === "tasks" && (
        <View style={{ gap: 8 }}>
          {tasksQuery.isLoading && <View style={t.loader}><ActivityIndicator size="small" color={COLORS.amber} /></View>}
          {!tasksQuery.isLoading && allTasks.length === 0 && (
            <View style={t.emptyCard}>
              <Feather name="check-square" size={18} color={COLORS.textDim} />
              <Text style={t.emptyText}>No tasks</Text>
            </View>
          )}
          {allTasks.map((task: any) => (
            <TaskItem key={task.id} task={task} />
          ))}
          <TouchableOpacity style={t.addTaskCta} onPress={onLogTask} activeOpacity={0.8}>
            <Feather name="plus" size={13} color={COLORS.textDim} />
            <Text style={t.addTaskCtaTxt}>Add Task</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function TaskItem({ task }: { task: any }) {
  const complete = useCompleteTask(task.id);
  const done = task.status === "COMPLETED";
  const pc = PRIORITY_COLORS[task.priority] || COLORS.textDim;

  function formatDue(d: string) {
    const dt = new Date(d);
    const diffDays = Math.floor((dt.getTime() - Date.now()) / 86400000);
    if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;
    if (diffDays === 0) return "Due today";
    if (diffDays === 1) return "Due tomorrow";
    return `In ${diffDays}d`;
  }

  return (
    <View style={[t.taskRow, done && t.taskDone]}>
      <TouchableOpacity
        style={[t.taskCheck, { borderColor: done ? COLORS.emerald : pc, backgroundColor: done ? COLORS.emerald : "transparent" }]}
        onPress={() => !done && complete.mutate()}
        disabled={done || complete.isPending}
        hitSlop={8}
      >
        {done && <Feather name="check" size={10} color="white" />}
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[t.taskText, done && t.taskTextDone]} numberOfLines={2}>{task.title}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 }}>
          <View style={[t.priorityBadge, { backgroundColor: pc + "22" }]}>
            <Text style={[t.priorityTxt, { color: pc }]}>{task.priority || "LOW"}</Text>
          </View>
          {task.dueDate && !done && <Text style={t.taskDueTxt}>{formatDue(task.dueDate)}</Text>}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.navy },
  identityCard: {
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
    backgroundColor: COLORS.navyCard,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: COLORS.navyBorder,
    borderRadius: 16,
    padding: 14,
  },
  identityTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  orgIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, borderWidth: 1,
  },
  orgIconEmoji: { fontSize: 22 },
  identityMid: { flex: 1, gap: 3 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  orgName: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, lineHeight: 20, flex: 1 },
  eyeBadge: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10,
    backgroundColor: INDIGO + "22", borderWidth: 1, borderColor: INDIGO + "33",
    flexShrink: 0,
  },
  eyeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: INDIGO_LIGHT },
  orgMono: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, letterSpacing: 0.3 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  stateBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, borderWidth: 1,
  },
  stateDot: { width: 5, height: 5, borderRadius: 3 },
  stateText: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  statStrip: {
    flexDirection: "row", alignItems: "center",
    marginTop: 12, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
  },
  statCell: { flex: 1, alignItems: "center" },
  statVal: { fontFamily: "Inter_700Bold", fontSize: 15 },
  statLbl: { fontFamily: "Inter_400Regular", fontSize: 9, color: COLORS.textDim, marginTop: 1 },
  statDivider: { width: 1, height: 28, backgroundColor: COLORS.navyBorder },
  pillScroll: { flexShrink: 0, paddingVertical: 4 },
  pillContent: { paddingHorizontal: 12, gap: 6 },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 6, paddingHorizontal: 11,
    borderRadius: 9, backgroundColor: COLORS.navyCard, borderWidth: 1,
  },
  pillTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.navyCard,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    marginTop: 4,
  },
  tab: {
    flex: 1, paddingVertical: 11,
    alignItems: "center", justifyContent: "center",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    height: 2,
    backgroundColor: INDIGO,
    borderRadius: 1,
  },
  tabLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textDim },
  tabLabelActive: { fontFamily: "Inter_600SemiBold", color: INDIGO_LIGHT },
  body: { flex: 1, backgroundColor: COLORS.navy },
  bodyScroll: { flex: 1 },
  bodyInner: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 100 },
  fabBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 10 },
  fabWrap: {
    position: "absolute", bottom: 24, right: 16,
    alignItems: "flex-end", gap: 8, zIndex: 11,
  },
  fabOption: { flexDirection: "row", alignItems: "center", gap: 8 },
  fabLabel: {
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  fabLabelTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.text, whiteSpace: "nowrap" as any },
  fabOptionBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
  },
  fab: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: "center", justifyContent: "center",
    shadowColor: INDIGO, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  actModalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center", alignItems: "center", padding: 24,
  },
  actModalCard: {
    width: "100%", backgroundColor: COLORS.navySurface,
    borderRadius: 16, padding: 20, borderWidth: 1,
    borderColor: COLORS.navyBorder, gap: 14,
  },
  actModalTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, textTransform: "capitalize" },
  actModalInput: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text,
    backgroundColor: COLORS.navy, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, minHeight: 80, textAlignVertical: "top",
  },
  actModalActions: { flexDirection: "row", gap: 10 },
  actModalCancel: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder, alignItems: "center",
  },
  actModalCancelText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textDim },
  actModalSave: { flex: 2, paddingVertical: 11, borderRadius: 10, backgroundColor: COLORS.emerald, alignItems: "center" },
  actModalSaveText: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.navy },
});

const t = StyleSheet.create({
  loader: { paddingVertical: 24, alignItems: "center" },
  emptyCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 16, marginBottom: 12,
  },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textDim },
  sectionHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8, marginTop: 16,
  },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 11,
    color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.6,
  },
  sectionAction: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.emerald },
  oppRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navyCard, borderRadius: 14, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, marginBottom: 8, gap: 10,
  },
  oppAccent: { width: 3, height: 36, borderRadius: 2, flexShrink: 0 },
  oppBody: { flex: 1 },
  oppTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text, marginBottom: 4 },
  oppMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  oppStage: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, flexShrink: 0 },
  oppBarWrap: {
    flex: 1, height: 4, backgroundColor: COLORS.navyBorder,
    borderRadius: 2, overflow: "hidden",
  },
  oppBar: { height: "100%", borderRadius: 2 },
  oppPct: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, flexShrink: 0 },
  oppValue: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.amber, flexShrink: 0 },
  activityGroup: {
    backgroundColor: COLORS.navyCard, borderRadius: 14, borderWidth: 1,
    borderColor: COLORS.navyBorder, marginBottom: 8, overflow: "hidden",
  },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  activityRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder },
  activityIcon: { fontSize: 14 },
  activityText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.text },
  activitySub: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 2 },
  intelCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, marginBottom: 12,
  },
  intelBars: { flexDirection: "row", gap: 10, alignItems: "center", marginBottom: 10 },
  barRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  barLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim },
  barPct: { fontFamily: "Inter_700Bold", fontSize: 10 },
  barTrack: {
    height: 5, backgroundColor: COLORS.navyBorder,
    borderRadius: 3, overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 3 },
  gapsBadge: {
    backgroundColor: COLORS.amber + "18", borderWidth: 1,
    borderColor: COLORS.amber + "33", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 6, alignItems: "center",
  },
  gapsNum: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.amber },
  gapsLbl: { fontFamily: "Inter_400Regular", fontSize: 9, color: COLORS.amber },
  intelFooter: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
  },
  intelFooterTxt: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, flex: 1 },
  viaEyeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  viaEyeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: INDIGO_LIGHT },
  accordionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 12, marginTop: 8,
    borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
  },
  accordionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.textMuted },
  scanPrompt: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: INDIGO + "12", borderWidth: 1, borderColor: INDIGO + "33",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12,
  },
  scanPromptTxt: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: INDIGO_LIGHT, flex: 1 },
  scanPromptBtn: {
    backgroundColor: INDIGO, paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: 10,
  },
  scanPromptBtnTxt: { fontFamily: "Inter_700Bold", fontSize: 11, color: "white" },
  deptPill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  deptPillActive: { backgroundColor: INDIGO + "18", borderColor: INDIGO + "55" },
  deptPillTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.textDim },
  deptPillTxtActive: { color: INDIGO_LIGHT },
  contactCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.navyCard, borderRadius: 14, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  contactAvatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  contactAvatarTxt: { fontFamily: "Inter_700Bold", fontSize: 13 },
  contactBody: { flex: 1, gap: 2 },
  contactNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  contactName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  contactTitle: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
  deptTag: { alignSelf: "flex-start", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
  deptTagTxt: { fontFamily: "Inter_600SemiBold", fontSize: 9 },
  contactRight: { alignItems: "flex-end", gap: 6 },
  strengthBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  strengthBadgeTxt: { fontFamily: "Inter_700Bold", fontSize: 10 },
  gapCallout: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.red + "10", borderWidth: 1, borderColor: COLORS.red + "30",
    borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, marginTop: 4,
  },
  gapCalloutIcon: { fontSize: 18 },
  gapCalloutTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.red + "cc" },
  gapCalloutTxt: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 1 },
  gapCalloutBtn: { backgroundColor: COLORS.red, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  gapCalloutBtnTxt: { fontFamily: "Inter_700Bold", fontSize: 11, color: "white" },
  rootNode: {
    backgroundColor: INDIGO + "18", borderWidth: 2,
    borderColor: INDIGO + "55", borderRadius: 16, padding: 14, marginBottom: 12,
  },
  rootNodeTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  rootNodeEmoji: { fontSize: 22 },
  rootNodeName: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.text },
  rootRootBadge: {
    backgroundColor: INDIGO + "33", paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 8,
  },
  rootRootBadgeTxt: { fontFamily: "Inter_700Bold", fontSize: 9, color: INDIGO_LIGHT },
  rootNpi: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 2 },
  rootStats: {
    flexDirection: "row", marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: INDIGO + "33",
  },
  rootStatCell: { flex: 1, alignItems: "center" },
  rootStatVal: { fontFamily: "Inter_700Bold", fontSize: 15 },
  rootStatLbl: { fontFamily: "Inter_400Regular", fontSize: 9, color: COLORS.textDim, marginTop: 1 },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  legendTxt: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim },
  legendHint: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginLeft: "auto" as any },
  childTree: {
    borderLeftWidth: 2, borderLeftColor: COLORS.navyBorder,
    borderStyle: "dashed" as any, paddingLeft: 10, marginLeft: 8, gap: 6,
  },
  childNode: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, marginBottom: 2,
  },
  childNodeMain: { flex: 1, flexDirection: "row", alignItems: "center" },
  childNodeName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text },
  childNodeNpi: { fontFamily: "Inter_400Regular", fontSize: 9, color: COLORS.textDim, marginTop: 1 },
  childNodeRight: { flexShrink: 0, alignItems: "flex-end", gap: 4 },
  structTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  structTagTxt: { fontFamily: "Inter_600SemiBold", fontSize: 9 },
  childStats: { flexDirection: "row", gap: 8 },
  childStat: { fontFamily: "Inter_400Regular", fontSize: 9, color: COLORS.textDim },
  parentSection: { marginTop: 12 },
  subLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 },
  parentRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12,
  },
  parentName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.blue, flex: 1 },
  addFacilityCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderStyle: "dashed" as any, borderColor: COLORS.navyBorder,
    borderRadius: 14, paddingVertical: 12, marginTop: 8, marginBottom: 8,
  },
  addFacilityTxt: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textDim },
  structScanBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.blue + "44", paddingVertical: 8, paddingHorizontal: 12,
    alignSelf: "flex-start", marginTop: 8,
  },
  structScanTxt: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.blue },
  scanHistoryRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, marginTop: 6,
  },
  scanHistoryTitle: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text, marginBottom: 2 },
  scanHistoryMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
  scanBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  scanBadgeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 10 },
  quickLogRow: { flexDirection: "row", gap: 6, marginBottom: 12 },
  quickLogBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 12,
    borderWidth: 1, alignItems: "center",
  },
  quickLogTxt: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  sectionToggle: {
    flexDirection: "row", backgroundColor: COLORS.navyCard,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 4, marginBottom: 12, gap: 4,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: "center" },
  toggleBtnActive: { backgroundColor: INDIGO },
  toggleBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textDim },
  toggleBtnTxtActive: { color: "white" },
  actEntry: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: COLORS.navyCard, borderRadius: 14, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 14,
  },
  actEntryIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, flexShrink: 0,
  },
  actEntryText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text, lineHeight: 16, flex: 1 },
  actTypeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  actTypeTxt: { fontFamily: "Inter_600SemiBold", fontSize: 9 },
  actContactTxt: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 3 },
  actDateTxt: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim + "88", marginTop: 2 },
  taskRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: COLORS.navyCard, borderRadius: 14, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 12,
  },
  taskDone: { opacity: 0.5 },
  taskCheck: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2,
    alignItems: "center", justifyContent: "center", marginTop: 1, flexShrink: 0,
  },
  taskText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text, lineHeight: 17 },
  taskTextDone: { textDecorationLine: "line-through", color: COLORS.textDim },
  priorityBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  priorityTxt: { fontFamily: "Inter_600SemiBold", fontSize: 9 },
  taskDueTxt: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim },
  addTaskCta: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderWidth: 1, borderStyle: "dashed" as any, borderColor: COLORS.navyBorder,
    borderRadius: 14, paddingVertical: 12, marginTop: 4,
  },
  addTaskCtaTxt: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textDim },
});
