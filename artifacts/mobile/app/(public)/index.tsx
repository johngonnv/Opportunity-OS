import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

const VALUE_PROPS = [
  {
    icon: "users" as const,
    color: COLORS.emerald,
    title: "Relationship Intelligence",
    desc: "Track every contact, organization, and interaction in one searchable workspace built for healthcare and GovCon.",
  },
  {
    icon: "trending-up" as const,
    color: COLORS.blue,
    title: "Visual Pipeline",
    desc: "Move opportunities from first conversation to contract with a pipeline built for real business development work.",
  },
  {
    icon: "camera" as const,
    color: COLORS.amber,
    title: "Business Card AI",
    desc: "Scan any business card, extract the details automatically, and turn it into a live CRM record in seconds.",
  },
];

const SCAN_STEPS = [
  { step: "1", icon: "camera" as const, label: "Scan", desc: "Capture any business card in seconds from the field." },
  { step: "2", icon: "cpu" as const, label: "Extract", desc: "Auto-read names, titles, companies, phone numbers, emails, and more." },
  { step: "3", icon: "user-plus" as const, label: "Save", desc: "Review, edit, and convert the card into a contact and organization instantly." },
];

const FEATURES = [
  { icon: "users" as const, color: COLORS.emerald, label: "Contact & Org CRM" },
  { icon: "trending-up" as const, color: COLORS.blue, label: "Kanban Pipeline" },
  { icon: "check-square" as const, color: COLORS.amber, label: "Task Management" },
  { icon: "activity" as const, color: COLORS.purple, label: "Activity Timeline" },
];

const TIERS = [
  {
    name: "Independent",
    price: "$29",
    period: "/mo",
    badge: null,
    color: COLORS.emerald,
    bullets: [
      "1 user",
      "Unlimited contacts & organizations",
      "Business card scanning",
      "Kanban pipeline",
      "Task & activity tracking",
    ],
    cta: "Start Free",
    ctaRoute: "/(auth)/signup" as const,
    isEnterprise: false,
  },
  {
    name: "Business",
    price: "$79",
    period: "/mo",
    badge: "Most Popular",
    color: COLORS.blue,
    bullets: [
      "Up to 5 users",
      "Everything in Independent",
      "Team collaboration tools",
      "Workspace analytics",
      "Priority support",
    ],
    cta: "Start Free",
    ctaRoute: "/(auth)/signup" as const,
    isEnterprise: false,
  },
  {
    name: "Enterprise",
    price: "Contact Us",
    period: "",
    badge: null,
    color: COLORS.purple,
    bullets: [
      "Everything in Business",
      "Dedicated account support",
      "Custom integrations",
      "Advanced security and compliance support",
    ],
    cta: "Book Demo",
    ctaRoute: "/(public)/demo" as const,
    isEnterprise: true,
  },
];

export default function LandingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Hero */}
      <View style={[styles.hero, { paddingTop: insets.top + 40 }]}>
        <View style={styles.logoMark}>
          <Feather name="target" size={32} color={COLORS.emerald} />
        </View>
        <Text style={styles.appName}>Opportunity OS</Text>
        <Text style={styles.tagline}>Healthcare & GovCon CRM</Text>
        <Text style={styles.heroLine}>Turn contacts{"\n"}into contracts.</Text>
        <Text style={styles.heroSub}>
          Capture. Organize. Close. Opportunity OS helps relationship-driven teams turn business cards, contacts, and conversations into measurable pipeline.
        </Text>
        <Text style={styles.heroPositioning}>The operating system for opportunity.</Text>
        <View style={styles.heroCtas}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => router.push("/(auth)/signup")}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Start Free</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => router.push("/(auth)/login")}
            activeOpacity={0.85}
          >
            <Text style={styles.ghostBtnText}>Sign In</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => router.push("/(public)/pricing")} style={styles.pricingLink}>
          <Text style={styles.pricingLinkText}>See pricing</Text>
          <Feather name="chevron-right" size={14} color={COLORS.emerald} />
        </TouchableOpacity>
      </View>

      {/* Value Propositions */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>WHY OPPORTUNITY OS</Text>
        <Text style={styles.sectionTitle}>Opportunity, organized.</Text>
        {VALUE_PROPS.map(({ icon, color, title, desc }) => (
          <View key={title} style={styles.valueCard}>
            <View style={[styles.valueIcon, { backgroundColor: color + "20" }]}>
              <Feather name={icon} size={22} color={color} />
            </View>
            <View style={styles.valueText}>
              <Text style={styles.valueTitle}>{title}</Text>
              <Text style={styles.valueDesc}>{desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Card Scanning */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>BUSINESS CARD SCANNER</Text>
        <Text style={styles.sectionTitle}>From card to contract</Text>
        <Text style={styles.sectionSub}>
          Scan it. Track it. Win it. Capture business cards, extract the details, and move new relationships into your pipeline without manual entry.
        </Text>
        <View style={styles.stepsRow}>
          {SCAN_STEPS.map(({ step, icon, label, desc }) => (
            <View key={step} style={styles.stepCard}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{step}</Text>
              </View>
              <View style={[styles.stepIcon, { backgroundColor: COLORS.emerald + "20" }]}>
                <Feather name={icon} size={20} color={COLORS.emerald} />
              </View>
              <Text style={styles.stepLabel}>{label}</Text>
              <Text style={styles.stepDesc}>{desc}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* CRM Features */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PLATFORM FEATURES</Text>
        <Text style={styles.sectionTitle}>Built to win</Text>
        <View style={styles.featuresGrid}>
          {FEATURES.map(({ icon, color, label }) => (
            <View key={label} style={styles.featureChip}>
              <Feather name={icon} size={18} color={color} />
              <Text style={styles.featureLabel}>{label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.featureDetails}>
          {[
            "Full contact and organization CRM with searchable notes and history",
            "Visual Kanban pipeline from first touch to close",
            "Tasks, follow-ups, and priority tracking in one place",
            "Complete activity timeline across calls, emails, meetings, and card scans",
          ].map(text => (
            <View key={text} style={styles.featureRow}>
              <Feather name="check" size={14} color={COLORS.emerald} />
              <Text style={styles.featureRowText}>{text}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Pricing Tiers */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SERVICE LEVELS</Text>
        <Text style={styles.sectionTitle}>Choose the service level{"\n"}that fits your growth</Text>
        {TIERS.map(({ name, price, period, badge, color, bullets, cta, ctaRoute, isEnterprise }) => (
          <View key={name} style={[styles.tierCard, { borderColor: color + "50" }]}>
            {badge && (
              <View style={[styles.tierBadge, { backgroundColor: color + "25" }]}>
                <Text style={[styles.tierBadgeText, { color }]}>{badge}</Text>
              </View>
            )}
            <View style={styles.tierHeader}>
              <Text style={[styles.tierName, { color }]}>{name}</Text>
              <View style={styles.tierPriceRow}>
                <Text style={styles.tierPrice}>{price}</Text>
                {period ? <Text style={styles.tierPeriod}>{period}</Text> : null}
              </View>
            </View>
            {bullets.map(b => (
              <View key={b} style={styles.tierBullet}>
                <Feather name="check-circle" size={14} color={color} />
                <Text style={styles.tierBulletText}>{b}</Text>
              </View>
            ))}
            <TouchableOpacity
              style={[styles.tierBtn, { backgroundColor: isEnterprise ? "transparent" : color, borderColor: color }]}
              onPress={() => router.push(ctaRoute)}
              activeOpacity={0.85}
            >
              <Text style={[styles.tierBtnText, { color: isEnterprise ? color : COLORS.white }]}>{cta}</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity onPress={() => router.push("/(public)/pricing")} style={styles.fullPricingLink}>
          <Text style={styles.fullPricingText}>Compare all features</Text>
          <Feather name="arrow-right" size={14} color={COLORS.emerald} />
        </TouchableOpacity>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Security Note */}
      <View style={[styles.section, styles.securitySection]}>
        <View style={styles.securityIcon}>
          <Feather name="shield" size={24} color={COLORS.emerald} />
        </View>
        <Text style={styles.securityTitle}>Built for compliance</Text>
        <Text style={styles.securityText}>
          Opportunity OS is designed with healthcare and government contracting workflows in mind. We prioritize secure authentication, encrypted data handling, and role-based workspace access, with enterprise support for more advanced compliance and security requirements.
        </Text>
        <View style={styles.badgeRow}>
          {["HIPAA-Aware", "GovCon-Ready", "Encrypted Data", "Secure Auth"].map(b => (
            <View key={b} style={styles.complianceBadge}>
              <Text style={styles.complianceBadgeText}>{b}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Divider */}
      <View style={styles.divider} />

      {/* Final CTA */}
      <View style={styles.ctaSection}>
        <Text style={styles.ctaTitle}>Ready to turn contacts{"\n"}into contracts?</Text>
        <Text style={styles.ctaSub}>Start free and organize your pipeline from the first card scan to the final close.</Text>
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => router.push("/(auth)/signup")}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaBtnText}>Get Started Free</Text>
          <Feather name="arrow-right" size={16} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push("/(public)/demo")} style={styles.demoLink}>
          <Text style={styles.demoLinkText}>Need enterprise pricing? Book a demo</Text>
        </TouchableOpacity>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <View style={styles.footerLogo}>
          <Feather name="target" size={14} color={COLORS.emerald} />
          <Text style={styles.footerBrand}>Opportunity OS</Text>
        </View>
        <Text style={styles.footerSub}>Healthcare & GovCon CRM</Text>
        <View style={styles.footerLinks}>
          <TouchableOpacity onPress={() => router.push("/(public)/pricing")}>
            <Text style={styles.footerLink}>Pricing</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity onPress={() => router.push("/(public)/demo")}>
            <Text style={styles.footerLink}>Book Demo</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/login")}>
            <Text style={styles.footerLink}>Sign In</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity>
            <Text style={styles.footerLink}>Terms</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity>
            <Text style={styles.footerLink}>Privacy</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.footerCopy}>© {new Date().getFullYear()} Opportunity OS. All rights reserved.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },

  hero: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 48 },
  logoMark: {
    width: 64, height: 64, borderRadius: 18,
    backgroundColor: COLORS.emerald + "20", borderWidth: 1.5,
    borderColor: COLORS.emerald + "60", alignItems: "center",
    justifyContent: "center", marginBottom: 14,
  },
  appName: { fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.text, marginBottom: 4 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.emerald, marginBottom: 24, letterSpacing: 0.5 },
  heroLine: { fontFamily: "Inter_700Bold", fontSize: 34, color: COLORS.text, textAlign: "center", lineHeight: 42, marginBottom: 16 },
  heroSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22, marginBottom: 12 },
  heroPositioning: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald, textAlign: "center", letterSpacing: 0.3, marginBottom: 28 },
  heroCtas: { flexDirection: "row", gap: 12, marginBottom: 16, width: "100%" },
  primaryBtn: { flex: 1, backgroundColor: COLORS.emerald, borderRadius: 14, paddingVertical: 15, alignItems: "center" },
  primaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.white },
  ghostBtn: { flex: 1, backgroundColor: "transparent", borderRadius: 14, paddingVertical: 15, alignItems: "center", borderWidth: 1.5, borderColor: COLORS.navyBorder },
  ghostBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.text },
  pricingLink: { flexDirection: "row", alignItems: "center", gap: 4 },
  pricingLinkText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.emerald },

  section: { paddingHorizontal: 20, paddingVertical: 32 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.emerald, letterSpacing: 1.2, marginBottom: 8 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, marginBottom: 8, lineHeight: 30 },
  sectionSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, lineHeight: 22, marginBottom: 24 },

  valueCard: { flexDirection: "row", gap: 14, marginBottom: 20 },
  valueIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  valueText: { flex: 1 },
  valueTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.text, marginBottom: 4 },
  valueDesc: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },

  stepsRow: { flexDirection: "row", gap: 10 },
  stepCard: { flex: 1, backgroundColor: COLORS.navyCard, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1, borderColor: COLORS.navyBorder },
  stepNum: { position: "absolute", top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.emerald + "20", alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: "Inter_700Bold", fontSize: 10, color: COLORS.emerald },
  stepIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 10 },
  stepLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, marginBottom: 4 },
  stepDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, textAlign: "center", lineHeight: 16 },

  featuresGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  featureChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.navyCard, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: COLORS.navyBorder },
  featureLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  featureDetails: { gap: 12 },
  featureRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  featureRowText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },

  tierCard: { backgroundColor: COLORS.navyCard, borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1.5, overflow: "hidden" },
  tierBadge: { position: "absolute", top: 14, right: 14, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  tierBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  tierHeader: { marginBottom: 16 },
  tierName: { fontFamily: "Inter_700Bold", fontSize: 18, marginBottom: 4 },
  tierPriceRow: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  tierPrice: { fontFamily: "Inter_700Bold", fontSize: 26, color: COLORS.text },
  tierPeriod: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, marginBottom: 3 },
  tierBullet: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  tierBulletText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  tierBtn: { marginTop: 16, borderRadius: 12, paddingVertical: 14, alignItems: "center", borderWidth: 1.5 },
  tierBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  fullPricingLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4 },
  fullPricingText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.emerald },

  securitySection: { alignItems: "center" },
  securityIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.emerald + "20", alignItems: "center", justifyContent: "center", marginBottom: 14 },
  securityTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 10 },
  securityText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center", lineHeight: 21, marginBottom: 20 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  complianceBadge: { backgroundColor: COLORS.navySurface, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5, borderWidth: 1, borderColor: COLORS.navyBorder },
  complianceBadgeText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },

  ctaSection: { margin: 20, backgroundColor: COLORS.emerald + "15", borderRadius: 20, padding: 28, alignItems: "center", borderWidth: 1, borderColor: COLORS.emerald + "30" },
  ctaTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, textAlign: "center", marginBottom: 10, lineHeight: 30 },
  ctaSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center", lineHeight: 20, marginBottom: 24 },
  ctaBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.emerald, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28, marginBottom: 14 },
  ctaBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.white },
  demoLink: {},
  demoLinkText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.emerald },

  divider: { height: 1, backgroundColor: COLORS.navyBorder, marginHorizontal: 20 },

  footer: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 40, alignItems: "center" },
  footerLogo: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  footerBrand: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  footerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim, marginBottom: 14 },
  footerLinks: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 12, justifyContent: "center" },
  footerLink: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  footerDot: { color: COLORS.textDim, fontSize: 13 },
  footerCopy: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, textAlign: "center" },
});
