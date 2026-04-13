import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useOrganizationCompetitors, type Competitor } from "@/hooks/useApi";
import { Card } from "@/components/ui/Card";

const INCUMBENT_LABEL: Record<string, string> = {
  CONFIRMED_INCUMBENT: "Incumbent",
  SUSPECTED_INCUMBENT: "Suspected",
  FORMER_INCUMBENT: "Former",
  NOT_INCUMBENT: "Not Incumbent",
};

const INCUMBENT_COLOR: Record<string, string> = {
  CONFIRMED_INCUMBENT: COLORS.red,
  SUSPECTED_INCUMBENT: COLORS.amber,
  FORMER_INCUMBENT: COLORS.textDim,
  NOT_INCUMBENT: COLORS.textDim,
};

const COMPETITOR_TYPE_LABEL: Record<string, string> = {
  DIRECT: "Direct",
  INDIRECT: "Indirect",
  EMERGING: "Emerging",
  LEGACY: "Legacy",
  NICHE: "Niche",
};

const DISPLACEMENT_COLOR: Record<string, string> = {
  VERY_HIGH: COLORS.red,
  HIGH: "#F97316",
  MEDIUM: COLORS.amber,
  LOW: COLORS.emerald,
};

const DISPLACEMENT_LABEL: Record<string, string> = {
  VERY_HIGH: "Very High",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

interface CompetitorRowProps {
  comp: Competitor;
}

function CompetitorRow({ comp }: CompetitorRowProps) {
  const [expanded, setExpanded] = useState(false);

  const incumbentColor = INCUMBENT_COLOR[comp.incumbentStatus] ?? COLORS.textDim;
  const incumbentLabel = INCUMBENT_LABEL[comp.incumbentStatus] ?? comp.incumbentStatus;
  const typeLabel = COMPETITOR_TYPE_LABEL[comp.competitorType] ?? comp.competitorType;
  const dispColor = comp.displacementDifficulty
    ? DISPLACEMENT_COLOR[comp.displacementDifficulty] ?? COLORS.textDim
    : COLORS.textDim;
  const dispLabel = comp.displacementDifficulty
    ? DISPLACEMENT_LABEL[comp.displacementDifficulty] ?? comp.displacementDifficulty
    : null;

  const isConfirmedIncumbent = comp.incumbentStatus === "CONFIRMED_INCUMBENT";

  return (
    <TouchableOpacity
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.8}
      style={styles.compRow}
    >
      <View style={styles.compRowCollapsed}>
        <View style={styles.compRowLeft}>
          <Feather
            name="shield"
            size={14}
            color={incumbentColor}
            style={{ marginTop: 1 }}
          />
          <View style={styles.compNameBlock}>
            <Text style={styles.compName} numberOfLines={1}>{comp.competitorName}</Text>
            {comp.serviceLine ? (
              <Text style={styles.compServiceLine} numberOfLines={1}>{comp.serviceLine}</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.compBadgeRow}>
          <View style={[styles.typeBadge, { backgroundColor: COLORS.textDim + "18", borderColor: COLORS.textDim + "33" }]}>
            <Text style={[styles.typeBadgeText, { color: COLORS.textDim }]}>{typeLabel}</Text>
          </View>
          {isConfirmedIncumbent && (
            <View style={[styles.typeBadge, { backgroundColor: incumbentColor + "18", borderColor: incumbentColor + "33" }]}>
              <Text style={[styles.typeBadgeText, { color: incumbentColor }]}>{incumbentLabel}</Text>
            </View>
          )}
          {dispLabel && (
            <View style={[styles.typeBadge, { backgroundColor: dispColor + "18", borderColor: dispColor + "33" }]}>
              <Text style={[styles.typeBadgeText, { color: dispColor }]}>{dispLabel}</Text>
            </View>
          )}
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={14}
          color={COLORS.textDim}
          style={{ marginLeft: 4 }}
        />
      </View>

      {expanded && (
        <View style={styles.compExpanded}>
          {!isConfirmedIncumbent && (
            <View style={styles.expandedMetaRow}>
              <View style={[styles.typeBadge, { backgroundColor: incumbentColor + "18", borderColor: incumbentColor + "33" }]}>
                <Text style={[styles.typeBadgeText, { color: incumbentColor }]}>{incumbentLabel}</Text>
              </View>
              {comp.shareOfWalletEstimate !== null && (
                <Text style={styles.metaText}>Wallet share: {comp.shareOfWalletEstimate}%</Text>
              )}
            </View>
          )}

          {comp.strengths.length > 0 && (
            <View style={styles.listSection}>
              <Text style={styles.listTitle}>Strengths</Text>
              {comp.strengths.map((s, i) => (
                <View key={i} style={styles.listItem}>
                  <View style={[styles.bullet, { backgroundColor: COLORS.red }]} />
                  <Text style={styles.listText}>{s}</Text>
                </View>
              ))}
            </View>
          )}

          {comp.weaknesses.length > 0 && (
            <View style={styles.listSection}>
              <Text style={styles.listTitle}>Weaknesses</Text>
              {comp.weaknesses.map((w, i) => (
                <View key={i} style={styles.listItem}>
                  <View style={[styles.bullet, { backgroundColor: COLORS.emerald }]} />
                  <Text style={styles.listText}>{w}</Text>
                </View>
              ))}
            </View>
          )}

          {comp.painPointsCaused.length > 0 && (
            <View style={styles.linkedPainRow}>
              <Feather name="link" size={11} color={COLORS.amber} />
              <Text style={styles.linkedPainText}>
                {comp.painPointsCaused.length} linked pain point{comp.painPointsCaused.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}

          <Text style={[styles.metaText, { marginTop: 4 }]}>
            Confidence: {comp.confidenceScore}%
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

interface Props {
  orgId: string;
  isAdmin: boolean;
}

export function CompetitorLandscapeCard({ orgId, isAdmin }: Props) {
  const { data, isLoading } = useOrganizationCompetitors(orgId);
  const competitors = data?.competitors ?? [];

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Feather name="shield-off" size={14} color={COLORS.purple} />
          <Text style={styles.cardTitle}>Competitor Landscape</Text>
        </View>
        {competitors.length > 0 && (
          <Text style={styles.countLabel}>{competitors.length}</Text>
        )}
      </View>

      <Card>
        {isLoading ? (
          <ActivityIndicator color={COLORS.purple} />
        ) : competitors.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="shield" size={20} color={COLORS.textDim} />
            <Text style={styles.emptyTitle}>No Competitors Mapped</Text>
            <Text style={styles.emptyBody}>
              No competitors have been identified for this account yet.
            </Text>
            {isAdmin && (
              <View style={styles.addCta}>
                <Feather name="plus-circle" size={13} color={COLORS.purple} />
                <Text style={styles.addCtaText}>Add competitor (coming soon)</Text>
              </View>
            )}
          </View>
        ) : (
          <>
            {competitors.map((comp, i) => (
              <View key={comp.id}>
                {i > 0 && <View style={styles.divider} />}
                <CompetitorRow comp={comp} />
              </View>
            ))}
          </>
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
  countLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.textDim,
  },
  compRow: {
    paddingVertical: 10,
  },
  compRowCollapsed: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  compRowLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  compNameBlock: {
    flex: 1,
    minWidth: 0,
  },
  compName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
  },
  compServiceLine: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 1,
  },
  compBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    alignItems: "center",
    flexShrink: 0,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
  },
  typeBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.2,
  },
  compExpanded: {
    marginTop: 10,
    marginLeft: 22,
    gap: 8,
  },
  expandedMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
  },
  listSection: {
    gap: 4,
  },
  listTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
    flexShrink: 0,
  },
  listText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
    lineHeight: 18,
  },
  linkedPainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  linkedPainText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.amber,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.navyBorder,
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
  addCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    backgroundColor: COLORS.purple + "15",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.purple + "33",
  },
  addCtaText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.purple,
  },
});
