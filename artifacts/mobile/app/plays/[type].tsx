import React from "react";
import {
  View, Text, ScrollView, StyleSheet,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

type PlayType = "OPEN_ACCOUNT" | "GROW_ACCOUNT" | "DISPLACE_VENDOR" | "PURSUE_CONTRACT";

interface PlayInfo {
  label: string;
  subtitle: string;
  objective: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const PLAY_INFO: Record<PlayType, PlayInfo> = {
  OPEN_ACCOUNT: {
    label: "Open Account",
    subtitle: "Identify & engage new decision-makers",
    objective: "Establish first contact with a new account and advance through initial qualification stages. Focus on mapping the org chart, identifying the economic buyer, and booking an executive intro call.",
    icon: "user-plus",
    color: COLORS.emerald,
  },
  GROW_ACCOUNT: {
    label: "Grow Account",
    subtitle: "Deepen relationships & expand share",
    objective: "Expand wallet share in an existing account by deepening executive relationships and identifying upsell opportunities. Focus on QBRs, executive sponsorship, and multi-threading across departments.",
    icon: "trending-up",
    color: COLORS.blue,
  },
  DISPLACE_VENDOR: {
    label: "Displace Vendor",
    subtitle: "Replace a competitor in an active account",
    objective: "Displace a competing vendor by uncovering dissatisfaction and positioning a superior solution. Focus on discovering pain points, building a business case, and securing a proof-of-concept.",
    icon: "shield",
    color: COLORS.amber,
  },
  PURSUE_CONTRACT: {
    label: "Pursue Contract",
    subtitle: "Target a specific contract or RFP",
    objective: "Win a targeted contract opportunity by aligning capabilities to requirements and building procurement relationships. Focus on shaping RFP requirements, teaming agreements, and price-to-win analysis.",
    icon: "file-text",
    color: COLORS.purple,
  },
};

const PLACEHOLDER_STAGES = [
  "Identify & Qualify",
  "Executive Intro",
  "Discovery & Needs Analysis",
  "Solution Presentation",
  "Business Case & Validation",
  "Proposal & Negotiation",
  "Close",
];

export default function PlayDetailScreen() {
  const { type } = useLocalSearchParams<{ type: string }>();
  const insets = useSafeAreaInsets();
  const info = PLAY_INFO[type as PlayType];

  if (!info) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Text style={styles.errorText}>Unknown play type.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container]}
      contentContainerStyle={{ paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.hero, { backgroundColor: info.color + "18", borderColor: info.color + "44" }]}>
        <View style={[styles.heroIcon, { backgroundColor: info.color + "25" }]}>
          <Feather name={info.icon} size={32} color={info.color} />
        </View>
        <Text style={styles.heroTitle}>{info.label}</Text>
        <Text style={styles.heroSubtitle}>{info.subtitle}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Objective</Text>
        <Text style={styles.objectiveText}>{info.objective}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>Stages</Text>
          <View style={styles.comingSoonBadge}>
            <Feather name="clock" size={10} color={COLORS.textDim} />
            <Text style={styles.comingSoonText}>Coming Soon</Text>
          </View>
        </View>
        <View style={styles.stagesPlaceholder}>
          {PLACEHOLDER_STAGES.map((stage, i) => (
            <View key={stage} style={styles.stageRow}>
              <View style={[styles.stageNumber, { opacity: 0.4 }]}>
                <Text style={styles.stageNumberText}>{i + 1}</Text>
              </View>
              <View style={styles.stageConnector} />
              <Text style={[styles.stageLabel, { opacity: 0.5 }]}>{stage}</Text>
              <View style={styles.stageLockIcon}>
                <Feather name="lock" size={11} color={COLORS.textDim} />
              </View>
            </View>
          ))}
        </View>
        <Text style={styles.comingSoonNote}>
          Stage logic, automation rules, and playbook actions will be available in a future update.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 15, color: COLORS.textMuted, textAlign: "center", marginTop: 40 },

  hero: {
    margin: 16, borderRadius: 16, borderWidth: 1,
    padding: 24, alignItems: "center", gap: 10,
  },
  heroIcon: {
    width: 72, height: 72, borderRadius: 20,
    alignItems: "center", justifyContent: "center",
    marginBottom: 4,
  },
  heroTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.text, textAlign: "center" },
  heroSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },

  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  sectionLabel: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, marginBottom: 10 },
  objectiveText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, lineHeight: 22 },

  stagesPlaceholder: {
    backgroundColor: COLORS.navyCard, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 16, gap: 0,
  },
  stageRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  stageNumber: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  stageNumberText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted },
  stageConnector: { display: "none" },
  stageLabel: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  stageLockIcon: { flexShrink: 0 },

  comingSoonBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.navySurface, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  comingSoonText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textDim },
  comingSoonNote: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim,
    marginTop: 12, lineHeight: 18,
  },
});
