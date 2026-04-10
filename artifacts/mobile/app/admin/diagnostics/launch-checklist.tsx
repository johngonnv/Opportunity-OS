import React from "react";
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
  clientType: string | null;
  status: ChecklistStatus;
  completedAt: string | null;
  completedByUserId: string | null;
  completedByUserEmail: string | null;
  sortOrder: number;
  createdAt: string;
}

interface ChecklistData {
  items: ChecklistItem[];
  workspace?: {
    id: string;
    name: string;
    clientType: string | null;
  };
}

const CLIENT_TYPE_COLORS: Record<string, string> = {
  SINGLE_USER: COLORS.textDim,
  SMALL_TEAM: COLORS.cyan,
  ENTERPRISE: COLORS.purple,
};

function clientTypeLabel(ct: string | null | undefined): string | null {
  if (!ct) return null;
  return ct.replace(/_/g, " ");
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
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function shortUser(userId: string | null, email: string | null): string {
  if (email) return email;
  if (!userId) return "unknown";
  return userId.length > 8 ? userId.slice(0, 8) + "…" : userId;
}

interface WorkspaceRow {
  id: string;
  name: string;
  clientType: string | null;
}

export default function LaunchChecklistScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const router = useRouter();

  const { data: workspacesData, isLoading: workspacesLoading } = useQuery<{ workspaces: WorkspaceRow[] }>({
    queryKey: ["adminWorkspacesList"],
    queryFn: () => adminFetch("/admin/workspaces?limit=100"),
    enabled: isAdminAuthenticated && !workspaceId,
    staleTime: 30_000,
  });

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
  const workspaceClientType = data?.workspace?.clientType ?? null;
  const completed = items.filter(i => i.status === "COMPLETED").length;
  const skipped = items.filter(i => i.status === "SKIPPED").length;
  const total = items.length;
  const progress = total > 0 ? (completed + skipped) / total : 0;
  const pct = Math.round(progress * 100);

  const renderItem = ({ item }: { item: ChecklistItem }) => {
    const sc = itemStatusColor(item.status);
    const si = itemStatusIcon(item.status);
    const isPending = item.status === "PENDING";
    const itemClientType = item.clientType ?? workspaceClientType;
    const ctColor = CLIENT_TYPE_COLORS[itemClientType ?? ""] ?? COLORS.textDim;

    return (
      <View style={[styles.card, { borderColor: sc + "33" }]}>
        <View style={styles.cardLeft}>
          <Feather name={si} size={20} color={sc} />
        </View>
        <View style={styles.cardMiddle}>
          <View style={styles.cardTopRow}>
            <Text style={[styles.cardLabel, !isPending && { color: COLORS.textMuted }]} numberOfLines={1}>
              {item.label ?? item.itemKey.replace(/_/g, " ")}
            </Text>
            {itemClientType && (
              <View style={[styles.clientTypeBadge, { borderColor: ctColor + "55", backgroundColor: ctColor + "11" }]}>
                <Text style={[styles.clientTypeBadgeText, { color: ctColor }]}>
                  {clientTypeLabel(itemClientType)}
                </Text>
              </View>
            )}
          </View>
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          {item.status === "COMPLETED" && item.completedAt && (
            <View style={styles.completedMeta}>
              <Feather name="user-check" size={10} color={COLORS.emerald} />
              <Text style={styles.cardMeta}>
                Completed {fmtDate(item.completedAt)}
                {(item.completedByUserId ?? item.completedByUserEmail) && (
                  <Text style={styles.completedByText}>
                    {" "}by {shortUser(item.completedByUserId, item.completedByUserEmail)}
                  </Text>
                )}
              </Text>
            </View>
          )}
          {item.status === "SKIPPED" && item.completedAt && (
            <Text style={styles.cardMeta}>Skipped {fmtDate(item.completedAt)}</Text>
          )}
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
    const workspaces = workspacesData?.workspaces ?? [];
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[
          { label: "Diagnostics", href: "/admin/(tabs)/diagnostics" as Href },
          { label: "Launch Checklist" },
        ]} />
        <Text style={styles.pickerTitle}>Select a workspace to view its launch checklist:</Text>
        {workspacesLoading ? (
          <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>
        ) : workspaces.length === 0 ? (
          <View style={styles.center}>
            <Feather name="inbox" size={28} color={COLORS.textDim} />
            <Text style={styles.stateText}>No workspaces found.</Text>
          </View>
        ) : (
          <FlatList
            data={workspaces}
            keyExtractor={w => w.id}
            contentContainerStyle={styles.pickerList}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.pickerRow}
                onPress={() => router.push(`/admin/diagnostics/launch-checklist?workspaceId=${item.id}` as Href)}
                activeOpacity={0.85}
              >
                <View style={styles.pickerRowLeft}>
                  <Text style={styles.pickerRowName}>{item.name}</Text>
                  {item.clientType && (
                    <Text style={[styles.pickerRowType, { color: CLIENT_TYPE_COLORS[item.clientType] ?? COLORS.textDim }]}>
                      {item.clientType.replace(/_/g, " ")}
                    </Text>
                  )}
                </View>
                <Feather name="chevron-right" size={16} color={COLORS.textDim} />
              </TouchableOpacity>
            )}
          />
        )}
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
            <View style={styles.progressLeft}>
              <Text style={styles.progressLabel}>
                {completed} completed · {skipped} skipped · {total - completed - skipped} pending
              </Text>
              {workspaceClientType && (
                <View style={[styles.clientTypeBadge, {
                  borderColor: (CLIENT_TYPE_COLORS[workspaceClientType] ?? COLORS.textDim) + "55",
                  backgroundColor: (CLIENT_TYPE_COLORS[workspaceClientType] ?? COLORS.textDim) + "11",
                }]}>
                  <Text style={[styles.clientTypeBadgeText, { color: CLIENT_TYPE_COLORS[workspaceClientType] ?? COLORS.textDim }]}>
                    {clientTypeLabel(workspaceClientType)}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.progressPct}>{pct}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${pct}%` }]} />
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

  pickerTitle: {
    color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_500Medium",
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  pickerList: { paddingHorizontal: 16, paddingBottom: 40 },
  pickerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  pickerRowLeft: { gap: 2, flex: 1, marginRight: 8 },
  pickerRowName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  pickerRowType: { fontSize: 11, fontFamily: "Inter_500Medium" },

  progressCard: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 12, gap: 8,
  },
  progressRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  progressLeft: { gap: 4, flex: 1, marginRight: 8 },
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
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  cardLabel: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_600SemiBold", flexShrink: 1 },
  cardDesc: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  cardMeta: { color: COLORS.textDim, fontSize: 10, fontFamily: "Inter_400Regular" },
  completedMeta: { flexDirection: "row", alignItems: "center", gap: 4 },
  completedByText: { color: COLORS.emerald, fontFamily: "Inter_500Medium" },

  clientTypeBadge: {
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1,
  },
  clientTypeBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.5 },

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
