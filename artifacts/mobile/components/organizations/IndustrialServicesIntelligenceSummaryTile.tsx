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
import { useRouter } from "expo-router";
import type { Href } from "expo-router";

const TEAL = "#14B8A6";
const TEAL_LIGHT = "#5EEAD4";

type SectionId = "industries" | "applications" | "services" | "links";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const SECTIONS: SectionDef[] = [
  { id: "industries", label: "Target Industries", icon: "globe", color: TEAL },
  { id: "applications", label: "Key Applications", icon: "droplet", color: "#0EA5E9" },
  { id: "services", label: "Service Lines", icon: "settings", color: COLORS.amber },
  { id: "links", label: "Quick Links", icon: "external-link", color: COLORS.purple },
];

// Tailored for water treatment / industrial optimization clients (e.g. Apex-style)
const TARGET_INDUSTRIES = [
  "Manufacturing & Process",
  "Food & Beverage",
  "Pharmaceutical & Life Sciences",
  "Power Generation",
  "Data Centers & Tech",
  "Pulp & Paper",
  "Chemical Processing",
  "Oil & Gas / Petrochem",
  "Municipal & Utilities",
];

const KEY_APPLICATIONS = [
  "Boiler Feedwater Treatment",
  "Cooling Tower Programs",
  "Wastewater Treatment & Reuse",
  "Process Water Optimization",
  "RO / UF / High Purity",
  "Remote Monitoring & IoT",
  "Legionella & Compliance",
];

// Service lines with keyword matchers for highlighting enabled ones from org.serviceLineTags / workspace tags
const SERVICE_LINE_DEFS = [
  {
    label: "Recurring Water Treatment",
    keywords: ["recurring", "water treatment", "program", "contract"],
  },
  {
    label: "Technical Assessments & Pilots",
    keywords: ["assessment", "pilot", "technical", "study", "trial"],
  },
  {
    label: "Remote Monitoring & Optimization",
    keywords: ["remote", "monitoring", "iot", "optimization", "sensor", "dashboard"],
  },
];

interface Props {
  orgId: string;
  isAdmin: boolean;
  serviceLineTags?: string[];
}

export function IndustrialServicesIntelligenceSummaryTile({ orgId, isAdmin, serviceLineTags = [] }: Props) {
  const [expanded, setExpanded] = useState<SectionId | null>(null);
  const router = useRouter();

  const loadedMap: Record<SectionId, boolean> = {
    industries: true,
    applications: true,
    services: true,
    links: true,
  };

  const toggle = (id: SectionId) =>
    setExpanded((prev) => (prev === id ? null : id));

  // Compute relevant / enabled service tags from the passed serviceLineTags (from org or workspace)
  const lowerTags = (serviceLineTags || []).map((t) => (t || "").toLowerCase());

  const enabledServiceLines = SERVICE_LINE_DEFS.map((def) => {
    const isEnabled = lowerTags.some((tag) =>
      def.keywords.some((kw) => tag.includes(kw))
    );
    return { ...def, isEnabled };
  });

  const enabledCount = enabledServiceLines.filter((s) => s.isEnabled).length;

  return (
    <View style={styles.wrapper}>
      <View style={styles.tileCard}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIconWrap, { backgroundColor: TEAL + "22" }]}>
              <Feather name="tool" size={14} color={TEAL} />
            </View>
            <Text style={styles.headerTitle}>Industrial Services Intelligence</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={[styles.loadedCount, { color: TEAL }]}>Ready</Text>
          </View>
        </View>

        {/* 2×2 Grid */}
        <View style={styles.grid}>
          {SECTIONS.map((section) => {
            const isLoaded = loadedMap[section.id];
            const isOpen = expanded === section.id;

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
                    <View
                      style={[
                        styles.statusDot,
                        { backgroundColor: isLoaded ? TEAL : COLORS.textDim },
                        isLoaded && styles.statusDotLoaded,
                      ]}
                    />
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

      {/* Inline expanded content */}
      {expanded === "industries" && (
        <View style={styles.expandedCard}>
          <Text style={styles.expTitle}>Common Target Industries</Text>
          <View style={styles.chipWrap}>
            {TARGET_INDUSTRIES.map((ind, i) => (
              <View key={i} style={[styles.chip, { borderColor: TEAL + "44", backgroundColor: TEAL + "10" }]}>
                <Text style={[styles.chipText, { color: TEAL }]}>{ind}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.expHint}>Use for account segmentation, saved views, and targeted plays.</Text>
        </View>
      )}

      {expanded === "applications" && (
        <View style={styles.expandedCard}>
          <Text style={styles.expTitle}>Key Applications</Text>
          <View style={styles.appList}>
            {KEY_APPLICATIONS.map((app, i) => (
              <View key={i} style={styles.appRow}>
                <Feather name="check-circle" size={13} color={COLORS.emerald} />
                <Text style={styles.appText}>{app}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.quickLink}
            onPress={() => router.push(`/opportunities?vertical=industrial_services` as Href)}
            activeOpacity={0.8}
          >
            <Text style={styles.quickLinkText}>View opportunities by application</Text>
            <Feather name="chevron-right" size={14} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>
      )}

      {expanded === "services" && (
        <View style={styles.expandedCard}>
          <Text style={styles.expTitle}>Offered Service Lines (Workspace-Enabled)</Text>
          <View style={styles.serviceList}>
            {enabledServiceLines.map((svc, i) => (
              <View key={i} style={[styles.serviceRow, svc.isEnabled && styles.serviceRowActive]}>
                <View style={[styles.serviceDot, { backgroundColor: svc.isEnabled ? TEAL : COLORS.textDim }]} />
                <Text style={[styles.serviceText, svc.isEnabled && { color: TEAL, fontWeight: "600" }]}>{svc.label}</Text>
                {svc.isEnabled && <Text style={styles.activeTag}>Enabled</Text>}
              </View>
            ))}
          </View>
          <Text style={styles.expHint}>
            {enabledCount > 0
              ? `${enabledCount} service line(s) matched from this org's tags.`
              : "Match against your enabled service lines / tags for precise targeting."}
          </Text>
          <Text style={[styles.expHint, { marginTop: 2 }]}>Pulled from org.serviceLineTags on the workspace.</Text>
        </View>
      )}

      {expanded === "links" && (
        <View style={styles.expandedCard}>
          <Text style={styles.expTitle}>Quick Links &amp; Actions</Text>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push(`/workspace/pipelines` as Href)}
            activeOpacity={0.8}
          >
            <Feather name="git-merge" size={14} color={COLORS.blue} />
            <Text style={styles.linkText}>Water Treatment Pipelines</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push(`/opportunities` as Href)}
            activeOpacity={0.8}
          >
            <Feather name="trending-up" size={14} color={COLORS.amber} />
            <Text style={styles.linkText}>Active Recurring Programs View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push(`/organizations?vertical=industrial_services` as Href)}
            activeOpacity={0.8}
          >
            <Feather name="globe" size={14} color={TEAL} />
            <Text style={styles.linkText}>Browse Industrial Accounts</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push(`/opportunity/new?organizationId=${orgId}` as Href)}
            activeOpacity={0.8}
          >
            <Feather name="plus-circle" size={14} color={COLORS.emerald} />
            <Text style={styles.linkText}>Create Pilot / Assessment Opp</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() => router.push(`/capture/new?organizationId=${orgId}` as Href)}
            activeOpacity={0.8}
          >
            <Feather name="user-plus" size={14} color={COLORS.emerald} />
            <Text style={styles.linkText}>Add EHS / Plant / Ops Contact</Text>
          </TouchableOpacity>
          <Text style={styles.expHint}>Pre-seeded views, pipelines, and capture flows from Day 1.</Text>
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
    borderColor: TEAL + "33",
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
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
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
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TEAL + "22",
    padding: 14,
    gap: 8,
  },
  expTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 4,
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipText: {
    fontSize: 11,
    fontWeight: "500",
  },
  appList: {
    gap: 6,
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  appText: {
    color: COLORS.textMuted,
    fontSize: 13,
    flex: 1,
  },
  serviceList: {
    gap: 6,
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  serviceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  serviceRowActive: {
    backgroundColor: TEAL + "08",
    borderRadius: 6,
    paddingHorizontal: 4,
  },
  serviceText: {
    color: COLORS.textMuted,
    fontSize: 13,
    flex: 1,
  },
  activeTag: {
    fontSize: 10,
    color: TEAL,
    fontWeight: "600",
    backgroundColor: TEAL + "22",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  linkText: {
    color: COLORS.text,
    fontSize: 13,
    flex: 1,
  },
  quickLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.navyBorder,
  },
  quickLinkText: {
    color: COLORS.blue,
    fontSize: 12,
    fontWeight: "600",
  },
  expHint: {
    color: COLORS.textDim,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 4,
  },
});
