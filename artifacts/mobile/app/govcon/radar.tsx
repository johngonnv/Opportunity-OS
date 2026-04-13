/**
 * GovCon Radar Screen
 *
 * Lists contract opportunities scored against the workspace's NAICS, PSC,
 * region, and agency targets. Each row shows score (0–100), match reasons,
 * and a recommended action.
 *
 * Route: /govcon/radar
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { useGovconRadar, type RadarMatch } from "@/hooks/useGovcon";

// ---------------------------------------------------------------------------
// Score badge
// ---------------------------------------------------------------------------

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 70 ? COLORS.emerald :
    score >= 50 ? COLORS.amber :
    score >= 30 ? COLORS.blue :
    COLORS.textDim;

  return (
    <View style={[sb.wrap, { borderColor: color + "55", backgroundColor: color + "18" }]}>
      <Text style={[sb.text, { color }]}>{score}</Text>
    </View>
  );
}

const sb = StyleSheet.create({
  wrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
});

// ---------------------------------------------------------------------------
// Opportunity card
// ---------------------------------------------------------------------------

function OpportunityCard({ match }: { match: RadarMatch }) {
  const [expanded, setExpanded] = useState(false);

  const fitColor =
    match.primeOrSubFit === "PRIME" ? COLORS.emerald :
    match.primeOrSubFit === "SUB" ? COLORS.blue :
    match.primeOrSubFit === "BOTH" ? COLORS.purple :
    COLORS.textDim;

  const fitLabel =
    match.primeOrSubFit === "PRIME" ? "Prime" :
    match.primeOrSubFit === "SUB" ? "Sub" :
    match.primeOrSubFit === "BOTH" ? "Prime / Sub" :
    "Unknown";

  return (
    <TouchableOpacity
      style={oc.card}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.85}
    >
      <View style={oc.headerRow}>
        <ScoreBadge score={match.opportunityScore} />
        <View style={oc.headerText}>
          <Text style={oc.title} numberOfLines={expanded ? 0 : 2}>{match.title}</Text>
          <Text style={oc.agency} numberOfLines={1}>{match.agency ?? "—"}</Text>
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={COLORS.textDim}
        />
      </View>

      <View style={oc.chips}>
        {match.naicsCode && (
          <View style={[oc.chip, { backgroundColor: COLORS.emerald + "18" }]}>
            <Text style={[oc.chipText, { color: COLORS.emerald }]}>NAICS {match.naicsCode}</Text>
          </View>
        )}
        {match.pscCode && (
          <View style={[oc.chip, { backgroundColor: COLORS.cyan + "18" }]}>
            <Text style={[oc.chipText, { color: COLORS.cyan }]}>PSC {match.pscCode}</Text>
          </View>
        )}
        {match.primeOrSubFit && match.primeOrSubFit !== "UNKNOWN" && (
          <View style={[oc.chip, { backgroundColor: fitColor + "18" }]}>
            <Text style={[oc.chipText, { color: fitColor }]}>{fitLabel}</Text>
          </View>
        )}
        {match.estimatedValue && (
          <View style={[oc.chip, { backgroundColor: COLORS.amber + "18" }]}>
            <Text style={[oc.chipText, { color: COLORS.amber }]}>{match.estimatedValue}</Text>
          </View>
        )}
      </View>

      {match.matchReasons.length > 0 && (
        <View style={oc.reasonsRow}>
          {match.matchReasons.slice(0, 2).map((r, i) => (
            <View key={i} style={oc.reasonBadge}>
              <Feather name="check" size={11} color={COLORS.emerald} />
              <Text style={oc.reasonText}>{r}</Text>
            </View>
          ))}
        </View>
      )}

      {expanded && (
        <View style={oc.expandedSection}>
          {match.summary && (
            <Text style={oc.summaryText}>{match.summary}</Text>
          )}

          <View style={oc.metaRow}>
            {match.region && (
              <View style={oc.metaItem}>
                <Feather name="map-pin" size={12} color={COLORS.textDim} />
                <Text style={oc.metaText}>{match.region}</Text>
              </View>
            )}
            {match.responseDeadline && (
              <View style={oc.metaItem}>
                <Feather name="clock" size={12} color={COLORS.amber} />
                <Text style={[oc.metaText, { color: COLORS.amber }]}>Due {match.responseDeadline}</Text>
              </View>
            )}
            {match.solicitationNumber && (
              <View style={oc.metaItem}>
                <Feather name="hash" size={12} color={COLORS.textDim} />
                <Text style={oc.metaText}>{match.solicitationNumber}</Text>
              </View>
            )}
          </View>

          <View style={oc.actionBox}>
            <Feather name="zap" size={13} color={COLORS.emerald} />
            <Text style={oc.actionText}>{match.recommendedAction}</Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

const oc = StyleSheet.create({
  card: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginBottom: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 10,
  },
  headerText: { flex: 1 },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: 3,
  },
  agency: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  chip: {
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  reasonsRow: { gap: 4 },
  reasonBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  reasonText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
  },
  expandedSection: { marginTop: 10, gap: 10 },
  summaryText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  metaRow: { gap: 6 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
  },
  actionBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: COLORS.emerald + "12",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.emerald + "33",
    padding: 10,
  },
  actionText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
});

// ---------------------------------------------------------------------------
// Score filter bar
// ---------------------------------------------------------------------------

const FILTERS: { label: string; minScore: number }[] = [
  { label: "All", minScore: 0 },
  { label: "30+", minScore: 30 },
  { label: "50+", minScore: 50 },
  { label: "70+", minScore: 70 },
];

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function GovConRadarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [minScore, setMinScore] = useState(0);

  const { data, isLoading, refetch, isRefetching } = useGovconRadar(minScore, 50);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>GovCon Radar</Text>
          {data && (
            <Text style={styles.headerSub}>
              {data.matched} match{data.matched !== 1 ? "es" : ""} · {data.highFit} high fit
            </Text>
          )}
        </View>
        <View style={styles.headerIcon}>
          <Feather name="target" size={18} color={COLORS.blue} />
        </View>
      </View>

      {/* Score filter */}
      <View style={styles.filterRow}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.label}
            style={[
              styles.filterChip,
              minScore === f.minScore && styles.filterChipActive,
            ]}
            onPress={() => setMinScore(f.minScore)}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.filterChipText,
              minScore === f.minScore && styles.filterChipTextActive,
            ]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.emerald }]} />
          <Text style={styles.legendText}>High (70+)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.amber }]} />
          <Text style={styles.legendText}>Moderate (50+)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: COLORS.blue }]} />
          <Text style={styles.legendText}>Low (30+)</Text>
        </View>
        <Text style={styles.legendHint}>Tap card to expand</Text>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.blue} size="large" />
          <Text style={styles.loadingText}>Scoring opportunities...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching && !isLoading}
              onRefresh={refetch}
              tintColor={COLORS.blue}
            />
          }
        >
          {(data?.matches ?? []).length === 0 ? (
            <View style={styles.emptyWrap}>
              <Feather name="target" size={36} color={COLORS.textDim} />
              <Text style={styles.emptyTitle}>No matches yet</Text>
              <Text style={styles.emptyDesc}>
                {minScore > 0
                  ? `No opportunities meet the ${minScore}+ score threshold. Try lowering the filter.`
                  : "Complete your GAGC profile to improve match scores."}
              </Text>
            </View>
          ) : (
            (data?.matches ?? []).map(match => (
              <OpportunityCard key={match.id} match={match} />
            ))
          )}
          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.navySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1 },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: COLORS.text,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: COLORS.blue + "20",
    alignItems: "center",
    justifyContent: "center",
  },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  filterChipActive: {
    backgroundColor: COLORS.blue + "25",
    borderColor: COLORS.blue + "66",
  },
  filterChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.textMuted,
  },
  filterChipTextActive: {
    color: COLORS.blue,
  },

  legend: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
  legendHint: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginLeft: "auto" },

  list: { paddingHorizontal: 16, paddingTop: 4 },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingTop: 80 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },

  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  emptyDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 24,
  },
});
