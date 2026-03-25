import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { useOpportunities, usePipelines } from "@/hooks/useApi";

const STATUS_COLORS: Record<string, string> = {
  OPEN: COLORS.emerald,
  WON: COLORS.blue,
  LOST: COLORS.red,
  ON_HOLD: COLORS.amber,
};

function formatValue(v?: number | null) {
  if (!v) return "";
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function OppCard({ opp, onPress }: any) {
  return (
    <TouchableOpacity style={styles.oppCard} onPress={() => onPress(opp.id)} activeOpacity={0.75}>
      <View style={styles.oppHeader}>
        <Text style={styles.oppTitle} numberOfLines={2}>{opp.title}</Text>
        <Badge label={opp.status} color={STATUS_COLORS[opp.status] || COLORS.textDim} />
      </View>
      {opp.organization && <Text style={styles.oppOrg} numberOfLines={1}>{opp.organization.name}</Text>}
      <View style={styles.oppMeta}>
        {opp.valueEstimate && (
          <View style={styles.metaChip}>
            <Feather name="dollar-sign" size={11} color={COLORS.emerald} />
            <Text style={styles.metaText}>{formatValue(opp.valueEstimate)}</Text>
          </View>
        )}
        {opp.pipelineStage && (
          <View style={styles.metaChip}>
            <Feather name="git-branch" size={11} color={COLORS.blue} />
            <Text style={styles.metaText}>{opp.pipelineStage.name}</Text>
          </View>
        )}
        {opp.vertical && (
          <View style={styles.metaChip}>
            <Text style={styles.metaText}>{opp.vertical}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function OpportunitiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const { data: pipelinesData } = usePipelines();
  const { data, isLoading, refetch, isRefetching } = useOpportunities(
    selectedPipeline ? { pipelineId: selectedPipeline, status: "OPEN" } : { status: "OPEN" }
  );

  if (isLoading) return <LoadingSpinner label="Loading pipeline..." />;

  const pipelines = pipelinesData?.pipelines || [];
  const opps = data?.opportunities || [];

  const currentPipeline = selectedPipeline
    ? pipelines.find((p: any) => p.id === selectedPipeline)
    : pipelines[0];

  const stages = currentPipeline?.stages || [];

  const oppsByStage = stages.reduce((acc: Record<string, any[]>, stage: any) => {
    acc[stage.id] = opps.filter((o: any) => o.pipelineStageId === stage.id);
    return acc;
  }, {});

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.headerTitle}>Pipeline</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/opportunity/new")}>
          <Feather name="plus" size={20} color={COLORS.emerald} />
        </TouchableOpacity>
      </View>

      {pipelines.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pipelineTabs} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {pipelines.map((p: any) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.pipelineTab, (selectedPipeline === p.id || (!selectedPipeline && p === pipelines[0])) && styles.pipelineTabActive]}
              onPress={() => setSelectedPipeline(p.id)}
            >
              <Text style={[styles.pipelineTabText, (selectedPipeline === p.id || (!selectedPipeline && p === pipelines[0])) && styles.pipelineTabTextActive]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.boardContent}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
      >
        {stages.map((stage: any) => {
          const stageOpps = oppsByStage[stage.id] || [];
          const totalValue = stageOpps.reduce((sum: number, o: any) => sum + (o.valueEstimate || 0), 0);
          return (
            <View key={stage.id} style={styles.column}>
              <View style={styles.columnHeader}>
                <Text style={styles.columnTitle}>{stage.name}</Text>
                <View style={styles.columnMeta}>
                  <View style={styles.countBadge}>
                    <Text style={styles.countText}>{stageOpps.length}</Text>
                  </View>
                  {totalValue > 0 && <Text style={styles.valueText}>{formatValue(totalValue)}</Text>}
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} style={styles.columnScroll}>
                {stageOpps.length === 0 ? (
                  <View style={styles.emptyColumn}>
                    <Text style={styles.emptyColumnText}>None</Text>
                  </View>
                ) : (
                  stageOpps.map((opp: any) => (
                    <OppCard key={opp.id} opp={opp} onPress={(id: string) => router.push(`/opportunity/${id}`)} />
                  ))
                )}
              </ScrollView>
            </View>
          );
        })}

        {stages.length === 0 && (
          <View style={styles.emptyBoard}>
            <EmptyState icon="trending-up" title="No pipeline stages" subtitle="The pipeline is being set up" />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  addBtn: { width: 36, height: 36, backgroundColor: COLORS.emeraldMuted, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  pipelineTabs: { paddingBottom: 10, maxHeight: 50 },
  pipelineTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  pipelineTabActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  pipelineTabText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  pipelineTabTextActive: { color: COLORS.emerald },
  boardContent: { paddingHorizontal: 12, paddingBottom: 100, gap: 10, alignItems: "flex-start" },
  column: { width: 220, backgroundColor: COLORS.navySurface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.navyBorder, overflow: "hidden" },
  columnHeader: { padding: 12, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder },
  columnTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, marginBottom: 4 },
  columnMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  countBadge: { backgroundColor: COLORS.navyBorder, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted },
  valueText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.emerald },
  columnScroll: { maxHeight: 600, padding: 8 },
  emptyColumn: { padding: 16, alignItems: "center" },
  emptyColumnText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim },
  oppCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  oppHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 },
  oppTitle: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, lineHeight: 18 },
  oppOrg: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginBottom: 6 },
  oppMeta: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  metaChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.navySurface, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  emptyBoard: { width: 280 },
});
