import React, { useState, useEffect } from "react";
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

type ScanState = "idle" | "uploading" | "parsing" | "done" | "error";

export default function ScanCardCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ScanState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [cardId, setCardId] = useState<string | null>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (state === "parsing" && cardId) {
      interval = setInterval(async () => {
        try {
          const card = await apiFetch(`/business-cards/${cardId}`);
          if (card.processingStatus === "PARSED" || card.processingStatus === "FAILED") {
            clearInterval(interval);
            const parsed = card.parsedJson as Record<string, string> | null;
            if (card.processingStatus === "PARSED" && parsed && !parsed.ocrError) {
              const params = new URLSearchParams({
                firstName: parsed.firstName || "",
                lastName: parsed.lastName || "",
                phone: parsed.phone || parsed.mobile || "",
                email: parsed.email || "",
                title: parsed.title || "",
                source: "CARD_SCAN",
              });
              setState("done");
              router.replace(`/capture/new?${params.toString()}` as Href);
            } else {
              setState("error");
              setError("OCR could not extract data from the card. Fill in details manually.");
              setTimeout(() => {
                router.replace("/capture/new?source=CARD_SCAN" as Href);
              }, 2000);
            }
          }
        } catch (e: unknown) {
          clearInterval(interval);
          const msg = e instanceof Error ? e.message : "Failed to check card status";
          setState("error");
          setError(msg);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [state, cardId]);

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
      setCardId(card.id);
      setState("parsing");
      apiFetch(`/business-cards/${card.id}/parse`, { method: "POST" }).catch(() => {});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to upload card image";
      setState("error");
      setError(msg);
    }
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera Permission", "Please allow camera access to scan business cards.");
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
          {state === "parsing" || state === "uploading" ? (
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
           state === "parsing" ? "Reading card with OCR…" :
           state === "done" ? "Done — loading form…" :
           "OCR failed"}
        </Text>
        <Text style={styles.subtitle}>
          {state === "idle"
            ? "Take a clear photo of the front of the business card. OCR will pre-fill the contact form."
            : state === "parsing"
            ? "Extracting name, phone, and email. This usually takes a few seconds."
            : state === "error"
            ? (error || "Could not extract data. You can fill in the form manually.")
            : ""}
        </Text>
      </View>

      {error && state === "error" && (
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
  white: { color: "#fff" },
});
