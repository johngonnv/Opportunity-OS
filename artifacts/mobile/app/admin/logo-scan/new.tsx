import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminUploadMasterOrgScan, adminFetch } from "@/hooks/useAdminAuth";

export default function AdminMasterOrgScanNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImage = async (uri: string) => {
    setUploading(true);
    setError(null);
    try {
      const result = await adminUploadMasterOrgScan(uri);
      adminFetch(`/admin/master-org-scans/${result.id}/parse`, { method: "POST" })
        .catch((e: any) => console.log("[MASTER-SCAN] parse trigger error:", e?.message));
      router.replace(`/admin/logo-scan/${result.id}` as Href);
    } catch (err: any) {
      setError(err.message || "Failed to upload image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      if (Platform.OS === "web") {
        alert("Camera permission required to take photos.");
        return;
      }
      Alert.alert("Camera Permission", "Please allow camera access to scan storefronts.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    handleImage(result.assets[0].uri);
  };

  const handleLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    handleImage(result.assets[0].uri);
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <AdminHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/admin/dashboard" as Href },
          { label: "Logo Scan" },
        ]}
      />

      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Feather name="camera" size={48} color={COLORS.cyan} />
        </View>
        <Text style={styles.title}>Master DB Logo Scan</Text>
        <Text style={styles.subtitle}>
          Photograph a facility sign or logo to extract the name and find a Google Places match. Approved scans create or enrich records in the platform-wide Master Organization database.
        </Text>
        <View style={styles.infoBadge}>
          <Feather name="database" size={13} color={COLORS.cyan} />
          <Text style={styles.infoBadgeText}>Targets Master Organizations — not workspace CRM</Text>
        </View>
      </View>

      {!!error && (
        <View style={styles.errorCard}>
          <Feather name="alert-circle" size={14} color={COLORS.red} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {uploading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={COLORS.cyan} />
          <Text style={styles.loadingText}>Uploading image…</Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCamera} activeOpacity={0.8}>
            <Feather name="camera" size={22} color={COLORS.navyDark} />
            <Text style={styles.primaryBtnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleLibrary} activeOpacity={0.8}>
            <Feather name="image" size={20} color={COLORS.cyan} />
            <Text style={styles.secondaryBtnText}>Upload from Library</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navyDark,
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
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.cyan + "18",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.cyan + "44",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: COLORS.text,
    textAlign: "center",
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  infoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.cyan + "15",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: COLORS.cyan + "35",
    marginTop: 4,
  },
  infoBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.cyan,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.red + "18",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, flex: 1 },
  loadingBlock: { alignItems: "center", gap: 12, paddingVertical: 32 },
  loadingText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
  actions: { gap: 12, paddingBottom: 8 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.cyan,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.navyDark },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.cyan + "18",
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.cyan + "55",
  },
  secondaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.cyan },
});
