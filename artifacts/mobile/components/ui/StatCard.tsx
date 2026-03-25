import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

interface StatCardProps {
  label: string;
  value: number | string;
  icon: keyof typeof Feather.glyphMap;
  color?: string;
  style?: ViewStyle;
}

export function StatCard({ label, value, icon, color = COLORS.emerald, style }: StatCardProps) {
  return (
    <View style={[styles.card, style]}>
      <View style={[styles.iconWrap, { backgroundColor: color + "20" }]}>
        <Feather name={icon} size={18} color={color} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label} numberOfLines={2}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    gap: 6,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: COLORS.text,
    lineHeight: 28,
  },
  label: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 16,
  },
});
