import React, { useEffect, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, ScrollView, Platform, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { getBaseUrl } from "@/hooks/useApi";

export default function AcceptInviteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const params = useLocalSearchParams<{ token?: string }>();
  const [token, setToken] = useState<string>("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof params.token === "string" && params.token.length > 0) {
      setToken(params.token);
    }
  }, [params.token]);

  const handleAccept = async () => {
    if (!token) {
      setError("This invite link is missing its token.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getBaseUrl()}/auth/accept-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not accept invite.");
      // Pass role from backend (ADMIN | MANAGER for invited users). The updated
      // AuthContext.login now also hydrates via /me for authoritative state + plan.
      await login(data.token, data.user, data.workspace, data.plan ?? null, data.role || "OWNER");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message || "Could not accept invite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Accept your invite</Text>
        <Text style={styles.subtitle}>
          Set a password to activate your Opportunity OS account.
        </Text>

        <Text style={styles.label}>New password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          placeholder="At least 6 characters"
          placeholderTextColor={COLORS.muted}
        />

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={styles.input}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
          autoCapitalize="none"
          placeholder="Re-enter password"
          placeholderTextColor={COLORS.muted}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.6 }]}
          onPress={handleAccept}
          disabled={loading}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Activate account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace("/(auth)/login")} style={styles.linkRow}>
          <Text style={styles.link}>Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  scroll: { padding: 24, gap: 12 },
  title: { fontSize: 24, fontWeight: "700", color: COLORS.text },
  subtitle: { fontSize: 14, color: COLORS.textMuted, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: "600", color: COLORS.text, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: COLORS.navyBorder, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text,
    backgroundColor: COLORS.navySurface,
  },
  button: {
    marginTop: 20, backgroundColor: COLORS.emerald,
    paddingVertical: 14, borderRadius: 10, alignItems: "center",
  },
  buttonText: { color: COLORS.white, fontSize: 16, fontWeight: "600" },
  error: { color: COLORS.red, marginTop: 8 },
  linkRow: { marginTop: 16, alignItems: "center" },
  link: { color: COLORS.emerald, fontWeight: "600" },
});
