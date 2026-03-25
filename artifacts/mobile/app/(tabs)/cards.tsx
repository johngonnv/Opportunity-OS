import React, { useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert, Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useBusinessCards, useCreateBusinessCard, apiFetch, uploadImageMultipart, getStorageUrl } from "@/hooks/useApi";

const REVIEW_COLORS: Record<string, string> = {
  PENDING_REVIEW: COLORS.amber,
  APPROVED: COLORS.emerald,
  REJECTED: COLORS.red,
  MERGED: COLORS.blue,
};

const PROCESSING_COLORS: Record<string, string> = {
  UPLOADED: COLORS.textDim,
  PARSING: COLORS.amber,
  PARSED: COLORS.emerald,
  FAILED: COLORS.red,
};

function resolveImageUri(imageUrlFront: string): string {
  if (imageUrlFront.startsWith("/objects/")) {
    return getStorageUrl(imageUrlFront);
  }
  return imageUrlFront;
}

function CardItem({ card, onPress }: any) {
  const imageUri = card.imageUrlFront ? resolveImageUri(card.imageUrlFront) : null;
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(card.id)} activeOpacity={0.75}>
      <View style={styles.cardImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Feather name="credit-card" size={24} color={COLORS.textDim} />
          </View>
        )}
      </View>
      <View style={styles.cardInfo}>
        {card.linkedContact ? (
          <>
            <Text style={styles.contactName}>{card.linkedContact.fullName}</Text>
            {card.linkedContact.title && <Text style={styles.contactTitle} numberOfLines={1}>{card.linkedContact.title}</Text>}
            {card.linkedOrganization && <Text style={styles.orgName} numberOfLines={1}>{card.linkedOrganization.name}</Text>}
          </>
        ) : (
          <Text style={styles.contactName}>Unreviewed Card</Text>
        )}
        <View style={styles.cardBadges}>
          <Badge label={card.reviewStatus.replace("_", " ")} color={REVIEW_COLORS[card.reviewStatus] || COLORS.textDim} />
          {card.processingStatus !== "PARSED" && (
            <Badge label={card.processingStatus} color={PROCESSING_COLORS[card.processingStatus] || COLORS.textDim} />
          )}
        </View>
        <Text style={styles.cardDate}>{new Date(card.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.textDim} />
    </TouchableOpacity>
  );
}

export default function CardsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [reviewFilter, setReviewFilter] = useState<string | null>("PENDING_REVIEW");
  const params: Record<string, string> = {};
  if (reviewFilter) params.reviewStatus = reviewFilter;
  const { data, isLoading, refetch, isRefetching } = useBusinessCards(params);
  const createCard = useCreateBusinessCard();
  const [uploading, setUploading] = useState(false);

  const processImage = async (uri: string) => {
    setUploading(true);
    try {
      console.log("[CARD] upload started, uri:", uri.slice(0, 60));

      const { objectPath } = await uploadImageMultipart(uri);
      console.log("[CARD] image uploaded, objectPath:", objectPath);

      const card = await createCard.mutateAsync({
        imageUrlFront: objectPath,
        processingStatus: "UPLOADED",
        reviewStatus: "PENDING_REVIEW",
      });
      console.log("[CARD] card created, id:", card.id);

      apiFetch(`/business-cards/${card.id}/parse`, { method: "POST" })
        .then(() => console.log("[CARD] parse triggered"))
        .catch((e: any) => console.log("[CARD] parse trigger error:", e?.message));

      refetch();
      router.push(`/card/${card.id}`);
    } catch (err: any) {
      console.log("[CARD] upload/create failed:", err?.message);
      Alert.alert("Upload Failed", err?.message || "Failed to upload card image. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleScan = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Camera Permission", "Please allow camera access to scan business cards.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0].uri);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      await processImage(result.assets[0].uri);
    }
  };

  if (isLoading) return <LoadingSpinner label="Loading cards..." />;
  const cards = data?.businessCards || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.headerTitle}>Business Cards</Text>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={handlePickImage} disabled={uploading}>
            <Feather name="image" size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.scanBtn} onPress={handleScan} disabled={uploading}>
            <Feather name="camera" size={18} color={COLORS.navy} />
            <Text style={styles.scanText}>{uploading ? "Uploading…" : "Scan"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.filterRow}>
        {[
          { label: "Pending", value: "PENDING_REVIEW" },
          { label: "Approved", value: "APPROVED" },
          { label: "All", value: null },
        ].map(({ label, value }) => (
          <TouchableOpacity
            key={label}
            style={[styles.filterBtn, reviewFilter === value && styles.filterBtnActive]}
            onPress={() => setReviewFilter(value)}
          >
            <Text style={[styles.filterText, reviewFilter === value && styles.filterTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={cards}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={[styles.list, cards.length === 0 && { flex: 1 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
        renderItem={({ item }) => (
          <CardItem card={item} onPress={(id: string) => router.push(`/card/${id}`)} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="credit-card"
            title={reviewFilter === "PENDING_REVIEW" ? "No cards pending review" : "No cards yet"}
            subtitle="Tap Scan to photograph a business card and add it as a contact"
            action={
              <Button title="Scan a Card" onPress={handleScan} icon={<Feather name="camera" size={16} color={COLORS.white} />} />
            }
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  topActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  iconBtn: { width: 36, height: 36, backgroundColor: COLORS.navySurface, borderRadius: 10, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.navyBorder },
  scanBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.emerald, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  scanText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.navy },
  filterRow: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  filterBtnActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  filterText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  filterTextActive: { color: COLORS.emerald },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    gap: 12,
  },
  cardImage: { width: 60, height: 40, borderRadius: 6, overflow: "hidden" },
  image: { width: "100%", height: "100%" },
  imagePlaceholder: { flex: 1, backgroundColor: COLORS.navySurface, alignItems: "center", justifyContent: "center" },
  cardInfo: { flex: 1, gap: 3 },
  contactName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  contactTitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  orgName: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  cardBadges: { flexDirection: "row", gap: 6, marginTop: 2 },
  cardDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 2 },
});
