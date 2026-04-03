import React from "react";
import {
  View, Text, ScrollView, StyleSheet,
  ActivityIndicator, RefreshControl, TouchableOpacity,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";

interface WorkspaceCoverageItem {
  workspaceId: string;
  workspaceName: string;
  totalOrgs: number;
  linkedOrgs: number;
  unlinkedOrgs: number;
  coveragePercent: number;
  healthStatus: "GOOD" | "PARTIAL" | "LOW";
}

interface CoverageResult {
  workspaces: WorkspaceCoverageItem[];
  totals: {
    totalOrgs: number;
    linkedOrgs: number;
    unlinkedOrgs: number;
    coveragePercent: number;
  };
}

const HEALTH_COLORS: Record<string, string> = {
  GOOD: COLORS.emerald,
  PARTIAL: COLORS.amber,
  LOW: COLORS.red ?? "#FF6B6B",
};

function CoverageBar({ percent, color }: { percent: number; color: string }) {
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { width: `${percent}%` as any, backgroundColor: color }]} />
    </View>
  );
}

function WorkspaceRow({ item, onViewUnlinked }: { item: WorkspaceCoverageItem; onViewUnlinked: () => void }) {
  const color = HEALTH_COLORS[item.healthStatus];

  return (
    <View style={[styles.wsRow, { borderColor: color + "33" }]}>
      <View style={styles.wsRowTop}>
        <View style={styles.wsRowLeft}>
          <Text style={styles.wsName} numberOfLines={1}>{item.workspaceName}</Text>
          <Text style={styles.wsMeta}>
            {item.linkedOrgs} / {item.totalOrgs} linked
          </Text>
        </View>
        <View style={styles.wsRowRight}>
          <Text style={[styles.wsPercent, { color }]}>{item.coveragePercent}%</Text>
          <View style={[styles.wsHealth, { backgroundColor: color + "22" }]}>
            <Text style={[styles.wsHealthText, { color }]}>{item.healthStatus}</Text>
          </View>
        </View>
      </View>
      <CoverageBar percent={item.coveragePercent} color={color} />
      {item.unlinkedOrgs > 0 && (
        <TouchableOpacity style={styles.viewUnlinkedBtn} onPress={onViewUnlinked}>
          <Text style={styles.viewUnlinkedText}>{item.unlinkedOrgs} unlinked</Text>
          <Feather name="chevron-right" size={12} color={COLORS.amber} />
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function WorkspaceCoverageScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, refetch, isRefetching } = useQuery<CoverageResult>({
    queryKey: ["workspaceCoverage"],
    queryFn: () => adminFetch("/admin/diagnostics/workspace-coverage"),
    enabled: isAdminAuthenticated,
  });

  const workspaces = data?.workspaces ?? [];
  const totals = data?.totals;

  return (
    <View style={styles.container}>
      <AdminHeader title="Workspace Coverage" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.emerald} />}
      >
        {isLoading ? (
          <ActivityIndicator color={COLORS.emerald} style={{ marginTop: 40 }} />
        ) : (
          <>
            {/* Overall summary */}
            {totals && (
              <View style={styles.summaryCard}>
                <Text style={styles.sectionLabel}>Overall Coverage</Text>
                <View style={styles.summaryRow}>
                  <View style={styles.summaryMetric}>
                    <Text style={styles.summaryValue}>{totals.totalOrgs}</Text>
                    <Text style={styles.summaryLabel}>Total Orgs</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryValue, { color: COLORS.emerald }]}>{totals.linkedOrgs}</Text>
                    <Text style={styles.summaryLabel}>Linked</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryValue, { color: COLORS.amber }]}>{totals.unlinkedOrgs}</Text>
                    <Text style={styles.summaryLabel}>Unlinked</Text>
                  </View>
                  <View style={styles.summaryMetric}>
                    <Text style={[styles.summaryValue, { color: totals.coveragePercent >= 80 ? COLORS.emerald : COLORS.amber }]}>
                      {totals.coveragePercent}%
                    </Text>
                    <Text style={styles.summaryLabel}>Coverage</Text>
                  </View>
                </View>
                <CoverageBar
                  percent={totals.coveragePercent}
                  color={totals.coveragePercent >= 80 ? COLORS.emerald : totals.coveragePercent >= 50 ? COLORS.amber : COLORS.red ?? "#FF6B6B"}
                />
              </View>
            )}

            <Text style={styles.sectionLabel}>By Workspace</Text>
            {workspaces.map(ws => (
              <WorkspaceRow
                key={ws.workspaceId}
                item={ws}
                onViewUnlinked={() => router.push(`/admin/diagnostics/structure?workspaceId=${ws.workspaceId}` as Href)}
              />
            ))}

            {workspaces.length === 0 && (
              <Text style={styles.empty}>No workspaces found.</Text>
            )}

            <View style={{ height: 40 }} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 32, gap: 10 },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6, marginTop: 6,
  },
  summaryCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, padding: 14, gap: 12,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-around" },
  summaryMetric: { alignItems: "center", gap: 2 },
  summaryValue: { color: COLORS.text, fontSize: 22, fontFamily: "Inter_700Bold" },
  summaryLabel: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_400Regular" },
  wsRow: {
    backgroundColor: COLORS.navyCard, borderRadius: 10,
    borderWidth: 1, padding: 12, gap: 8,
  },
  wsRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  wsRowLeft: { flex: 1, gap: 2 },
  wsName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  wsMeta: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  wsRowRight: { alignItems: "flex-end", gap: 4 },
  wsPercent: { fontSize: 18, fontFamily: "Inter_700Bold" },
  wsHealth: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  wsHealthText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  barTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.navyBorder, overflow: "hidden" },
  barFill: { height: 4, borderRadius: 2 },
  viewUnlinkedBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  viewUnlinkedText: { color: COLORS.amber, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  empty: { color: COLORS.textMuted, textAlign: "center", paddingTop: 40, fontFamily: "Inter_400Regular" },
});
