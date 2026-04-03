import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface OrgRow {
  id: string;
  canonical_name: string;
  source_type: string;
  source_confidence?: string;
  admin_flags?: string[];
  created_at?: string;
  updated_at?: string;
}

interface StructureData {
  isolatedOrgs: OrgRow[];
  flaggedOrgs: OrgRow[];
  totalIsolated: number;
  totalFlagged: number;
}

export default function AdminDiagnosticsStructureScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [tab, setTab] = useState<"isolated" | "flagged">("isolated");

  const { data, isLoading, refetch, isRefetching } = useQuery<StructureData>({
    queryKey: ["adminDiagnosticsStructure"],
    queryFn: () => adminFetch("/admin/diagnostics/structure-coverage"),
    enabled: isAdminAuthenticated,
  });

  const items: OrgRow[] = tab === "isolated" ? (data?.isolatedOrgs ?? []) : (data?.flaggedOrgs ?? []);

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/diagnostics" as Href },
        { label: "Structure Coverage" },
      ]} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.amber} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Structure Coverage</Text>
        </View>

        <View style={styles.tabRow}>
          <TouchableOpacity style={[styles.tab, tab === "isolated" && styles.tabActive]} onPress={() => setTab("isolated")}>
            <Text style={[styles.tabText, tab === "isolated" && styles.tabTextActive]}>
              Isolated ({data?.totalIsolated ?? 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === "flagged" && styles.tabActive]} onPress={() => setTab("flagged")}>
            <Text style={[styles.tabText, tab === "flagged" && styles.tabTextActive]}>
              Flagged ({data?.totalFlagged ?? 0})
            </Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}><ActivityIndicator color={COLORS.amber} /></View>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="check-circle" size={28} color={COLORS.emerald} />
            <Text style={styles.emptyTitle}>All clear</Text>
            <Text style={styles.emptyDesc}>
              {tab === "isolated" ? "All records have at least one relationship." : "No records are flagged."}
            </Text>
          </View>
        ) : (
          items.map(org => (
            <TouchableOpacity
              key={org.id}
              style={styles.row}
              onPress={() => router.push(`/admin/master-organizations/${org.id}` as Href)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.rowName} numberOfLines={1}>{org.canonical_name}</Text>
                <View style={styles.rowMeta}>
                  <Text style={styles.rowSource}>{org.source_type}</Text>
                  {(org.admin_flags ?? []).length > 0 && (
                    <Text style={styles.rowFlags}>{(org.admin_flags ?? []).join(", ")}</Text>
                  )}
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={COLORS.textDim} />
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  headerRow: { marginBottom: 16 },
  title: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingVertical: 9, alignItems: "center", backgroundColor: COLORS.navyCard,
  },
  tabActive: { borderColor: COLORS.amber, backgroundColor: "#2A1F00" },
  tabText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_500Medium" },
  tabTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  loadingRow: { alignItems: "center", paddingVertical: 40 },
  emptyCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 32, alignItems: "center", gap: 8,
  },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  rowLeft: { flex: 1, marginRight: 8 },
  rowName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" },
  rowMeta: { flexDirection: "row", gap: 8, marginTop: 3, flexWrap: "wrap" },
  rowSource: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },
  rowFlags: { color: COLORS.amber, fontSize: 11, fontFamily: "Inter_500Medium" },
});
