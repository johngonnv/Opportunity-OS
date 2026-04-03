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

interface DuplicateGroup {
  type: "normalized_name" | "domain";
  key: string;
  ids: string[];
  names: string[];
  count: number;
}

interface DuplicatesData {
  duplicateGroups: DuplicateGroup[];
  total: number;
}

const TYPE_COLORS: Record<string, { color: string; label: string }> = {
  normalized_name: { color: COLORS.red, label: "Name Match" },
  domain: { color: COLORS.amber, label: "Domain Match" },
};

export default function AdminDiagnosticsDuplicatesScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [filter, setFilter] = useState<"ALL" | "normalized_name" | "domain">("ALL");

  const { data, isLoading, refetch, isRefetching } = useQuery<DuplicatesData>({
    queryKey: ["adminDiagnosticsDuplicates"],
    queryFn: () => adminFetch("/admin/diagnostics/duplicates"),
    enabled: isAdminAuthenticated,
  });

  const groups = (data?.duplicateGroups ?? []).filter(g => filter === "ALL" || g.type === filter);

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/diagnostics" },
        { label: "Duplicate Finder" },
      ]} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.amber} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Duplicate Finder</Text>
          {data && <Text style={styles.countText}>{data.total} group{data.total !== 1 ? "s" : ""}</Text>}
        </View>

        <View style={styles.filterRow}>
          {(["ALL", "normalized_name", "domain"] as const).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, filter === f && styles.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
                {f === "ALL" ? "All" : f === "normalized_name" ? "Name" : "Domain"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}><ActivityIndicator color={COLORS.amber} /></View>
        ) : groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="check-circle" size={28} color={COLORS.emerald} />
            <Text style={styles.emptyTitle}>No duplicates found</Text>
            <Text style={styles.emptyDesc}>No groups share the same normalized name or domain.</Text>
          </View>
        ) : (
          groups.map((group, idx) => {
            const cfg = TYPE_COLORS[group.type] ?? { color: COLORS.textDim, label: group.type };
            return (
              <View key={idx} style={[styles.groupCard, { borderColor: cfg.color + "44" }]}>
                <View style={styles.groupHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: cfg.color + "22" }]}>
                    <Text style={[styles.typeBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
                  </View>
                  <Text style={styles.groupKey} numberOfLines={1}>{group.key}</Text>
                  <Text style={[styles.groupCount, { color: cfg.color }]}>{group.count}×</Text>
                </View>
                <View style={styles.groupOrgs}>
                  {group.names.map((name, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.orgRow}
                      onPress={() => router.push(`/admin/master-organizations/${group.ids[i]}` as Href)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.orgName} numberOfLines={1}>{name}</Text>
                      <Feather name="arrow-right" size={14} color={COLORS.textDim} />
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  countText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  filterChip: {
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingHorizontal: 14, paddingVertical: 6, backgroundColor: COLORS.navyCard,
  },
  filterChipActive: { borderColor: COLORS.red, backgroundColor: "#2A0A0A" },
  filterChipText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_500Medium" },
  filterChipTextActive: { color: COLORS.red },
  loadingRow: { alignItems: "center", paddingVertical: 40 },
  emptyCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 32, alignItems: "center", gap: 8,
  },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  groupCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    marginBottom: 12, overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  typeBadge: { borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  groupKey: { flex: 1, color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular" },
  groupCount: { fontSize: 13, fontFamily: "Inter_700Bold" },
  groupOrgs: { paddingHorizontal: 14, paddingVertical: 8, gap: 2 },
  orgRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "55",
  },
  orgName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
});
