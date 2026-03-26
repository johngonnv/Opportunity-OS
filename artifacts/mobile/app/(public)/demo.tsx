import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TextInput,
  TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

export default function DemoScreen() {
  const insets = useSafeAreaInsets();
  const [form, setForm] = useState({
    name: "", company: "", email: "", phone: "", needs: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setF = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.company.trim() || !form.email.trim()) {
      setError("Name, company, and email are required.");
      return;
    }
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(form.email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <View style={[styles.successContainer, { paddingTop: insets.top + 40 }]}>
        <View style={styles.successIcon}>
          <Feather name="check-circle" size={40} color={COLORS.emerald} />
        </View>
        <Text style={styles.successTitle}>Request received!</Text>
        <Text style={styles.successText}>
          Thanks, {form.name.split(" ")[0]}. Our team will reach out to {form.email} within one business day to schedule your demo.
        </Text>
        <View style={styles.successDetails}>
          {[
            { icon: "clock" as const, text: "30-minute guided product walkthrough" },
            { icon: "users" as const, text: "Tailored to your team size and use case" },
            { icon: "shield" as const, text: "Compliance & security Q&A included" },
          ].map(({ icon, text }) => (
            <View key={text} style={styles.successRow}>
              <Feather name={icon} size={14} color={COLORS.emerald} />
              <Text style={styles.successRowText}>{text}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Feather name="calendar" size={24} color={COLORS.purple} />
          </View>
          <Text style={styles.headerLabel}>ENTERPRISE</Text>
          <Text style={styles.headerTitle}>Book a personalized demo</Text>
          <Text style={styles.headerSub}>
            See how Opportunity OS fits your enterprise workflows. We'll walk through the platform, answer compliance questions, and discuss custom pricing.
          </Text>
        </View>

        <View style={styles.form}>
          {error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color={COLORS.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {[
            { key: "name", label: "Full Name *", placeholder: "John Smith", keyboard: "default" as const },
            { key: "company", label: "Company *", placeholder: "Acme Government Contracting", keyboard: "default" as const },
            { key: "email", label: "Work Email *", placeholder: "john@company.com", keyboard: "email-address" as const },
            { key: "phone", label: "Phone (optional)", placeholder: "+1 (555) 000-0000", keyboard: "phone-pad" as const },
          ].map(({ key, label, placeholder, keyboard }) => (
            <View key={key} style={styles.field}>
              <Text style={styles.label}>{label}</Text>
              <TextInput
                style={styles.input}
                value={form[key as keyof typeof form]}
                onChangeText={setF(key)}
                placeholder={placeholder}
                placeholderTextColor={COLORS.textDim}
                keyboardType={keyboard}
                autoCapitalize={keyboard === "email-address" ? "none" : "words"}
                autoCorrect={false}
              />
            </View>
          ))}

          <View style={styles.field}>
            <Text style={styles.label}>Tell us about your needs (optional)</Text>
            <TextInput
              style={[styles.input, styles.textarea]}
              value={form.needs}
              onChangeText={setF("needs")}
              placeholder="Team size, current pain points, compliance requirements..."
              placeholderTextColor={COLORS.textDim}
              multiline
              numberOfLines={4}
              autoCapitalize="sentences"
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.7 }]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : (
                <View style={styles.submitInner}>
                  <Text style={styles.submitText}>Request Demo</Text>
                  <Feather name="arrow-right" size={16} color={COLORS.white} />
                </View>
              )
            }
          </TouchableOpacity>

          <View style={styles.trustSection}>
            {[
              { icon: "clock" as const, text: "We respond within 1 business day" },
              { icon: "lock" as const, text: "Your information is never shared" },
              { icon: "shield" as const, text: "HIPAA & GovCon compliance discussed" },
            ].map(({ icon, text }) => (
              <View key={text} style={styles.trustRow}>
                <Feather name={icon} size={13} color={COLORS.emerald} />
                <Text style={styles.trustText}>{text}</Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 28, alignItems: "center" },
  headerIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.purple + "20", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  headerLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.purple, letterSpacing: 1.2, marginBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.text, textAlign: "center", marginBottom: 10 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 },
  form: { paddingHorizontal: 20 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.red + "18", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.red + "40", marginBottom: 16 },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, lineHeight: 18 },
  field: { marginBottom: 16 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: { backgroundColor: COLORS.navySurface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder },
  textarea: { height: 110, paddingTop: 13 },
  submitBtn: { backgroundColor: COLORS.purple, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8, marginBottom: 28 },
  submitInner: { flexDirection: "row", alignItems: "center", gap: 8 },
  submitText: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.white },
  trustSection: { gap: 10, paddingBottom: 20 },
  trustRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  trustText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },

  successContainer: { flex: 1, backgroundColor: COLORS.navy, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 60 },
  successIcon: { width: 80, height: 80, borderRadius: 24, backgroundColor: COLORS.emerald + "20", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  successTitle: { fontFamily: "Inter_700Bold", fontSize: 26, color: COLORS.text, marginBottom: 12, textAlign: "center" },
  successText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22, marginBottom: 28 },
  successDetails: { gap: 12, width: "100%" },
  successRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  successRowText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, flex: 1 },
});
