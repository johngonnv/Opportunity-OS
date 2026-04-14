import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

interface CaptureOption {
  icon: string;
  label: string;
  sublabel: string;
  color: string;
  route?: Href;
  disabled?: boolean;
}

const OPTIONS: CaptureOption[] = [
  {
    icon: "credit-card",
    label: "Scan Business Card",
    sublabel: "Camera OCR extracts name, phone & email — then normalize & assign",
    color: COLORS.emerald,
    route: "/capture/scan-card" as Href,
  },
  {
    icon: "edit-3",
    label: "Manual Entry",
    sublabel: "Type name, phone, email and assign an org",
    color: "#60a5fa",
    route: "/capture/new" as Href,
  },
  {
    icon: "users",
    label: "Import iOS Contacts",
    sublabel: "Pick a contact from your device and add them to your workspace",
    color: "#a78bfa",
    route: "/capture/pick-contact" as Href,
  },
  {
    icon: "image",
    label: "Scan Business Location",
    sublabel: "Org intelligence flow — scans org profile from storefront or sign (separate from contact pipeline)",
    color: "#f59e0b",
    route: "/org-scan/new" as Href,
  },
  {
    icon: "upload",
    label: "Bulk Import CSV",
    sublabel: "Upload a spreadsheet of contacts — coming in next release",
    color: "#34d399",
    route: "/capture/bulk" as Href,
  },
];

export default function CaptureHubScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 16 }]}>
      <Stack.Screen
        options={{
          title: "Capture",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
          presentation: "modal",
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>How do you want to capture?</Text>
        <Text style={styles.subheading}>
          Choose an entry method. All flows normalize, deduplicate, and assign an org before saving.
        </Text>

        <View style={styles.grid}>
          {OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              style={[
                styles.card,
                opt.disabled && styles.cardDisabled,
              ]}
              onPress={() => {
                if (opt.disabled || !opt.route) return;
                router.push(opt.route);
              }}
              activeOpacity={opt.disabled ? 1 : 0.75}
            >
              <View style={[styles.iconWrap, { backgroundColor: opt.color + "22" }]}>
                <Feather name={opt.icon as "edit-3"} size={24} color={opt.disabled ? COLORS.textDim : opt.color} />
              </View>
              <View style={styles.cardText}>
                <Text style={[styles.cardLabel, opt.disabled && styles.textDim]}>{opt.label}</Text>
                <Text style={styles.cardSub} numberOfLines={2}>{opt.sublabel}</Text>
              </View>
              {opt.disabled ? (
                <View style={styles.comingSoon}>
                  <Text style={styles.comingSoonText}>Soon</Text>
                </View>
              ) : (
                <Feather name="chevron-right" size={16} color={COLORS.textDim} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, paddingTop: 24 },

  heading: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: COLORS.text,
    marginBottom: 8,
  },
  subheading: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    lineHeight: 21,
    marginBottom: 28,
  },

  grid: { gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: COLORS.navySurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 16,
  },
  cardDisabled: { opacity: 0.55 },

  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardText: { flex: 1 },
  cardLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: COLORS.text,
    marginBottom: 3,
  },
  cardSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
  },
  textDim: { color: COLORS.textDim },

  comingSoon: {
    backgroundColor: COLORS.navyBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  comingSoonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: COLORS.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
