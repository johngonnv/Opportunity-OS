import React from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface DiagnosticSummary {
  totalMasterOrgs: number;
  duplicateSuspects: number;
  isolatedRecords: number;
  lowConfidence: number;
  staleRecords: number;
  missingDomain?: number;
  missingIndustry?: number;
  unvalidated?: number;
  pendingAiSuggestions?: number;
  unlinkedWorkspaceOrgs?: number;
  pendingOrgPromotions?: number;
  pendingContactPromotions?: number;
  pendingNotePromotions?: number;
  pendingPromotions?: number;
}

interface SummaryCardProps {
  label: string;
  value: number;
  color: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  alert?: boolean;
}

function SummaryCard({ label, value, color, icon, alert }: SummaryCardProps) {
  return (
    <View style={[styles.summaryCard, { borderColor: color + "33" }, alert && value > 0 ? styles.summaryCardAlert : null]}>
      <View style={[styles.summaryIconWrap, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={[styles.summaryValue, { color: alert && value > 0 ? color : COLORS.text }]}>
        {value.toLocaleString()}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

interface DiagTileProps {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  description: string;
  color: string;
  count?: number;
  onPress: () => void;
}

function DiagTile({ icon, label, description, color, count, onPress }: DiagTileProps) {
  return (
    <TouchableOpacity style={[styles.diagTile, { borderColor: color + "33" }]} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.diagTileLeft}>
        <View style={[styles.diagTileIcon, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={20} color={color} />
        </View>
        <View style={styles.diagTileText}>
          <Text style={[styles.diagTileLabel, { color }]}>{label}</Text>
          <Text style={styles.diagTileDesc}>{description}</Text>
        </View>
      </View>
      <View style={styles.diagTileRight}>
        {count !== undefined && count > 0 ? (
          <View style={[styles.diagTileBadge, { backgroundColor: color + "22" }]}>
            <Text style={[styles.diagTileBadgeText, { color }]}>{count}</Text>
          </View>
        ) : null}
        <Feather name="chevron-right" size={18} color={COLORS.textDim} />
      </View>
    </TouchableOpacity>
  );
}

export default function AdminDiagnosticsScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, refetch, isRefetching } = useQuery<DiagnosticSummary>({
    queryKey: ["adminDiagnosticsSummary"],
    queryFn: () => adminFetch("/admin/diagnostics/summary"),
    enabled: isAdminAuthenticated,
  });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.amber} />}
      >
        <Text style={styles.sectionLabel}>Database Health</Text>

        {isLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.amber} />
          </View>
        ) : (
          <View style={styles.summaryGrid}>
            <SummaryCard label="Total Master Orgs" value={data?.totalMasterOrgs ?? 0} color={COLORS.emerald} icon="database" />
            <SummaryCard label="Duplicate Suspects" value={data?.duplicateSuspects ?? 0} color={COLORS.red} icon="copy" alert />
            <SummaryCard label="Isolated Records" value={data?.isolatedRecords ?? 0} color={COLORS.amber} icon="alert-triangle" alert />
            <SummaryCard label="Low Confidence" value={data?.lowConfidence ?? 0} color={COLORS.purple} icon="sliders" alert />
            <SummaryCard label="Stale Records" value={data?.staleRecords ?? 0} color={COLORS.textDim} icon="clock" alert />
            <SummaryCard label="Pending Promotions" value={data?.pendingPromotions ?? 0} color={COLORS.amber} icon="upload" alert />
          </View>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Diagnostic Tools</Text>

        <DiagTile
          icon="copy"
          label="Duplicate Finder"
          description="Exact name matches, shared domains, alias collisions"
          color={COLORS.red}
          count={data?.duplicateSuspects}
          onPress={() => router.push("/admin/diagnostics/duplicates" as Href)}
        />
        <DiagTile
          icon="git-branch"
          label="Structure Coverage"
          description="Isolated orgs with no relationships, flagged records"
          color={COLORS.amber}
          count={data?.isolatedRecords}
          onPress={() => router.push("/admin/diagnostics/structure" as Href)}
        />
        <DiagTile
          icon="alert-circle"
          label="Relationship Integrity"
          description="Orphaned children, circular links, low-confidence edges"
          color={COLORS.amber}
          onPress={() => router.push("/admin/diagnostics/relationships" as Href)}
        />
        <DiagTile
          icon="sliders"
          label="Confidence Review Queue"
          description="Records below confidence threshold needing review"
          color={COLORS.purple}
          count={data?.lowConfidence}
          onPress={() => router.push("/admin/diagnostics/confidence" as Href)}
        />
        <DiagTile
          icon="globe"
          label="Domain Diagnostics"
          description="Missing domains, duplicate roots, malformed entries"
          color={COLORS.cyan}
          onPress={() => router.push("/admin/diagnostics/domain" as Href)}
        />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Completeness &amp; Enrichment</Text>

        <DiagTile
          icon="bar-chart-2"
          label="Completeness Audit"
          description="Field-by-field scoring: INCOMPLETE → IDENTIFIED → STRUCTURED → STRATEGIC"
          color={COLORS.emerald}
          count={data?.unvalidated}
          onPress={() => router.push("/admin/completeness-audit" as Href)}
        />
        <DiagTile
          icon="zap"
          label="AI Enrichment Queue"
          description="AI-suggested values awaiting human approval before writeback"
          color={COLORS.cyan}
          count={data?.pendingAiSuggestions}
          onPress={() => router.push("/admin/ai-suggestions" as Href)}
        />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Workspace Coverage</Text>

        <DiagTile
          icon="layers"
          label="Workspace-to-Master Coverage"
          description="Orgs per workspace linked vs. unlinked to master organizations"
          color={COLORS.amber}
          count={data?.unlinkedWorkspaceOrgs}
          onPress={() => router.push("/admin/workspace-coverage" as Href)}
        />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Promotion Queue</Text>

        <DiagTile
          icon="upload"
          label="Org Validation Queue"
          description="New and updated workspace organizations awaiting master promotion"
          color={COLORS.amber}
          count={data?.pendingOrgPromotions}
          onPress={() => router.push("/admin/diagnostics/org-promotions" as Href)}
        />
        <DiagTile
          icon="user-check"
          label="Contact Validation Queue"
          description="New and updated workspace contacts awaiting master promotion"
          color={COLORS.cyan}
          count={data?.pendingContactPromotions}
          onPress={() => router.push("/admin/diagnostics/contact-promotions" as Href)}
        />
        <DiagTile
          icon="file-text"
          label="Notes Validation Queue"
          description="Notes added to workspace contacts and orgs needing review"
          color={COLORS.purple}
          count={data?.pendingNotePromotions}
          onPress={() => router.push("/admin/diagnostics/note-promotions" as Href)}
        />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Client Onboarding</Text>

        <DiagTile
          icon="user-plus"
          label="Onboarding Sessions"
          description="Manage intake, AI recommendations, review, and provisioning for new clients"
          color={COLORS.amber}
          onPress={() => router.push("/admin/onboarding" as Href)}
        />
        <DiagTile
          icon="package"
          label="Onboarding Presets"
          description="Reusable vertical configurations to accelerate new client setup"
          color={COLORS.purple}
          onPress={() => router.push("/admin/onboarding/presets" as Href)}
        />
        <DiagTile
          icon="check-square"
          label="Launch Checklists"
          description="Per-workspace post-provisioning launch checklists — select a workspace to review"
          color={COLORS.emerald}
          onPress={() => router.push("/admin/(tabs)/workspaces" as Href)}
        />

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  loadingRow: { alignItems: "center", paddingVertical: 24 },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 8,
  },
  summaryCard: {
    width: "47%",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  summaryCardAlert: {
    borderWidth: 1,
  },
  summaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    lineHeight: 28,
  },
  summaryLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },

  diagTile: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  diagTileLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 12 },
  diagTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  diagTileText: { flex: 1 },
  diagTileLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  diagTileDesc: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  diagTileRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  diagTileBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    minWidth: 26,
    alignItems: "center",
  },
  diagTileBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});
