import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Feather name="calendar" size={18} color={COLORS.emerald} />
        <Text style={styles.headerTitle}>Calendar</Text>
      </View>
      <View style={styles.placeholder}>
        <View style={styles.iconWrap}>
          <Feather name="calendar" size={48} color={COLORS.textDim} />
        </View>
        <Text style={styles.title}>Calendar — Coming Soon</Text>
        <Text style={styles.desc}>
          Schedule follow-ups, meetings, and reminders synced with your contacts and opportunities.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  placeholder: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 16 },
  iconWrap: {
    width: 96, height: 96, borderRadius: 24,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    alignItems: "center", justifyContent: "center",
    marginBottom: 8,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, textAlign: "center" },
  desc: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 },
});
