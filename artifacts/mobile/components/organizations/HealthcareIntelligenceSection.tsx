import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import {
  useHealthcareProfile,
  useOrganizationPainPoints,
  useOrganizationCompetitors,
  useOrganizationOpportunityScore,
  useOrganizationIntelligenceSummary,
  useRunCmsSuggestions,
  useApprovePainPoint,
  useRejectPainPoint,
  useComputeIntelligenceSummary,
  type PainPoint,
  type Competitor,
} from "@/hooks/useApi";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";

// ---------------------------------------------------------------------------
// Label maps
// ---------------------------------------------------------------------------

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: COLORS.red,
  HIGH: "#F97316",
  MEDIUM: COLORS.amber,
  LOW: COLORS.textDim,
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const CATEGORY_LABEL: Record<string, string> = {
  ED_BOARDING: "ED Boarding",
  DISCHARGE_BOTTLENECK: "Discharge Bottleneck",
  CARE_TRANSITION_RISK: "Care Transition Risk",
  STAFFING_PRESSURE: "Staffing Pressure",
  CAPACITY_CONSTRAINT: "Capacity Constraint",
  REVENUE_CYCLE: "Revenue Cycle",
  DOCUMENTATION_BURDEN: "Documentation Burden",
  PATIENT_EXPERIENCE: "Patient Experience",
  OTHER: "Other",
};

const INCUMBENT_LABEL: Record<string, string> = {
  CONFIRMED_INCUMBENT: "Confirmed Incumbent",
  SUSPECTED_INCUMBENT: "Suspected",
  FORMER_INCUMBENT: "Former",
  NOT_INCUMBENT: "Not Incumbent",
};

const DISPLACEMENT_COLOR: Record<string, string> = {
  VERY_HIGH: COLORS.red,
  HIGH: "#F97316",
  MEDIUM: COLORS.amber,
  LOW: COLORS.emerald,
};

const VERIFICATION_LABEL: Record<string, string> = {
  SUGGESTED: "AI Suggested",
  PENDING_REVIEW: "Pending Review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

// ---------------------------------------------------------------------------
// Opportunity Score Ring (simple horizontal bar)
// ---------------------------------------------------------------------------

function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <View style={scoreStyles.track}>
      <View style={[scoreStyles.fill, { width: `${score}%` as `${number}%`, backgroundColor: color }]} />
    </View>
  );
}

const scoreStyles = StyleSheet.create({
  track: {
    height: 6,
    backgroundColor: COLORS.navyBorder,
    borderRadius: 4,
    overflow: "hidden",
    flex: 1,
  },
  fill: {
    height: 6,
    borderRadius: 4,
  },
});

// ---------------------------------------------------------------------------
// Opportunity Score Card
// ---------------------------------------------------------------------------

function OpportunityScoreCard({ orgId }: { orgId: string }) {
  const { data, isLoading, refetch, isRefetching } = useOrganizationOpportunityScore(orgId);

  const score = data?.overallScore ?? 0;
  const scoreColor =
    score >= 70 ? COLORS.emerald : score >= 45 ? COLORS.amber : score >= 20 ? "#F97316" : COLORS.red;

  const DIMENSION_LABELS: Record<string, string> = {
    cmsOperationalPressure: "CMS Pressure",
    painPointSeverity: "Pain Severity",
    competitorWeaknessDelta: "Competitor Gap",
    relationshipDepth: "Relationship Depth",
    buyerAccessMaturity: "Buyer Access",
    bedCountScale: "Bed Scale",
    dataConfidence: "Data Confidence",
  };

  return (
    <Card>
      {isLoading ? (
        <ActivityIndicator color={COLORS.emerald} />
      ) : data ? (
        <>
          <View style={styles.scoreHeader}>
            <View>
              <Text style={styles.scoreLabel}>Opportunity Score</Text>
              <Text style={[styles.scoreValue, { color: scoreColor }]}>{score}<Text style={styles.scoreMax}>/100</Text></Text>
            </View>
            <TouchableOpacity
              onPress={() => refetch()}
              disabled={isRefetching}
              style={styles.refreshBtn}
            >
              {isRefetching ? (
                <ActivityIndicator size="small" color={COLORS.textDim} />
              ) : (
                <Feather name="refresh-cw" size={14} color={COLORS.textDim} />
              )}
            </TouchableOpacity>
          </View>

          {data.freshness.staleSignals.length > 0 && (
            <View style={styles.staleWarning}>
              <Feather name="alert-triangle" size={12} color={COLORS.amber} />
              <Text style={styles.staleWarningText}>
                Stale data: {data.freshness.staleSignals.join(", ")}
              </Text>
            </View>
          )}

          <View style={styles.dimensionsGrid}>
            {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
              const dim = data.dimensions[key];
              if (!dim) return null;
              const dimColor =
                dim.score >= 70 ? COLORS.emerald : dim.score >= 45 ? COLORS.amber : "#F97316";
              return (
                <View key={key} style={styles.dimensionRow}>
                  <Text style={styles.dimensionLabel}>{label}</Text>
                  <View style={styles.dimensionRight}>
                    <ScoreBar score={dim.score} color={dimColor} />
                    <Text style={[styles.dimensionScore, { color: dimColor }]}>{dim.score}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {data.freshness.cmsDataAgeDays !== null && (
            <Text style={styles.freshnessMeta}>
              CMS data age: {data.freshness.cmsDataAgeDays}d
            </Text>
          )}
        </>
      ) : (
        <Text style={styles.emptyText}>Score unavailable</Text>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pain Points Card
// ---------------------------------------------------------------------------

function PainPointRow({
  pp,
  orgId,
  canReview,
}: {
  pp: PainPoint;
  orgId: string;
  canReview: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const approve = useApprovePainPoint(orgId);
  const reject = useRejectPainPoint(orgId);

  const severityColor = SEVERITY_COLOR[pp.severity] ?? COLORS.textDim;
  const statusColor =
    pp.verificationStatus === "VERIFIED"
      ? COLORS.emerald
      : pp.verificationStatus === "SUGGESTED"
      ? COLORS.amber
      : pp.verificationStatus === "REJECTED"
      ? COLORS.textDim
      : COLORS.blue;

  const handleApprove = () => {
    if (reviewing) return;
    const doApprove = async () => {
      setReviewing(true);
      try {
        await approve.mutateAsync({ painPointId: pp.id });
      } finally {
        setReviewing(false);
      }
    };
    if (Platform.OS === "web") {
      doApprove();
    } else {
      Alert.alert("Approve Pain Point", "Mark this pain point as Verified?", [
        { text: "Cancel", style: "cancel" },
        { text: "Approve", onPress: doApprove },
      ]);
    }
  };

  const handleReject = () => {
    if (reviewing) return;
    const doReject = async () => {
      setReviewing(true);
      try {
        await reject.mutateAsync({ painPointId: pp.id });
      } finally {
        setReviewing(false);
      }
    };
    if (Platform.OS === "web") {
      doReject();
    } else {
      Alert.alert("Reject Pain Point", "Mark this pain point as Rejected?", [
        { text: "Cancel", style: "cancel" },
        { text: "Reject", style: "destructive", onPress: doReject },
      ]);
    }
  };

  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.8}
      style={styles.ppRow}
    >
      <View style={styles.ppRowTop}>
        <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
        <View style={styles.ppRowContent}>
          <Text style={styles.ppCategory}>
            {CATEGORY_LABEL[pp.painPointCategory] ?? pp.painPointCategory}
          </Text>
          <View style={[styles.ppStatusBadge, { backgroundColor: statusColor + "20", borderColor: statusColor + "44" }]}>
            <Text style={[styles.ppStatusText, { color: statusColor }]}>
              {VERIFICATION_LABEL[pp.verificationStatus] ?? pp.verificationStatus}
            </Text>
          </View>
        </View>
        <Text style={[styles.ppSeverity, { color: severityColor }]}>
          {SEVERITY_LABEL[pp.severity] ?? pp.severity}
        </Text>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={COLORS.textDim}
          style={{ marginLeft: 6 }}
        />
      </View>

      {expanded && (
        <View style={styles.ppExpanded}>
          {pp.painPointStatement ? (
            <Text style={styles.ppStatement}>{pp.painPointStatement}</Text>
          ) : null}
          <View style={styles.ppMeta}>
            <Text style={styles.ppMetaText}>
              Confidence: {pp.confidenceScore}%
            </Text>
            {pp.linkedCmsSignalKey && (
              <Text style={styles.ppMetaText}>
                Source: {pp.linkedCmsSignalKey.replace(/_/g, " ")}
              </Text>
            )}
          </View>

          {canReview && (pp.verificationStatus === "SUGGESTED" || pp.verificationStatus === "PENDING_REVIEW") && (
            <View style={styles.reviewActions}>
              {reviewing ? (
                <ActivityIndicator size="small" color={COLORS.emerald} />
              ) : (
                <>
                  <TouchableOpacity
                    style={styles.approveBtn}
                    onPress={handleApprove}
                    activeOpacity={0.8}
                  >
                    <Feather name="check" size={13} color={COLORS.emerald} />
                    <Text style={[styles.reviewBtnText, { color: COLORS.emerald }]}>Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={handleReject}
                    activeOpacity={0.8}
                  >
                    <Feather name="x" size={13} color={COLORS.red} />
                    <Text style={[styles.reviewBtnText, { color: COLORS.red }]}>Reject</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function PainPointsCard({ orgId, canReview }: { orgId: string; canReview: boolean }) {
  const { data, isLoading } = useOrganizationPainPoints(orgId);
  const runSuggestions = useRunCmsSuggestions(orgId);
  const [showAll, setShowAll] = useState(false);

  const allPoints = data?.painPoints ?? [];
  const suggested = allPoints.filter(pp => pp.verificationStatus === "SUGGESTED" || pp.verificationStatus === "PENDING_REVIEW");
  const verified = allPoints.filter(pp => pp.verificationStatus === "VERIFIED");
  const rejected = allPoints.filter(pp => pp.verificationStatus === "REJECTED");

  const displayPoints = showAll ? allPoints : allPoints.slice(0, 4);

  return (
    <Card>
      {isLoading ? (
        <ActivityIndicator color={COLORS.emerald} />
      ) : (
        <>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleLeft}>
              <Feather name="alert-circle" size={14} color={COLORS.amber} />
              <Text style={styles.cardTitle}>Pain Points</Text>
            </View>
            <View style={styles.ppCounts}>
              {verified.length > 0 && (
                <View style={[styles.countBadge, { backgroundColor: COLORS.emerald + "20" }]}>
                  <Text style={[styles.countBadgeText, { color: COLORS.emerald }]}>{verified.length} verified</Text>
                </View>
              )}
              {suggested.length > 0 && (
                <View style={[styles.countBadge, { backgroundColor: COLORS.amber + "20" }]}>
                  <Text style={[styles.countBadgeText, { color: COLORS.amber }]}>{suggested.length} pending</Text>
                </View>
              )}
            </View>
          </View>

          {allPoints.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No pain points recorded.</Text>
              {canReview && (
                <TouchableOpacity
                  style={styles.runSuggestionsBtn}
                  onPress={() => runSuggestions.mutate()}
                  disabled={runSuggestions.isPending}
                  activeOpacity={0.8}
                >
                  {runSuggestions.isPending ? (
                    <ActivityIndicator size="small" color={COLORS.emerald} />
                  ) : (
                    <>
                      <Feather name="zap" size={12} color={COLORS.emerald} />
                      <Text style={styles.runSuggestionsText}>Run CMS Suggestions</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {displayPoints.map((pp, i) => (
                <View key={pp.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <PainPointRow pp={pp} orgId={orgId} canReview={canReview} />
                </View>
              ))}
              {allPoints.length > 4 && (
                <TouchableOpacity
                  onPress={() => setShowAll(v => !v)}
                  style={styles.showMoreBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.showMoreText}>
                    {showAll ? "Show less" : `Show all ${allPoints.length}`}
                  </Text>
                  <Feather name={showAll ? "chevron-up" : "chevron-down"} size={13} color={COLORS.blue} />
                </TouchableOpacity>
              )}
              {canReview && suggested.length === 0 && (
                <TouchableOpacity
                  style={[styles.runSuggestionsBtn, { marginTop: 10 }]}
                  onPress={() => runSuggestions.mutate()}
                  disabled={runSuggestions.isPending}
                  activeOpacity={0.8}
                >
                  {runSuggestions.isPending ? (
                    <ActivityIndicator size="small" color={COLORS.emerald} />
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={12} color={COLORS.emerald} />
                      <Text style={styles.runSuggestionsText}>Refresh CMS Suggestions</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Competitors Card
// ---------------------------------------------------------------------------

function CompetitorRow({ comp }: { comp: Competitor }) {
  const [expanded, setExpanded] = useState(false);

  const incumbentColor =
    comp.incumbentStatus === "CONFIRMED_INCUMBENT"
      ? COLORS.red
      : comp.incumbentStatus === "SUSPECTED_INCUMBENT"
      ? COLORS.amber
      : COLORS.textDim;

  const dispColor = comp.displacementDifficulty
    ? DISPLACEMENT_COLOR[comp.displacementDifficulty] ?? COLORS.textDim
    : COLORS.textDim;

  return (
    <TouchableOpacity onPress={() => setExpanded(v => !v)} activeOpacity={0.8} style={styles.ppRow}>
      <View style={styles.ppRowTop}>
        <Feather name="shield" size={14} color={incumbentColor} />
        <View style={[styles.ppRowContent, { marginLeft: 8 }]}>
          <Text style={styles.ppCategory}>{comp.competitorName}</Text>
          {comp.serviceLine && (
            <Text style={styles.ppMetaInline}>{comp.serviceLine}</Text>
          )}
        </View>
        <View style={[styles.dispBadge, { backgroundColor: dispColor + "20", borderColor: dispColor + "44" }]}>
          <Text style={[styles.dispText, { color: dispColor }]}>
            {comp.displacementDifficulty?.replace("_", " ") ?? "—"}
          </Text>
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={COLORS.textDim}
          style={{ marginLeft: 6 }}
        />
      </View>

      {expanded && (
        <View style={styles.ppExpanded}>
          <View style={styles.compMetaRow}>
            <Text style={[styles.ppMetaText, { color: incumbentColor }]}>
              {INCUMBENT_LABEL[comp.incumbentStatus] ?? comp.incumbentStatus}
            </Text>
            {comp.shareOfWalletEstimate !== null && (
              <Text style={styles.ppMetaText}>
                Wallet share: {comp.shareOfWalletEstimate}%
              </Text>
            )}
            {comp.contractStatus && comp.contractStatus !== "UNKNOWN" && (
              <Text style={styles.ppMetaText}>
                {comp.contractStatus.replace(/_/g, " ")}
              </Text>
            )}
          </View>

          {comp.weaknesses.length > 0 && (
            <View style={styles.compListSection}>
              <Text style={styles.compListTitle}>Weaknesses</Text>
              {comp.weaknesses.map((w, i) => (
                <View key={i} style={styles.compListItem}>
                  <View style={[styles.compBullet, { backgroundColor: COLORS.emerald }]} />
                  <Text style={styles.compListText}>{w}</Text>
                </View>
              ))}
            </View>
          )}

          {comp.strengths.length > 0 && (
            <View style={styles.compListSection}>
              <Text style={styles.compListTitle}>Strengths</Text>
              {comp.strengths.map((s, i) => (
                <View key={i} style={styles.compListItem}>
                  <View style={[styles.compBullet, { backgroundColor: COLORS.red }]} />
                  <Text style={styles.compListText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {comp.painPointsCaused.length > 0 && (
            <View style={styles.compListSection}>
              <Text style={styles.compListTitle}>Linked Pain Points</Text>
              {comp.painPointsCaused.map((p, i) => (
                <View key={i} style={styles.compListItem}>
                  <View style={[styles.compBullet, { backgroundColor: COLORS.amber }]} />
                  <Text style={styles.compListText}>{p}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.ppMeta}>
            <Text style={styles.ppMetaText}>
              Confidence: {comp.confidenceScore}%
            </Text>
            <Text style={[styles.ppMetaText, {
              color: comp.verificationStatus === "VERIFIED" ? COLORS.emerald : COLORS.amber,
            }]}>
              {VERIFICATION_LABEL[comp.verificationStatus] ?? comp.verificationStatus}
            </Text>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

function CompetitorsCard({ orgId }: { orgId: string }) {
  const { data, isLoading } = useOrganizationCompetitors(orgId);
  const [showAll, setShowAll] = useState(false);

  const competitors = data?.competitors ?? [];
  const displayCompetitors = showAll ? competitors : competitors.slice(0, 3);

  return (
    <Card>
      {isLoading ? (
        <ActivityIndicator color={COLORS.emerald} />
      ) : (
        <>
          <View style={styles.cardTitleRow}>
            <View style={styles.cardTitleLeft}>
              <Feather name="shield-off" size={14} color={COLORS.purple} />
              <Text style={styles.cardTitle}>Competitors</Text>
            </View>
            {competitors.length > 0 && (
              <Text style={styles.competitorCount}>{competitors.length}</Text>
            )}
          </View>

          {competitors.length === 0 ? (
            <Text style={styles.emptyText}>No competitors mapped for this account.</Text>
          ) : (
            <>
              {displayCompetitors.map((comp, i) => (
                <View key={comp.id}>
                  {i > 0 && <View style={styles.divider} />}
                  <CompetitorRow comp={comp} />
                </View>
              ))}
              {competitors.length > 3 && (
                <TouchableOpacity
                  onPress={() => setShowAll(v => !v)}
                  style={styles.showMoreBtn}
                  activeOpacity={0.8}
                >
                  <Text style={styles.showMoreText}>
                    {showAll ? "Show less" : `Show all ${competitors.length}`}
                  </Text>
                  <Feather name={showAll ? "chevron-up" : "chevron-down"} size={13} color={COLORS.blue} />
                </TouchableOpacity>
              )}
            </>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Intelligence Summary Card
// ---------------------------------------------------------------------------

function IntelligenceSummaryCard({ orgId }: { orgId: string }) {
  const { data, isLoading } = useOrganizationIntelligenceSummary(orgId);
  const recompute = useComputeIntelligenceSummary(orgId);

  const summary = data?.summary;

  return (
    <Card>
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleLeft}>
          <Feather name="cpu" size={14} color={COLORS.cyan} />
          <Text style={styles.cardTitle}>Intelligence Summary</Text>
        </View>
        <TouchableOpacity
          onPress={() => recompute.mutate()}
          disabled={recompute.isPending}
          style={styles.refreshBtn}
        >
          {recompute.isPending ? (
            <ActivityIndicator size="small" color={COLORS.textDim} />
          ) : (
            <Feather name="refresh-cw" size={14} color={COLORS.textDim} />
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={COLORS.cyan} />
      ) : !summary ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No summary yet.</Text>
          <TouchableOpacity
            style={[styles.runSuggestionsBtn, { backgroundColor: COLORS.cyan + "15" }]}
            onPress={() => recompute.mutate()}
            disabled={recompute.isPending}
            activeOpacity={0.8}
          >
            <Feather name="cpu" size={12} color={COLORS.cyan} />
            <Text style={[styles.runSuggestionsText, { color: COLORS.cyan }]}>Generate Summary</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Impact Statement */}
          <View style={styles.impactBox}>
            <Text style={styles.impactStatement}>{summary.impactStatement}</Text>
          </View>

          {/* Entry Strategy */}
          <View style={styles.strategyRow}>
            <Feather name="target" size={13} color={COLORS.blue} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.strategyLabel}>Entry Strategy</Text>
              <Text style={styles.strategyValue}>{summary.entryStrategy}</Text>
            </View>
          </View>

          {/* Primary Action */}
          <View style={styles.strategyRow}>
            <Feather name="play-circle" size={13} color={COLORS.emerald} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.strategyLabel}>Recommended Action</Text>
              <Text style={styles.strategyValue}>{summary.primaryAction}</Text>
            </View>
          </View>

          {/* Buyer Patterns */}
          {summary.buyerPatterns.length > 0 && (
            <View style={styles.buyerPatternsBox}>
              <Text style={styles.compListTitle}>Buyer Patterns</Text>
              {summary.buyerPatterns.map((p, i) => (
                <View key={i} style={styles.compListItem}>
                  <View style={[styles.compBullet, { backgroundColor: COLORS.purple }]} />
                  <Text style={styles.compListText}>{p}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Top Pain Points */}
          {summary.topPainPoints.length > 0 && (
            <View style={styles.buyerPatternsBox}>
              <Text style={styles.compListTitle}>Top Verified Pain Points</Text>
              {summary.topPainPoints.map((pp, i) => {
                const sColor = SEVERITY_COLOR[pp.severity] ?? COLORS.textDim;
                return (
                  <View key={i} style={styles.summaryPpRow}>
                    <View style={[styles.compBullet, { backgroundColor: sColor, marginTop: 5 }]} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.compListText, { color: sColor, fontWeight: "600" }]}>
                        {CATEGORY_LABEL[pp.category] ?? pp.category} — {pp.severity}
                      </Text>
                      {pp.statement && (
                        <Text style={styles.summaryPpStatement} numberOfLines={2}>{pp.statement}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* Top Competitors */}
          {summary.topCompetitors.length > 0 && (
            <View style={styles.buyerPatternsBox}>
              <Text style={styles.compListTitle}>Top Competitors</Text>
              {summary.topCompetitors.map((c, i) => {
                const dColor = DISPLACEMENT_COLOR[c.displacementDifficulty] ?? COLORS.textDim;
                return (
                  <View key={i} style={styles.summaryPpRow}>
                    <Feather name="shield" size={12} color={dColor} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.compListText}>{c.competitorName}</Text>
                      <Text style={[styles.summaryPpStatement, { color: dColor }]}>
                        {INCUMBENT_LABEL[c.incumbentStatus] ?? c.incumbentStatus} · {c.displacementDifficulty?.replace("_", " ") ?? "Unknown"} displacement
                      </Text>
                      {c.topWeakness && (
                        <Text style={styles.summaryPpStatement}>Gap: {c.topWeakness}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {!data?.cached && (
            <Text style={styles.freshnessMeta}>Computed just now</Text>
          )}
          {data?.cached && summary.computedAt && (
            <Text style={styles.freshnessMeta}>
              Last computed {new Date(summary.computedAt).toLocaleDateString()}
            </Text>
          )}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// CMS Profile Card
// ---------------------------------------------------------------------------

function CmsProfileCard({ orgId }: { orgId: string }) {
  const { data, isLoading } = useHealthcareProfile(orgId);
  const profile = data?.profile;

  if (isLoading) return <Card><ActivityIndicator color={COLORS.cyan} /></Card>;
  if (!profile) return null;

  const metrics: Array<{ label: string; value: string | number | null; highlight?: boolean }> = [
    { label: "CCN", value: profile.cmsCcn },
    { label: "Bed Count", value: profile.cmsBedCount },
    { label: "Provider Type", value: profile.cmsProviderType },
    { label: "Overall Stars", value: profile.cmsOverallStarRating ? `${profile.cmsOverallStarRating}/5 ★` : null },
    { label: "Patient Experience", value: profile.cmsPatientExperienceRating ? `${profile.cmsPatientExperienceRating}/5 ★` : null, highlight: (profile.cmsPatientExperienceRating ?? 5) <= 2 },
    { label: "ED Boarding", value: profile.cmsEdBoardingTimeMinutes ? `${profile.cmsEdBoardingTimeMinutes} min` : null, highlight: (profile.cmsEdBoardingTimeMinutes ?? 0) > 60 },
    { label: "ED Admit Wait", value: profile.cmsEdTimeToAdmitMinutes ? `${profile.cmsEdTimeToAdmitMinutes} min` : null, highlight: (profile.cmsEdTimeToAdmitMinutes ?? 0) > 120 },
    { label: "LWBS Rate", value: profile.cmsEdLwbsPercent ? `${(profile.cmsEdLwbsPercent / 100).toFixed(1)}%` : null, highlight: (profile.cmsEdLwbsPercent ?? 0) > 300 },
    { label: "Care Transition", value: profile.cmsCareTransitionRating ? `${profile.cmsCareTransitionRating}/5 ★` : null, highlight: (profile.cmsCareTransitionRating ?? 5) <= 2 },
    { label: "Emergency Services", value: profile.cmsEmergencyServices ? "Yes" : profile.cmsEmergencyServices === false ? "No" : null },
  ].filter(m => m.value !== null && m.value !== undefined);

  if (metrics.length === 0) return null;

  return (
    <Card>
      <View style={styles.cardTitleRow}>
        <View style={styles.cardTitleLeft}>
          <Feather name="database" size={14} color={COLORS.blue} />
          <Text style={styles.cardTitle}>CMS Data</Text>
        </View>
        {profile.cmsVerificationStatus && (
          <View style={[styles.countBadge, { backgroundColor: COLORS.blue + "20" }]}>
            <Text style={[styles.countBadgeText, { color: COLORS.blue }]}>
              {profile.cmsVerificationStatus}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.cmsGrid}>
        {metrics.map(m => (
          <View key={m.label} style={styles.cmsMetric}>
            <Text style={styles.cmsMetricLabel}>{m.label}</Text>
            <Text style={[styles.cmsMetricValue, m.highlight && { color: COLORS.red }]}>
              {m.value}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Section Export
// ---------------------------------------------------------------------------

interface Props {
  orgId: string;
  canReview?: boolean;
}

export function HealthcareIntelligenceSection({ orgId, canReview = false }: Props) {
  return (
    <View>
      <View style={styles.section}>
        <SectionHeader title="Healthcare Opportunity Score" />
        <OpportunityScoreCard orgId={orgId} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Intelligence Summary" />
        <IntelligenceSummaryCard orgId={orgId} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Pain Points" />
        <PainPointsCard orgId={orgId} canReview={canReview} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="Competitive Landscape" />
        <CompetitorsCard orgId={orgId} />
      </View>

      <View style={styles.section}>
        <SectionHeader title="CMS Profile" />
        <CmsProfileCard orgId={orgId} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },

  // Score card
  scoreHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  scoreLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 2,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: "700",
    lineHeight: 36,
  },
  scoreMax: {
    fontSize: 16,
    fontWeight: "400",
    color: COLORS.textDim,
  },
  refreshBtn: {
    padding: 6,
  },
  staleWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.amber + "15",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  staleWarningText: {
    color: COLORS.amber,
    fontSize: 12,
  },
  dimensionsGrid: {
    gap: 10,
  },
  dimensionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  dimensionLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    width: 120,
  },
  dimensionRight: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dimensionScore: {
    fontSize: 12,
    fontWeight: "600",
    width: 28,
    textAlign: "right",
  },
  freshnessMeta: {
    color: COLORS.textDim,
    fontSize: 11,
    marginTop: 12,
    textAlign: "right",
  },

  // Card title
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardTitleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  competitorCount: {
    color: COLORS.textDim,
    fontSize: 13,
  },
  ppCounts: {
    flexDirection: "row",
    gap: 6,
  },
  countBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },

  // Pain point row
  ppRow: {
    paddingVertical: 8,
  },
  ppRowTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  ppRowContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  ppCategory: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "500",
  },
  ppMetaInline: {
    color: COLORS.textDim,
    fontSize: 11,
  },
  ppSeverity: {
    fontSize: 11,
    fontWeight: "600",
  },
  ppStatusBadge: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  ppStatusText: {
    fontSize: 10,
    fontWeight: "600",
  },
  ppExpanded: {
    marginTop: 10,
    marginLeft: 18,
    paddingLeft: 10,
    borderLeftWidth: 2,
    borderLeftColor: COLORS.navyBorder,
    gap: 8,
  },
  ppStatement: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  ppMeta: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
  },
  ppMetaText: {
    color: COLORS.textDim,
    fontSize: 11,
  },
  reviewActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.emerald + "15",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.emerald + "44",
  },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.red + "15",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  reviewBtnText: {
    fontSize: 12,
    fontWeight: "600",
  },

  // Competitor
  dispBadge: {
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  dispText: {
    fontSize: 10,
    fontWeight: "600",
  },
  compMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  compListSection: {
    gap: 4,
  },
  compListTitle: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  compListItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingVertical: 1,
  },
  compBullet: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginTop: 5,
  },
  compListText: {
    color: COLORS.textMuted,
    fontSize: 12,
    lineHeight: 18,
    flex: 1,
  },

  // Intelligence Summary
  impactBox: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  impactStatement: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },
  strategyRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 10,
  },
  strategyLabel: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  strategyValue: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 19,
  },
  buyerPatternsBox: {
    marginTop: 6,
    gap: 4,
  },
  summaryPpRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  summaryPpStatement: {
    color: COLORS.textDim,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 1,
  },

  // CMS Grid
  cmsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  cmsMetric: {
    width: "47%",
  },
  cmsMetricLabel: {
    color: COLORS.textDim,
    fontSize: 11,
    marginBottom: 2,
  },
  cmsMetricValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },

  // Shared
  divider: {
    height: 1,
    backgroundColor: COLORS.navyBorder,
    marginVertical: 4,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  emptyText: {
    color: COLORS.textDim,
    fontSize: 13,
  },
  showMoreBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 12,
  },
  showMoreText: {
    color: COLORS.blue,
    fontSize: 12,
    fontWeight: "600",
  },
  runSuggestionsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.emerald + "15",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.emerald + "44",
  },
  runSuggestionsText: {
    color: COLORS.emerald,
    fontSize: 12,
    fontWeight: "600",
  },
});
