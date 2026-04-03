import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface AdminHeaderProps {
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export function AdminHeader({ breadcrumbs = [] }: AdminHeaderProps) {
  const { adminLogout, adminUser } = useAdminAuthContext();
  const router = useRouter();

  async function handleSignOut() {
    await adminLogout();
    router.replace("/admin/login");
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ADMIN</Text>
          </View>
          <Text style={styles.title}>Internal Admin — Opportunity OS</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => router.push("/admin/templates")}>
          <Text style={styles.navItem}>Templates</Text>
        </TouchableOpacity>
        <Text style={styles.navSep}>/</Text>
        <TouchableOpacity onPress={() => router.push("/admin/workspaces")}>
          <Text style={styles.navItem}>Workspaces</Text>
        </TouchableOpacity>
        <Text style={styles.navSep}>/</Text>
        <TouchableOpacity onPress={() => router.push("/admin/master-organizations" as any)}>
          <Text style={styles.navItem}>Master Orgs</Text>
        </TouchableOpacity>
        {breadcrumbs.length > 0 && breadcrumbs.map((bc, i) => (
          <React.Fragment key={i}>
            <Text style={styles.navSep}>/</Text>
            <TouchableOpacity onPress={() => bc.href ? router.push(bc.href as any) : undefined} disabled={!bc.href}>
              <Text style={[styles.navItem, !bc.href && styles.navItemActive]}>{bc.label}</Text>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#1C1204",
    borderBottomWidth: 1,
    borderBottomColor: "#3D2A00",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  badge: {
    backgroundColor: "#2D1B00",
    borderColor: COLORS.amber,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: { color: COLORS.amber, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 1.5 },
  title: { color: COLORS.amber, fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
  signOutBtn: {
    backgroundColor: "#2D1B00",
    borderColor: COLORS.amber,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  signOutText: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_500Medium" },
  navRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4 },
  navItem: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  navItemActive: { color: COLORS.text, fontFamily: "Inter_600SemiBold" },
  navSep: { color: COLORS.textDim, fontSize: 13 },
});
