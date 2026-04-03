import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface AdminStats {
  totalWorkspaces: number;
  totalMembers: number;
  totalTemplates: number;
  activeTemplates: number;
  totalMasterOrgs: number;
  recentScans: RecentScan[];
}

interface RecentScan {
  id: string;
  scanStatus: string;
  reviewStatus: string;
  organizationId: string;
  workspaceId: string;
  organizationName: string | null;
  createdAt: string;
}

const SCAN_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  PENDING: { color: COLORS.textDim, label: "Pending" },
  MASTER_MATCHED: { color: COLORS.amber, label: "Matching" },
  EXTERNAL_SEARCHED: { color: COLORS.amber, label: "Searching" },
  LLM_REVIEWED: { color: COLORS.amber, label: "AI Review" },
  COMPLETED: { color: COLORS.emerald, label: "Completed" },
  FAILED: { color: COLORS.red, label: "Failed" },
};

const REVIEW_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  PENDING_REVIEW: { color: COLORS.amber, label: "Needs Review" },
  APPROVED: { color: COLORS.emerald, label: "Approved" },
  REJECTED: { color: COLORS.red, label: "Rejected" },
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export default function AdminDashboardScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, refetch, isRefetching } = useQuery<AdminStats>({
    queryKey: ["adminStats"],
    queryFn: () => adminFetch("/admin/stats"),
    enabled: isAdminAuthenticated,
    refetchInterval: 30000,
  });

  const stats = data;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={refetch}
            tintColor={COLORS.amber}
          />
        }
      >
        <Text style={styles.sectionLabel}>Platform Overview</Text>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.amber} />
            <Text style={styles.loadingText}>Loading stats…</Text>
          </View>
        ) : (
          <View style={styles.kpiGrid}>
            <StatCard
              icon="briefcase"
              value={stats?.totalWorkspaces ?? 0}
              label="Workspaces"
              color={COLORS.blue}
            />
            <StatCard
              icon="users"
              value={stats?.totalMembers ?? 0}
              label="Total Members"
              color={COLORS.purple}
            />
            <StatCard
              icon="layers"
              value={stats?.activeTemplates ?? 0}
              sublabel={`of ${stats?.totalTemplates ?? 0} total`}
              label="Active Templates"
              color={COLORS.amber}
            />
            <StatCard
              icon="database"
              value={stats?.totalMasterOrgs ?? 0}
              label="Master Orgs"
              color={COLORS.emerald}
            />
          </View>
        )}

        <Text style={styles.sectionLabel}>Quick Actions</Text>
        <View style={styles.quickActionsRow}>
          <TouchableOpacity
            style={[styles.quickActionBtn, { borderColor: COLORS.amber }]}
            onPress={() => router.push("/admin/templates/new" as Href)}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={15} color={COLORS.amber} />
            <Text style={[styles.quickActionText, { color: COLORS.amber }]}>New Template</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickActionBtn, { borderColor: COLORS.emerald }]}
            onPress={() => router.push("/admin/master-organizations/new" as Href)}
            activeOpacity={0.8}
          >
            <Feather name="plus" size={15} color={COLORS.emerald} />
            <Text style={[styles.quickActionText, { color: COLORS.emerald }]}>Add Master Org</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickActionBtn, { borderColor: COLORS.cyan }]}
            onPress={() => router.push("/admin/logo-scan/new" as Href)}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={15} color={COLORS.cyan} />
            <Text style={[styles.quickActionText, { color: COLORS.cyan }]}>Logo Scan</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionLabel}>Recent Structure Scans</Text>
        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.amber} size="small" />
          </View>
        ) : !stats?.recentScans?.length ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No structure scans yet.</Text>
          </View>
        ) : (
          <View style={styles.scansCard}>
            {stats.recentScans.map((scan, idx) => {
              const scanCfg = SCAN_STATUS_CONFIG[scan.scanStatus] ?? { color: COLORS.textDim, label: scan.scanStatus };
              const reviewCfg = REVIEW_STATUS_CONFIG[scan.reviewStatus] ?? { color: COLORS.textDim, label: scan.reviewStatus };
              const isLast = idx === stats.recentScans.length - 1;
              return (
                <TouchableOpacity
                  key={scan.id}
                  style={[styles.scanRow, !isLast && styles.scanRowBorder]}
                  onPress={() => router.push(`/admin/structure-scans/${scan.id}` as Href)}
                  activeOpacity={0.7}
                >
                  <View style={styles.scanLeft}>
                    <Text style={styles.scanOrgName} numberOfLines={1}>
                      {scan.organizationName ?? "Unknown Org"}
                    </Text>
                    <Text style={styles.scanTime}>{formatRelativeTime(scan.createdAt)}</Text>
                  </View>
                  <View style={styles.scanRight}>
                    <View style={styles.scanBadges}>
                      <View style={[styles.badge, { borderColor: scanCfg.color + "55" }]}>
                        <Text style={[styles.badgeText, { color: scanCfg.color }]}>{scanCfg.label}</Text>
                      </View>
                      {scan.scanStatus === "COMPLETED" && (
                        <View style={[styles.badge, { borderColor: reviewCfg.color + "55" }]}>
                          <Text style={[styles.badgeText, { color: reviewCfg.color }]}>{reviewCfg.label}</Text>
                        </View>
                      )}
                    </View>
                    <Feather name="chevron-right" size={14} color={COLORS.textDim} style={styles.scanChevron} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({
  icon,
  value,
  label,
  sublabel,
  color,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  value: number;
  label: string;
  sublabel?: string;
  color: string;
}) {
  return (
    <View style={[styles.kpiCard, { borderColor: color + "33" }]}>
      <View style={[styles.kpiIconWrap, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value.toLocaleString()}</Text>
      {sublabel ? (
        <Text style={styles.kpiSublabel}>{sublabel}</Text>
      ) : null}
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 4,
  },

  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 20,
    justifyContent: "center",
  },
  loadingText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },

  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  kpiCard: {
    width: "47%",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  kpiValue: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    lineHeight: 30,
  },
  kpiSublabel: {
    color: COLORS.textDim,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 14,
  },
  kpiLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },

  quickActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 20,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.navyCard,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
  },
  quickActionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },

  scansCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    overflow: "hidden",
    marginBottom: 8,
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scanRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  scanLeft: { flex: 1, marginRight: 8 },
  scanOrgName: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  scanTime: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  scanRight: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 0 },
  scanBadges: { flexDirection: "row", gap: 5 },
  scanChevron: { marginLeft: 2 },
  badge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },

  emptyCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 24,
    alignItems: "center",
    marginBottom: 8,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
});
