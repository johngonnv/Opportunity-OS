import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { ModeHeader } from "@/components/ui/ModeHeader";
import { useMode } from "@/contexts/ModeContext";
import { useDashboard } from "@/hooks/useApi";

type PlayType = "OPEN_ACCOUNT" | "GROW_ACCOUNT" | "DISPLACE_VENDOR" | "PURSUE_CONTRACT";

interface PlayDef {
  type: PlayType;
  label: string;
  subtitle: string;
  objective: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const PLAYS: PlayDef[] = [
  {
    type: "OPEN_ACCOUNT",
    label: "Open Account",
    subtitle: "Identify & engage new decision-makers",
    objective: "Establish first contact with a new account and advance through initial qualification stages.",
    icon: "user-plus",
    color: COLORS.emerald,
  },
  {
    type: "GROW_ACCOUNT",
    label: "Grow Account",
    subtitle: "Deepen relationships & expand share",
    objective: "Expand wallet share in an existing account by deepening executive relationships and identifying upsell opportunities.",
    icon: "trending-up",
    color: COLORS.blue,
  },
  {
    type: "DISPLACE_VENDOR",
    label: "Displace Vendor",
    subtitle: "Replace a competitor in an active account",
    objective: "Displace a competing vendor by uncovering dissatisfaction and positioning a superior solution.",
    icon: "shield",
    color: COLORS.amber,
  },
  {
    type: "PURSUE_CONTRACT",
    label: "Pursue Contract",
    subtitle: "Target a specific contract or RFP",
    objective: "Win a targeted contract opportunity by aligning capabilities to requirements and building procurement relationships.",
    icon: "file-text",
    color: COLORS.purple,
  },
];

function PlayCard({ play }: { play: PlayDef }) {
  const router = useRouter();

  return (
    <TouchableOpacity
      style={[styles.playCard, { borderColor: play.color + "44" }]}
      onPress={() => router.push(`/plays/${play.type}` as Href)}
      activeOpacity={0.8}
    >
      <View style={styles.playCardHeader}>
        <View style={[styles.playIconWrap, { backgroundColor: play.color + "20" }]}>
          <Feather name={play.icon} size={22} color={play.color} />
        </View>
        <View style={styles.playTitleBlock}>
          <Text style={styles.playLabel}>{play.label}</Text>
          <Text style={styles.playSubtitle} numberOfLines={1}>{play.subtitle}</Text>
        </View>
        <Feather name="chevron-right" size={18} color={COLORS.textDim} />
      </View>
      <Text style={styles.playObjective} numberOfLines={2}>{play.objective}</Text>
      <View style={styles.comingSoonBadge}>
        <Feather name="clock" size={10} color={COLORS.textDim} />
        <Text style={styles.comingSoonText}>Stages — Coming Soon</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PlaysScreen() {
  const insets = useSafeAreaInsets();
  const { mode } = useMode();
  const { data: dashData } = useDashboard();

  const openObjectives: number = (dashData as { openOpportunities?: number } | undefined)?.openOpportunities ?? 0;
  const overdueCount: number = (dashData as { tasksOverdue?: number } | undefined)?.tasksOverdue ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ModeHeader title="Objectives" icon="target" />

      {mode === "office" && (
        <View style={styles.kpiStrip}>
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: COLORS.emerald }]}>{openObjectives}</Text>
            <Text style={styles.kpiLabel}>Open</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: overdueCount > 0 ? COLORS.red : COLORS.text }]}>{overdueCount}</Text>
            <Text style={styles.kpiLabel}>Overdue Tasks</Text>
          </View>
        </View>
      )}

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionDesc}>
          Kick off a structured approach for your next opportunity.
        </Text>
        {PLAYS.map(play => (
          <PlayCard key={play.type} play={play} />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  kpiStrip: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: COLORS.navySurface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, paddingVertical: 10,
  },
  kpiItem: { flex: 1, alignItems: "center" },
  kpiValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  kpiLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  kpiDivider: { width: 1, height: 28, backgroundColor: COLORS.navyBorder },
  content: { padding: 16, paddingBottom: 120 },
  sectionDesc: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted,
    marginBottom: 16, lineHeight: 20,
  },
  playCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 16,
    borderWidth: 1, padding: 16, marginBottom: 12,
  },
  playCardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  playIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  playTitleBlock: { flex: 1 },
  playLabel: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, marginBottom: 2 },
  playSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  playObjective: {
    fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted,
    lineHeight: 20, marginBottom: 10,
  },
  comingSoonBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    alignSelf: "flex-start",
    backgroundColor: COLORS.navySurface,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  comingSoonText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textDim },
});
