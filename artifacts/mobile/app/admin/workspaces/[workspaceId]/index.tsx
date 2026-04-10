import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Switch, Alert, Modal, FlatList,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

type TabKey = "pipeline-views" | "members" | "audit-log";

interface PipelineView {
  id: string;
  name: string;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  visibilityScope: string;
}

interface Member {
  id: string;
  role: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null } | null;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  changedByName: string;
  platformSupportAction: boolean;
  changedAt: string;
  previousValue: any;
  newValue: any;
}

function SupportBanner() {
  return (
    <View style={styles.supportBanner}>
      <Text style={styles.supportBannerIcon}>⚠</Text>
      <Text style={styles.supportBannerText}>Platform Support Mode — All changes are logged as support actions</Text>
    </View>
  );
}

function confirmSupportAction(message: string, onConfirm: () => void) {
  Alert.alert(
    "Platform Support Action",
    `${message}\n\nThis action will be logged as a platform support action. Continue?`,
    [
      { text: "Cancel", style: "cancel" },
      { text: "Continue", onPress: onConfirm },
    ]
  );
}

function PipelineViewsTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading } = useQuery({
    queryKey: ["adminWorkspacePipelineViews", workspaceId],
    queryFn: () => adminFetch(`/admin/workspaces/${workspaceId}/pipeline-views`),
    enabled: isAdminAuthenticated && !!workspaceId,
  });

  const views: PipelineView[] = (data?.views ?? []).sort((a: PipelineView, b: PipelineView) => a.sortOrder - b.sortOrder);

  async function updateView(viewId: string, updates: Partial<PipelineView>, description: string) {
    confirmSupportAction(description, async () => {
      try {
        await adminFetch(`/admin/workspaces/${workspaceId}/pipeline-views/${viewId}`, {
          method: "PUT",
          body: JSON.stringify(updates),
        });
        qc.invalidateQueries({ queryKey: ["adminWorkspacePipelineViews", workspaceId] });
      } catch (e: any) {
        Alert.alert("Error", e.message);
      }
    });
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>;
  }

  if (views.length === 0) {
    return <View style={styles.center}><Text style={styles.emptyText}>No pipeline views in this workspace.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {views.map((view, index) => (
        <View key={view.id} style={styles.viewCard}>
          <View style={styles.viewCardHeader}>
            <Text style={styles.viewName}>{view.name}</Text>
            <View style={styles.viewBadges}>
              {view.isDefault && <View style={styles.defaultBadge}><Text style={styles.defaultBadgeText}>DEFAULT</Text></View>}
              <Text style={styles.orderText}>#{index + 1}</Text>
            </View>
          </View>

          <View style={styles.viewControls}>
            <View style={styles.viewControl}>
              <Text style={styles.controlLabel}>Enabled</Text>
              <Switch
                value={view.isEnabled}
                onValueChange={val => updateView(view.id, { isEnabled: val }, `${val ? "Enable" : "Disable"} pipeline view "${view.name}"`)}
                trackColor={{ true: COLORS.emerald, false: COLORS.navyBorder }}
                thumbColor={COLORS.white}
              />
            </View>
            <View style={styles.viewControl}>
              <Text style={styles.controlLabel}>Visibility</Text>
              <TouchableOpacity
                style={styles.setDefaultBtn}
                onPress={() => {
                  const next = view.visibilityScope === "all" ? "admins_only" : "all";
                  updateView(view.id, { visibilityScope: next }, `Set visibility of "${view.name}" to ${next}`);
                }}
              >
                <Text style={styles.setDefaultBtnText}>{view.visibilityScope ?? "all"}</Text>
              </TouchableOpacity>
            </View>
            {!view.isDefault && (
              <TouchableOpacity
                style={styles.setDefaultBtn}
                onPress={() => updateView(view.id, { isDefault: true }, `Set "${view.name}" as the default pipeline view`)}
              >
                <Text style={styles.setDefaultBtnText}>Set Default</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.viewReorder}>
            {index > 0 && (
              <TouchableOpacity
                style={styles.reorderBtn}
                onPress={() => {
                  const prev = views[index - 1];
                  confirmSupportAction(`Move "${view.name}" up in order`, async () => {
                    try {
                      await adminFetch(`/admin/workspaces/${workspaceId}/pipeline-views/${view.id}`, {
                        method: "PUT",
                        body: JSON.stringify({ sortOrder: prev.sortOrder }),
                      });
                      await adminFetch(`/admin/workspaces/${workspaceId}/pipeline-views/${prev.id}`, {
                        method: "PUT",
                        body: JSON.stringify({ sortOrder: view.sortOrder }),
                      });
                      qc.invalidateQueries({ queryKey: ["adminWorkspacePipelineViews", workspaceId] });
                    } catch (e: any) {
                      Alert.alert("Error", e.message);
                    }
                  });
                }}
              >
                <Text style={styles.reorderBtnText}>↑ Move Up</Text>
              </TouchableOpacity>
            )}
            {index < views.length - 1 && (
              <TouchableOpacity
                style={styles.reorderBtn}
                onPress={() => {
                  const next = views[index + 1];
                  confirmSupportAction(`Move "${view.name}" down in order`, async () => {
                    try {
                      await adminFetch(`/admin/workspaces/${workspaceId}/pipeline-views/${view.id}`, {
                        method: "PUT",
                        body: JSON.stringify({ sortOrder: next.sortOrder }),
                      });
                      await adminFetch(`/admin/workspaces/${workspaceId}/pipeline-views/${next.id}`, {
                        method: "PUT",
                        body: JSON.stringify({ sortOrder: view.sortOrder }),
                      });
                      qc.invalidateQueries({ queryKey: ["adminWorkspacePipelineViews", workspaceId] });
                    } catch (e: any) {
                      Alert.alert("Error", e.message);
                    }
                  });
                }}
              >
                <Text style={styles.reorderBtnText}>↓ Move Down</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function MembersTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading } = useQuery({
    queryKey: ["adminWorkspaceMembers", workspaceId],
    queryFn: () => adminFetch(`/admin/workspaces/${workspaceId}/members`),
    enabled: isAdminAuthenticated && !!workspaceId,
  });

  const members: Member[] = data?.members ?? [];

  function getMemberDisplayName(m: Member): string {
    if (!m.user) return "Unknown";
    return [m.user.firstName, m.user.lastName].filter(Boolean).join(" ") || m.user.email;
  }

  function handleRoleChange(member: Member, newRole: string) {
    const name = getMemberDisplayName(member);
    confirmSupportAction(
      `Change ${name}'s role from ${member.role} to ${newRole}`,
      async () => {
        try {
          await adminFetch(`/admin/workspaces/${workspaceId}/members/${member.id}/role`, {
            method: "PUT",
            body: JSON.stringify({ role: newRole }),
          });
          qc.invalidateQueries({ queryKey: ["adminWorkspaceMembers", workspaceId] });
        } catch (e: any) {
          Alert.alert("Error", e.message);
        }
      }
    );
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>;
  }

  const ROLES = ["OWNER", "ADMIN", "MEMBER"];

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {members.map(m => (
        <View key={m.id} style={styles.memberCard}>
          <View style={styles.memberInfo}>
            <Text style={styles.memberName}>{getMemberDisplayName(m)}</Text>
            {m.user && <Text style={styles.memberEmail}>{m.user.email}</Text>}
          </View>
          <View style={styles.roleButtons}>
            {ROLES.map(role => (
              <TouchableOpacity
                key={role}
                style={[styles.roleBtn, m.role === role && styles.roleBtnActive]}
                onPress={() => m.role !== role && handleRoleChange(m, role)}
                disabled={m.role === role}
              >
                <Text style={[styles.roleBtnText, m.role === role && styles.roleBtnTextActive]}>{role}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
      {members.length === 0 && (
        <View style={styles.center}><Text style={styles.emptyText}>No members found.</Text></View>
      )}
    </ScrollView>
  );
}

function AuditLogTab({ workspaceId }: { workspaceId: string }) {
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading } = useQuery({
    queryKey: ["adminWorkspaceAuditLog", workspaceId],
    queryFn: () => adminFetch(`/admin/workspaces/${workspaceId}/audit-log`),
    enabled: isAdminAuthenticated && !!workspaceId,
  });

  const entries: AuditEntry[] = data?.entries ?? [];

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>;
  }

  if (entries.length === 0) {
    return <View style={styles.center}><Text style={styles.emptyText}>No audit entries yet.</Text></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {entries.map(entry => (
        <View key={entry.id} style={styles.auditCard}>
          <View style={styles.auditHeader}>
            <Text style={styles.auditAction}>{entry.action.replace(/_/g, " ")}</Text>
            {entry.platformSupportAction && (
              <View style={styles.supportBadge}><Text style={styles.supportBadgeText}>SUPPORT</Text></View>
            )}
          </View>
          <Text style={styles.auditMeta}>
            {entry.entityType} · by {entry.changedByName}
          </Text>
          <Text style={styles.auditTime}>{new Date(entry.changedAt).toLocaleString()}</Text>
          {(entry.previousValue || entry.newValue) && (
            <View style={styles.auditChanges}>
              {entry.previousValue && (
                <Text style={styles.auditBefore}>Before: {JSON.stringify(entry.previousValue).substring(0, 120)}</Text>
              )}
              {entry.newValue && (
                <Text style={styles.auditAfter}>After: {JSON.stringify(entry.newValue).substring(0, 120)}</Text>
              )}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

export default function WorkspaceSupportPanel() {
  const router = useRouter();
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [activeTab, setActiveTab] = useState<TabKey>("pipeline-views");

  const { data, isLoading } = useQuery({
    queryKey: ["adminWorkspace", workspaceId],
    queryFn: () => adminFetch(`/admin/workspaces/${workspaceId}`),
    enabled: isAdminAuthenticated && !!workspaceId,
  });

  const workspace = data?.workspace;

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[{ label: "Workspaces", href: "/admin/(tabs)/workspaces" }, { label: "Loading..." }]} />
        <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  const TABS: { key: TabKey; label: string }[] = [
    { key: "pipeline-views", label: "Pipeline Views" },
    { key: "members", label: "Members" },
    { key: "audit-log", label: "Audit Log" },
  ];

  return (
    <View style={styles.container}>
      <AdminHeader
        breadcrumbs={[
          { label: "Workspaces", href: "/admin/(tabs)/workspaces" },
          { label: workspace?.name ?? workspaceId },
        ]}
      />
      <SupportBanner />

      <TouchableOpacity
        style={styles.checklistBtn}
        onPress={() => router.push((`/admin/diagnostics/launch-checklist?workspaceId=${workspaceId}`) as Href)}
        activeOpacity={0.85}
      >
        <Feather name="check-square" size={15} color={COLORS.emerald} />
        <Text style={styles.checklistBtnText}>Launch Checklist</Text>
        <Feather name="chevron-right" size={14} color={COLORS.emerald} />
      </TouchableOpacity>

      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tabBody}>
        {activeTab === "pipeline-views" && <PipelineViewsTab workspaceId={workspaceId} />}
        {activeTab === "members" && <MembersTab workspaceId={workspaceId} />}
        {activeTab === "audit-log" && <AuditLogTab workspaceId={workspaceId} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  supportBanner: {
    backgroundColor: "#3D2A00",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.amber,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  supportBannerIcon: { fontSize: 16 },
  supportBannerText: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  checklistBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: COLORS.emerald + "11",
    borderBottomWidth: 1, borderBottomColor: COLORS.emerald + "44",
  },
  checklistBtnText: { color: COLORS.emerald, fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder, backgroundColor: COLORS.navyMid },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.amber },
  tabText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  tabTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  tabBody: { flex: 1 },
  tabContent: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
  viewCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  viewCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  viewName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
  viewBadges: { flexDirection: "row", alignItems: "center", gap: 8 },
  defaultBadge: { backgroundColor: COLORS.emeraldMuted, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  defaultBadgeText: { color: COLORS.emerald, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  orderText: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular" },
  viewControls: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 8, flexWrap: "wrap" },
  viewControl: { flexDirection: "row", alignItems: "center", gap: 8 },
  controlLabel: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  setDefaultBtn: {
    borderWidth: 1,
    borderColor: COLORS.emerald,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  setDefaultBtnText: { color: COLORS.emerald, fontSize: 12, fontFamily: "Inter_500Medium" },
  viewReorder: { flexDirection: "row", gap: 8, marginTop: 4 },
  reorderBtn: {
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reorderBtnText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  memberCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  memberInfo: { marginBottom: 10 },
  memberName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" },
  memberEmail: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  roleButtons: { flexDirection: "row", gap: 8 },
  roleBtn: {
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.navySurface,
  },
  roleBtnActive: { borderColor: COLORS.amber, backgroundColor: "#2D1B00" },
  roleBtnText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  roleBtnTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  auditCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  auditHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  auditAction: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium", flex: 1, textTransform: "capitalize" },
  supportBadge: { backgroundColor: "#2D1B00", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.amber },
  supportBadgeText: { color: COLORS.amber, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 1 },
  auditMeta: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  auditTime: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4 },
  auditChanges: { marginTop: 8, gap: 2 },
  auditBefore: { color: COLORS.red, fontSize: 11, fontFamily: "Inter_400Regular" },
  auditAfter: { color: COLORS.emerald, fontSize: 11, fontFamily: "Inter_400Regular" },
});
