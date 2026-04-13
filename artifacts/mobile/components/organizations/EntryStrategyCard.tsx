import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import {
  useOrganizationIntelligenceSummary,
  useComputeIntelligenceSummary,
  useOrganizationOpportunityScore,
  type IntelligenceSummary,
} from "@/hooks/useApi";
import { Card } from "@/components/ui/Card";

function formatAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function deriveMissingEvidence(summary: IntelligenceSummary, staleSignals: string[]): string[] {
  const gaps: string[] = [];
  if (summary.topPainPoints.length === 0) {
    gaps.push("No verified pain points — review AI suggestions or log pain manually");
  }
  if (summary.topCompetitors.length === 0) {
    gaps.push("No verified competitors — map the competitive landscape");
  }
  if (summary.buyerPatterns.some(p => p.toLowerCase().includes("no buyer"))) {
    gaps.push("No buyer contacts linked — add a decision-maker or champion");
  }
  for (const sig of staleSignals) {
    const readable = sig.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    gaps.push(`Stale signal: ${readable}`);
  }
  return gaps;
}

function isLowConfidence(summary: IntelligenceSummary, staleSignals: string[]): boolean {
  return (
    summary.topPainPoints.length === 0 ||
    summary.topCompetitors.length === 0 ||
    staleSignals.length > 0 ||
    summary.buyerPatterns.some(p => p.toLowerCase().includes("no buyer"))
  );
}

interface SummaryContentProps {
  summary: IntelligenceSummary;
  staleSignals: string[];
  isAdmin: boolean;
  recompute: ReturnType<typeof useComputeIntelligenceSummary>;
}

function SummaryContent({ summary, staleSignals, isAdmin, recompute }: SummaryContentProps) {
  const showMissingEvidence = isLowConfidence(summary, staleSignals);
  const missingEvidence = showMissingEvidence ? deriveMissingEvidence(summary, staleSignals) : [];

  return (
    <>
      <View style={styles.primaryActionBlock}>
        <View style={styles.primaryActionHeader}>
          <Feather name="zap" size={13} color={COLORS.amber} />
          <Text style={styles.primaryActionLabel}>Recommended Next Action</Text>
        </View>
        <Text style={styles.primaryActionText}>{summary.primaryAction}</Text>
      </View>

      <View style={styles.entryStrategyBlock}>
        <Text style={styles.sectionLabel}>Entry Strategy</Text>
        <Text style={styles.entryStrategyText}>{summary.entryStrategy}</Text>
      </View>

      {summary.buyerPatterns.length > 0 && (
        <View style={styles.rationaleBlock}>
          <Text style={styles.sectionLabel}>Why This Action</Text>
          {summary.buyerPatterns.map((pattern, i) => (
            <View key={i} style={styles.rationaleRow}>
              <View style={styles.rationaleDot} />
              <Text style={styles.rationaleText}>{pattern}</Text>
            </View>
          ))}
        </View>
      )}

      {showMissingEvidence && missingEvidence.length > 0 && (
        <View style={styles.missingEvidenceBlock}>
          <View style={styles.missingEvidenceHeader}>
            <Feather name="alert-triangle" size={12} color={COLORS.amber} />
            <Text style={styles.missingEvidenceLabel}>Missing Evidence</Text>
          </View>
          {missingEvidence.map((gap, i) => (
            <View key={i} style={styles.missingEvidenceRow}>
              <Text style={styles.missingEvidenceBullet}>·</Text>
              <Text style={styles.missingEvidenceText}>{gap}</Text>
            </View>
          ))}
        </View>
      )}

      {summary.impactStatement ? (
        <View style={styles.impactBlock}>
          <Feather name="info" size={12} color={COLORS.textDim} />
          <Text style={styles.impactText}>{summary.impactStatement}</Text>
        </View>
      ) : null}

      <View style={styles.footer}>
        <Text style={styles.computedAt}>Last computed: {formatAgo(summary.computedAt)}</Text>
        {isAdmin && (
          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={() => recompute.mutate()}
            disabled={recompute.isPending}
            activeOpacity={0.8}
          >
            {recompute.isPending ? (
              <ActivityIndicator size="small" color={COLORS.cyan} />
            ) : (
              <>
                <Feather name="refresh-cw" size={12} color={COLORS.cyan} />
                <Text style={styles.refreshBtnText}>Refresh Intelligence</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    </>
  );
}

interface Props {
  orgId: string;
  isAdmin: boolean;
}

export function EntryStrategyCard({ orgId, isAdmin }: Props) {
  const { data, isLoading } = useOrganizationIntelligenceSummary(orgId);
  const { data: scoreData } = useOrganizationOpportunityScore(orgId);
  const recompute = useComputeIntelligenceSummary(orgId);

  const summary = data?.summary ?? null;
  const staleSignals = scoreData?.freshness.staleSignals ?? [];

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Feather name="cpu" size={14} color={COLORS.cyan} />
          <Text style={styles.cardTitle}>Entry Strategy</Text>
        </View>
      </View>

      <Card>
        {isLoading ? (
          <ActivityIndicator color={COLORS.cyan} />
        ) : !summary ? (
          <View style={styles.emptyState}>
            <Feather name="cpu" size={20} color={COLORS.textDim} />
            <Text style={styles.emptyTitle}>No Intelligence Summary</Text>
            <Text style={styles.emptyBody}>
              Intelligence has not been computed yet for this account.
            </Text>
            {isAdmin && (
              <TouchableOpacity
                style={styles.computeBtn}
                onPress={() => recompute.mutate()}
                disabled={recompute.isPending}
                activeOpacity={0.8}
              >
                {recompute.isPending ? (
                  <ActivityIndicator size="small" color={COLORS.cyan} />
                ) : (
                  <>
                    <Feather name="cpu" size={12} color={COLORS.cyan} />
                    <Text style={styles.computeBtnText}>Compute Intelligence</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <SummaryContent
            summary={summary}
            staleSignals={staleSignals}
            isAdmin={isAdmin}
            recompute={recompute}
          />
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
  },
  primaryActionBlock: {
    backgroundColor: COLORS.amber + "12",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.amber + "44",
    padding: 12,
    marginBottom: 14,
    gap: 6,
  },
  primaryActionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  primaryActionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.amber,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  primaryActionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  entryStrategyBlock: {
    marginBottom: 14,
    gap: 6,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  entryStrategyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
  },
  rationaleBlock: {
    marginBottom: 14,
    gap: 4,
  },
  rationaleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  rationaleDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: COLORS.cyan,
    marginTop: 7,
    flexShrink: 0,
  },
  rationaleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 20,
  },
  missingEvidenceBlock: {
    backgroundColor: COLORS.amber + "0D",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.amber + "33",
    padding: 12,
    marginBottom: 14,
    gap: 6,
  },
  missingEvidenceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  missingEvidenceLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.amber,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  missingEvidenceRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  missingEvidenceBullet: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.amber,
    lineHeight: 18,
  },
  missingEvidenceText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  impactBlock: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: COLORS.navySurface,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  impactText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
    flex: 1,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 2,
  },
  computedAt: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
  },
  refreshBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.cyan + "15",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.cyan + "33",
  },
  refreshBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.cyan,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.textMuted,
  },
  emptyBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
    textAlign: "center",
    lineHeight: 18,
  },
  computeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.cyan + "15",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.cyan + "33",
  },
  computeBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.cyan,
  },
});
