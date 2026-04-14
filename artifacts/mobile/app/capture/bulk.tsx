import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

export default function BulkImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <Stack.Screen
        options={{
          title: "Bulk Import",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        }}
      />

      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Feather name="upload-cloud" size={40} color={COLORS.amber} />
        </View>
        <Text style={styles.title}>Bulk Import</Text>
        <Text style={styles.subtitle}>
          Upload a CSV of contacts with name, email, and phone number. Each row will be normalized, deduped, and added to your workspace.
        </Text>
        <View style={styles.badge}>
          <Feather name="clock" size={14} color={COLORS.amber} />
          <Text style={styles.badgeText}>Coming in the next release</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerNote}>
          In the meantime, add contacts one at a time using Manual Entry or scan a business card.
        </Text>
        <TouchableOpacity
          style={styles.btn}
          onPress={() => router.replace("/capture/new")}
          activeOpacity={0.8}
        >
          <Feather name="edit-2" size={18} color={COLORS.white} />
          <Text style={styles.btnText}>Add Contact Manually</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 32,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.amber + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 300,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.amber + "22",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginTop: 4,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.amber,
  },
  footer: { gap: 12, paddingBottom: 8 },
  footerNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textDim,
    textAlign: "center",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.emerald,
    borderRadius: 14,
    paddingVertical: 16,
  },
  btnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.white },
});
