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

interface RelIntegrityData {
  orphanedRelationships: { id: string; parent_id: string; child_id: string; relationship_type: string }[];
  circularRelationships: { child_id: string; parent_id: string; grandparent_id: string; child_name: string; parent_name: string }[];
  lowConfidenceRelationships: { id: string; parent_id: string; child_id: string; relationship_type: string; confidence_score: string; parent_name: string; child_name: string }[];
  hasIssues: boolean;
}

export default function AdminDiagnosticsRelationshipsScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [tab, setTab] = useState<"orphaned" | "circular" | "lowconf">("orphaned");

  const { data, isLoading, refetch, isRefetching } = useQuery<RelIntegrityData>({
    queryKey: ["adminDiagnosticsRelationships"],
    queryFn: () => adminFetch("/admin/diagnostics/relationship-integrity"),
    enabled: isAdminAuthenticated,
  });

  const tabs: { key: typeof tab; label: string; count: number }[] = [
    { key: "orphaned", label: "Orphaned", count: data?.orphanedRelationships?.length ?? 0 },
    { key: "circular", label: "Circular", count: data?.circularRelationships?.length ?? 0 },
    { key: "lowconf", label: "Low Conf.", count: data?.lowConfidenceRelationships?.length ?? 0 },
  ];

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/diagnostics" },
        { label: "Relationship Integrity" },
      ]} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.amber} />}
      >
        <Text style={styles.title}>Relationship Integrity</Text>

        <View style={styles.tabRow}>
          {tabs.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label} {t.count > 0 ? `(${t.count})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}><ActivityIndicator color={COLORS.amber} /></View>
        ) : tab === "orphaned" ? (
          data?.orphanedRelationships?.length === 0 ? (
            <EmptyCard message="No orphaned relationships found." />
          ) : (
            data?.orphanedRelationships.map(r => (
              <View key={r.id} style={styles.card}>
                <Text style={styles.cardLabel}>Orphaned Relationship</Text>
                <Text style={styles.cardMeta}>Parent ID: {r.parent_id.slice(0, 8)}…</Text>
                <Text style={styles.cardMeta}>Child ID: {r.child_id.slice(0, 8)}…</Text>
                <Text style={[styles.typeBadge]}>{r.relationship_type}</Text>
              </View>
            ))
          )
        ) : tab === "circular" ? (
          data?.circularRelationships?.length === 0 ? (
            <EmptyCard message="No circular relationships detected." />
          ) : (
            data?.circularRelationships.map((r, i) => (
              <View key={i} style={[styles.card, { borderColor: COLORS.red + "55" }]}>
                <Text style={[styles.cardLabel, { color: COLORS.red }]}>Circular Reference</Text>
                <TouchableOpacity onPress={() => router.push(`/admin/master-organizations/${r.child_id}` as Href)}>
                  <Text style={styles.orgLink}>{r.child_name}</Text>
                </TouchableOpacity>
                <Feather name="arrow-down" size={12} color={COLORS.textDim} style={{ marginLeft: 8 }} />
                <TouchableOpacity onPress={() => router.push(`/admin/master-organizations/${r.parent_id}` as Href)}>
                  <Text style={styles.orgLink}>{r.parent_name}</Text>
                </TouchableOpacity>
                <Text style={styles.cardMeta}>→ and back (2-hop cycle)</Text>
              </View>
            ))
          )
        ) : (
          data?.lowConfidenceRelationships?.length === 0 ? (
            <EmptyCard message="No low-confidence relationships." />
          ) : (
            data?.lowConfidenceRelationships.map(r => (
              <TouchableOpacity
                key={r.id}
                style={styles.card}
                onPress={() => router.push(`/admin/master-organizations/${r.parent_id}` as Href)}
                activeOpacity={0.7}
              >
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel} numberOfLines={1}>{r.parent_name}</Text>
                  <View style={styles.confBadge}>
                    <Text style={styles.confText}>{(parseFloat(r.confidence_score) * 100).toFixed(0)}%</Text>
                  </View>
                </View>
                <Text style={styles.cardMeta}>{r.relationship_type} → {r.child_name}</Text>
              </TouchableOpacity>
            ))
          )
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <View style={styles.emptyCard}>
      <Feather name="check-circle" size={28} color={COLORS.emerald} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  title: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 16 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingVertical: 9, alignItems: "center", backgroundColor: COLORS.navyCard,
  },
  tabActive: { borderColor: COLORS.amber, backgroundColor: "#2A1F00" },
  tabText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_500Medium" },
  tabTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  loadingRow: { alignItems: "center", paddingVertical: 40 },
  emptyCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 32, alignItems: "center", gap: 10,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: {
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 14, marginBottom: 8, gap: 4,
  },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLabel: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  cardMeta: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular" },
  typeBadge: { color: COLORS.amber, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  confBadge: { backgroundColor: COLORS.red + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  confText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_700Bold" },
  orgLink: { color: COLORS.cyan, fontSize: 13, fontFamily: "Inter_500Medium" },
});
