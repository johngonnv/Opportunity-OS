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
      // Role not returned by /login; the login() impl now immediately calls /me
      // to hydrate the correct role (and plan). Pass "OWNER" as fallback only.
      await login(data.token, data.user, data.workspace, data.plan, "OWNER");
    } catch (err: any) {
      const message = err.message || "";
      if (message.toLowerCase().includes("failed to fetch") || message.toLowerCase().includes("network")) {
        setError("Cannot connect to the server. Is the backend running?");
      } else {
        setError(message || "Login failed. Please try again.");
      }
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
          <Feather name="arrow-left" size={20} color={COLORS.text} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your workspace</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="you@company.com"
              placeholderTextColor={COLORS.textDim}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordRow}>
              <TextInput
                style={[styles.input, styles.passwordInput]}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                placeholder="Your password"
                placeholderTextColor={COLORS.textDim}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
                <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={COLORS.textDim} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.rememberRow}>
            <TouchableOpacity style={styles.checkbox} onPress={() => setRememberMe(!rememberMe)}>
              <View style={[styles.checkboxBox, rememberMe && styles.checkboxChecked]}>
                {rememberMe ? <Feather name="check" size={12} color="#fff" /> : null}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <TouchableOpacity style={[styles.primaryBtn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Sign In</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => router.push("/(auth)/forgot-password")}>
            <Text style={styles.forgot}>Forgot password?</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity onPress={() => router.push("/(auth)/signup")} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Create a new account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  inner: { flexGrow: 1, padding: 24 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  backText: { color: COLORS.text, fontSize: 14, fontWeight: "500" },
  content: { flex: 1, justifyContent: "center", maxWidth: 420, alignSelf: "center", width: "100%" },
  title: { fontSize: 28, fontWeight: "700", color: COLORS.text, textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 15, color: COLORS.textMuted, textAlign: "center", marginBottom: 32 },
  field: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: "600", color: COLORS.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  input: {
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.text,
    fontSize: 15,
  },
  passwordRow: { flexDirection: "row", alignItems: "center" },
  passwordInput: { flex: 1, paddingRight: 44 },
  eyeBtn: { position: "absolute", right: 14, height: "100%", justifyContent: "center" },
  rememberRow: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  checkbox: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkboxBox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: COLORS.navyBorder, alignItems: "center", justifyContent: "center", backgroundColor: COLORS.navySurface },
  checkboxChecked: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  rememberText: { color: COLORS.textDim, fontSize: 13 },
  error: { color: COLORS.red, marginBottom: 12, textAlign: "center" },
  primaryBtn: { backgroundColor: COLORS.emerald, paddingVertical: 14, borderRadius: 10, alignItems: "center", marginBottom: 12 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  forgot: { color: COLORS.emerald, textAlign: "center", fontSize: 13, fontWeight: "500" },
  divider: { height: 1, backgroundColor: COLORS.navyBorder, marginVertical: 20 },
  secondaryBtn: { alignItems: "center", paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder },
  secondaryBtnText: { color: COLORS.text, fontSize: 15, fontWeight: "500" },
});
