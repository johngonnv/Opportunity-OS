import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Switch, Modal, FlatList, TextInput, Share,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { confirmAction, alertMessage } from "@/utils/crossPlatformAlert";
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
  isPending: boolean;
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
  void confirmAction(
    "Platform Support Action",
    `${message}\n\nThis action will be logged as a platform support action. Continue?`,
    { confirmLabel: "Continue" }
  ).then((ok) => { if (ok) onConfirm(); });
}

// All write requests from this screen happen under platform-support context.
// The API treats this header as the source-of-truth for setting
// platformSupportAction=true on the resulting audit-log row.
const SUPPORT_HEADERS = { "x-platform-support": "true" } as const;

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
          method: "PUT", headers: SUPPORT_HEADERS,
          body: JSON.stringify(updates),
        });
        qc.invalidateQueries({ queryKey: ["adminWorkspacePipelineViews", workspaceId] });
      } catch (e: any) {
        alertMessage("Error", e.message);
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
                        method: "PUT", headers: SUPPORT_HEADERS,
                        body: JSON.stringify({ sortOrder: prev.sortOrder }),
                      });
                      await adminFetch(`/admin/workspaces/${workspaceId}/pipeline-views/${prev.id}`, {
                        method: "PUT", headers: SUPPORT_HEADERS,
                        body: JSON.stringify({ sortOrder: view.sortOrder }),
                      });
                      qc.invalidateQueries({ queryKey: ["adminWorkspacePipelineViews", workspaceId] });
                    } catch (e: any) {
                      alertMessage("Error", e.message);
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
                        method: "PUT", headers: SUPPORT_HEADERS,
                        body: JSON.stringify({ sortOrder: next.sortOrder }),
                      });
                      await adminFetch(`/admin/workspaces/${workspaceId}/pipeline-views/${next.id}`, {
                        method: "PUT", headers: SUPPORT_HEADERS,
                        body: JSON.stringify({ sortOrder: view.sortOrder }),
                      });
                      qc.invalidateQueries({ queryKey: ["adminWorkspacePipelineViews", workspaceId] });
                    } catch (e: any) {
                      alertMessage("Error", e.message);
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

  // ─── Invite form state ────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MANAGER">("MANAGER");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
            method: "PUT", headers: SUPPORT_HEADERS,
            body: JSON.stringify({ role: newRole }),
          });
          qc.invalidateQueries({ queryKey: ["adminWorkspaceMembers", workspaceId] });
        } catch (e: unknown) {
          alertMessage("Error", e instanceof Error ? e.message : String(e));
        }
      }
    );
  }

  function handleRemove(member: Member) {
    if (!member.user) return;
    const name = getMemberDisplayName(member);
    confirmSupportAction(
      `Remove ${name} (${member.role}) from this workspace`,
      async () => {
        try {
          await adminFetch(`/admin/workspaces/${workspaceId}/members/${member.user!.id}`, {
            method: "DELETE", headers: SUPPORT_HEADERS,
          });
          qc.invalidateQueries({ queryKey: ["adminWorkspaceMembers", workspaceId] });
        } catch (e: unknown) {
          alertMessage("Error", e instanceof Error ? e.message : String(e));
        }
      }
    );
  }

  function handleResendInvite(member: Member) {
    if (!member.user) return;
    const name = getMemberDisplayName(member);
    confirmSupportAction(
      `Resend invite email to ${name}`,
      async () => {
        try {
          const result = await adminFetch(
            `/admin/workspaces/${workspaceId}/members/${member.user!.id}/resend-invite`,
            { method: "POST", headers: SUPPORT_HEADERS },
          );
          qc.invalidateQueries({ queryKey: ["adminWorkspaceAuditLog", workspaceId] });
          const status = result?.deliveryStatus ?? "queued";
          const url = result?.inviteUrl as string | undefined;
          const msg = status === "delivered"
            ? `Invite re-sent to ${member.user!.email}.`
            : `Email delivery ${status} (domain not yet verified in Resend). Use this link to invite them directly:\n\n${url ?? ""}`;
          alertMessage(status === "delivered" ? "Invite re-sent" : "Use invite link", msg);
        } catch (e: unknown) {
          alertMessage("Error", e instanceof Error ? e.message : String(e));
        }
      }
    );
  }

  async function handleShareInviteLink(member: Member) {
    if (!member.user) return;
    try {
      const result = await adminFetch(
        `/admin/workspaces/${workspaceId}/members/${member.user.id}/resend-invite`,
        { method: "POST", headers: SUPPORT_HEADERS },
      );
      qc.invalidateQueries({ queryKey: ["adminWorkspaceAuditLog", workspaceId] });
      const url = result?.inviteUrl as string | undefined;
      if (url) {
        await Share.share({ message: url, url });
      } else {
        alertMessage("No link", "Could not generate an invite link.");
      }
    } catch (e: unknown) {
      alertMessage("Error", e instanceof Error ? e.message : String(e));
    }
  }

  function handlePasswordReset(member: Member) {
    if (!member.user) return;
    const name = getMemberDisplayName(member);
    confirmSupportAction(
      `Send a password reset email to ${name}`,
      async () => {
        try {
          const result = await adminFetch(
            `/admin/workspaces/${workspaceId}/members/${member.user!.id}/password-reset`,
            { method: "POST", headers: SUPPORT_HEADERS },
          );
          qc.invalidateQueries({ queryKey: ["adminWorkspaceAuditLog", workspaceId] });
          const status = result?.deliveryStatus ?? "queued";
          const url = result?.inviteUrl as string | undefined;
          const msg = status === "delivered"
            ? `Password reset email sent to ${member.user!.email}.`
            : `Email delivery ${status} (domain not yet verified in Resend). Share this reset link directly:\n\n${url ?? ""}`;
          alertMessage(status === "delivered" ? "Reset sent" : "Use reset link", msg);
        } catch (e: unknown) {
          alertMessage("Error", e instanceof Error ? e.message : String(e));
        }
      }
    );
  }

  async function submitInvite() {
    const email = inviteEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      alertMessage("Invalid email", "Enter a valid email address.");
      return;
    }
    setInviteSubmitting(true);
    try {
      const result = await adminFetch(`/admin/workspaces/${workspaceId}/members/invite`, {
        method: "POST", headers: SUPPORT_HEADERS,
        body: JSON.stringify({
          name: inviteName.trim() || undefined,
          email,
          role: inviteRole,
        }),
      });
      qc.invalidateQueries({ queryKey: ["adminWorkspaceMembers", workspaceId] });
      qc.invalidateQueries({ queryKey: ["adminWorkspaceAuditLog", workspaceId] });
      const status = result?.invite?.deliveryStatus ?? "queued";
      const url = result?.invite?.inviteUrl as string | undefined;
      const summary =
        status === "delivered"
          ? `Invite emailed to ${email}.`
          : `Invite created. Email is ${status} — share this link if needed:\n\n${url ?? ""}`;
      alertMessage("Invite sent", summary);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("MANAGER");
      setInviteOpen(false);
    } catch (e: unknown) {
      alertMessage("Couldn't send invite", e instanceof Error ? e.message : String(e));
    } finally {
      setInviteSubmitting(false);
    }
  }

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>;
  }

  // OWNER is shown for context but cannot be set via this UI — owners are
  // bound to the workspace's ownerUserId column.
  const ROLES = ["ADMIN", "MANAGER", "MEMBER"];

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      {/* Invite form */}
      <View style={styles.inviteCard}>
        <View style={styles.inviteHeaderRow}>
          <Text style={styles.inviteTitle}>Invite Admin or Manager</Text>
          <TouchableOpacity onPress={() => setInviteOpen(o => !o)}>
            <Feather
              name={inviteOpen ? "chevron-up" : "chevron-down"}
              size={18}
              color={COLORS.amber}
            />
          </TouchableOpacity>
        </View>
        {inviteOpen && (
          <View style={{ gap: 8, marginTop: 10 }}>
            <TextInput
              style={styles.inviteInput}
              placeholder="Name (optional)"
              placeholderTextColor={COLORS.textDim}
              value={inviteName}
              onChangeText={setInviteName}
              autoCapitalize="words"
            />
            <TextInput
              style={styles.inviteInput}
              placeholder="Email"
              placeholderTextColor={COLORS.textDim}
              value={inviteEmail}
              onChangeText={setInviteEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
            <View style={styles.roleButtons}>
              {(["ADMIN", "MANAGER"] as const).map(r => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleBtn, inviteRole === r && styles.roleBtnActive]}
                  onPress={() => setInviteRole(r)}
                >
                  <Text style={[styles.roleBtnText, inviteRole === r && styles.roleBtnTextActive]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.inviteSubmitBtn, inviteSubmitting && { opacity: 0.5 }]}
              onPress={() =>
                confirmSupportAction(
                  `Invite ${inviteEmail || "this user"} as ${inviteRole}`,
                  () => { void submitInvite(); },
                )
              }
              disabled={inviteSubmitting}
            >
              {inviteSubmitting
                ? <ActivityIndicator color={COLORS.white} />
                : <Text style={styles.inviteSubmitBtnText}>Send invite</Text>}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {members.map(m => (
        <View key={m.id} style={styles.memberCard}>
          {/* Name + status badge */}
          <View style={styles.memberInfo}>
            <View style={styles.memberNameRow}>
              <Text style={styles.memberName}>{getMemberDisplayName(m)}</Text>
              {m.isPending && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>PENDING</Text>
                </View>
              )}
            </View>
            {m.user && <Text style={styles.memberEmail}>{m.user.email}</Text>}
          </View>

          {/* Role selector */}
          <View style={styles.roleButtons}>
            {ROLES.map(role => (
              <TouchableOpacity
                key={role}
                style={[styles.roleBtn, m.role === role && styles.roleBtnActive]}
                onPress={() => m.role !== role && handleRoleChange(m, role)}
                disabled={m.role === role || m.role === "OWNER"}
              >
                <Text style={[styles.roleBtnText, m.role === role && styles.roleBtnTextActive]}>{role}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Context-aware action buttons */}
          {m.role !== "OWNER" && m.user && (
            <View style={styles.memberActions}>
              {m.isPending ? (
                <>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleResendInvite(m)}>
                    <Feather name="send" size={13} color={COLORS.amber} />
                    <Text style={styles.actionBtnText}>Resend invite</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => void handleShareInviteLink(m)}>
                    <Feather name="link" size={13} color={COLORS.emerald} />
                    <Text style={[styles.actionBtnText, { color: COLORS.emerald }]}>Share link</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity style={styles.actionBtn} onPress={() => handlePasswordReset(m)}>
                  <Feather name="key" size={13} color={COLORS.amber} />
                  <Text style={styles.actionBtnText}>Send password reset</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.actionBtnDanger} onPress={() => handleRemove(m)}>
                <Feather name="trash-2" size={13} color={COLORS.red} />
                <Text style={styles.actionBtnDangerText}>Remove</Text>
              </TouchableOpacity>
            </View>
          )}
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
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  memberName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" },
  memberEmail: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  pendingBadge: { backgroundColor: "#2D2000", borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.amber + "88" },
  pendingBadgeText: { color: COLORS.amber, fontSize: 9, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8 },
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
  inviteCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  inviteHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inviteTitle: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  inviteInput: {
    borderWidth: 1, borderColor: COLORS.navyBorder, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    color: COLORS.text, backgroundColor: COLORS.navySurface,
    fontFamily: "Inter_400Regular", fontSize: 13,
  },
  inviteSubmitBtn: {
    marginTop: 4, backgroundColor: COLORS.emerald,
    paddingVertical: 10, borderRadius: 6, alignItems: "center",
  },
  inviteSubmitBtnText: { color: COLORS.white, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  memberActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.amber + "55",
    backgroundColor: COLORS.navySurface,
  },
  actionBtnText: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_500Medium" },
  actionBtnDanger: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 5, paddingHorizontal: 10,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.red + "55",
    backgroundColor: COLORS.navySurface,
  },
  actionBtnDangerText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_500Medium" },
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
