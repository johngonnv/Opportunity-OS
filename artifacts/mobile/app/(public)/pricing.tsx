import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

const TIERS = [
  {
    name: "Independent",
    price: "$29",
    period: "/month",
    tagline: "For solo healthcare & GovCon professionals",
    color: COLORS.emerald,
    popular: false,
    features: [
      { label: "1 user seat", included: true },
      { label: "Unlimited contacts & organizations", included: true },
      { label: "Business card scanning (AI OCR)", included: true },
      { label: "Kanban opportunity pipeline", included: true },
      { label: "Task management & due dates", included: true },
      { label: "Activity timeline & notes", included: true },
      { label: "Email & phone lookup", included: true },
      { label: "Team collaboration", included: false },
      { label: "Workspace analytics", included: false },
      { label: "Custom integrations", included: false },
      { label: "Dedicated account manager", included: false },
      { label: "HIPAA compliance support", included: false },
    ],
    cta: "Start Free",
    isEnterprise: false,
  },
  {
    name: "Business",
    price: "$79",
    period: "/month",
    tagline: "For growing teams and agencies",
    color: COLORS.blue,
    popular: true,
    features: [
      { label: "Up to 5 user seats", included: true },
      { label: "Unlimited contacts & organizations", included: true },
      { label: "Business card scanning (AI OCR)", included: true },
      { label: "Kanban opportunity pipeline", included: true },
      { label: "Task management & due dates", included: true },
      { label: "Activity timeline & notes", included: true },
      { label: "Email & phone lookup", included: true },
      { label: "Team collaboration", included: true },
      { label: "Workspace analytics", included: true },
      { label: "Custom integrations", included: false },
      { label: "Dedicated account manager", included: false },
      { label: "HIPAA compliance support", included: false },
    ],
    cta: "Start Free",
    isEnterprise: false,
  },
  {
    name: "Enterprise",
    price: "Contact Us",
    period: "",
    tagline: "For large organizations with compliance needs",
    color: COLORS.purple,
    popular: false,
    features: [
      { label: "Unlimited user seats", included: true },
      { label: "Unlimited contacts & organizations", included: true },
      { label: "Business card scanning (AI OCR)", included: true },
      { label: "Kanban opportunity pipeline", included: true },
      { label: "Task management & due dates", included: true },
      { label: "Activity timeline & notes", included: true },
      { label: "Email & phone lookup", included: true },
      { label: "Team collaboration", included: true },
      { label: "Workspace analytics", included: true },
      { label: "Custom integrations", included: true },
      { label: "Dedicated account manager", included: true },
      { label: "HIPAA compliance support", included: true },
    ],
    cta: "Book Demo",
    isEnterprise: true,
  },
];

export default function PricingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <Text style={styles.headerLabel}>PRICING</Text>
        <Text style={styles.headerTitle}>Simple, honest pricing</Text>
        <Text style={styles.headerSub}>
          Start free and scale as you grow. Every plan includes a 14-day trial, no credit card required.
        </Text>
      </View>

      {TIERS.map(({ name, price, period, tagline, color, popular, features, cta, isEnterprise }) => (
        <View key={name} style={[styles.tierCard, { borderColor: popular ? color : COLORS.navyBorder }]}>
          {popular && (
            <View style={[styles.popularBanner, { backgroundColor: color }]}>
              <Text style={styles.popularText}>MOST POPULAR</Text>
            </View>
          )}

          <View style={styles.tierTop}>
            <View style={styles.tierMeta}>
              <Text style={[styles.tierName, { color }]}>{name}</Text>
              <Text style={styles.tierTagline}>{tagline}</Text>
            </View>
            <View style={styles.tierPricing}>
              <Text style={styles.tierPrice}>{price}</Text>
              {period ? <Text style={styles.tierPeriod}>{period}</Text> : null}
            </View>
          </View>

          <View style={styles.featureList}>
            {features.map(({ label, included }) => (
              <View key={label} style={styles.featureRow}>
                <Feather
                  name={included ? "check" : "x"}
                  size={14}
                  color={included ? color : COLORS.textDim}
                />
                <Text style={[styles.featureText, !included && styles.featureTextDim]}>
                  {label}
                </Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[
              styles.ctaBtn,
              {
                backgroundColor: isEnterprise ? "transparent" : color,
                borderColor: color,
              },
            ]}
            onPress={() => {
              if (isEnterprise) {
                router.push("/(public)/demo");
              } else {
                router.push("/(auth)/signup");
              }
            }}
            activeOpacity={0.85}
          >
            <Text style={[styles.ctaText, { color: isEnterprise ? color : COLORS.white }]}>
              {cta}
            </Text>
          </TouchableOpacity>
        </View>
      ))}

      <View style={styles.note}>
        <Feather name="info" size={14} color={COLORS.textDim} />
        <Text style={styles.noteText}>
          All plans billed monthly. Annual billing saves 20%. Contact us to discuss custom volume pricing.
        </Text>
      </View>

      <View style={styles.trustRow}>
        {["No credit card required", "Cancel anytime", "Data export included"].map(t => (
          <View key={t} style={styles.trustItem}>
            <Feather name="check-circle" size={12} color={COLORS.emerald} />
            <Text style={styles.trustText}>{t}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 28, alignItems: "center" },
  headerLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.emerald, letterSpacing: 1.2, marginBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: COLORS.text, marginBottom: 8, textAlign: "center" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 },
  tierCard: {
    marginHorizontal: 16, marginBottom: 16,
    backgroundColor: COLORS.navyCard, borderRadius: 16,
    borderWidth: 1.5, overflow: "hidden",
  },
  popularBanner: { paddingVertical: 5, alignItems: "center" },
  popularText: { fontFamily: "Inter_700Bold", fontSize: 11, color: COLORS.white, letterSpacing: 1 },
  tierTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", padding: 20, paddingBottom: 16 },
  tierMeta: { flex: 1 },
  tierName: { fontFamily: "Inter_700Bold", fontSize: 20, marginBottom: 4 },
  tierTagline: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  tierPricing: { alignItems: "flex-end", paddingLeft: 12 },
  tierPrice: { fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.text },
  tierPeriod: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  featureList: { paddingHorizontal: 20, paddingBottom: 12, gap: 10 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  featureText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, flex: 1 },
  featureTextDim: { color: COLORS.textDim },
  ctaBtn: { margin: 20, marginTop: 8, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1.5 },
  ctaText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  note: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 20, marginBottom: 20 },
  noteText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim, lineHeight: 18 },
  trustRow: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  trustItem: { flexDirection: "row", alignItems: "center", gap: 8 },
  trustText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
});
