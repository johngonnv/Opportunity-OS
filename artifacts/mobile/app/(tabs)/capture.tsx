import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import {
  useBusinessCards,
  useOrganizationScans,
  uploadImageMultipart,
  uploadOrgScanMultipart,
  apiFetch,
} from "@/hooks/useApi";

type ScanMode = "card" | "logo" | "qr";
type CaptureState = "idle" | "uploading" | "parsing";

interface ScanMode_Def {
  id: ScanMode;
  label: string;
  sub: string;
  accentColor: string;
  icon: keyof typeof Feather.glyphMap;
}

const MODES: ScanMode_Def[] = [
  {
    id: "card",
    label: "Business Card",
    sub: "OCR → contact form pre-fill",
    accentColor: COLORS.emerald,
    icon: "credit-card",
  },
  {
    id: "logo",
    label: "Facility / Logo",
    sub: "Logo → NPI match → hierarchy",
    accentColor: "#6366f1",
    icon: "home",
  },
  {
    id: "qr",
    label: "Badge / QR",
    sub: "Conference badge instant import",
    accentColor: COLORS.amber,
    icon: "grid",
  },
];

export default function OpportunityEyeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeMode, setActiveMode] = useState<ScanMode>("card");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");

  const mode = MODES.find((m) => m.id === activeMode)!;

  const { data: cardsData } = useBusinessCards({ limit: "5" });
  const { data: orgScansData } = useOrganizationScans();

  const recentScans = buildRecentScans(cardsData, orgScansData);

  const handleCapture = async (uri: string) => {
    if (activeMode === "logo") {
      setCaptureState("uploading");
      try {
        const result = await uploadOrgScanMultipart(uri, undefined);
        apiFetch(`/organization-scans/${result.id}/parse`, { method: "POST" }).catch(() => {});
        router.push(`/org-scan/${result.id}` as Href);
      } catch {
        Alert.alert("Upload failed", "Could not upload the image. Try again.");
      } finally {
        setCaptureState("idle");
      }
    } else {
      setCaptureState("uploading");
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
        setCaptureState("parsing");
        apiFetch(`/business-cards/${card.id}/parse`, { method: "POST" }).catch(() => {});
        const params = new URLSearchParams({ source: activeMode === "qr" ? "QR_SCAN" : "CARD_SCAN" });
        router.push(`/capture/new?${params.toString()}` as Href);
      } catch {
        Alert.alert("Upload failed", "Could not upload the image. Try again.");
      } finally {
        setCaptureState("idle");
      }
    }
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera Permission", "Please allow camera access to use Opportunity Eye.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    handleCapture(result.assets[0].uri);
  };

  const handleLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    handleCapture(result.assets[0].uri);
  };

  const isBusy = captureState !== "idle";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <View style={styles.headerTitleRow}>
            <Feather name="eye" size={18} color="#6366f1" />
            <Text style={styles.headerTitle}>Opportunity Eye</Text>
          </View>
          <Text style={styles.headerSub}>Unified capture · scan anything</Text>
        </View>
        <TouchableOpacity
          style={styles.searchBtn}
          onPress={() => router.push("/capture/new" as Href)}
          activeOpacity={0.75}
        >
          <Feather name="search" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Mode Selector */}
      <View style={styles.modeRow}>
        {MODES.map((m) => {
          const isActive = m.id === activeMode;
          return (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.modeCard,
                {
                  backgroundColor: isActive ? m.accentColor + "18" : COLORS.navySurface,
                  borderColor: isActive ? m.accentColor + "88" : COLORS.navyBorder,
                },
              ]}
              onPress={() => setActiveMode(m.id)}
              activeOpacity={0.75}
            >
              <Feather
                name={m.icon}
                size={22}
                color={isActive ? m.accentColor : COLORS.textDim}
              />
              <Text
                style={[styles.modeLabel, { color: isActive ? m.accentColor : COLORS.textDim }]}
                numberOfLines={2}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Viewfinder */}
        <TouchableOpacity
          style={[styles.viewfinder, { borderColor: mode.accentColor + "44" }]}
          onPress={isBusy ? undefined : handleCamera}
          activeOpacity={isBusy ? 1 : 0.85}
        >
          {/* Corner brackets */}
          <View style={[styles.corner, styles.cornerTL, { borderColor: mode.accentColor }]} />
          <View style={[styles.corner, styles.cornerTR, { borderColor: mode.accentColor }]} />
          <View style={[styles.corner, styles.cornerBL, { borderColor: mode.accentColor }]} />
          <View style={[styles.corner, styles.cornerBR, { borderColor: mode.accentColor }]} />

          {/* Scan line */}
          <View style={[styles.scanLine, { backgroundColor: mode.accentColor }]} />

          {/* Center content */}
          {isBusy ? (
            <View style={styles.viewfinderCenter}>
              <ActivityIndicator size="large" color={mode.accentColor} />
              <Text style={[styles.viewfinderHint, { color: mode.accentColor }]}>
                {captureState === "uploading" ? "Uploading…" : "Processing…"}
              </Text>
            </View>
          ) : (
            <View style={styles.viewfinderCenter}>
              <Feather name={mode.icon} size={28} color={mode.accentColor} style={{ opacity: 0.5 }} />
              <Text style={[styles.viewfinderHint, { color: mode.accentColor, opacity: 0.7 }]}>
                {mode.sub}
              </Text>
            </View>
          )}

          {/* Shutter button */}
          {!isBusy && (
            <View style={styles.shutterWrap}>
              <TouchableOpacity
                style={[styles.shutterBtn, { backgroundColor: mode.accentColor }]}
                onPress={handleCamera}
                activeOpacity={0.8}
              >
                <Feather name="camera" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>

        {/* Action row */}
        <View style={styles.actionRow}>
          {[
            { label: "Library", icon: "folder" as const, onPress: handleLibrary },
            { label: "Manual", icon: "edit-3" as const, onPress: () => router.push("/capture/new" as Href) },
            { label: "History", icon: "clock" as const, onPress: () => router.push("/capture/bulk" as Href) },
          ].map(({ label, icon, onPress }) => (
            <TouchableOpacity
              key={label}
              style={styles.actionBtn}
              onPress={onPress}
              activeOpacity={0.75}
            >
              <Feather name={icon} size={14} color={COLORS.textMuted} />
              <Text style={styles.actionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent Scans */}
        <Text style={styles.sectionLabel}>RECENT SCANS</Text>
        {recentScans.length === 0 ? (
          <View style={styles.emptyScans}>
            <Feather name="inbox" size={28} color={COLORS.textDim} />
            <Text style={styles.emptyText}>No scans yet — tap the camera to start</Text>
          </View>
        ) : (
          <View style={styles.scanList}>
            {recentScans.map((scan, i) => (
              <TouchableOpacity
                key={i}
                style={styles.scanItem}
                onPress={() => scan.route && router.push(scan.route as Href)}
                activeOpacity={scan.route ? 0.75 : 1}
              >
                <View style={[styles.scanAvatar, { backgroundColor: scan.accentColor + "22" }]}>
                  <Feather name={scan.icon} size={16} color={scan.accentColor} />
                </View>
                <View style={styles.scanText}>
                  <Text style={styles.scanTitle} numberOfLines={1}>{scan.label}</Text>
                  <Text style={styles.scanSub}>{scan.sub}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: scan.statusColor + "22" }]}>
                  <Text style={[styles.statusText, { color: scan.statusColor }]}>{scan.status}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

interface RecentScan {
  label: string;
  sub: string;
  icon: keyof typeof Feather.glyphMap;
  accentColor: string;
  status: string;
  statusColor: string;
  route?: string;
}

function buildRecentScans(cardsData: unknown, orgScansData: unknown): RecentScan[] {
  const items: RecentScan[] = [];

  const cards = Array.isArray(cardsData) ? cardsData : (cardsData as { cards?: unknown[] } | null)?.cards ?? [];
  for (const c of (cards as Record<string, unknown>[]).slice(0, 3)) {
    const parsed = c.parsedJson as Record<string, string> | null;
    const name =
      parsed && (parsed.firstName || parsed.lastName)
        ? `${parsed.firstName ?? ""} ${parsed.lastName ?? ""}`.trim()
        : "Business Card";
    const status =
      c.reviewStatus === "APPROVED"
        ? "Imported"
        : c.processingStatus === "PARSED"
        ? "Ready"
        : "Pending";
    items.push({
      label: name,
      sub: `Card scan · ${timeAgo(c.createdAt as string)}`,
      icon: "credit-card",
      accentColor: COLORS.emerald,
      status,
      statusColor:
        status === "Imported" ? "#6366f1" : status === "Ready" ? COLORS.emerald : COLORS.amber,
      route: c.id ? `/card/${c.id}` : undefined,
    });
  }

  const orgScans = Array.isArray(orgScansData)
    ? orgScansData
    : (orgScansData as { scans?: unknown[] } | null)?.scans ?? [];
  for (const s of (orgScans as Record<string, unknown>[]).slice(0, 3)) {
    const status =
      s.status === "APPROVED"
        ? "Matched"
        : s.status === "PENDING"
        ? "Pending"
        : s.processingStatus === "PARSED"
        ? "Review"
        : "Scanning";
    items.push({
      label: (s.extractedName as string) || "Organization Scan",
      sub: `Logo scan · ${timeAgo(s.createdAt as string)}`,
      icon: "home",
      accentColor: "#6366f1",
      status,
      statusColor:
        status === "Matched" ? COLORS.emerald : status === "Pending" ? COLORS.amber : "#6366f1",
      route: s.id ? `/org-scan/${s.id}` : undefined,
    });
  }

  items.sort((a, b) => {
    const tA = extractTime(a.sub);
    const tB = extractTime(b.sub);
    return tA - tB;
  });

  return items.slice(0, 5);
}

function timeAgo(ts: string | undefined): string {
  if (!ts) return "just now";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.floor(hrs / 24)} days ago`;
}

function extractTime(sub: string): number {
  const m = sub.match(/(\d+)\s*(min|hr|day)/);
  if (!m) return 0;
  const n = parseInt(m[1], 10);
  if (m[2] === "min") return n;
  if (m[2] === "hr") return n * 60;
  return n * 1440;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.navy },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  searchBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.navySurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },

  modeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  modeCard: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
  },
  modeLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 14,
  },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 0 },

  viewfinder: {
    width: "100%",
    height: 220,
    borderRadius: 20,
    backgroundColor: "#050e1e",
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    position: "relative",
  },
  corner: {
    position: "absolute",
    width: 22,
    height: 22,
  },
  cornerTL: { top: 10, left: 10, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 4 },
  cornerTR: { top: 10, right: 10, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 4 },
  cornerBL: { bottom: 10, left: 10, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 10, right: 10, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 4 },
  scanLine: {
    position: "absolute",
    top: "45%",
    left: 24,
    right: 24,
    height: 1,
    opacity: 0.6,
  },
  viewfinderCenter: {
    alignItems: "center",
    gap: 10,
  },
  viewfinderHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  shutterWrap: {
    position: "absolute",
    bottom: 14,
    alignSelf: "center",
  },
  shutterBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.2)",
  },

  actionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.navySurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingVertical: 10,
  },
  actionLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textMuted,
  },

  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.textDim,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  scanList: { gap: 8 },
  scanItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.navySurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  scanAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  scanText: { flex: 1, minWidth: 0 },
  scanTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 2,
  },
  scanSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
  },
  statusBadge: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },

  emptyScans: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 32,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textDim,
    textAlign: "center",
  },
});
