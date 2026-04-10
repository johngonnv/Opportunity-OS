import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

type ChecklistStatus = "PENDING" | "COMPLETED" | "SKIPPED";

interface ChecklistItem {
  id: string;
  workspaceId: string;
  itemKey: string;
  label: string | null;
  description: string | null;
  status: ChecklistStatus;
  completedAt: string | null;
  completedByUserId: string | null;
  sortOrder: number;
  createdAt: string;
}

interface ChecklistData {
  items: ChecklistItem[];
}

function itemStatusColor(s: ChecklistStatus): string {
  if (s === "COMPLETED") return COLORS.emerald;
  if (s === "SKIPPED") return COLORS.textDim;
  return COLORS.amber;
}

function itemStatusIcon(s: ChecklistStatus): React.ComponentProps<typeof Feather>["name"] {
  if (s === "COMPLETED") return "check-circle";
  if (s === "SKIPPED") return "minus-circle";
  return "circle";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LaunchChecklistScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, refetch, isRefetching } = useQuery<ChecklistData>({
    queryKey: ["adminLaunchChecklist", workspaceId],
    queryFn: () => adminFetch(`/admin/workspaces/${workspaceId}/checklist`),
    enabled: isAdminAuthenticated && !!workspaceId,
  });

  const updateMutation = useMutation({
    mutationFn: ({ key, status }: { key: string; status: ChecklistStatus }) =>
      adminFetch(`/admin/workspaces/${workspaceId}/checklist/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminLaunchChecklist", workspaceId] });
    },
  });

  const items = data?.items ?? [];
  const completed = items.filter(i => i.status === "COMPLETED").length;
  const skipped = items.filter(i => i.status === "SKIPPED").length;
  const total = items.length;
  const progress = total > 0 ? (completed + skipped) / total : 0;

  const renderItem = ({ item }: { item: ChecklistItem }) => {
    const sc = itemStatusColor(item.status);
    const si = itemStatusIcon(item.status);
    const isPending = item.status === "PENDING";

    return (
      <View style={[styles.card, { borderColor: sc + "33" }]}>
        <View style={styles.cardLeft}>
          <Feather name={si} size={20} color={sc} />
        </View>
        <View style={styles.cardMiddle}>
          <Text style={[styles.cardLabel, !isPending && { color: COLORS.textMuted }]}>
            {item.label ?? item.itemKey.replace(/_/g, " ")}
          </Text>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          {item.completedAt ? (
            <Text style={styles.cardMeta}>Completed {fmtDate(item.completedAt)}</Text>
          ) : null}
        </View>
        {isPending && (
          <View style={styles.actionCol}>
            <TouchableOpacity
              style={styles.completeBtn}
              onPress={() => updateMutation.mutate({ key: item.itemKey, status: "COMPLETED" })}
              disabled={updateMutation.isPending}
            >
              <Feather name="check" size={13} color={COLORS.navyDark} />
              <Text style={styles.completeBtnText}>Done</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.skipBtn}
              onPress={() => updateMutation.mutate({ key: item.itemKey, status: "SKIPPED" })}
              disabled={updateMutation.isPending}
            >
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
          </View>
        )}
        {!isPending && (
          <TouchableOpacity
            style={styles.undoBtn}
            onPress={() => updateMutation.mutate({ key: item.itemKey, status: "PENDING" })}
            disabled={updateMutation.isPending}
          >
            <Feather name="rotate-ccw" size={13} color={COLORS.textDim} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (!workspaceId) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[
          { label: "Diagnostics", href: "/admin/(tabs)/diagnostics" as Href },
          { label: "Launch Checklist" },
        ]} />
        <View style={styles.center}>
          <Feather name="alert-circle" size={28} color={COLORS.red} />
          <Text style={styles.stateText}>No workspace ID provided.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/(tabs)/diagnostics" as Href },
        { label: "Launch Checklist" },
      ]} />

      {total > 0 && (
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>
              {completed} completed · {skipped} skipped · {total - completed - skipped} pending
            </Text>
            <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
          </View>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={i => i.id}
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
            <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>
          ) : (
            <View style={styles.center}>
              <Feather name="check-square" size={32} color={COLORS.textDim} />
              <Text style={styles.stateText}>No checklist items found for this workspace.</Text>
              <Text style={styles.stateHint}>
                Checklist items are created automatically during provisioning.
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
  center: { alignItems: "center", paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  stateText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  stateHint: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },

  progressCard: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, gap: 8,
  },
  progressRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressLabel: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  progressPct: { color: COLORS.emerald, fontSize: 13, fontFamily: "Inter_700Bold" },
  progressBar: { height: 6, backgroundColor: COLORS.navyDark, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: COLORS.emerald, borderRadius: 3 },

  list: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 40 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    padding: 14, marginBottom: 10, gap: 12,
  },
  cardLeft: { width: 24, alignItems: "center" },
  cardMiddle: { flex: 1, gap: 3 },
  cardLabel: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  cardDesc: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  cardMeta: { color: COLORS.textDim, fontSize: 10, fontFamily: "Inter_400Regular" },

  actionCol: { gap: 5 },
  completeBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.emerald, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  completeBtnText: { color: COLORS.navyDark, fontSize: 11, fontFamily: "Inter_700Bold" },
  skipBtn: {
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.textDim + "55",
    paddingHorizontal: 10, paddingVertical: 6, alignItems: "center",
  },
  skipBtnText: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_500Medium" },
  undoBtn: {
    padding: 8, borderRadius: 8, borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
});
