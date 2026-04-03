import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter, type Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface AdminHeaderProps {
  breadcrumbs?: Array<{ label: string; href?: Href }>;
}

export function AdminHeader({ breadcrumbs = [] }: AdminHeaderProps) {
  const { adminLogout } = useAdminAuthContext();
  const router = useRouter();

  async function handleSignOut() {
    await adminLogout();
    router.replace("/admin/login");
  }

  const backTarget = breadcrumbs.find(bc => bc.href);

  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else if (backTarget?.href) {
      router.replace(backTarget.href);
    } else {
      router.replace("/admin/(tabs)/dashboard" as Href);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.titleRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>ADMIN</Text>
          </View>
          <Text style={styles.title} numberOfLines={1}>Internal Admin — Opportunity OS</Text>
        </View>
        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      {breadcrumbs.length > 0 && (
        <View style={styles.navRow}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="chevron-left" size={18} color={COLORS.amber} />
            <Text style={styles.backLabel}>
              {backTarget?.label ?? "Back"}
            </Text>
          </TouchableOpacity>

          <View style={styles.breadcrumbRow}>
            {breadcrumbs.map((bc, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Text style={styles.breadcrumbSep}>›</Text>}
                <TouchableOpacity
                  onPress={() => bc.href ? router.push(bc.href) : undefined}
                  disabled={!bc.href}
                >
                  <Text style={[styles.breadcrumbItem, bc.href ? styles.breadcrumbLink : styles.breadcrumbCurrent]}>
                    {bc.label}
                  </Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </View>
        </View>
      )}
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

  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingVertical: 4,
    paddingRight: 8,
    borderRightWidth: 1,
    borderRightColor: "#3D2A00",
  },
  backLabel: {
    color: COLORS.amber,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  breadcrumbRow: { flexDirection: "row", alignItems: "center", gap: 5, flex: 1, flexWrap: "wrap" },
  breadcrumbSep: { color: COLORS.textDim, fontSize: 13 },
  breadcrumbItem: { fontSize: 13 },
  breadcrumbLink: { color: COLORS.amber, fontFamily: "Inter_500Medium" },
  breadcrumbCurrent: { color: COLORS.text, fontFamily: "Inter_600SemiBold" },
});
