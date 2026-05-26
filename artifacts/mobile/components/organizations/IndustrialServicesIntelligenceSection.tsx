import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";

const TEAL = "#14B8A6";

interface Props {
  orgId: string;
  orgName?: string;
  serviceLineTags?: string[];
}

// Consistent with the SummaryTile (lightweight fuller variant)
const TARGET_INDUSTRIES = [
  "Manufacturing & Process",
  "Food & Beverage",
  "Pharma & Life Sciences",
  "Power Generation",
  "Data Centers & Tech",
  "Pulp & Paper",
  "Chemical Processing",
  "Oil & Gas",
  "Municipal & Utilities",
];

const APPLICATIONS = [
  "Boilers",
  "Cooling Towers",
  "Wastewater & Reuse",
  "Process Water",
  "High Purity / RO",
  "IoT Monitoring",
];

const SERVICE_LINES = [
  { key: "recurring", label: "Recurring Water Treatment Program" },
  { key: "monitoring", label: "Remote Monitoring & Optimization" },
  { key: "assessment", label: "Technical Assessment & Pilot" },
];

export function IndustrialServicesIntelligenceSection({ orgId, orgName, serviceLineTags = [] }: Props) {
  const router = useRouter();

  const lowerTags = (serviceLineTags || []).map((t) => (t || "").toLowerCase());

  const activeServices = SERVICE_LINES.filter((s) =>
    lowerTags.some((tag) =>
      tag.includes(s.key) ||
      tag.includes("water") ||
      tag.includes("pilot") ||
      tag.includes("remote")
    )
  );

  return (
    <View>
      <View style={styles.section}>
        <SectionHeader title="Industrial Services Intelligence" />
        <Card>
          <View style={styles.headerRow}>
            <Feather name="tool" size={16} color={TEAL} />
            <Text style={styles.title}>Water Treatment &amp; Industrial Programs</Text>
          </View>

          <Text style={styles.sub}>Tailored for Apex-style industrial clients.</Text>

          {/* Target Industries */}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Target Industries</Text>
            <View style={styles.chipRow}>
              {TARGET_INDUSTRIES.map((ind, i) => (
                <View key={i} style={[styles.chip, { borderColor: TEAL + "44" }]}>
                  <Text style={[styles.chipTxt, { color: TEAL }]}>{ind}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Applications */}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Key Applications</Text>
            <View style={styles.appGrid}>
              {APPLICATIONS.map((app, i) => (
                <View key={i} style={styles.appChip}>
                  <Feather name="droplet" size={11} color={COLORS.cyan} />
                  <Text style={styles.appChipTxt}>{app}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Service Lines */}
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Enabled Service Lines</Text>
            {SERVICE_LINES.map((svc, i) => {
              const isActive = activeServices.some((a) => a.key === svc.key);
              return (
                <View key={i} style={[styles.svcRow, isActive && styles.svcActive]}>
                  <Text style={[styles.svcLabel, isActive && { color: TEAL }]}>{svc.label}</Text>
                  {isActive ? (
                    <Text style={styles.activePill}>Active on this account</Text>
                  ) : (
                    <Text style={styles.inactivePill}>Available</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Quick Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/workspace/pipelines` as Href)}
            >
              <Feather name="git-merge" size={14} color={COLORS.blue} />
              <Text style={styles.actionTxt}>View Water Pipelines</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/opportunity/new?organizationId=${orgId}` as Href)}
            >
              <Feather name="plus" size={14} color={COLORS.emerald} />
              <Text style={styles.actionTxt}>New Industrial Opp / Pilot</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/organizations?vertical=industrial_services` as Href)}
            >
              <Feather name="list" size={14} color={TEAL} />
              <Text style={styles.actionTxt}>Browse Industrial Accounts</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => router.push(`/capture/new?organizationId=${orgId}` as Href)}
            >
              <Feather name="user-plus" size={14} color={COLORS.emerald} />
              <Text style={styles.actionTxt}>Add EHS / Plant Contact</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  title: {
    color: COLORS.text,
    fontSize: 15,
    fontWeight: "600",
  },
  sub: {
    color: COLORS.textDim,
    fontSize: 12,
    marginBottom: 12,
  },
  block: {
    marginBottom: 12,
  },
  blockTitle: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: COLORS.navySurface,
  },
  chipTxt: {
    fontSize: 11,
    fontWeight: "500",
  },
  appGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  appChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: COLORS.navySurface,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  appChipTxt: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  svcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 6,
  },
  svcActive: {
    backgroundColor: TEAL + "10",
  },
  svcLabel: {
    color: COLORS.text,
    fontSize: 13,
  },
  activePill: {
    fontSize: 10,
    color: TEAL,
    backgroundColor: TEAL + "22",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  inactivePill: {
    fontSize: 10,
    color: COLORS.textDim,
    backgroundColor: COLORS.navyBorder,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.navySurface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  actionTxt: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: "500",
  },
});
