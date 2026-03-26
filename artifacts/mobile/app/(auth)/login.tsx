import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getBaseUrl } from "@/hooks/useApi";

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed.");
      await login(data.token, data.user, data.workspace, data.plan);
    } catch (err: any) {
      setError(err.message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {/* Back to landing */}
        <TouchableOpacity
          style={[styles.backBtn, { marginTop: insets.top + 8 }]}
          onPress={() => router.replace("/(public)")}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={16} color={COLORS.textMuted} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.logoSection}>
          <View style={styles.logoMark}>
            <Feather name="target" size={36} color={COLORS.emerald} />
          </View>
          <Text style={styles.appName}>Opportunity OS</Text>
          <Text style={styles.tagline}>Healthcare & GovCon CRM</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.title}>Welcome back</Text>

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
              returnKeyType="next"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                style={[styles.input, { flex: 1, borderWidth: 0, padding: 0 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor={COLORS.textDim}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.rememberRow}>
            <TouchableOpacity style={styles.checkRow} onPress={() => setRememberMe(v => !v)} activeOpacity={0.7}>
              <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                {rememberMe && <Feather name="check" size={12} color={COLORS.white} />}
              </View>
              <Text style={styles.rememberLabel}>Remember me</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push("/(auth)/forgot-password")}>
              <Text style={styles.forgotLink}>Forgot password?</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Text style={styles.loginBtnText}>Sign In</Text>
            }
          </TouchableOpacity>

          <View style={styles.signupRow}>
            <Text style={styles.signupText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/signup")}>
              <Text style={styles.signupLink}>Create account</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  inner: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4 },
  backText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  logoSection: { alignItems: "center", paddingTop: 32, paddingBottom: 40 },
  logoMark: {
    width: 72, height: 72, borderRadius: 20,
    backgroundColor: COLORS.emerald + "20", borderWidth: 1.5,
    borderColor: COLORS.emerald + "60", alignItems: "center",
    justifyContent: "center", marginBottom: 16,
  },
  appName: { fontFamily: "Inter_700Bold", fontSize: 26, color: COLORS.text, marginBottom: 4 },
  tagline: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  form: { flex: 1 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, marginBottom: 24 },
  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: COLORS.red + "18", borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: COLORS.red + "40", marginBottom: 16,
  },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, lineHeight: 18 },
  field: { marginBottom: 16 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.navySurface, borderRadius: 12, paddingHorizontal: 14,
    paddingVertical: 13, color: COLORS.text, fontFamily: "Inter_400Regular",
    fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  passwordWrap: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navySurface, borderRadius: 12,
    paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  eyeBtn: { paddingVertical: 13, paddingLeft: 8 },
  rememberRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 24 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkbox: {
    width: 20, height: 20, borderRadius: 6, borderWidth: 1.5,
    borderColor: COLORS.navyBorder, alignItems: "center", justifyContent: "center",
  },
  checkboxActive: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  rememberLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  forgotLink: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.blue },
  loginBtn: {
    backgroundColor: COLORS.emerald, borderRadius: 14, paddingVertical: 15,
    alignItems: "center", marginBottom: 20,
  },
  loginBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.white },
  signupRow: { flexDirection: "row", justifyContent: "center" },
  signupText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  signupLink: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald },
});
