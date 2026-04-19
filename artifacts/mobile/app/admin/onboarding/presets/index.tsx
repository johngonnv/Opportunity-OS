import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView, Modal,
} from "react-native";
import { alertMessage } from "@/utils/crossPlatformAlert";
import { useRouter } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
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

interface PresetConfigSection {
  key: string;
  label?: string;
  name?: string;
}

interface PresetDetail extends Preset {
  appliedConfig: {
    serviceLines?: PresetConfigSection[];
    pipelineTemplates?: PresetConfigSection[];
    addOns?: PresetConfigSection[];
    salesCycleType?: string;
    teamSize?: string;
    [key: string]: unknown;
  } | null;
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
  const [applyingPresetId, setApplyingPresetId] = useState<string | null>(null);
  const [detailPreset, setDetailPreset] = useState<Preset | null>(null);

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

  const applyMutation = useMutation({
    mutationFn: (presetId: string) =>
      adminFetch(`/admin/onboarding/presets/${presetId}/apply`, { method: "POST", body: JSON.stringify({}) }),
    onSuccess: (data: { session: { id: string } }) => {
      setApplyingPresetId(null);
      router.push(`/admin/onboarding/${data.session.id}/review` as Href);
    },
    onError: () => {
      setApplyingPresetId(null);
      alertMessage("Error", "Failed to apply preset. Please try again.");
    },
  });

  const handleUsePreset = (presetId: string) => {
    setDetailPreset(null);
    setApplyingPresetId(presetId);
    applyMutation.mutate(presetId);
  };

  const { data: detailData, isLoading: detailLoading } = useQuery<{ preset: PresetDetail }>({
    queryKey: ["adminPresetDetail", detailPreset?.id],
    queryFn: () => adminFetch(`/admin/onboarding/presets/${detailPreset!.id}`),
    enabled: isAdminAuthenticated && detailPreset !== null,
    staleTime: 30_000,
  });

  const renderItem = ({ item }: { item: Preset }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => setDetailPreset(item)}
      activeOpacity={0.85}
    >
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
        <Feather name="chevron-right" size={16} color={COLORS.textDim} />
      </View>
    </TouchableOpacity>
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

      {detailPreset !== null && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setDetailPreset(null)}>
          <View style={styles.detailOverlay}>
            <View style={styles.detailSheet}>
              <View style={styles.detailHeader}>
                <Text style={styles.detailTitle} numberOfLines={2}>{detailPreset.name}</Text>
                <TouchableOpacity onPress={() => setDetailPreset(null)}>
                  <Feather name="x" size={20} color={COLORS.textDim} />
                </TouchableOpacity>
              </View>

              {detailPreset.description ? (
                <Text style={styles.detailDesc}>{detailPreset.description}</Text>
              ) : null}

              <View style={styles.detailTagRow}>
                {detailPreset.verticalLabel && (
                  <View style={styles.tag}><Text style={styles.tagText}>{detailPreset.verticalLabel}</Text></View>
                )}
                {detailPreset.subVerticalLabel && (
                  <View style={[styles.tag, { backgroundColor: COLORS.amber + "18" }]}>
                    <Text style={[styles.tagText, { color: COLORS.amber }]}>{detailPreset.subVerticalLabel}</Text>
                  </View>
                )}
                {detailPreset.isPublic && (
                  <View style={[styles.tag, { backgroundColor: COLORS.emerald + "18" }]}>
                    <Text style={[styles.tagText, { color: COLORS.emerald }]}>Public</Text>
                  </View>
                )}
              </View>

              <Text style={styles.detailMeta}>
                Used {detailPreset.usageCount}× · v{detailPreset.version} · Created {fmtDate(detailPreset.createdAt)}
              </Text>

              <Text style={styles.detailSectionLabel}>Configuration</Text>
              {detailLoading ? (
                <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 12 }} />
              ) : detailData?.preset.appliedConfig ? (
                <ScrollView style={styles.detailConfig} showsVerticalScrollIndicator={false}>
                  {detailData.preset.appliedConfig.salesCycleType ? (
                    <View style={styles.detailConfigRow}>
                      <Text style={styles.detailConfigKey}>Sales Cycle</Text>
                      <Text style={styles.detailConfigVal}>{detailData.preset.appliedConfig.salesCycleType}</Text>
                    </View>
                  ) : null}
                  {detailData.preset.appliedConfig.teamSize ? (
                    <View style={styles.detailConfigRow}>
                      <Text style={styles.detailConfigKey}>Team Size</Text>
                      <Text style={styles.detailConfigVal}>{detailData.preset.appliedConfig.teamSize}</Text>
                    </View>
                  ) : null}
                  {(detailData.preset.appliedConfig.serviceLines ?? []).length > 0 ? (
                    <View style={styles.detailConfigRow}>
                      <Text style={styles.detailConfigKey}>Service Lines</Text>
                      <Text style={styles.detailConfigVal}>
                        {(detailData.preset.appliedConfig.serviceLines ?? [])
                          .map(s => s.label ?? s.name ?? s.key).join(", ")}
                      </Text>
                    </View>
                  ) : null}
                  {(detailData.preset.appliedConfig.pipelineTemplates ?? []).length > 0 ? (
                    <View style={styles.detailConfigRow}>
                      <Text style={styles.detailConfigKey}>Pipelines</Text>
                      <Text style={styles.detailConfigVal}>
                        {(detailData.preset.appliedConfig.pipelineTemplates ?? [])
                          .map(p => p.label ?? p.name ?? p.key).join(", ")}
                      </Text>
                    </View>
                  ) : null}
                  {(detailData.preset.appliedConfig.addOns ?? []).length > 0 ? (
                    <View style={styles.detailConfigRow}>
                      <Text style={styles.detailConfigKey}>Add-Ons</Text>
                      <Text style={styles.detailConfigVal}>
                        {(detailData.preset.appliedConfig.addOns ?? [])
                          .map(a => a.label ?? a.name ?? a.key).join(", ")}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>
              ) : (
                <Text style={styles.detailNoConfig}>No configuration details stored for this preset.</Text>
              )}

              <TouchableOpacity
                style={[styles.useBtn, applyingPresetId === detailPreset.id && { opacity: 0.7 }]}
                onPress={() => handleUsePreset(detailPreset.id)}
                activeOpacity={0.85}
                disabled={applyingPresetId !== null}
              >
                {applyingPresetId === detailPreset.id ? (
                  <ActivityIndicator size="small" color={COLORS.navyDark} />
                ) : (
                  <Feather name="play" size={15} color={COLORS.navyDark} />
                )}
                <Text style={styles.useBtnText}>
                  {applyingPresetId === detailPreset.id ? "Applying Preset…" : "Use This Preset"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
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
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardLeft: { gap: 4, flex: 1 },
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

  detailOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  detailSheet: {
    backgroundColor: COLORS.navyMid, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 36, maxHeight: "85%",
    borderTopWidth: 1, borderColor: COLORS.navyBorder,
  },
  detailHeader: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    marginBottom: 10, gap: 12,
  },
  detailTitle: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold", flex: 1 },
  detailDesc: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 10, lineHeight: 18 },
  detailTagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  detailMeta: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 14 },
  detailSectionLabel: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.8, marginBottom: 8, textTransform: "uppercase" },
  detailConfig: { maxHeight: 180, marginBottom: 16 },
  detailConfigRow: {
    flexDirection: "row", alignItems: "flex-start", paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder, gap: 12,
  },
  detailConfigKey: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_500Medium", width: 100 },
  detailConfigVal: { color: COLORS.text, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, flexWrap: "wrap" },
  detailNoConfig: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular", fontStyle: "italic", marginBottom: 16 },
});
