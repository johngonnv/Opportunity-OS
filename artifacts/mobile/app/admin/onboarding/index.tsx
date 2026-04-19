import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

type SessionFilter =
  | "ALL"
  | "INTAKE"
  | "AWAITING_RECOMMENDATION"
  | "NORMALIZING"
  | "REVIEW"
  | "LOCKED"
  | "PROVISIONING"
  | "PROVISIONED"
  | "FAILED"
  | "ARCHIVED";

interface SessionItem {
  id: string;
  status: string;
  clientType: string;
  clientName: string;
  verticalLabel: string | null;
  createdWorkspaceId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  blockingCount: number;
  isStaleDraft: boolean;
}

interface SessionsData {
  items: SessionItem[];
  total: number;
}

const STATUS_FILTERS: SessionFilter[] = [
  "ALL", "INTAKE", "AWAITING_RECOMMENDATION", "NORMALIZING",
  "REVIEW", "LOCKED", "PROVISIONING", "PROVISIONED", "FAILED", "ARCHIVED",
];

function statusColor(s: string): string {
  switch (s) {
    case "INTAKE": return COLORS.textDim;
    case "AWAITING_RECOMMENDATION":
    case "NORMALIZING": return COLORS.cyan;
    case "REVIEW": return COLORS.amber;
    case "LOCKED": return COLORS.amber;
    case "PROVISIONING": return COLORS.blue;
    case "PROVISIONED": return COLORS.emerald;
    case "FAILED": return COLORS.red;
    default: return COLORS.textDim;
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "INTAKE": return "Intake";
    case "AWAITING_RECOMMENDATION": return "Awaiting AI";
    case "NORMALIZING": return "Normalizing";
    case "REVIEW": return "Review";
    case "LOCKED": return "Locked";
    case "PROVISIONING": return "Provisioning";
    case "PROVISIONED": return "Provisioned";
    case "FAILED": return "Failed";
    default: return s;
  }
}

function filterLabel(f: SessionFilter): string {
  if (f === "ALL") return "All";
  if (f === "ARCHIVED") return "Archived";
  if (f === "NORMALIZING") return "Normalizing";
  if (f === "LOCKED") return "Locked";
  return statusLabel(f);
}

function ageLabel(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const h = Math.floor(ms / 3600000);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function OnboardingSessionsScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const qc = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<SessionFilter>("ALL");
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const [applyingId, setApplyingId] = useState<string | null>(null);
  const lockMutation = useMutation({
    mutationFn: (sessionId: string) =>
      adminFetch(`/admin/onboarding/sessions/${sessionId}/lock`, {
        method: "POST", body: JSON.stringify({}),
      }),
    onSuccess: (_d, sessionId) => {
      qc.invalidateQueries({ queryKey: ["adminOnboardingSessions"] });
      router.push(`/admin/onboarding/${sessionId}/provision` as Href);
    },
    onSettled: () => setApplyingId(null),
    onError: (e: unknown) =>
      Alert.alert("Could not apply", (e as { message?: string })?.message ?? String(e)),
  });
  function confirmApply(sessionId: string, name: string) {
    Alert.alert(
      "Apply & Provision?",
      `All required items for "${name}" are resolved. Lock the review and start provisioning now?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Apply & Provision",
          style: "destructive",
          onPress: () => { setApplyingId(sessionId); lockMutation.mutate(sessionId); },
        },
      ]
    );
  }

  const archiveMutation = useMutation({
    mutationFn: (sessionId: string) =>
      adminFetch(`/admin/onboarding/sessions/${sessionId}/archive`, {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
    onSettled: () => {
      setArchivingId(null);
      qc.invalidateQueries({ queryKey: ["adminOnboardingSessions"] });
    },
    onError: (e: unknown) => {
      Alert.alert("Could not archive", (e as { message?: string })?.message ?? String(e));
    },
  });

  function confirmArchiveStale(sessionId: string, name: string) {
    Alert.alert(
      "Archive stale draft?",
      `"${name}" hasn't moved past intake. Archiving hides it from the active list.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive",
          style: "destructive",
          onPress: () => {
            setArchivingId(sessionId);
            archiveMutation.mutate(sessionId);
          },
        },
      ]
    );
  }

  const isArchivedTab = activeFilter === "ARCHIVED";

  const queryUrl = isArchivedTab
    ? `/admin/onboarding/sessions?archived=true&limit=50`
    : activeFilter === "ALL"
      ? `/admin/onboarding/sessions?archived=false&limit=50`
      : `/admin/onboarding/sessions?status=${activeFilter}&archived=false&limit=50`;

  const { data, isLoading, refetch, isRefetching } = useQuery<SessionsData>({
    queryKey: ["adminOnboardingSessions", activeFilter],
    queryFn: () => adminFetch(queryUrl),
    enabled: isAdminAuthenticated,
  });

  const allItems = data?.items ?? [];
  const staleDrafts = !isArchivedTab && (activeFilter === "ALL" || activeFilter === "INTAKE")
    ? allItems.filter(i => i.isStaleDraft)
    : [];
  const items = !isArchivedTab && (activeFilter === "ALL" || activeFilter === "INTAKE")
    ? allItems.filter(i => !i.isStaleDraft)
    : allItems;

  const [staleExpanded, setStaleExpanded] = useState(false);

  const renderItem = ({ item }: { item: SessionItem }) => {
    const color = isArchivedTab ? COLORS.textDim : statusColor(item.status);
    const isReady = !isArchivedTab && item.status === "REVIEW" && item.blockingCount === 0;
    return (
      <TouchableOpacity
        style={[
          styles.card,
          isArchivedTab && styles.cardArchived,
          isReady && styles.cardReady,
        ]}
        onPress={() => router.push(`/admin/onboarding/${item.id}` as Href)}
        activeOpacity={0.8}
      >
        <View style={styles.cardLeft}>
          <View style={styles.cardTopRow}>
            {isArchivedTab ? (
              <View style={[styles.statusBadge, { backgroundColor: COLORS.textDim + "22" }]}>
                <Feather name="archive" size={9} color={COLORS.textDim} style={{ marginRight: 3 }} />
                <Text style={[styles.statusBadgeText, { color: COLORS.textDim }]}>ARCHIVED</Text>
              </View>
            ) : (
              <View style={[styles.statusBadge, { backgroundColor: color + "22" }]}>
                <Text style={[styles.statusBadgeText, { color }]}>{statusLabel(item.status)}</Text>
              </View>
            )}
            {isReady && (
              <View style={styles.readyBadge}>
                <Feather name="zap" size={9} color={COLORS.emerald} style={{ marginRight: 3 }} />
                <Text style={styles.readyBadgeText}>READY TO PROVISION</Text>
              </View>
            )}
            {!isArchivedTab && item.status === "REVIEW" && item.blockingCount > 0 && (
              <View style={styles.blockingBadge}>
                <Text style={styles.blockingBadgeText}>{item.blockingCount} BLOCKING</Text>
              </View>
            )}
            {item.verticalLabel && (
              <View style={styles.verticalBadge}>
                <Text style={styles.verticalBadgeText} numberOfLines={1}>{item.verticalLabel}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.cardName, isArchivedTab && { color: COLORS.textMuted }]} numberOfLines={1}>
            {item.clientName}
          </Text>
          <Text style={styles.cardMeta}>{item.clientType.replace(/_/g, " ")} · {ageLabel(item.updatedAt)}</Text>
        </View>
        {isReady ? (
          <TouchableOpacity
            style={styles.cardApplyBtn}
            onPress={(e) => { e.stopPropagation?.(); confirmApply(item.id, item.clientName); }}
            disabled={applyingId === item.id && lockMutation.isPending}
            activeOpacity={0.8}
          >
            {applyingId === item.id && lockMutation.isPending ? (
              <ActivityIndicator size="small" color={COLORS.navyDark} />
            ) : (
              <>
                <Feather name="zap" size={12} color={COLORS.navyDark} />
                <Text style={styles.cardApplyBtnText}>Apply</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <Feather name="chevron-right" size={18} color={COLORS.textDim} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/(tabs)/diagnostics" as Href },
        { label: "Client Onboarding" },
      ]} />

      <View style={styles.toolbar}>
        <FlatList
          data={STATUS_FILTERS}
          keyExtractor={s => s}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          renderItem={({ item: s }) => (
            <TouchableOpacity
              style={[
                styles.filterChip,
                activeFilter === s && styles.filterChipActive,
                s === "ARCHIVED" && activeFilter === s && styles.filterChipArchived,
              ]}
              onPress={() => setActiveFilter(s)}
            >
              {s === "ARCHIVED" && (
                <Feather
                  name="archive"
                  size={10}
                  color={activeFilter === s ? COLORS.textDim : COLORS.textDim + "99"}
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[
                styles.filterChipText,
                activeFilter === s && styles.filterChipTextActive,
                s === "ARCHIVED" && activeFilter === s && { color: COLORS.textDim },
              ]}>
                {filterLabel(s)}
              </Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push("/admin/onboarding/new" as Href)}
        >
          <Feather name="plus" size={16} color={COLORS.navyDark} />
          <Text style={styles.newBtnText}>New Client</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.totalText}>
        {data?.total ?? 0} {isArchivedTab ? "archived" : ""} sessions
      </Text>

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
        ListHeaderComponent={
          staleDrafts.length > 0 ? (
            <View style={styles.staleSection}>
              <TouchableOpacity
                style={styles.staleHeader}
                onPress={() => setStaleExpanded(e => !e)}
                activeOpacity={0.7}
              >
                <Feather name="clock" size={13} color={COLORS.amber} />
                <Text style={styles.staleHeaderTitle}>
                  {staleDrafts.length} stale draft{staleDrafts.length > 1 ? "s" : ""} (no AI run, &gt; 7 days)
                </Text>
                <Feather
                  name={staleExpanded ? "chevron-down" : "chevron-right"}
                  size={14}
                  color={COLORS.textDim}
                />
              </TouchableOpacity>
              {staleExpanded && staleDrafts.map(d => {
                const isArchiving = archivingId === d.id && archiveMutation.isPending;
                return (
                  <View key={d.id} style={styles.staleRow}>
                    <View style={styles.staleDot} />
                    <TouchableOpacity
                      style={styles.staleRowMain}
                      onPress={() => router.push(`/admin/onboarding/${d.id}` as Href)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.staleRowName} numberOfLines={1}>{d.clientName}</Text>
                      <Text style={styles.staleRowAge}>{ageLabel(d.createdAt)}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.staleArchiveBtn}
                      onPress={() => confirmArchiveStale(d.id, d.clientName)}
                      disabled={isArchiving}
                      activeOpacity={0.7}
                    >
                      {isArchiving ? (
                        <ActivityIndicator size="small" color={COLORS.amber} />
                      ) : (
                        <>
                          <Feather name="archive" size={11} color={COLORS.amber} />
                          <Text style={styles.staleArchiveBtnText}>Archive</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          ) : null
        }
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}><ActivityIndicator color={COLORS.amber} /></View>
          ) : (
            <View style={styles.empty}>
              <Feather name={isArchivedTab ? "archive" : "users"} size={32} color={COLORS.textDim} />
              <Text style={styles.emptyText}>
                {isArchivedTab ? "No archived sessions" : "No onboarding sessions"}
              </Text>
              {!isArchivedTab && (
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => router.push("/admin/onboarding/new" as Href)}
                >
                  <Text style={styles.emptyBtnText}>Start a new session</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  toolbar: {
    flexDirection: "row", alignItems: "center",
    paddingRight: 16, paddingTop: 10,
  },
  filterRow: { paddingHorizontal: 16, gap: 8, flexGrow: 1 },
  filterChip: {
    borderRadius: 16, borderWidth: 1,
    borderColor: COLORS.textDim + "44",
    paddingHorizontal: 12, paddingVertical: 4,
    flexDirection: "row", alignItems: "center",
  },
  filterChipActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "22" },
  filterChipArchived: { borderColor: COLORS.textDim + "66", backgroundColor: COLORS.textDim + "11" },
  filterChipText: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterChipTextActive: { color: COLORS.amber },
  newBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.amber, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  newBtnText: { color: COLORS.navyDark, fontSize: 13, fontFamily: "Inter_700Bold" },
  totalText: {
    color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular",
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4,
  },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.amber + "22", padding: 14, marginBottom: 10,
  },
  cardArchived: {
    borderColor: COLORS.navyBorder, opacity: 0.7,
  },
  cardReady: {
    borderColor: COLORS.emerald + "88", backgroundColor: COLORS.emerald + "0A",
  },
  readyBadge: {
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: COLORS.emerald + "22", borderWidth: 1, borderColor: COLORS.emerald + "55",
    flexDirection: "row", alignItems: "center",
  },
  readyBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: COLORS.emerald, letterSpacing: 0.5 },
  blockingBadge: {
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: COLORS.red + "22", borderWidth: 1, borderColor: COLORS.red + "55",
  },
  blockingBadgeText: { fontSize: 9, fontFamily: "Inter_700Bold", color: COLORS.red, letterSpacing: 0.5 },
  cardApplyBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: COLORS.emerald, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, minWidth: 78,
    justifyContent: "center",
  },
  cardApplyBtnText: { color: COLORS.navyDark, fontSize: 13, fontFamily: "Inter_700Bold" },
  staleSection: {
    backgroundColor: COLORS.amber + "0A", borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.amber + "33",
    marginBottom: 10, overflow: "hidden",
  },
  staleHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  staleHeaderTitle: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_600SemiBold", flex: 1 },
  staleRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderTopWidth: 1, borderTopColor: COLORS.amber + "22",
  },
  staleRowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  staleDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: COLORS.amber },
  staleRowName: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  staleRowAge: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  staleArchiveBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.amber + "66",
    minWidth: 76, justifyContent: "center",
  },
  staleArchiveBtnText: { color: COLORS.amber, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  cardLeft: { flex: 1, gap: 4 },
  cardTopRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  statusBadge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
    flexDirection: "row", alignItems: "center",
  },
  statusBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  verticalBadge: {
    borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2,
    backgroundColor: COLORS.amber + "11", borderWidth: 1, borderColor: COLORS.amber + "33",
    maxWidth: 160,
  },
  verticalBadgeText: { fontSize: 10, fontFamily: "Inter_500Medium", color: COLORS.amber },
  cardName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardMeta: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
  emptyBtn: {
    borderRadius: 20, borderWidth: 1, borderColor: COLORS.amber,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  emptyBtnText: { color: COLORS.amber, fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
