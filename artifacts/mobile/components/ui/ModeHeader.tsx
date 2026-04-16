import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { COLORS } from "@/constants/colors";
import { useMode } from "@/contexts/ModeContext";

interface ModeHeaderProps {
  title: string;
  icon?: keyof typeof Feather.glyphMap;
}

export function ModeHeader({ title, icon }: ModeHeaderProps) {
  const { mode, setMode } = useMode();
  const router = useRouter();
  const accentColor = mode === "work" ? COLORS.emerald : COLORS.cyan;

  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {icon && <Feather name={icon} size={18} color={accentColor} />}
        <Text style={styles.title}>{title}</Text>
      </View>
      <View style={styles.headerRight}>
        <View style={styles.togglePill}>
          <TouchableOpacity
            style={[styles.toggleOption, mode === "work" && styles.toggleOptionWork]}
            onPress={() => setMode("work")}
            activeOpacity={0.8}
          >
            <Feather
              name="radio"
              size={12}
              color={mode === "work" ? COLORS.navy : COLORS.textMuted}
            />
            <Text style={[styles.toggleText, mode === "work" && styles.toggleTextActive]}>
              Work
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleOption, mode === "office" && styles.toggleOptionOffice]}
            onPress={() => setMode("office")}
            activeOpacity={0.8}
          >
            <Feather
              name="monitor"
              size={12}
              color={mode === "office" ? COLORS.navy : COLORS.textMuted}
            />
            <Text style={[styles.toggleText, mode === "office" && styles.toggleTextActive]}>
              Office
            </Text>
          </TouchableOpacity>
        </View>
        {mode === "office" && (
          <TouchableOpacity
            style={styles.gearBtn}
            onPress={() => router.push("/(tabs)/settings" as Href)}
            activeOpacity={0.75}
          >
            <Feather name="settings" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  togglePill: {
    flexDirection: "row",
    backgroundColor: COLORS.navySurface,
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  toggleOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  toggleOptionWork: { backgroundColor: COLORS.emerald },
  toggleOptionOffice: { backgroundColor: COLORS.cyan },
  toggleText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted },
  toggleTextActive: { color: COLORS.navy },
  gearBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
  },
});
