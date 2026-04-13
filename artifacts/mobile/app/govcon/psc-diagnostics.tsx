/**
 * PSC Diagnostics Screen
 *
 * Shows workspace PSC classification coverage, target alignment,
 * top codes, gaps, and recommendations.
 *
 * Route: /govcon/psc-diagnostics
 */

import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { usePscDiagnostics } from "@/hooks/useGovcon";

function PercentBar({ value, color = COLORS.cyan }: { value: number; color?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <View style={pb.track}>
      <View style={[pb.fill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.navyBorder,
    overflow: "hidden",
    marginTop: 6,
  },
  fill: { height: "100%", borderRadius: 3 },
});

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <View style={sc.card}>
      <Text style={[sc.value, { color: color ?? COLORS.text }]}>{value}</Text>
      <Text style={sc.label}>{label}</Text>
      {sub && <Text style={sc.sub}>{sub}</Text>}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    alignItems: "center",
  },
  value: { fontFamily: "Inter_700Bold", fontSize: 22, marginBottom: 4 },
  label: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, textAlign: "center" },
  sub: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 2, textAlign: "center" },
});

export default function PscDiagnosticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data, isLoading, refetch, isRefetching } = usePscDiagnostics();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="arrow-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>PSC Diagnostics</Text>
        <View style={[styles.headerIcon, { backgroundColor: COLORS.cyan + "20" }]}>
          <Feather name="tag" size={18} color={COLORS.cyan} />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={COLORS.cyan} size="large" />
          <Text style={styles.loadingText}>Analyzing PSC coverage...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.cyan} />
          }
        >
          {/* Summary stats */}
          <View style={styles.statRow}>
            <StatCard
              label="PSC Coverage"
              value={`${data?.coveragePercent ?? 0}%`}
              sub={`${data?.classifiedOrgs ?? 0} / ${data?.totalOrgs ?? 0} orgs`}
              color={COLORS.cyan}
            />
            <StatCard
              label="Target Alignment"
              value={`${data?.targetAlignmentPercent ?? 0}%`}
              sub={`${data?.alignedOrgs ?? 0} aligned`}
              color={COLORS.blue}
            />
          </View>

          {/* Coverage bar */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>PSC Classification Coverage</Text>
            <PercentBar value={data?.coveragePercent ?? 0} color={COLORS.cyan} />
            <View style={styles.barLabels}>
              <Text style={styles.barLabel}>{data?.classifiedOrgs ?? 0} classified</Text>
              <Text style={styles.barLabel}>{(data?.totalOrgs ?? 0) - (data?.classifiedOrgs ?? 0)} unclassified</Text>
            </View>
          </View>

          {/* Target alignment bar */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Target Alignment</Text>
            <PercentBar value={data?.targetAlignmentPercent ?? 0} color={COLORS.blue} />
            <View style={styles.barLabels}>
              <Text style={styles.barLabel}>{data?.alignedOrgs ?? 0} aligned to PSC targets</Text>
              <Text style={styles.barLabel}>{(data?.classifiedOrgs ?? 0) - (data?.alignedOrgs ?? 0)} not aligned</Text>
            </View>
          </View>

          {/* Top PSC codes */}
          {(data?.topPsc?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Top PSC Codes</Text>
              {data!.topPsc.map(n => (
                <View key={n.code} style={styles.codeRow}>
                  <View style={[styles.codeChip, { backgroundColor: n.isTargeted ? COLORS.cyan + "20" : COLORS.navySurface }]}>
                    <Text style={[styles.codeText, { color: n.isTargeted ? COLORS.cyan : COLORS.textMuted }]}>{n.code}</Text>
                  </View>
                  <View style={styles.codeInfo}>
                    <Text style={styles.codeName} numberOfLines={1}>{n.name ?? n.code}</Text>
                    <Text style={styles.codeCount}>{n.orgCount} org{n.orgCount !== 1 ? "s" : ""}</Text>
                  </View>
                  {n.isTargeted && (
                    <View style={styles.targetedBadge}>
                      <Feather name="check" size={10} color={COLORS.cyan} />
                      <Text style={[styles.targetedText, { color: COLORS.cyan }]}>Targeted</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          {/* Gaps */}
          {(data?.gaps?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Coverage Gaps</Text>
              <Text style={styles.gapDesc}>
                These PSC codes appear in your classified orgs but are not in your targeting profile.
              </Text>
              <View style={styles.gapChips}>
                {data!.gaps.map(g => (
                  <View key={g.code} style={styles.gapChip}>
                    <Feather name="alert-circle" size={11} color={COLORS.amber} />
                    <Text style={styles.gapCode}>{g.code}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Recommendations */}
          {(data?.recommendations?.length ?? 0) > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recommendations</Text>
              {data!.recommendations.map((rec, i) => (
                <View key={i} style={styles.recRow}>
                  <View style={styles.recDot} />
                  <Text style={styles.recText}>{rec}</Text>
                </View>
              ))}
            </View>
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
  headerTitle: {
    flex: 1,
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: COLORS.text,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },

  content: { paddingHorizontal: 16, paddingTop: 8 },

  statRow: { flexDirection: "row", gap: 10, marginBottom: 16 },

  section: { marginBottom: 20 },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },

  barLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  barLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
  },

  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  codeChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 60,
    alignItems: "center",
  },
  codeText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  codeInfo: { flex: 1 },
  codeName: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text },
  codeCount: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
  targetedBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  targetedText: { fontFamily: "Inter_400Regular", fontSize: 11 },

  gapDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
    marginBottom: 10,
    lineHeight: 18,
  },
  gapChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gapChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.amber + "15",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: COLORS.amber + "40",
  },
  gapCode: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.amber },

  recRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  recDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.cyan,
    marginTop: 6,
    flexShrink: 0,
  },
  recText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
});
