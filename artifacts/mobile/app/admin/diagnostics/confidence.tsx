import React from "react";
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

interface ConfidenceItem {
  id: string;
  canonicalName: string;
  sourceType: string;
  sourceConfidence: number;
  adminFlags: string[];
  updatedAt: string;
  createdAt: string;
  daysSinceUpdate: number;
}

interface ConfidenceData {
  items: ConfidenceItem[];
  total: number;
}

function confidenceColor(score: number): string {
  if (score >= 0.7) return COLORS.emerald;
  if (score >= 0.5) return COLORS.amber;
  return COLORS.red;
}

function ConfBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = confidenceColor(score);
  return (
    <View style={styles.confBarWrap}>
      <View style={[styles.confBar, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export default function AdminDiagnosticsConfidenceScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, refetch, isRefetching } = useQuery<ConfidenceData>({
    queryKey: ["adminDiagnosticsConfidence"],
    queryFn: () => adminFetch("/admin/diagnostics/confidence-review"),
    enabled: isAdminAuthenticated,
  });

  const items = data?.items ?? [];

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/(tabs)/diagnostics" },
        { label: "Confidence Review" },
      ]} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.amber} />}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Confidence Review Queue</Text>
          {data && <Text style={styles.countText}>{data.total} record{data.total !== 1 ? "s" : ""}</Text>}
        </View>

        <View style={styles.infoBox}>
          <Feather name="info" size={14} color={COLORS.textDim} />
          <Text style={styles.infoText}>
            Records with source confidence below 0.7 for workspace-promoted or manually entered orgs, or below 0.5 overall.
          </Text>
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}><ActivityIndicator color={COLORS.amber} /></View>
        ) : items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Feather name="check-circle" size={28} color={COLORS.emerald} />
            <Text style={styles.emptyTitle}>Queue is clear</Text>
            <Text style={styles.emptyDesc}>All records meet confidence thresholds.</Text>
          </View>
        ) : (
          items.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => router.push(`/admin/master-organizations/${item.id}` as Href)}
              activeOpacity={0.7}
            >
              <View style={styles.cardTop}>
                <Text style={styles.orgName} numberOfLines={1}>{item.canonicalName}</Text>
                <Text style={[styles.confScore, { color: confidenceColor(item.sourceConfidence) }]}>
                  {Math.round(item.sourceConfidence * 100)}%
                </Text>
              </View>
              <ConfBar score={item.sourceConfidence} />
              <View style={styles.cardMeta}>
                <Text style={styles.sourceType}>{item.sourceType.replace(/_/g, " ")}</Text>
                <Text style={styles.daysSince}>
                  {item.daysSinceUpdate === 0 ? "Updated today" : `${item.daysSinceUpdate}d ago`}
                </Text>
              </View>
              {item.adminFlags.length > 0 && (
                <View style={styles.flagsRow}>
                  {item.adminFlags.map(f => (
                    <View key={f} style={styles.flagChip}>
                      <Text style={styles.flagText}>{f.replace(/_/g, " ")}</Text>
                    </View>
                  ))}
                </View>
              )}
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
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  countText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  infoBox: {
    flexDirection: "row", gap: 8, alignItems: "flex-start",
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, marginBottom: 16,
  },
  infoText: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  loadingRow: { alignItems: "center", paddingVertical: 40 },
  emptyCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 32, alignItems: "center", gap: 8,
  },
  emptyTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyDesc: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  card: {
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 14, marginBottom: 10, gap: 6,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  orgName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  confScore: { fontSize: 14, fontFamily: "Inter_700Bold", marginLeft: 8 },
  confBarWrap: { height: 4, backgroundColor: COLORS.navyBorder, borderRadius: 2, overflow: "hidden" },
  confBar: { height: "100%", borderRadius: 2 },
  cardMeta: { flexDirection: "row", justifyContent: "space-between" },
  sourceType: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },
  daysSince: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  flagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  flagChip: { backgroundColor: COLORS.amber + "22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  flagText: { color: COLORS.amber, fontSize: 10, fontFamily: "Inter_500Medium" },
});
