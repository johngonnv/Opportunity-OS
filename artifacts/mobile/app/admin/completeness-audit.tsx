import React, { useState, useRef } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView, Alert,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  const queryClient = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [stageFilter, setStageFilter] = useState<StageFilter>("ALL");
  const [sort, setSort] = useState<SortMode>("score_asc");
  const [enrichingIds, setEnrichingIds] = useState<Set<string>>(new Set());
  const [enrichedIds, setEnrichedIds] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  const bulkCancelRef = useRef(false);

  const { data, isLoading, refetch, isRefetching } = useQuery<AuditResult>({
    queryKey: ["completenessAudit", stageFilter, sort],
    queryFn: () => adminFetch(`/admin/master-organizations/completeness-audit?healthStage=${stageFilter}&sort=${sort}&limit=100`),
    enabled: isAdminAuthenticated,
  });

  const orgs = data?.orgs ?? [];
  const stageCounts = data?.stageCounts ?? { INCOMPLETE: 0, IDENTIFIED: 0, STRUCTURED: 0, STRATEGIC: 0 };

  // ── Per-org enrich mutation ──────────────────────────────────────────────
  async function enrichOrg(orgId: string) {
    if (enrichingIds.has(orgId)) return;
    setEnrichingIds(prev => new Set(prev).add(orgId));
    try {
      await adminFetch(`/admin/ai-suggestions/${orgId}/generate`, { method: "POST" });
      setEnrichedIds(prev => new Set(prev).add(orgId));
      queryClient.invalidateQueries({ queryKey: ["aiSuggestions"] });
    } catch (err: any) {
      Alert.alert("Enrichment Failed", err?.message ?? "Could not generate AI suggestions.");
    } finally {
      setEnrichingIds(prev => {
        const next = new Set(prev);
        next.delete(orgId);
        return next;
      });
    }
  }

  // ── Bulk enrich ──────────────────────────────────────────────────────────
  async function bulkEnrich() {
    const eligible = orgs.filter(o => o.healthStage !== "STRATEGIC" && !enrichedIds.has(o.id));
    if (eligible.length === 0) {
      Alert.alert("Nothing to enrich", "All orgs in this view are already enriched or strategic.");
      return;
    }
    Alert.alert(
      "Bulk AI Enrichment",
      `Run AI enrichment on ${eligible.length} org${eligible.length !== 1 ? "s" : ""}? Suggestions will queue for your approval.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Enrich All",
          onPress: async () => {
            setBulkRunning(true);
            bulkCancelRef.current = false;
            for (const org of eligible) {
              if (bulkCancelRef.current) break;
              await enrichOrg(org.id);
            }
            setBulkRunning(false);
            Alert.alert("Done", "AI suggestions generated — review them in the Enrichment Queue.");
          },
        },
      ]
    );
  }

  function startReview(startId?: string) {
    setReviewSession({
      orgIds: orgs.map(o => o.id),
      filters: { search: "", sourceFilter: "ALL", industryFilter: "ALL" },
    });
    const target = startId ?? orgs[0]?.id;
    if (target) router.push(`/admin/master-organizations/${target}` as Href);
  }

  const renderItem = ({ item }: { item: AuditOrg }) => {
    const isEnriching = enrichingIds.has(item.id);
    const isDone = enrichedIds.has(item.id);
    return (
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

        {/* AI Enrich button — only show if not STRATEGIC */}
        {item.healthStage !== "STRATEGIC" && (
          <TouchableOpacity
            style={[styles.enrichBtn, isDone && styles.enrichBtnDone, isEnriching && styles.enrichBtnLoading]}
            onPress={e => { e.stopPropagation?.(); enrichOrg(item.id); }}
            disabled={isEnriching}
            activeOpacity={0.75}
          >
            {isEnriching ? (
              <ActivityIndicator size="small" color={COLORS.cyan} style={{ width: 14, height: 14 }} />
            ) : (
              <Feather name={isDone ? "check" : "zap"} size={12} color={isDone ? COLORS.emerald : COLORS.cyan} />
            )}
            <Text style={[styles.enrichBtnText, isDone && { color: COLORS.emerald }]}>
              {isEnriching ? "Enriching…" : isDone ? "Suggestions queued" : "AI Enrich"}
            </Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const enrichableCount = orgs.filter(o => o.healthStage !== "STRATEGIC" && !enrichedIds.has(o.id)).length;

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[{ label: "Dashboard", href: "/admin/(tabs)/dashboard" as Href }, { label: "Completeness Audit" }]} />

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

      {/* Action toolbar */}
      {orgs.length > 0 && (
        <View style={styles.toolbar}>
          <TouchableOpacity style={styles.reviewAllBtn} onPress={() => startReview()}>
            <Feather name="play" size={13} color="#8B8BFF" />
            <Text style={styles.reviewAllText}>Review All ({orgs.length})</Text>
          </TouchableOpacity>

          {enrichableCount > 0 && (
            <TouchableOpacity
              style={[styles.enrichAllBtn, bulkRunning && styles.enrichAllBtnDisabled]}
              onPress={bulkEnrich}
              disabled={bulkRunning}
            >
              {bulkRunning ? (
                <ActivityIndicator size="small" color={COLORS.cyan} style={{ width: 13, height: 13 }} />
              ) : (
                <Feather name="zap" size={13} color={COLORS.cyan} />
              )}
              <Text style={styles.enrichAllText}>
                {bulkRunning ? "Enriching…" : `AI Enrich (${enrichableCount})`}
              </Text>
            </TouchableOpacity>
          )}
        </View>
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

  toolbar: {
    flexDirection: "row", gap: 8,
    marginHorizontal: 14, marginBottom: 8, alignItems: "center",
  },
  reviewAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    flex: 1, paddingVertical: 8, paddingHorizontal: 14,
    backgroundColor: "#1A0D2E", borderRadius: 8, borderWidth: 1, borderColor: "#8B8BFF55",
  },
  reviewAllText: { color: "#8B8BFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  enrichAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    flex: 1, paddingVertical: 8, paddingHorizontal: 14,
    backgroundColor: "#0A1A2E", borderRadius: 8, borderWidth: 1, borderColor: COLORS.cyan + "55",
  },
  enrichAllBtnDisabled: { opacity: 0.6 },
  enrichAllText: { color: COLORS.cyan, fontSize: 13, fontFamily: "Inter_600SemiBold" },

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

  enrichBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    alignSelf: "flex-start",
    marginTop: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1,
    borderColor: COLORS.cyan + "55",
    backgroundColor: "#0A1A2E",
  },
  enrichBtnDone: { borderColor: COLORS.emerald + "55", backgroundColor: COLORS.emerald + "0F" },
  enrichBtnLoading: { opacity: 0.7 },
  enrichBtnText: { color: COLORS.cyan, fontSize: 11, fontFamily: "Inter_600SemiBold" },

  empty: { color: COLORS.textMuted, textAlign: "center", paddingTop: 40, fontFamily: "Inter_400Regular" },
});
