import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { COLORS } from "@/constants/colors";
import { uploadOrgScanMultipart, apiFetch } from "@/hooks/useApi";

export default function OrgScanCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { targetOrganizationId } = useLocalSearchParams<{ targetOrganizationId?: string }>();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEnrich = !!targetOrganizationId;

  const handleImage = async (uri: string) => {
    setUploading(true);
    setError(null);
    try {
      const result = await uploadOrgScanMultipart(uri, targetOrganizationId);
      apiFetch(`/organization-scans/${result.id}/parse`, { method: "POST" })
        .catch((e: any) => console.log("[ORG-SCAN] parse trigger error:", e?.message));
      router.replace(`/org-scan/${result.id}`);
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
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]) return;
    handleImage(result.assets[0].uri);
  };

  const handleLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    handleImage(result.assets[0].uri);
  };

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <Stack.Screen
        options={{ title: isEnrich ? "Enrich from Photo" : "Scan Business Logo" }}
      />

      <View style={styles.hero}>
        <View style={styles.iconCircle}>
          <Feather name="image" size={52} color={COLORS.emerald} />
        </View>
        <Text style={styles.title}>
          {isEnrich ? "Enrich Organization" : "Scan Business Logo"}
        </Text>
        <Text style={styles.subtitle}>
          Take a clear photo of the business sign or storefront name. OCR will extract the business name and find a Google Places match.
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
          <ActivityIndicator size="large" color={COLORS.emerald} />
          <Text style={styles.loadingText}>Uploading image…</Text>
        </View>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCamera} activeOpacity={0.8}>
            <Feather name="camera" size={22} color={COLORS.white} />
            <Text style={styles.primaryBtnText}>Take Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={handleLibrary} activeOpacity={0.8}>
            <Feather name="image" size={20} color={COLORS.emerald} />
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
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.emeraldMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
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
  loadingBlock: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 32,
  },
  loadingText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
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
