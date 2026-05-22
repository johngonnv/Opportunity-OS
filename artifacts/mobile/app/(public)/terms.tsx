import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

const EFFECTIVE_DATE = "May 22, 2026";

const sections = [
  {
    title: "1. Acceptance of Terms",
    body: `By downloading, installing, or using Opportunity OS ("the App"), you agree to be bound by these Terms of Service. If you do not agree, do not use the App.`,
  },
  {
    title: "2. Eligibility",
    body: `You must be at least 18 years old and have the authority to enter into these terms on behalf of yourself or your organization. The App is intended for business use only.`,
  },
  {
    title: "3. License",
    body: `We grant you a limited, non-exclusive, non-transferable, revocable license to use the App for your internal business purposes. You may not copy, modify, distribute, sell, or reverse engineer any part of the App.`,
  },
  {
    title: "4. Accounts",
    body: `You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account. We reserve the right to terminate accounts that violate these terms.`,
  },
  {
    title: "5. Acceptable Use",
    body: `You agree not to: (a) use the App for unlawful purposes; (b) upload malicious code; (c) attempt to gain unauthorized access to our systems; (d) use the App to harvest data from third parties without their consent; or (e) resell or sublicense access to the App.`,
  },
  {
    title: "6. Data & Privacy",
    body: `Your use of the App is subject to our Privacy Policy, which is incorporated into these terms by reference. By using the App, you consent to our data practices as described therein.`,
  },
  {
    title: "7. Subscription & Billing",
    body: `Paid plans are billed on a monthly or annual basis. Subscriptions auto-renew unless cancelled before the renewal date. Refunds are not provided for partial billing periods except where required by law.`,
  },
  {
    title: "8. Intellectual Property",
    body: `All content, features, and functionality of the App are owned by Opportunity OS and are protected by applicable intellectual property laws. CRM data you enter remains yours; you grant us a license to process it to provide the service.`,
  },
  {
    title: "9. Disclaimer of Warranties",
    body: `The App is provided "as is" without warranties of any kind. We do not warrant that the App will be uninterrupted, error-free, or free of harmful components.`,
  },
  {
    title: "10. Limitation of Liability",
    body: `To the maximum extent permitted by law, Opportunity OS shall not be liable for indirect, incidental, special, consequential, or punitive damages arising from your use of the App, even if advised of the possibility of such damages.`,
  },
  {
    title: "11. Changes to Terms",
    body: `We may update these terms at any time. Continued use of the App after changes constitutes acceptance of the new terms. We will notify you of material changes via email or in-app notice.`,
  },
  {
    title: "12. Contact",
    body: `Questions about these terms? Contact us at:\n\nsupport@onboard.opportunityos.org`,
  },
];

export default function TermsOfServiceScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Terms of Service", headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Feather name="arrow-left" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          <Text style={styles.title}>Terms of Service</Text>
          <Text style={styles.effective}>Effective: {EFFECTIVE_DATE}</Text>
          <Text style={styles.intro}>
            Please read these Terms of Service carefully before using Opportunity OS. These terms govern your use of our mobile application and related services.
          </Text>
        </View>

        {sections.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}

        <View style={styles.footer}>
          <Text style={styles.footerText}>© {new Date().getFullYear()} Opportunity OS. All rights reserved.</Text>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  header: { paddingTop: 20, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder, marginBottom: 24 },
  backBtn: { marginBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 26, color: COLORS.text, marginBottom: 6 },
  effective: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.emerald, marginBottom: 14, letterSpacing: 0.3 },
  intro: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, lineHeight: 22 },
  section: { marginBottom: 24 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text, marginBottom: 8 },
  sectionBody: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, lineHeight: 22 },
  footer: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder, paddingTop: 20, marginTop: 8 },
  footerText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim, textAlign: "center" },
});
