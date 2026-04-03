import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { setReviewSession } from "@/stores/adminReviewSession";

interface AuditOrg {
  id: string;
  canonicalName: string;
  industry: string | null;
  validationStatus: string;
  score: number;
  maxScore: number;
  percentage: number;
  healthStage: "INCOMPLETE" | "IDENTIFIED" | "STRUCTURED" | "STRATEGIC";
  missingCritical: string[];
}

interface AuditResult {
  orgs: AuditOrg[];
  total: number;
  stageCounts: { INCOMPLETE: number; IDENTIFIED: number; STRUCTURED: number; STRATEGIC: number };
}

const STAGE_COLORS: Record<string, string> = {
  INCOMPLETE: COLORS.red ?? "#FF6B6B",
  IDENTIFIED: COLORS.amber,
  STRUCTURED: COLORS.cyan,
  STRATEGIC: COLORS.emerald,
};

const STAGE_ICONS: Record<string, React.ComponentProps<typeof Feather>["name"]> = {
  INCOMPLETE: "alert-circle",
  IDENTIFIED: "check-circle",
  STRUCTURED: "git-branch",
  STRATEGIC: "star",
};

type StageFilter = "ALL" | "INCOMPLETE" | "IDENTIFIED" | "STRUCTURED" | "STRATEGIC";
type SortMode = "score_asc" | "score_desc";

function HealthStageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage] ?? COLORS.textMuted;
  return (
    <View style={[styles.stageBadge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
      <Text style={[styles.stageBadgeText, { color }]}>{stage}</Text>
    </View>
  );
}

function ScoreBar({ percentage }: { percentage: number }) {
  const color = percentage >= 80 ? COLORS.emerald : percentage >= 60 ? COLORS.cyan : percentage >= 30 ? COLORS.amber : COLORS.red ?? "#FF6B6B";
  return (
    <View style={styles.scoreBarTrack}>
      <View style={[styles.scoreBarFill, { width: `${percentage}%` as any, backgroundColor: color }]} />
    </View>
  );
}

export default function CompletenessAuditScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("score_asc");

  const { data, isLoading, refetch, isRefetching } = useQuery<AuditResult>({
    queryKey: ["completenessAudit", stageFilter, sort],
    queryFn: () => adminFetch(`/admin/master-organizations/completeness-audit?healthStage=${stageFilter}&sort=${sort}&limit=100`),
    enabled: isAdminAuthenticated,
  });

  const orgs = data?.orgs ?? [];
  const stageCounts = data?.stageCounts ?? { INCOMPLETE: 0, IDENTIFIED: 0, STRUCTURED: 0, STRATEGIC: 0 };

  function startReview(startId?: string) {
    setReviewSession({
      orgIds: orgs.map(o => o.id),
      filters: { search: "", sourceFilter: "ALL", industryFilter: "ALL" },
    });
    const target = startId ?? orgs[0]?.id;
    if (target) router.push(`/admin/master-organizations/${target}` as Href);
  }

  const renderItem = ({ item }: { item: AuditOrg }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => startReview(item.id)}
      activeOpacity={0.7}
    >
      <View style={styles.rowTop}>
        <Text style={styles.rowName} numberOfLines={1}>{item.canonicalName}</Text>
        <Text style={styles.rowPercent}>{item.percentage}%</Text>
      </View>
      <ScoreBar percentage={item.percentage} />
      <View style={styles.rowBottom}>
        <HealthStageBadge stage={item.healthStage} />
        {item.missingCritical.length > 0 && (
          <Text style={styles.missingText} numberOfLines={1}>
            Missing: {item.missingCritical.join(", ")}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <AdminHeader title="Completeness Audit" />

      {/* Stage summary pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.stageRow} contentContainerStyle={styles.stageRowInner}>
        {(["ALL", "INCOMPLETE", "IDENTIFIED", "STRUCTURED", "STRATEGIC"] as StageFilter[]).map(stage => {
          const count = stage === "ALL" ? (data?.total ?? 0) : (stageCounts[stage] ?? 0);
          const color = stage === "ALL" ? COLORS.textMuted : (STAGE_COLORS[stage] ?? COLORS.textMuted);
          return (
            <TouchableOpacity
              key={stage}
              style={[styles.stageChip, stageFilter === stage && { backgroundColor: color + "22", borderColor: color + "55" }]}
              onPress={() => setStageFilter(stage)}
            >
              {stage !== "ALL" && <Feather name={STAGE_ICONS[stage]} size={11} color={stageFilter === stage ? color : COLORS.textMuted} />}
              <Text style={[styles.stageChipText, stageFilter === stage && { color }]}>
                {stage} {count > 0 ? `(${count})` : ""}
              </Text>
            </TouchableOpacity>
          );
        })}

        <TouchableOpacity
          style={[styles.stageChip, { marginLeft: 8, borderColor: COLORS.cyan + "55" }]}
          onPress={() => setSort(s => s === "score_asc" ? "score_desc" : "score_asc")}
        >
          <Feather name={sort === "score_asc" ? "arrow-up" : "arrow-down"} size={11} color={COLORS.cyan} />
          <Text style={[styles.stageChipText, { color: COLORS.cyan }]}>Score</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Review all button */}
      {orgs.length > 0 && (
        <TouchableOpacity style={styles.reviewAllBtn} onPress={() => startReview()}>
          <Feather name="play" size={14} color="#8B8BFF" />
          <Text style={styles.reviewAllText}>Review All ({orgs.length})</Text>
        </TouchableOpacity>
      )}

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.emerald} />
        </View>
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={o => o.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.emerald} />}
          ListEmptyComponent={<Text style={styles.empty}>No records found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  stageRow: { maxHeight: 48 },
  stageRowInner: { paddingHorizontal: 14, paddingVertical: 10, gap: 8, flexDirection: "row", alignItems: "center" },
  stageChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyCard,
  },
  stageChipText: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  reviewAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 14, marginBottom: 8, paddingVertical: 8, paddingHorizontal: 14,
    backgroundColor: "#1A0D2E", borderRadius: 8, borderWidth: 1, borderColor: "#8B8BFF55",
  },
  reviewAllText: { color: "#8B8BFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 14, paddingBottom: 32, gap: 8 },
  row: {
    backgroundColor: COLORS.navyCard, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 12, gap: 6,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  rowPercent: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_700Bold", marginLeft: 8 },
  scoreBarTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.navyBorder, overflow: "hidden" },
  scoreBarFill: { height: 4, borderRadius: 2 },
  rowBottom: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  stageBadge: {
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1,
  },
  stageBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  missingText: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_400Regular", flex: 1 },
  empty: { color: COLORS.textMuted, textAlign: "center", paddingTop: 40, fontFamily: "Inter_400Regular" },
});
