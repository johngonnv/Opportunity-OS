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

const INDIGO = "#6366f1";

type Phase =
  | "launching"
  | "uploading"
  | "parsing"
  | "prompt_back"
  | "uploading_back"
  | "parsing_back"
  | "routing"
  | "done_facility"
  | "canceled"
  | "error";

const PHASE_LABELS: Record<Phase, string> = {
  launching: "Opening camera…",
  uploading: "Uploading image…",
  parsing: "Analyzing scan…",
  prompt_back: "Business card detected",
  uploading_back: "Uploading back of card…",
  parsing_back: "Reading both sides…",
  routing: "Got it — loading…",
  done_facility: "Facility scan complete",
  canceled: "Canceled",
  error: "Could not process image",
};

export default function AutoCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("launching");
  const [detectedType, setDetectedType] = useState<"card" | "facility" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasRun = useRef(false);
  const pendingCardId = useRef<string | null>(null);
  const pendingParsed = useRef<Record<string, string> | null>(null);
  const pendingOrgScanId = useRef<string | null>(null);
  const pendingOrgName = useRef<string | null>(null);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    runAutoCapture();
  }, []);

  const runAutoCapture = async () => {
    setPhase("launching");
    setErrorMsg(null);
    pendingCardId.current = null;
    pendingParsed.current = null;
    pendingOrgScanId.current = null;
    pendingOrgName.current = null;

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

      const front = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: false,
      });

      if (front.canceled || !front.assets[0]) {
        setPhase("canceled");
        setTimeout(() => { if (router.canGoBack()) router.back(); }, 800);
        return;
      }

      const frontUri = front.assets[0].uri;

      setPhase("uploading");
      const { objectPath } = await uploadImageMultipart(frontUri);
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

      if (isPersonCard(parsed)) {
        setDetectedType("card");
        pendingCardId.current = card.id;
        pendingParsed.current = parsed;
        setPhase("prompt_back");
      } else {
        await routeAsFacility(frontUri, parsed);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Something went wrong.";
      setErrorMsg(msg);
      setPhase("error");
    }
  };

  const handleScanBack = async () => {
    const cardId = pendingCardId.current;
    if (!cardId) return;

    try {
      const back = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        quality: 0.85,
        allowsEditing: false,
      });

      if (back.canceled || !back.assets[0]) {
        routeAsCard(pendingParsed.current);
        return;
      }

      setPhase("uploading_back");
      const { objectPath: backPath } = await uploadImageMultipart(back.assets[0].uri);

      await apiFetch(`/business-cards/${cardId}`, {
        method: "PUT",
        body: JSON.stringify({ imageUrlBack: backPath }),
      });

      setPhase("parsing_back");
      apiFetch(`/business-cards/${cardId}/parse`, { method: "POST" }).catch(() => {});
      const reParsed = await pollForParse(cardId);

      routeAsCard(reParsed ?? pendingParsed.current);
    } catch (e: unknown) {
      routeAsCard(pendingParsed.current);
    }
  };

  const handleSkipBack = () => {
    routeAsCard(pendingParsed.current);
  };

  const routeAsCard = (parsed: Record<string, string> | null) => {
    setPhase("routing");
    const params = new URLSearchParams({
      source: "AUTO_SCAN",
      firstName: parsed?.firstName ?? "",
      lastName: parsed?.lastName ?? "",
      phone: parsed?.phone ?? "",
      mobile: parsed?.mobile ?? "",
      email: parsed?.email ?? "",
      title: parsed?.title ?? "",
      orgName: parsed?.organizationName ?? "",
    });
    setTimeout(() => {
      router.replace(`/capture/new?${params.toString()}` as Href);
    }, 300);
  };

  const routeAsFacility = async (uri: string, parsed: Record<string, string> | null) => {
    setDetectedType("facility");
    setPhase("routing");
    try {
      const orgResult = await uploadOrgScanMultipart(uri, undefined);
      apiFetch(`/organization-scans/${orgResult.id}/parse`, { method: "POST" }).catch(() => {});
      pendingOrgScanId.current = orgResult.id;
      // Try to get org name from parsed data
      pendingOrgName.current = parsed?.businessName || parsed?.organizationName || null;
      setPhase("done_facility");
    } catch {
      const params = new URLSearchParams({
        source: "AUTO_SCAN",
        ...(parsed?.businessName ? { orgName: parsed.businessName } : {}),
      });
      router.replace(`/capture/new?${params.toString()}` as Href);
    }
  };

  const handleViewScanResult = () => {
    const scanId = pendingOrgScanId.current;
    if (scanId) {
      router.replace(`/org-scan/${scanId}` as Href);
    }
  };

  const handleLogEvent = () => {
    const orgName = pendingOrgName.current;
    const params = new URLSearchParams({ source: "AUTO_SCAN" });
    if (orgName) params.set("orgName", orgName);
    router.replace(`/capture/opportunity-event?${params.toString()}` as Href);
  };

  const isSpinning = ["uploading", "parsing", "uploading_back", "parsing_back"].includes(phase);

  const accentColor =
    phase === "error" || phase === "canceled"
      ? COLORS.red
      : phase === "done_facility"
      ? INDIGO
      : phase === "prompt_back" || (phase === "routing" && detectedType === "card")
      ? COLORS.emerald
      : phase === "routing" && detectedType === "facility"
      ? INDIGO
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
          {isSpinning ? (
            <ActivityIndicator size="large" color={accentColor} />
          ) : phase === "prompt_back" ? (
            <Feather name="credit-card" size={44} color={accentColor} />
          ) : phase === "done_facility" ? (
            <Feather name="home" size={44} color={accentColor} />
          ) : phase === "routing" ? (
            <Feather name="check-circle" size={44} color={accentColor} />
          ) : phase === "canceled" ? (
            <Feather name="x-circle" size={44} color={accentColor} />
          ) : phase === "error" ? (
            <Feather name="alert-circle" size={44} color={accentColor} />
          ) : (
            <Feather name="camera" size={44} color={accentColor} />
          )}
        </View>

        <Text style={styles.phaseLabel}>{PHASE_LABELS[phase]}</Text>

        {phase === "parsing" && (
          <Text style={styles.hint}>
            Checking for contact info, facility name, and logo…
          </Text>
        )}

        {phase === "parsing_back" && (
          <Text style={styles.hint}>Re-analyzing with both sides of the card…</Text>
        )}

        {phase === "prompt_back" && (
          <Text style={styles.hint}>
            We found a contact on the front. Scan the back for more details — phone extensions, direct lines, or extra notes.
          </Text>
        )}

        {phase === "done_facility" && (
          <Text style={styles.hint}>
            {pendingOrgName.current
              ? `"${pendingOrgName.current}" has been captured. What would you like to do next?`
              : "The facility scan is ready. What would you like to do next?"}
          </Text>
        )}

        {phase === "error" && (
          <Text style={styles.errorText}>{errorMsg}</Text>
        )}
      </View>

      {phase === "prompt_back" && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleScanBack} activeOpacity={0.8}>
            <Feather name="camera" size={18} color={COLORS.white} />
            <Text style={styles.primaryBtnText}>Scan Back of Card</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={handleSkipBack} activeOpacity={0.75}>
            <Text style={styles.skipBtnText}>Skip — front is enough</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "done_facility" && (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleViewScanResult} activeOpacity={0.8}>
            <Feather name="eye" size={18} color={COLORS.white} />
            <Text style={styles.primaryBtnText}>View Scan Result</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.eventBtn} onPress={handleLogEvent} activeOpacity={0.8}>
            <Feather name="file-text" size={18} color={COLORS.white} />
            <Text style={styles.primaryBtnText}>Log an Opportunity Event</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.skipBtn} onPress={() => { if (router.canGoBack()) router.back(); }} activeOpacity={0.75}>
            <Text style={styles.skipBtnText}>Done — go back</Text>
          </TouchableOpacity>
        </View>
      )}

      {(phase === "error" || phase === "canceled") && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => { hasRun.current = false; runAutoCapture(); }}
            activeOpacity={0.8}
          >
            <Feather name="camera" size={18} color={COLORS.white} />
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.skipBtn}
            onPress={() => { if (router.canGoBack()) router.back(); }}
            activeOpacity={0.75}
          >
            <Text style={styles.skipBtnText}>Go Back</Text>
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
  return !!(parsed.firstName || parsed.lastName || parsed.email || parsed.phone || parsed.mobile);
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
    maxWidth: 300,
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
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.emerald,
    borderRadius: 14,
    paddingVertical: 16,
  },
  eventBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: INDIGO,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: COLORS.white,
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  skipBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.textMuted,
  },
});
