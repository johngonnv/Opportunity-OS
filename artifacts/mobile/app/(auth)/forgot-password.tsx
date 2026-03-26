import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { getBaseUrl } from "@/hooks/useApi";

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!email.trim()) { setError("Please enter your email address."); return; }
    setLoading(true);
    setError(null);
    try {
      await fetch(`${getBaseUrl()}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.container}>
        {sent ? (
          <View style={styles.sentBox}>
            <Feather name="mail" size={40} color={COLORS.emerald} style={{ marginBottom: 16 }} />
            <Text style={styles.sentTitle}>Check your email</Text>
            <Text style={styles.sentText}>
              If an account exists for {email}, you'll receive a password reset link shortly.
            </Text>
            <TouchableOpacity style={styles.btn} onPress={() => router.back()}>
              <Text style={styles.btnText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inner}>
            <Text style={styles.subtitle}>Enter your email address and we'll send you a link to reset your password.</Text>

            {error && (
              <View style={styles.errorBox}>
                <Feather name="alert-circle" size={14} color={COLORS.red} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={COLORS.textDim}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
            </View>

            <TouchableOpacity style={[styles.btn, loading && { opacity: 0.7 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnText}>Send Reset Link</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
              <Text style={styles.backText}>Back to Sign In</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 24 },
  inner: { flex: 1, paddingTop: 24 },
  sentBox: { flex: 1, alignItems: "center", justifyContent: "center" },
  sentTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, marginBottom: 12, textAlign: "center" },
  sentText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, lineHeight: 22, textAlign: "center", marginBottom: 32 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, lineHeight: 22, marginBottom: 24 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.red + "18", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.red + "40", marginBottom: 16 },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, lineHeight: 18 },
  field: { marginBottom: 24 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: { backgroundColor: COLORS.navySurface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder },
  btn: { backgroundColor: COLORS.emerald, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginBottom: 16 },
  btnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  backBtn: { alignItems: "center", paddingVertical: 12 },
  backText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
});
