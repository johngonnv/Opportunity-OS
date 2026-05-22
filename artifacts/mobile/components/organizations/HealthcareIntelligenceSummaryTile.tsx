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
import {
  useHealthcareProfile,
  useOrganizationPainPoints,
  useOrganizationCompetitors,
  useOrganizationIntelligenceSummary,
} from "@/hooks/useApi";
import { CMSEvidenceCard } from "./CMSEvidenceCard";
import { PainPointsCard } from "./PainPointsCard";
import { CompetitorLandscapeCard } from "./CompetitorLandscapeCard";
import { EntryStrategyCard } from "./EntryStrategyCard";

const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#818cf8";

type SectionId = "cms" | "pain" | "competitors" | "strategy";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const SECTIONS: SectionDef[] = [
  { id: "cms", label: "CMS Evidence", icon: "activity", color: COLORS.cyan },
  { id: "pain", label: "Pain Points", icon: "alert-circle", color: COLORS.amber },
  { id: "competitors", label: "Competitors", icon: "users", color: COLORS.red },
  { id: "strategy", label: "Entry Strategy", icon: "compass", color: INDIGO_LIGHT },
];

interface Props {
  orgId: string;
  isAdmin: boolean;
}

export function HealthcareIntelligenceSummaryTile({ orgId, isAdmin }: Props) {
  const [expanded, setExpanded] = useState<SectionId | null>(null);

  const { data: cmsData, isLoading: cmsLoading } = useHealthcareProfile(orgId);
  const { data: painData, isLoading: painLoading } = useOrganizationPainPoints(orgId);
  const { data: compData, isLoading: compLoading } = useOrganizationCompetitors(orgId);
  const { data: stratData, isLoading: stratLoading } = useOrganizationIntelligenceSummary(orgId);

  const loadedMap: Record<SectionId, boolean> = {
    cms: !cmsLoading && !!cmsData?.profile,
    pain: !painLoading && (painData?.painPoints?.length ?? 0) > 0,
    competitors: !compLoading && (compData?.competitors?.length ?? 0) > 0,
    strategy: !stratLoading && !!stratData?.summary,
  };

  const loadingMap: Record<SectionId, boolean> = {
    cms: cmsLoading,
    pain: painLoading,
    competitors: compLoading,
    strategy: stratLoading,
  };

  const loadedCount = Object.values(loadedMap).filter(Boolean).length;

  const toggle = (id: SectionId) =>
    setExpanded((prev) => (prev === id ? null : id));

  return (
    <View style={styles.wrapper}>
      <View style={styles.tileCard}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIconWrap, { backgroundColor: INDIGO + "22" }]}>
              <Feather name="cpu" size={14} color={INDIGO_LIGHT} />
            </View>
            <Text style={styles.headerTitle}>Healthcare Intelligence</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.loadedCount, { color: loadedCount === 4 ? COLORS.emerald : COLORS.textDim }]}>
              {loadedCount}/4 loaded
            </Text>
          </View>
        </View>

        {/* 2×2 Grid */}
        <View style={styles.grid}>
          {SECTIONS.map((section) => {
            const isLoaded = loadedMap[section.id];
            const isLoading = loadingMap[section.id];
            const isOpen = expanded === section.id;
            const dotColor = isLoaded ? COLORS.emerald : COLORS.textDim;

            return (
              <TouchableOpacity
                key={section.id}
                style={[
                  styles.cell,
                  isOpen && { borderColor: section.color + "55", backgroundColor: section.color + "0D" },
                ]}
                onPress={() => toggle(section.id)}
                activeOpacity={0.75}
              >
                <View style={styles.cellTop}>
                  <View style={styles.cellIconRow}>
                    <Feather
                      name={section.icon}
                      size={12}
                      color={isLoaded ? section.color : COLORS.textDim}
                    />
                    {isLoading ? (
                      <ActivityIndicator size="small" color={COLORS.textDim} style={styles.cellSpinner} />
                    ) : (
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: dotColor },
                          isLoaded && styles.statusDotLoaded,
                        ]}
                      />
                    )}
                  </View>
                  <Text
                    style={[
                      styles.cellLabel,
                      { color: isLoaded ? COLORS.text : COLORS.textDim },
                    ]}
                    numberOfLines={2}
                  >
                    {section.label}
                  </Text>
                </View>
                <Feather
                  name={isOpen ? "chevron-up" : "chevron-down"}
                  size={11}
                  color={isOpen ? section.color : COLORS.textDim}
                  style={styles.cellChevron}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Inline expanded cards */}
      {expanded === "cms" && (
        <View style={styles.expandedCard}>
          <CMSEvidenceCard orgId={orgId} />
        </View>
      )}
      {expanded === "pain" && (
        <View style={styles.expandedCard}>
          <PainPointsCard orgId={orgId} isAdmin={isAdmin} />
        </View>
      )}
      {expanded === "competitors" && (
        <View style={styles.expandedCard}>
          <CompetitorLandscapeCard orgId={orgId} isAdmin={isAdmin} />
        </View>
      )}
      {expanded === "strategy" && (
        <View style={styles.expandedCard}>
          <EntryStrategyCard orgId={orgId} isAdmin={isAdmin} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  tileCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: INDIGO + "33",
    padding: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  headerIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  loadedCount: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cell: {
    width: "47.5%",
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 10,
    justifyContent: "space-between",
    minHeight: 68,
  },
  cellTop: {
    gap: 6,
  },
  cellIconRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusDotLoaded: {
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  cellSpinner: {
    transform: [{ scale: 0.65 }],
  },
  cellLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    lineHeight: 16,
  },
  cellChevron: {
    alignSelf: "flex-end",
    marginTop: 4,
  },
  expandedCard: {
    marginTop: 8,
  },
});
