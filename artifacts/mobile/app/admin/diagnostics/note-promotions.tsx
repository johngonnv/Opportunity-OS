import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, KeyboardAvoidingView, Platform,
  ScrollView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";

interface PromotionItem {
  id: string;
  entityType: string;
  entityId: string;
  workspaceId: string;
  workspaceName: string;
  changeType: string;
  status: string;
  resolvedMasterId: string | null;
  sourceSnapshot: Record<string, unknown>;
  createdAt: string;
  ageHours: number;
  entityName: string;
}

interface QueueData {
  items: PromotionItem[];
  total: number;
  page: number;
  limit: number;
}

function ageLabel(hours: number): string {
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function parentTypeLabel(snapshot: Record<string, unknown>): string {
  if (snapshot.organizationId) return "Org note";
  if (snapshot.contactId) return "Contact note";
  return "Note";
}

function parentTypeColor(snapshot: Record<string, unknown>): string {
  if (snapshot.organizationId) return COLORS.amber;
  if (snapshot.contactId) return COLORS.cyan;
  return COLORS.textDim;
}

export default function NotePromotionsScreen() {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const qc = useQueryClient();

  const [selectedItem, setSelectedItem] = useState<PromotionItem | null>(null);
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "ALL">("PENDING");

  const { data, isLoading, refetch, isRefetching } = useQuery<QueueData>({
    queryKey: ["adminNotePromotions", statusFilter],
    queryFn: () => adminFetch(`/admin/master-promotion/queue?entityType=NOTE&status=${statusFilter}`),
    enabled: isAdminAuthenticated,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => {
      if (action === "reject") {
        return adminFetch(`/admin/master-promotion/${id}/reject`, { method: "POST", body: JSON.stringify({}) });
      }
      return adminFetch(`/admin/master-promotion/${id}/reject`, { method: "POST", body: JSON.stringify({}) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminNotePromotions"] });
      qc.invalidateQueries({ queryKey: ["adminDiagnosticsSummary"] });
      setSelectedItem(null);
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) =>
      adminFetch(`/admin/master-promotion/${id}/reject`, { method: "POST", body: JSON.stringify({ reason: "Reviewed — no action needed" }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminNotePromotions"] });
      qc.invalidateQueries({ queryKey: ["adminDiagnosticsSummary"] });
      setSelectedItem(null);
    },
  });

  const items = data?.items ?? [];

  const renderItem = ({ item }: { item: PromotionItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelectedItem(item)} activeOpacity={0.8}>
      <View style={styles.cardLeft}>
        <View style={[styles.typeBadge, { backgroundColor: parentTypeColor(item.sourceSnapshot) + "22" }]}>
          <Text style={[styles.typeBadgeText, { color: parentTypeColor(item.sourceSnapshot) }]}>
            {parentTypeLabel(item.sourceSnapshot)}
          </Text>
        </View>
        <Text style={styles.cardName} numberOfLines={2}>{item.entityName}</Text>
        <Text style={styles.cardMeta}>{item.workspaceName} · {ageLabel(item.ageHours)}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={COLORS.textDim} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/(tabs)/diagnostics" as any },
        { label: "Note Activity Queue" },
      ]} />

      <View style={styles.infoBox}>
        <Feather name="info" size={13} color={COLORS.textDim} />
        <Text style={styles.infoText}>
          Notes are queued to signal activity on their parent org or contact. Review then dismiss — they cannot be directly promoted to master records.
        </Text>
      </View>

      <View style={styles.filterRow}>
        {(["PENDING", "ALL"] as const).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.totalText}>{data?.total ?? 0} items</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={i => i.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.amber} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}><ActivityIndicator color={COLORS.amber} /></View>
          ) : (
            <View style={styles.empty}>
              <Feather name="check-circle" size={32} color={COLORS.emerald} />
              <Text style={styles.emptyText}>No pending note activity</Text>
            </View>
          )
        }
      />

      {selectedItem && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setSelectedItem(null)}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Note Detail</Text>
                  <TouchableOpacity onPress={() => setSelectedItem(null)}>
                    <Feather name="x" size={20} color={COLORS.textDim} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <View style={styles.noteContentBox}>
                    <Text style={styles.noteContent}>{selectedItem.entityName}</Text>
                  </View>

                  <View style={styles.snapshotSection}>
                    <Text style={styles.snapshotLabel}>Workspace</Text>
                    <Text style={styles.snapshotValue}>{selectedItem.workspaceName}</Text>

                    <Text style={styles.snapshotLabel}>Parent Type</Text>
                    <Text style={[styles.snapshotValue, { color: parentTypeColor(selectedItem.sourceSnapshot) }]}>
                      {parentTypeLabel(selectedItem.sourceSnapshot)}
                    </Text>

                    {selectedItem.sourceSnapshot?.organizationId && (
                      <>
                        <Text style={styles.snapshotLabel}>Org ID</Text>
                        <Text style={styles.snapshotValue}>{String(selectedItem.sourceSnapshot.organizationId)}</Text>
                      </>
                    )}
                    {selectedItem.sourceSnapshot?.contactId && (
                      <>
                        <Text style={styles.snapshotLabel}>Contact ID</Text>
                        <Text style={styles.snapshotValue}>{String(selectedItem.sourceSnapshot.contactId)}</Text>
                      </>
                    )}
                  </View>

                  <Text style={styles.actionSectionLabel}>Actions</Text>

                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: COLORS.emerald + "44", backgroundColor: COLORS.emerald + "11" }]}
                    onPress={() => dismissMutation.mutate(selectedItem.id)}
                    disabled={dismissMutation.isPending || approveMutation.isPending}
                  >
                    <Feather name="check" size={16} color={COLORS.emerald} />
                    <Text style={[styles.actionBtnText, { color: COLORS.emerald }]}>Dismiss (Reviewed)</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: COLORS.red + "44", backgroundColor: COLORS.red + "11" }]}
                    onPress={() => approveMutation.mutate({ id: selectedItem.id, action: "reject" })}
                    disabled={dismissMutation.isPending || approveMutation.isPending}
                  >
                    <Feather name="x-circle" size={16} color={COLORS.red} />
                    <Text style={[styles.actionBtnText, { color: COLORS.red }]}>Reject / Flag</Text>
                  </TouchableOpacity>

                  {(dismissMutation.isPending || approveMutation.isPending) && (
                    <View style={styles.actionLoading}><ActivityIndicator color={COLORS.amber} /></View>
                  )}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  infoBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 16, marginTop: 10, padding: 10,
    borderRadius: 8, backgroundColor: COLORS.navyCard, borderWidth: 1, borderColor: COLORS.textDim + "22",
  },
  infoText: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: { borderRadius: 16, borderWidth: 1, borderColor: COLORS.textDim + "44", paddingHorizontal: 12, paddingVertical: 4 },
  filterChipActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "22" },
  filterChipText: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterChipTextActive: { color: COLORS.amber },
  totalText: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginLeft: "auto" },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  card: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.cyan + "22", padding: 14, marginBottom: 10,
  },
  cardLeft: { flex: 1, gap: 4 },
  typeBadge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  cardName: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  cardMeta: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },

  modalOverlay: { flex: 1, backgroundColor: "#000000aa", justifyContent: "flex-end" },
  modalWrap: { width: "100%" },
  modalSheet: {
    backgroundColor: COLORS.navyCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, maxHeight: "85%",
  },
  modalHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 },
  modalTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_700Bold", flex: 1, marginRight: 12 },
  modalScroll: { maxHeight: 500 },

  noteContentBox: {
    backgroundColor: COLORS.navyDark, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.textDim + "22", padding: 14, marginBottom: 16,
  },
  noteContent: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },

  snapshotSection: { marginBottom: 16, gap: 4 },
  snapshotLabel: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8 },
  snapshotValue: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_400Regular" },

  actionSectionLabel: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actionLoading: { alignItems: "center", marginTop: 8 },
});
