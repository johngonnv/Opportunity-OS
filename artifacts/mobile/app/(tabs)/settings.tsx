import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, Alert, Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { apiFetch } from "@/hooks/useApi";

function InfoRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Feather name={icon} size={14} color={COLORS.textMuted} />
      </View>
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value || "—"}</Text>
      </View>
    </View>
  );
}

function NavRow({ icon, label, onPress }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.navRow} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.navRowLeft}>
        <Feather name={icon} size={15} color={COLORS.emerald} />
        <Text style={styles.navRowLabel}>{label}</Text>
      </View>
      <Feather name="chevron-right" size={15} color={COLORS.textDim} />
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { user, workspace, plan, role, logout } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const [changingPw, setChangingPw] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const doLogout = async () => {
    qc.clear();
    await logout();
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) { setDeleteError("Please enter your password to confirm."); return; }
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiFetch("/auth/delete-account", {
        method: "DELETE",
        body: JSON.stringify({ password: deletePassword }),
      });
      qc.clear();
      await logout();
    } catch (err: any) {
      const msg = err.message || "";
      if (msg.includes("OWNER_CANNOT_DELETE")) {
        setDeleteError("Your account owns a workspace. Contact support@onboard.opportunityos.org to close your workspace first.");
      } else if (msg.includes("Incorrect password")) {
        setDeleteError("Incorrect password. Please try again.");
      } else {
        setDeleteError(msg || "Failed to delete account. Please try again.");
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDeleteAccount = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Permanently delete your account? This cannot be undone.")) {
        handleDeleteAccount();
      }
    } else {
      Alert.alert(
        "Delete Account",
        "This will permanently delete your account and remove you from all workspaces. This cannot be undone.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete Account", style: "destructive", onPress: handleDeleteAccount },
        ]
      );
    }
  };

  const handleLogout = () => {
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to sign out?")) {
        doLogout();
      }
    } else {
      Alert.alert("Sign Out", "Are you sure you want to sign out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  const handleChangePassword = async () => {
    if (!pwForm.current || !pwForm.next) { setPwError("All fields are required."); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError("New passwords do not match."); return; }
    if (pwForm.next.length < 6) { setPwError("New password must be at least 6 characters."); return; }
    setPwLoading(true);
    setPwError(null);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
      });
      setPwSuccess(true);
      setPwForm({ current: "", next: "", confirm: "" });
      setTimeout(() => { setChangingPw(false); setPwSuccess(false); }, 1500);
    } catch (err: any) {
      setPwError(err.message || "Failed to change password.");
    } finally {
      setPwLoading(false);
    }
  };

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Unknown";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={{ title: "Settings" }} />

      <View style={styles.profileHero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarInitial}>{user?.firstName?.[0]?.toUpperCase() || "?"}</Text>
        </View>
        <Text style={styles.heroName}>{fullName}</Text>
        <Text style={styles.heroEmail}>{user?.email}</Text>
        <View style={styles.roleChip}>
          <Text style={styles.roleChipText}>{role}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Workspace" />
        <Card>
          <InfoRow icon="briefcase" label="Company" value={workspace?.name || ""} />
          <InfoRow icon="globe" label="Focus" value={workspace?.industryFocus || ""} />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="More" />
        <Card padding={0}>
          <NavRow
            icon="trending-up"
            label="Pipeline"
            onPress={() => router.push("/(tabs)/opportunities")}
          />
          <View style={styles.navDivider} />
          <NavRow
            icon="credit-card"
            label="Business Cards"
            onPress={() => router.push("/(tabs)/cards")}
          />
          <View style={styles.navDivider} />
          <NavRow
            icon="check-square"
            label="Tasks"
            onPress={() => router.push("/(tabs)/tasks")}
          />
          <View style={styles.navDivider} />
          <NavRow
            icon="calendar"
            label="Calendar"
            onPress={() => router.push("/calendar")}
          />
        </Card>
      </View>

      {isAdmin && (
        <View style={styles.section}>
          <SectionHeader title="Workspace Settings" />
          <Card padding={0}>
            <NavRow
              icon="layers"
              label="Pipeline Views"
              onPress={() => router.push("/workspace/pipelines")}
            />
            <View style={styles.navDivider} />
            <NavRow
              icon="users"
              label="Team & Roles"
              onPress={() => router.push("/workspace/team")}
            />
          </Card>
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader title="Subscription" />
        <Card>
          <InfoRow icon="star" label="Plan" value={plan?.name || "—"} />
          <InfoRow icon="shield" label="Status" value="Active" />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionHeader title="Account" />
        <Card>
          <InfoRow icon="mail" label="Email" value={user?.email || ""} />
          <InfoRow icon="user" label="Name" value={fullName} />
        </Card>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.expandRow}
          onPress={() => { setChangingPw(v => !v); setPwError(null); setPwSuccess(false); }}
        >
          <SectionHeader title="Change Password" />
          <Feather name={changingPw ? "chevron-up" : "chevron-down"} size={16} color={COLORS.textDim} />
        </TouchableOpacity>
        {changingPw && (
          <Card style={{ marginTop: 8 }}>
            {pwSuccess && (
              <View style={styles.successBox}>
                <Feather name="check-circle" size={14} color={COLORS.emerald} />
                <Text style={styles.successText}>Password updated successfully!</Text>
              </View>
            )}
            {pwError && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={COLORS.red} />
                <Text style={styles.errorText}>{pwError}</Text>
              </View>
            )}
            {[
              { key: "current", label: "Current Password", placeholder: "••••••••" },
              { key: "next", label: "New Password", placeholder: "••••••••" },
              { key: "confirm", label: "Confirm New Password", placeholder: "••••••••" },
            ].map(({ key, label, placeholder }) => (
              <View key={key} style={styles.pwField}>
                <Text style={styles.pwLabel}>{label}</Text>
                <TextInput
                  style={styles.pwInput}
                  value={pwForm[key as keyof typeof pwForm]}
                  onChangeText={v => setPwForm(f => ({ ...f, [key]: v }))}
                  placeholder={placeholder}
                  placeholderTextColor={COLORS.textDim}
                  secureTextEntry
                  autoCapitalize="none"
                />
              </View>
            ))}
            <Button title="Update Password" onPress={handleChangePassword} loading={pwLoading} />
          </Card>
        )}
      </View>

      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Feather name="log-out" size={16} color={COLORS.red} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={styles.expandRow}
          onPress={() => { setDeletingAccount(v => !v); setDeleteError(null); setDeletePassword(""); }}
        >
          <SectionHeader title="Delete Account" />
          <Feather name={deletingAccount ? "chevron-up" : "chevron-down"} size={16} color={COLORS.textDim} />
        </TouchableOpacity>
        {deletingAccount && (
          <Card style={{ marginTop: 8 }}>
            <View style={styles.deleteWarningBox}>
              <Feather name="alert-triangle" size={14} color={COLORS.amber} />
              <Text style={styles.deleteWarningText}>
                Permanently deletes your account and removes you from all workspaces. This cannot be undone.
              </Text>
            </View>
            {deleteError && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={COLORS.red} />
                <Text style={styles.errorText}>{deleteError}</Text>
              </View>
            )}
            <View style={styles.pwField}>
              <Text style={styles.pwLabel}>Confirm your password</Text>
              <TextInput
                style={styles.pwInput}
                value={deletePassword}
                onChangeText={setDeletePassword}
                placeholder="••••••••"
                placeholderTextColor={COLORS.textDim}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>
            <TouchableOpacity
              style={[styles.deleteAccountBtn, deleteLoading && { opacity: 0.6 }]}
              onPress={confirmDeleteAccount}
              disabled={deleteLoading}
              activeOpacity={0.8}
            >
              <Feather name="trash-2" size={15} color={COLORS.white} />
              <Text style={styles.deleteAccountBtnText}>
                {deleteLoading ? "Deleting…" : "Delete My Account"}
              </Text>
            </TouchableOpacity>
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  profileHero: { alignItems: "center", paddingVertical: 28 },
  avatar: { width: 72, height: 72, borderRadius: 36, backgroundColor: COLORS.emerald + "25", borderWidth: 2, borderColor: COLORS.emerald, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  avatarInitial: { fontFamily: "Inter_700Bold", fontSize: 28, color: COLORS.emerald },
  heroName: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 4 },
  heroEmail: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginBottom: 10 },
  roleChip: { backgroundColor: COLORS.navySurface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.navyBorder },
  roleChipText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted, letterSpacing: 0.5 },
  section: { marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "55" },
  infoIcon: { width: 28, alignItems: "center" },
  infoContent: { flex: 1 },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  expandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pwField: { marginBottom: 12 },
  pwLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  pwInput: { backgroundColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder, marginBottom: 2 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.red + "18", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.red + "40", marginBottom: 12 },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.red, lineHeight: 17 },
  successBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.emerald + "18", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.emerald + "40", marginBottom: 12 },
  successText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.emerald },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.red + "15", borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: COLORS.red + "30" },
  logoutText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.red },
  deleteWarningBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.amber + "18", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.amber + "44", marginBottom: 12 },
  deleteWarningText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.amber, lineHeight: 17 },
  deleteAccountBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.red, borderRadius: 10, paddingVertical: 12 },
  deleteAccountBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.white },
  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 14 },
  navRowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  navRowLabel: { fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.text },
  navDivider: { height: 1, backgroundColor: COLORS.navyBorder + "55", marginHorizontal: 16 },
});
