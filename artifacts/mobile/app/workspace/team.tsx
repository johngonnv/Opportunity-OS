import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator, Modal, TextInput, Platform,
} from "react-native";
import { Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";

interface Member {
  id: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

function roleBadgeColor(role: string) {
  if (role === "OWNER") return COLORS.amber;
  if (role === "ADMIN") return COLORS.emerald;
  return COLORS.textDim;
}

function countAdmins(members: Member[]) {
  return members.filter(m => m.role === "OWNER" || m.role === "ADMIN").length;
}

interface InviteModalProps {
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function InviteModal({ workspaceId, onClose, onSuccess }: InviteModalProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInvite = async () => {
    setError(null);
    if (!email.trim()) { setError("Email is required."); return; }
    setLoading(true);
    try {
      await apiFetch(`/workspaces/${workspaceId}/invites`, {
        method: "POST",
        body: JSON.stringify({ email: email.trim() }),
      });
      setSuccess(true);
      setTimeout(() => { onSuccess(); onClose(); }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to send invitation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={im.overlay}>
      <TouchableOpacity style={im.backdrop} onPress={onClose} activeOpacity={1} />
      <View style={im.sheet}>
        <View style={im.handle} />
        <View style={im.header}>
          <Text style={im.title}>Invite Member</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={im.subtitle}>Enter the email address of the person you want to invite.</Text>
        {error && (
          <View style={im.errorBox}>
            <Feather name="alert-circle" size={13} color={COLORS.red} />
            <Text style={im.errorText}>{error}</Text>
          </View>
        )}
        {success && (
          <View style={im.successBox}>
            <Feather name="check-circle" size={13} color={COLORS.emerald} />
            <Text style={im.successText}>Invitation sent!</Text>
          </View>
        )}
        <View style={im.field}>
          <Text style={im.fieldLabel}>Email Address</Text>
          <TextInput
            style={im.input}
            value={email}
            onChangeText={setEmail}
            placeholder="name@company.com"
            placeholderTextColor={COLORS.textDim}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <TouchableOpacity style={im.btn} onPress={handleInvite} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <Text style={im.btnText}>Send Invitation</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const im = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", zIndex: 100 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: COLORS.navyMid, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  handle: { width: 36, height: 4, backgroundColor: COLORS.navyBorder, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginBottom: 16, lineHeight: 20 },
  field: { marginBottom: 16 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: { backgroundColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder },
  btn: { backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.white },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.red + "18", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.red + "40", marginBottom: 12 },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.red },
  successBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.emerald + "18", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.emerald + "40", marginBottom: 12 },
  successText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.emerald },
});

export default function TeamScreen() {
  const { workspace, role, user } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const workspaceId = workspace?.id || "";
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const [showInvite, setShowInvite] = useState(false);
  const [actionMenuMember, setActionMenuMember] = useState<Member | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspaceMembers", workspaceId],
    queryFn: () => apiFetch(`/workspaces/${workspaceId}/members`),
    enabled: !!workspaceId && isAdmin,
  });

  const members: Member[] = data?.members || [];

  const updateRoleMutation = useMutation({
    mutationFn: ({ userId, newRole }: { userId: string; newRole: string }) =>
      apiFetch(`/workspaces/${workspaceId}/members/${userId}`, {
        method: "PUT",
        body: JSON.stringify({ role: newRole }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
      setActionMenuMember(null);
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to update role.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/workspaces/${workspaceId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaceMembers", workspaceId] });
      setActionMenuMember(null);
    },
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to remove member.");
    },
  });

  const handleRoleAction = (member: Member, action: "promote" | "demote" | "remove") => {
    const adminCount = countAdmins(members);
    const isLastAdmin = (member.role === "OWNER" || member.role === "ADMIN") && adminCount <= 1;

    if (action === "remove" && isLastAdmin) {
      Alert.alert(
        "Cannot Remove Last Admin",
        "You cannot remove the last workspace admin. Please promote another member to Admin first.",
        [{ text: "OK" }]
      );
      return;
    }
    if (action === "demote" && isLastAdmin) {
      Alert.alert(
        "Cannot Demote Last Admin",
        "You cannot demote the last workspace admin. Please promote another member to Admin first.",
        [{ text: "OK" }]
      );
      return;
    }

    const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ") || member.email || "this member";
    let confirmTitle = "";
    let confirmMsg = "";
    let confirmAction = () => {};

    if (action === "promote") {
      confirmTitle = "Promote to Admin";
      confirmMsg = `Give ${fullName} admin permissions?`;
      confirmAction = () => updateRoleMutation.mutate({ userId: member.userId, newRole: "ADMIN" });
    } else if (action === "demote") {
      confirmTitle = "Demote to Member";
      confirmMsg = `Remove admin permissions from ${fullName}?`;
      confirmAction = () => updateRoleMutation.mutate({ userId: member.userId, newRole: "MEMBER" });
    } else {
      confirmTitle = "Remove Member";
      confirmMsg = `Remove ${fullName} from this workspace? This cannot be undone.`;
      confirmAction = () => removeMutation.mutate(member.userId);
    }

    if (Platform.OS === "web") {
      if (window.confirm(`${confirmTitle}: ${confirmMsg}`)) confirmAction();
    } else {
      Alert.alert(confirmTitle, confirmMsg, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: action === "remove" ? "destructive" : "default", onPress: confirmAction },
      ]);
    }
    setActionMenuMember(null);
  };

  if (!isAdmin) {
    return (
      <View style={styles.restrictedContainer}>
        <Stack.Screen options={{ title: "Team & Roles" }} />
        <View style={styles.restrictedContent}>
          <Feather name="lock" size={36} color={COLORS.textDim} />
          <Text style={styles.restrictedTitle}>Access Restricted</Text>
          <Text style={styles.restrictedBody}>You need Owner or Admin permissions to manage team members.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Team & Roles" }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.inviteBtn} onPress={() => setShowInvite(true)} activeOpacity={0.85}>
          <Feather name="user-plus" size={16} color={COLORS.emerald} />
          <Text style={styles.inviteBtnText}>Invite Member</Text>
        </TouchableOpacity>

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={COLORS.emerald} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Failed to load team members.</Text>
          </View>
        ) : members.length === 0 ? (
          <Card style={{ padding: 24, alignItems: "center" }}>
            <Feather name="users" size={28} color={COLORS.textDim} />
            <Text style={styles.emptyText}>No members found.</Text>
          </Card>
        ) : (
          members.map(member => {
            const fullName = [member.firstName, member.lastName].filter(Boolean).join(" ") || "—";
            const isMe = member.userId === user?.id;
            return (
              <Card key={member.id} style={styles.memberCard}>
                <View style={styles.memberRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarInitial}>
                      {member.firstName?.[0]?.toUpperCase() || member.email?.[0]?.toUpperCase() || "?"}
                    </Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberName}>{fullName}</Text>
                      {isMe && <Text style={styles.meTag}>(you)</Text>}
                    </View>
                    <Text style={styles.memberEmail}>{member.email || "—"}</Text>
                    <Badge label={member.role} color={roleBadgeColor(member.role)} style={{ marginTop: 4 }} />
                  </View>
                  {isAdmin && !isMe && (
                    <TouchableOpacity
                      style={styles.menuBtn}
                      onPress={() => setActionMenuMember(m => m?.id === member.id ? null : member)}
                    >
                      <Feather name="more-vertical" size={18} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                {actionMenuMember?.id === member.id && (
                  <View style={styles.actionMenu}>
                    {member.role === "MEMBER" && (
                      <TouchableOpacity
                        style={styles.actionItem}
                        onPress={() => handleRoleAction(member, "promote")}
                      >
                        <Feather name="arrow-up-circle" size={14} color={COLORS.emerald} />
                        <Text style={[styles.actionText, { color: COLORS.emerald }]}>Promote to Admin</Text>
                      </TouchableOpacity>
                    )}
                    {(member.role === "ADMIN") && (
                      <TouchableOpacity
                        style={styles.actionItem}
                        onPress={() => handleRoleAction(member, "demote")}
                      >
                        <Feather name="arrow-down-circle" size={14} color={COLORS.amber} />
                        <Text style={[styles.actionText, { color: COLORS.amber }]}>Demote to Member</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.actionItem, styles.actionItemLast]}
                      onPress={() => handleRoleAction(member, "remove")}
                    >
                      <Feather name="user-x" size={14} color={COLORS.red} />
                      <Text style={[styles.actionText, { color: COLORS.red }]}>Remove from Workspace</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </Card>
            );
          })
        )}
      </ScrollView>

      {showInvite && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setShowInvite(false)}>
          <InviteModal
            workspaceId={workspaceId}
            onClose={() => setShowInvite(false)}
            onSuccess={() => refetch()}
          />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  centered: { paddingVertical: 40, alignItems: "center" },
  inviteBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.emerald + "15", borderRadius: 12, paddingVertical: 13, paddingHorizontal: 20, borderWidth: 1, borderColor: COLORS.emerald + "40", marginBottom: 16, justifyContent: "center" },
  inviteBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.emerald },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.red },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, marginTop: 12, textAlign: "center" },
  memberCard: { marginBottom: 10, padding: 14 },
  memberRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarInitial: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.emerald },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  memberName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  meTag: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim },
  memberEmail: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  menuBtn: { padding: 6, marginLeft: 4 },
  actionMenu: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.navyBorder, paddingTop: 10 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "55" },
  actionItemLast: { borderBottomWidth: 0 },
  actionText: { fontFamily: "Inter_500Medium", fontSize: 14 },
  restrictedContainer: { flex: 1, backgroundColor: COLORS.navy },
  restrictedContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  restrictedTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text },
  restrictedBody: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
});
