import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { uploadImageMultipart, uploadOrgScanMultipart, apiFetch } from "@/hooks/useApi";

type Phase =
  | "launching"
  | "uploading"
  | "parsing"
  | "routing"
  | "canceled"
  | "error";

const PHASE_LABELS: Record<Phase, string> = {
  launching: "Opening camera…",
  uploading: "Uploading image…",
  parsing: "Analyzing scan…",
  routing: "Detected — loading…",
  canceled: "Canceled",
  error: "Could not process image",
};

const PHASE_ICONS: Record<Phase, keyof typeof Feather.glyphMap> = {
  launching: "camera",
  uploading: "upload-cloud",
  parsing: "cpu",
  routing: "check-circle",
  canceled: "x-circle",
  error: "alert-circle",
};

export default function AutoCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("launching");
  const [detectedType, setDetectedType] = useState<"card" | "facility" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runAutoCapture();
  }, []);

  const runAutoCapture = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera Permission",
          "Please allow camera access to use Opportunity Eye.",
          [{ text: "OK", onPress: () => router.back() }],
        );
        setPhase("canceled");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets[0]) {
        setPhase("canceled");
        setTimeout(() => { if (router.canGoBack()) router.back(); }, 800);
        return;
      }

      const uri = result.assets[0].uri;

      setPhase("uploading");
      const { objectPath } = await uploadImageMultipart(uri);
      const card = await apiFetch("/business-cards", {
        method: "POST",
        body: JSON.stringify({
          imageUrlFront: objectPath,
          processingStatus: "UPLOADED",
          reviewStatus: "PENDING_REVIEW",
        }),
      });

      setPhase("parsing");
      apiFetch(`/business-cards/${card.id}/parse`, { method: "POST" }).catch(() => {});

      const parsed = await pollForParse(card.id);

      setPhase("routing");

      if (isPersonCard(parsed)) {
        setDetectedType("card");
        const params = new URLSearchParams({
          source: "AUTO_SCAN",
          firstName: parsed?.firstName ?? "",
          lastName: parsed?.lastName ?? "",
          phone: parsed?.phone ?? parsed?.mobile ?? "",
          email: parsed?.email ?? "",
          title: parsed?.title ?? "",
        });
        setTimeout(() => {
          router.replace(`/capture/new?${params.toString()}` as Href);
        }, 400);
      } else {
        setDetectedType("facility");
        try {
          const orgResult = await uploadOrgScanMultipart(uri, undefined);
          apiFetch(`/organization-scans/${orgResult.id}/parse`, { method: "POST" }).catch(() => {});
          setTimeout(() => {
            router.replace(`/org-scan/${orgResult.id}` as Href);
          }, 400);
        } catch {
          const params = new URLSearchParams({
            source: "AUTO_SCAN",
            ...(parsed?.businessName ? { orgName: parsed.businessName } : {}),
          });
          router.replace(`/capture/new?${params.toString()}` as Href);
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setErrorMsg(msg);
      setPhase("error");
    }
  };

  const accentColor =
    phase === "error" || phase === "canceled"
      ? COLORS.red
      : phase === "routing" && detectedType === "card"
      ? COLORS.emerald
      : phase === "routing" && detectedType === "facility"
      ? "#6366f1"
      : COLORS.emerald;

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom + 24 }]}>
      <Stack.Screen
        options={{
          title: "Opportunity Eye",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        }}
      />

      <View style={styles.body}>
        <View style={[styles.iconCircle, { backgroundColor: accentColor + "22" }]}>
          {phase === "uploading" || phase === "parsing" ? (
            <ActivityIndicator size="large" color={accentColor} />
          ) : (
            <Feather name={PHASE_ICONS[phase]} size={44} color={accentColor} />
          )}
        </View>

        <Text style={styles.phaseLabel}>{PHASE_LABELS[phase]}</Text>

        {phase === "parsing" && (
          <Text style={styles.hint}>
            Checking for contact info, facility name, and logo…
          </Text>
        )}

        {phase === "routing" && detectedType && (
          <Text style={[styles.detectedBadge, { color: accentColor }]}>
            {detectedType === "card" ? "Business card detected" : "Facility / logo detected"}
          </Text>
        )}

        {phase === "error" && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}
      </View>

      {(phase === "error" || phase === "canceled") && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.retryBtn} onPress={runAutoCapture} activeOpacity={0.8}>
            <Feather name="camera" size={18} color={COLORS.white} />
            <Text style={styles.retryBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => { if (router.canGoBack()) router.back(); }}
            activeOpacity={0.75}
          >
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

async function pollForParse(
  cardId: string,
  maxAttempts = 12,
  intervalMs = 1500,
): Promise<Record<string, string> | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(intervalMs);
    try {
      const card = await apiFetch(`/business-cards/${cardId}`);
      if (card.processingStatus === "PARSED" || card.processingStatus === "FAILED") {
        return (card.parsedJson as Record<string, string> | null) ?? null;
      }
    } catch {
      // keep polling
    }
  }
  return null;
}

function isPersonCard(parsed: Record<string, string> | null): boolean {
  if (!parsed) return false;
  const hasName = !!(parsed.firstName || parsed.lastName);
  const hasContact = !!(parsed.email || parsed.phone || parsed.mobile);
  return hasName || hasContact;
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.navy,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  phaseLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: COLORS.text,
    textAlign: "center",
  },
  hint: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 21,
    maxWidth: 280,
  },
  detectedBadge: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    textAlign: "center",
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.red,
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 280,
  },
  actions: { gap: 10, paddingBottom: 8 },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.emerald,
    borderRadius: 14,
    paddingVertical: 16,
  },
  retryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: COLORS.white,
  },
  backBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  backBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
