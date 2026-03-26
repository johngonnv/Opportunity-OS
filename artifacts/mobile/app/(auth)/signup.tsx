import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getBaseUrl } from "@/hooks/useApi";

export default function SignupScreen() {
  const router = useRouter();
  const { login } = useAuth();
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", password: "", workspaceName: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setF = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSignup = async () => {
    if (!form.firstName || !form.email || !form.password || !form.workspaceName) {
      setError("Please fill in all required fields.");
      return;
    }
    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, email: form.email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed.");
      await login(data.token, data.user, data.workspace, data.plan);
    } catch (err: any) {
      setError(err.message || "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.subtitle}>Create your account to get started</Text>

        {error && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.nameRow}>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>First Name *</Text>
            <TextInput style={styles.input} value={form.firstName} onChangeText={setF("firstName")} placeholder="John" placeholderTextColor={COLORS.textDim} autoCapitalize="words" />
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Text style={styles.label}>Last Name</Text>
            <TextInput style={styles.input} value={form.lastName} onChangeText={setF("lastName")} placeholder="Smith" placeholderTextColor={COLORS.textDim} autoCapitalize="words" />
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email *</Text>
          <TextInput style={styles.input} value={form.email} onChangeText={setF("email")} placeholder="you@example.com" placeholderTextColor={COLORS.textDim} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password * (min 6 characters)</Text>
          <View style={styles.passwordWrap}>
            <TextInput style={[styles.input, { flex: 1, borderWidth: 0, padding: 0 }]} value={form.password} onChangeText={setF("password")} placeholder="••••••••" placeholderTextColor={COLORS.textDim} secureTextEntry={!showPassword} autoCapitalize="none" />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
              <Feather name={showPassword ? "eye-off" : "eye"} size={16} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Company / Workspace Name *</Text>
          <TextInput style={styles.input} value={form.workspaceName} onChangeText={setF("workspaceName")} placeholder="Golden Age Government Contracting" placeholderTextColor={COLORS.textDim} autoCapitalize="words" />
        </View>

        <TouchableOpacity
          style={[styles.btn, loading && { opacity: 0.7 }]}
          onPress={handleSignup}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.btnText}>Create Account</Text>
          }
        </TouchableOpacity>

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.loginLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  inner: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, marginBottom: 24 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.red + "18", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: COLORS.red + "40", marginBottom: 16 },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, lineHeight: 18 },
  nameRow: { flexDirection: "row", gap: 10 },
  field: { marginBottom: 16 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: { backgroundColor: COLORS.navySurface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder },
  passwordWrap: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.navySurface, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: COLORS.navyBorder },
  eyeBtn: { paddingVertical: 13, paddingLeft: 8 },
  btn: { backgroundColor: COLORS.emerald, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 8, marginBottom: 20 },
  btnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  loginRow: { flexDirection: "row", justifyContent: "center" },
  loginText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  loginLink: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald },
});
