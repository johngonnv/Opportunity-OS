import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import type { OrgPrimaryAction } from "@/hooks/useApi";

const ACTION_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  FOLLOW_UP: "phone",
  SCHEDULE_MEETING: "calendar",
  CLOSE_DEAL: "target",
  ENGAGE_STAKEHOLDER: "user-check",
  REACTIVATE: "refresh-cw",
  CAPTURE_CONTACT: "user-plus",
  ADVANCE_STAGE: "trending-up",
};

interface Props {
  action: OrgPrimaryAction | null | undefined;
  loading?: boolean;
  onPress?: () => void;
}

export function PrimaryActionCard({ action, loading, onPress }: Props) {
  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingBar} />
        <View style={[styles.loadingBar, { width: "70%", marginTop: 8, opacity: 0.5 }]} />
      </View>
    );
  }

  if (!action) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Feather name="calendar" size={16} color={COLORS.amber} />
          </View>
          <Text style={styles.title}>Schedule a conversation</Text>
        </View>
        <Text style={styles.whyNow}>
          No recent activity detected. Reach out to warm this account and identify open opportunities.
        </Text>
        {onPress && (
          <TouchableOpacity style={styles.ctaBtn} onPress={onPress} activeOpacity={0.8}>
            <Feather name="calendar" size={14} color={COLORS.navy} />
            <Text style={styles.ctaLabel}>Log an activity</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const icon = ACTION_ICONS[action.type] || "zap";

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconWrap}>
          <Feather name={icon} size={16} color={COLORS.amber} />
        </View>
        <Text style={styles.title}>{action.title}</Text>
      </View>
      <Text style={styles.whyNow}>{action.whyNow}</Text>
      {onPress && (
        <TouchableOpacity style={styles.ctaBtn} onPress={onPress} activeOpacity={0.8}>
          <Feather name={icon} size={14} color={COLORS.navy} />
          <Text style={styles.ctaLabel}>{action.title}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.amber + "12",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.amber + "44",
    padding: 16,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: COLORS.amber + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: COLORS.amber,
    flex: 1,
  },
  whyNow: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 19,
    marginBottom: 14,
  },
  ctaBtn: {
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "flex-start",
  },
  ctaLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: COLORS.navy,
  },
  loadingBar: {
    height: 14,
    width: "100%",
    borderRadius: 7,
    backgroundColor: COLORS.amber + "22",
  },
});
