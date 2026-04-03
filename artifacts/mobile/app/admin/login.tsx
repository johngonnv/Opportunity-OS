import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

export default function AdminLoginScreen() {
  const { adminLogin } = useAdminAuthContext();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("Email and password are required.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await adminLogin(email.trim().toLowerCase(), password);
      router.replace("/admin/(tabs)/dashboard");
    } catch (e: any) {
      setError(e.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.badge}>
          <Text style={styles.badgeText}>PLATFORM ADMIN</Text>
        </View>
        <Text style={styles.title}>Internal Admin</Text>
        <Text style={styles.subtitle}>Opportunity OS</Text>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="admin@example.com"
            placeholderTextColor={COLORS.textDim}
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoComplete="current-password"
              placeholder="••••••••"
              placeholderTextColor={COLORS.textDim}
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn} activeOpacity={0.7}>
              <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={COLORS.navyDark} />
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.note}>This console is for internal team use only.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  inner: { flexGrow: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  badge: {
    backgroundColor: "#2D1B00",
    borderColor: COLORS.amber,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginBottom: 24,
  },
  badgeText: { color: COLORS.amber, fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 1.5 },
  title: { color: COLORS.amber, fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 4 },
  subtitle: { color: COLORS.textMuted, fontSize: 16, fontFamily: "Inter_400Regular", marginBottom: 32 },
  form: { width: "100%", maxWidth: 400, gap: 12 },
  label: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 4 },
  input: {
    backgroundColor: COLORS.navySurface,
    borderColor: COLORS.navyBorder,
    borderWidth: 1,
    borderRadius: 8,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
  },
  passwordWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navySurface,
    borderColor: COLORS.navyBorder,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  passwordInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    paddingVertical: 12,
  },
  eyeBtn: { paddingVertical: 12, paddingLeft: 10 },
  button: {
    backgroundColor: COLORS.amber,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: { color: COLORS.navyDark, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  errorBox: {
    backgroundColor: "#2D0A0A",
    borderColor: COLORS.red,
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    width: "100%",
    maxWidth: 400,
  },
  errorText: { color: COLORS.red, fontSize: 14, fontFamily: "Inter_400Regular" },
  note: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 32 },
});
