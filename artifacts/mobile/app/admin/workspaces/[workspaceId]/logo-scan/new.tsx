import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminUploadOrgScan, adminFetch } from "@/hooks/useAdminAuth";

export default function AdminLogoScanNewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImage = async (uri: string) => {
    setUploading(true);
    setError(null);
    try {
      const result = await adminUploadOrgScan(workspaceId, uri);
      adminFetch(`/admin/workspaces/${workspaceId}/organization-scans/${result.id}/parse`, { method: "POST" })
        .catch((e: any) => console.log("[ADMIN-SCAN] parse trigger error:", e?.message));
      router.replace(`/admin/workspaces/${workspaceId}/logo-scan/${result.id}` as Href);
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
          { label: "Workspaces", href: "/admin/workspaces" as Href },
          { label: "Support Panel", href: `/admin/workspaces/${workspaceId}` as Href },
          { label: "Logo Scan" },
        ]}
      />

      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Feather name="camera" size={48} color={COLORS.amber} />
        </View>
        <Text style={styles.title}>Logo Scan</Text>
        <Text style={styles.subtitle}>
          Take a clear photo of the business sign or storefront. OCR will extract the name and find a Google Places match to create or enrich an organization in this workspace.
        </Text>
      </View>

      {!!error && (
        <View style={styles.errorCard}>
          <Feather name="alert-circle" size={14} color={COLORS.red} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {uploading ? (
        <View style={styles.loadingBlock}>
          <ActivityIndicator size="large" color={COLORS.amber} />
          <Text style={styles.loadingText}>Uploading image…</Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCamera} activeOpacity={0.8}>
            <Feather name="camera" size={22} color={COLORS.white} />
            <Text style={styles.primaryBtnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleLibrary} activeOpacity={0.8}>
            <Feather name="image" size={20} color={COLORS.amber} />
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
    backgroundColor: "#3D2A00",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.amber + "44",
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
    backgroundColor: COLORS.amber,
    borderRadius: 14,
    paddingVertical: 16,
  },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.navyDark },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#3D2A00",
    borderRadius: 14,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: COLORS.amber + "55",
  },
  secondaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.amber },
});
