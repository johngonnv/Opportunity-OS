import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";

const EFFECTIVE_DATE = "May 22, 2026";

const sections = [
  {
    title: "1. Information We Collect",
    body: `We collect information you provide directly, including your name, email address, company affiliation, and contact data you import into the app. We also collect usage data such as feature interactions, scan activity, and device identifiers to improve the service.`,
  },
  {
    title: "2. Camera & Photo Library",
    body: `Opportunity OS requests access to your camera and photo library solely to enable business card scanning and organization logo capture. Images processed for OCR are sent to our secure servers and are not shared with third parties for advertising purposes.`,
  },
  {
    title: "3. Contacts",
    body: `If you grant contacts permission, we read your device contacts to help you quickly import leads into your CRM. Contact data is stored on our servers associated with your workspace. We do not sell contact data.`,
  },
  {
    title: "4. Location",
    body: `Location access is used only when you actively use the organization scan feature to improve nearby business matching accuracy. We do not track your location in the background.`,
  },
  {
    title: "5. How We Use Your Information",
    body: `We use your data to operate and improve Opportunity OS, send transactional emails (invites, password resets), provide AI-powered contact normalization, and deliver GovCon opportunity matching. We do not sell your personal data.`,
  },
  {
    title: "6. Data Sharing",
    body: `We share data only with service providers necessary to operate the platform (cloud storage, AI processing, email delivery). All providers are bound by data processing agreements. We may disclose data if required by law.`,
  },
  {
    title: "7. Data Retention & Deletion",
    body: `You may delete your account at any time from Settings → Delete Account. Upon deletion, your personal profile and workspace membership are permanently removed. Workspace CRM data (contacts, organizations) created by you may be retained by your workspace administrator per their data policies.`,
  },
  {
    title: "8. Security",
    body: `We use industry-standard encryption in transit (TLS) and at rest. Passwords are hashed using bcrypt and never stored in plaintext. Access tokens are short-lived JWTs stored in your device's secure storage.`,
  },
  {
    title: "9. Children's Privacy",
    body: `Opportunity OS is a B2B CRM platform not intended for users under 18. We do not knowingly collect information from minors.`,
  },
  {
    title: "10. Contact Us",
    body: `For privacy questions or data deletion requests, contact us at:\n\nsupport@onboard.opportunityos.org`,
  },
];

export default function PrivacyPolicyScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Privacy Policy", headerShown: true }} />
      <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
            <Feather name="arrow-left" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          <Text style={styles.title}>Privacy Policy</Text>
          <Text style={styles.effective}>Effective: {EFFECTIVE_DATE}</Text>
          <Text style={styles.intro}>
            Opportunity OS ("we", "our", or "us") is committed to protecting your privacy. This policy explains what data we collect, how we use it, and your rights as a user.
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
