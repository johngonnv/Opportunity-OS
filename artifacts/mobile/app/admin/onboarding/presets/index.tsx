import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

interface Vertical {
  id: string;
  key: string;
  label: string;
}

interface Preset {
  id: string;
  name: string;
  description: string | null;
  verticalId: string | null;
  subVerticalId: string | null;
  isPublic: boolean;
  usageCount: number;
  version: number;
  verticalLabel: string | null;
  subVerticalLabel: string | null;
  createdAt: string;
}

interface PresetsData {
  presets: Preset[];
  total: number;
}

interface VerticalsData {
  verticals: Vertical[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PresetsScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [selectedVerticalId, setSelectedVerticalId] = useState<string | null>(null);

  const { data: verticalsData } = useQuery<VerticalsData>({
    queryKey: ["adminOnboardingVerticals"],
    queryFn: () => adminFetch("/admin/onboarding/config/verticals"),
    enabled: isAdminAuthenticated,
  });

  const { data, isLoading, refetch, isRefetching } = useQuery<PresetsData>({
    queryKey: ["adminOnboardingPresets", selectedVerticalId],
    queryFn: () => {
      const qs = selectedVerticalId ? `?verticalId=${selectedVerticalId}` : "";
      return adminFetch(`/admin/onboarding/presets${qs}`);
    },
    enabled: isAdminAuthenticated,
  });

  const verticals = verticalsData?.verticals ?? [];
  const presets = data?.presets ?? [];

  const handleUsePreset = (presetId: string) => {
    router.push((`/admin/onboarding/new?presetId=${presetId}`) as Href);
  };

  const renderItem = ({ item }: { item: Preset }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardName}>{item.name}</Text>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          <View style={styles.cardTags}>
            {item.verticalLabel && (
              <View style={styles.tag}>
                <Text style={styles.tagText}>{item.verticalLabel}</Text>
              </View>
            )}
            {item.subVerticalLabel && (
              <View style={[styles.tag, { backgroundColor: COLORS.amber + "18" }]}>
                <Text style={[styles.tagText, { color: COLORS.amber }]}>{item.subVerticalLabel}</Text>
              </View>
            )}
            {item.isPublic && (
              <View style={[styles.tag, { backgroundColor: COLORS.emerald + "18" }]}>
                <Text style={[styles.tagText, { color: COLORS.emerald }]}>Public</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardMeta}>
            Used {item.usageCount}× · v{item.version} · {fmtDate(item.createdAt)}
          </Text>
        </View>
      </View>
      <TouchableOpacity
        style={styles.useBtn}
        onPress={() => handleUsePreset(item.id)}
        activeOpacity={0.85}
      >
        <Feather name="play" size={14} color={COLORS.navyDark} />
        <Text style={styles.useBtnText}>Use Preset</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Onboarding", href: "/admin/onboarding" as Href },
        { label: "Presets" },
      ]} />

      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          <TouchableOpacity
            style={[styles.filterChip, !selectedVerticalId && styles.filterChipActive]}
            onPress={() => setSelectedVerticalId(null)}
          >
            <Text style={[styles.filterChipText, !selectedVerticalId && styles.filterChipTextActive]}>All</Text>
          </TouchableOpacity>
          {verticals.map(v => (
            <TouchableOpacity
              key={v.id}
              style={[styles.filterChip, selectedVerticalId === v.id && styles.filterChipActive]}
              onPress={() => setSelectedVerticalId(selectedVerticalId === v.id ? null : v.id)}
            >
              <Text style={[styles.filterChipText, selectedVerticalId === v.id && styles.filterChipTextActive]}>
                {v.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <Text style={styles.totalText}>{data?.total ?? 0} presets</Text>

      <FlatList
        data={presets}
        keyExtractor={p => p.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={refetch}
            tintColor={COLORS.amber}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}><ActivityIndicator color={COLORS.amber} /></View>
          ) : (
            <View style={styles.empty}>
              <Feather name="package" size={32} color={COLORS.textDim} />
              <Text style={styles.emptyText}>No presets found</Text>
              <Text style={styles.emptyHint}>
                Presets are saved from completed provisioning sessions.
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  filterWrap: { paddingVertical: 10 },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    borderRadius: 16, borderWidth: 1,
    borderColor: COLORS.textDim + "44",
    paddingHorizontal: 12, paddingVertical: 4,
  },
  filterChipActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "22" },
  filterChipText: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterChipTextActive: { color: COLORS.amber },
  totalText: {
    color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular",
    paddingHorizontal: 16, paddingBottom: 4,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.amber + "22", padding: 14, marginBottom: 10,
  },
  cardTop: { marginBottom: 12 },
  cardLeft: { gap: 4 },
  cardName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  cardDesc: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
  cardTags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  tag: {
    backgroundColor: COLORS.navyDark, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  tagText: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold" },
  cardMeta: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  useBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: COLORS.amber, borderRadius: 10, paddingVertical: 10,
  },
  useBtnText: { color: COLORS.navyDark, fontSize: 13, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
  emptyHint: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingHorizontal: 32 },
});
