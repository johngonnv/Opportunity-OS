import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { apiFetch, uploadImageMultipart } from "@/hooks/useApi";

type ScanState = "idle" | "uploading" | "error";

export default function ScanCardCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async (uri: string) => {
    setState("uploading");
    setError(null);
    try {
      const { objectPath } = await uploadImageMultipart(uri);
      const card = await apiFetch("/business-cards", {
        method: "POST",
        body: JSON.stringify({
          imageUrlFront: objectPath,
          processingStatus: "UPLOADED",
          reviewStatus: "PENDING_REVIEW",
        }),
      });
      apiFetch(`/business-cards/${card.id}/parse`, { method: "POST" }).catch(() => {});
      router.replace(`/capture/scan-card-review?cardId=${card.id}` as Href);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to upload card image";
      setState("error");
      setError(msg);
    }
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      if (Platform.OS === "web") {
        setError("Camera permission is required to scan business cards.");
      } else {
        Alert.alert("Camera Permission", "Please allow camera access to scan business cards.");
      }
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    handleCapture(result.assets[0].uri);
  };

  const handleLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    handleCapture(result.assets[0].uri);
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <Stack.Screen
        options={{
          title: "Scan Business Card",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        }}
      />

      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          {state === "uploading" ? (
            <ActivityIndicator size="large" color={COLORS.emerald} />
          ) : state === "error" ? (
            <Feather name="alert-circle" size={44} color={COLORS.red} />
          ) : (
            <Feather name="credit-card" size={44} color={COLORS.emerald} />
          )}
        </View>
        <Text style={styles.title}>
          {state === "idle" ? "Scan a Business Card" :
           state === "uploading" ? "Uploading image…" :
           "Upload failed"}
        </Text>
        <Text style={styles.subtitle}>
          {state === "idle"
            ? "Take a clear photo of the front of the business card. OCR will extract the contact details for review."
            : state === "error"
            ? (error || "Could not upload. Please try again.")
            : ""}
        </Text>
      </View>

      {state === "error" && (
        <TouchableOpacity
          style={styles.retryBtn}
          onPress={() => { setState("idle"); setError(null); }}
        >
          <Feather name="refresh-cw" size={16} color={COLORS.emerald} />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      )}

      {state === "idle" && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCamera} activeOpacity={0.8}>
            <Feather name="camera" size={22} color={COLORS.white} />
            <Text style={styles.primaryBtnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleLibrary} activeOpacity={0.8}>
            <Feather name="image" size={20} color={COLORS.emerald} />
            <Text style={styles.secondaryBtnText}>Pick from Library</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  hero: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: COLORS.emeraldMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 300,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    marginBottom: 16,
  },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald },
  actions: { gap: 12, paddingBottom: 8 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.emerald,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.white },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.emeraldMuted,
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.emerald + "55",
  },
  secondaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.emerald },
});
