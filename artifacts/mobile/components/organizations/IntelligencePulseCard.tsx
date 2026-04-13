import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useOrganizationOpportunityScore } from "@/hooks/useApi";

interface Props {
  health: number;
  risk: number;
  gapsCount: number;
  focus: string | null;
  orgId?: string;
}

const TOOLTIPS: Record<string, { title: string; body: string }> = {
  health: {
    title: "Health Score",
    body: "Computed from open opportunities (+25), activity recency (+up to 30), Decision Maker presence (+15), Champion presence (+10), and engaged contacts (+5-10). Higher is better.",
  },
  risk: {
    title: "Risk Score",
    body: "Computed from stale stage >30d (+30), overdue tasks (+25), inactivity >30d (+25), and missing key stakeholders (+15). Lower is better.",
  },
  gaps: {
    title: "Coverage Gaps",
    body: "Missing required stakeholder roles (Decision Maker, Champion), unlinked contacts on open opportunities, or all-cold relationship strengths.",
  },
  focus: {
    title: "Primary Focus",
    body: "The top vertical or domain for this account based on org profile settings.",
  },
};

const DIMENSION_LABELS: Record<string, string> = {
  cmsOperationalPressure: "CMS Operational Pressure",
  painPointSeverity: "Pain Point Severity",
  competitorWeaknessDelta: "Competitor Weakness Gap",
  relationshipDepth: "Relationship Depth",
  buyerAccessMaturity: "Buyer Access Maturity",
  bedCountScale: "Bed Count Scale",
  dataConfidence: "Data Confidence",
};

function ProgressBar({ value, color }: { value: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <View style={styles.barTrack}>
      <View style={{ flex: clamped, height: 4, backgroundColor: color, borderRadius: 2 }} />
      {clamped < 100 && <View style={{ flex: 100 - clamped }} />}
    </View>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <View style={styles.scoreBarTrack}>
      <View style={{ flex: clamped, height: 5, backgroundColor: color, borderRadius: 2.5 }} />
      {clamped < 100 && <View style={{ flex: 100 - clamped }} />}
    </View>
  );
}

function PulseCell({ label, value, metric, onPress }: {
  label: string;
  value: React.ReactNode;
  metric: string;
  onPress: (key: string) => void;
}) {
  return (
    <TouchableOpacity style={styles.cell} onPress={() => onPress(metric)} activeOpacity={0.75}>
      <Text style={styles.cellLabel}>{label}</Text>
      {value}
    </TouchableOpacity>
  );
}

function OppScoreCell({ orgId, onPress }: { orgId: string; onPress: () => void }) {
  const { data, isLoading } = useOrganizationOpportunityScore(orgId);
  const score = data?.overallScore ?? null;
  const scoreColor =
    score === null ? COLORS.textDim :
    score >= 70 ? COLORS.emerald :
    score >= 40 ? COLORS.amber :
    COLORS.red;

  return (
    <TouchableOpacity style={[styles.cell, styles.oppCell]} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.oppCellHeader}>
        <Text style={styles.cellLabel}>Opp Score</Text>
        <Feather name="chevron-right" size={11} color={COLORS.textDim} />
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={COLORS.emerald} />
      ) : score !== null ? (
        <View>
          <Text style={[styles.scoreText, { color: scoreColor }]}>
            {score}<Text style={styles.scoreMax}>/100</Text>
          </Text>
          <ProgressBar value={score} color={scoreColor} />
        </View>
      ) : (
        <Text style={[styles.scoreText, { color: COLORS.textDim }]}>—</Text>
      )}
    </TouchableOpacity>
  );
}

function OppScoreModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const { data, isLoading } = useOrganizationOpportunityScore(orgId);
  const score = data?.overallScore ?? null;
  const scoreColor =
    score === null ? COLORS.textDim :
    score >= 70 ? COLORS.emerald :
    score >= 40 ? COLORS.amber :
    COLORS.red;

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable style={styles.oppModal} onPress={() => {}}>
        <View style={styles.oppModalHeader}>
          <Text style={styles.oppModalTitle}>Opportunity Score</Text>
          <TouchableOpacity onPress={onClose} style={styles.oppModalClose}>
            <Feather name="x" size={16} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <ActivityIndicator color={COLORS.emerald} style={{ marginVertical: 20 }} />
        ) : !data ? (
          <Text style={styles.tooltipBody}>Score not available for this account.</Text>
        ) : (
          <>
            <View style={styles.oppScoreHero}>
              <Text style={[styles.oppScoreHeroValue, { color: scoreColor }]}>{score}</Text>
              <Text style={styles.oppScoreHeroMax}>/100</Text>
            </View>

            {data.freshness.staleSignals.length > 0 && (
              <View style={styles.staleRow}>
                <Feather name="alert-triangle" size={12} color={COLORS.amber} />
                <Text style={styles.staleText}>
                  Stale signals: {data.freshness.staleSignals.join(", ")}
                </Text>
              </View>
            )}

            <Text style={styles.dimensionsSectionLabel}>Score Breakdown</Text>

            {Object.entries(DIMENSION_LABELS).map(([key, label]) => {
              const dim = data.dimensions[key];
              if (!dim) return null;
              const dimScore = dim.score;
              const dimColor =
                dimScore >= 70 ? COLORS.emerald :
                dimScore >= 40 ? COLORS.amber :
                COLORS.red;
              return (
                <View key={key} style={styles.dimensionRow}>
                  <View style={styles.dimensionLabelRow}>
                    <Text style={styles.dimensionLabel}>{label}</Text>
                    <Text style={[styles.dimensionScore, { color: dimColor }]}>{dimScore}</Text>
                  </View>
                  <View style={styles.dimensionBarRow}>
                    <ScoreBar value={dimScore} color={dimColor} />
                    <Text style={styles.dimensionWeight}>×{dim.weight}</Text>
                  </View>
                </View>
              );
            })}

            {data.freshness.cmsDataAgeDays !== null && (
              <Text style={styles.freshnessFooter}>
                CMS data age: {data.freshness.cmsDataAgeDays}d · Scored {new Date(data.scoredAt).toLocaleString()}
              </Text>
            )}
          </>
        )}

        <TouchableOpacity onPress={onClose} style={styles.modalDismissBtn}>
          <Text style={styles.modalDismissBtnText}>Close</Text>
        </TouchableOpacity>
      </Pressable>
    </Pressable>
  );
}

export function IntelligencePulseCard({ health, risk, gapsCount, focus, orgId }: Props) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [oppModalOpen, setOppModalOpen] = useState(false);
  const tooltip = activeTooltip ? TOOLTIPS[activeTooltip] : null;

  const healthColor = health >= 60 ? COLORS.emerald : health >= 30 ? COLORS.amber : COLORS.red;
  const riskColor = risk >= 60 ? COLORS.red : risk >= 30 ? COLORS.amber : COLORS.emerald;
  const gapsColor = gapsCount === 0 ? COLORS.emerald : gapsCount === 1 ? COLORS.amber : COLORS.red;

  return (
    <>
      <View style={styles.grid}>
        <PulseCell
          label="Health"
          metric="health"
          onPress={setActiveTooltip}
          value={
            <View>
              <Text style={[styles.scoreText, { color: healthColor }]}>{health}</Text>
              <ProgressBar value={health} color={healthColor} />
            </View>
          }
        />
        <PulseCell
          label="Risk"
          metric="risk"
          onPress={setActiveTooltip}
          value={
            <View>
              <Text style={[styles.scoreText, { color: riskColor }]}>{risk}</Text>
              <ProgressBar value={risk} color={riskColor} />
            </View>
          }
        />
        <PulseCell
          label="Gaps"
          metric="gaps"
          onPress={setActiveTooltip}
          value={
            <Text style={[styles.scoreText, { color: gapsColor }]}>{gapsCount}</Text>
          }
        />
        <PulseCell
          label="Focus"
          metric="focus"
          onPress={setActiveTooltip}
          value={
            <Text style={styles.focusText} numberOfLines={2}>{focus || "—"}</Text>
          }
        />
        {orgId && (
          <OppScoreCell orgId={orgId} onPress={() => setOppModalOpen(true)} />
        )}
      </View>

      <Modal visible={!!activeTooltip} transparent animationType="fade" onRequestClose={() => setActiveTooltip(null)}>
        <Pressable style={styles.overlay} onPress={() => setActiveTooltip(null)}>
          <View style={styles.tooltipBox}>
            <Text style={styles.tooltipTitle}>{tooltip?.title}</Text>
            <Text style={styles.tooltipBody}>{tooltip?.body}</Text>
            <TouchableOpacity onPress={() => setActiveTooltip(null)} style={styles.tooltipClose}>
              <Text style={styles.tooltipCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {orgId && (
        <Modal visible={oppModalOpen} transparent animationType="slide" onRequestClose={() => setOppModalOpen(false)}>
          <OppScoreModal orgId={orgId} onClose={() => setOppModalOpen(false)} />
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  cell: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    gap: 6,
  },
  oppCell: {
    minWidth: "100%",
    flex: 0,
  },
  oppCellHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cellLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scoreText: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    marginBottom: 4,
  },
  scoreMax: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: COLORS.textDim,
  },
  focusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
  },
  barTrack: {
    height: 4,
    backgroundColor: COLORS.navyBorder,
    borderRadius: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  scoreBarTrack: {
    height: 5,
    backgroundColor: COLORS.navyBorder,
    borderRadius: 2.5,
    flexDirection: "row",
    overflow: "hidden",
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  tooltipBox: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 20,
    maxWidth: 320,
    width: "100%",
  },
  tooltipTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 10,
  },
  tooltipBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  tooltipClose: {
    backgroundColor: COLORS.emerald,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  tooltipCloseText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.navy,
  },
  oppModal: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 20,
    maxWidth: 380,
    width: "100%",
  },
  oppModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  oppModalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: COLORS.text,
  },
  oppModalClose: {
    padding: 4,
  },
  oppScoreHero: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 2,
    marginBottom: 12,
  },
  oppScoreHeroValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 40,
  },
  oppScoreHeroMax: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: COLORS.textDim,
    marginLeft: 2,
  },
  staleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.amber + "15",
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  staleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.amber,
    flex: 1,
  },
  dimensionsSectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  dimensionRow: {
    marginBottom: 10,
    gap: 4,
  },
  dimensionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dimensionLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  dimensionScore: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    marginLeft: 8,
  },
  dimensionBarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dimensionWeight: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    flexShrink: 0,
    width: 22,
    textAlign: "right",
  },
  freshnessFooter: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 8,
  },
  modalDismissBtn: {
    marginTop: 16,
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  modalDismissBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
