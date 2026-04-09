import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput, KeyboardAvoidingView, Platform,
  ScrollView,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

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

interface MatchSuggestion {
  id: string;
  label: string;
  subtitle: string | null;
  confidenceScore: number;
  confidenceBand: "HIGH" | "MEDIUM" | "LOW";
}

interface SuggestData {
  suggestions: MatchSuggestion[];
}

function changeTypeLabel(t: string) {
  if (t === "CREATED") return "New";
  if (t === "UPDATED") return "Updated";
  if (t === "NOTE_ADDED") return "Note Added";
  return t;
}

function changeTypeColor(t: string) {
  if (t === "CREATED") return COLORS.emerald;
  if (t === "UPDATED") return COLORS.amber;
  return COLORS.cyan;
}

function ageLabel(hours: number): string {
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function bandColor(band: string) {
  if (band === "HIGH") return COLORS.emerald;
  if (band === "MEDIUM") return COLORS.amber;
  return COLORS.red;
}

export default function ContactPromotionsScreen() {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const qc = useQueryClient();

  const [selectedItem, setSelectedItem] = useState<PromotionItem | null>(null);
  const [modalMode, setModalMode] = useState<"detail" | "merge_search" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMaster, setSelectedMaster] = useState<MatchSuggestion | null>(null);
  const [statusFilter, setStatusFilter] = useState<"PENDING" | "ALL">("PENDING");

  const { data, isLoading, refetch, isRefetching } = useQuery<QueueData>({
    queryKey: ["adminContactPromotions", statusFilter],
    queryFn: () => adminFetch(`/admin/master-promotion/queue?entityType=CONTACT&status=${statusFilter}`),
    enabled: isAdminAuthenticated,
  });

  const { data: suggestions, isLoading: suggestLoading } = useQuery<SuggestData>({
    queryKey: ["adminContactSuggest", searchQuery, selectedItem?.sourceSnapshot?.organizationId],
    queryFn: () => {
      if (!searchQuery.trim()) return { suggestions: [] };
      const orgId = selectedItem?.sourceSnapshot?.organizationId
        ? `&organizationId=${encodeURIComponent(String(selectedItem.sourceSnapshot.organizationId))}`
        : "";
      return adminFetch(`/admin/master-promotion/suggest-match?entityType=CONTACT&name=${encodeURIComponent(searchQuery)}${orgId}`);
    },
    enabled: isAdminAuthenticated && modalMode === "merge_search" && searchQuery.trim().length > 0,
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, action, masterId }: { id: string; action: string; masterId?: string }) => {
      if (action === "approve-new") {
        return adminFetch(`/admin/master-promotion/${id}/approve-new`, { method: "POST", body: JSON.stringify({}) });
      }
      if (action === "approve-merge" || action === "approve-link") {
        return adminFetch(`/admin/master-promotion/${id}/${action}`, { method: "POST", body: JSON.stringify({ masterId }) });
      }
      return adminFetch(`/admin/master-promotion/${id}/reject`, { method: "POST", body: JSON.stringify({}) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminContactPromotions"] });
      qc.invalidateQueries({ queryKey: ["adminDiagnosticsSummary"] });
      setSelectedItem(null);
      setModalMode(null);
      setSelectedMaster(null);
      setSearchQuery("");
    },
  });

  const items = data?.items ?? [];

  const openDetail = (item: PromotionItem) => {
    setSelectedItem(item);
    setModalMode("detail");
    setSearchQuery(item.entityName);
    setSelectedMaster(null);
  };

  const closeModal = () => {
    setSelectedItem(null);
    setModalMode(null);
    setSelectedMaster(null);
    setSearchQuery("");
  };

  const isMissingOrgLink = (item: PromotionItem) => {
    if (item.sourceSnapshot?.organizationId == null) return true;
    return item.sourceSnapshot?.parentOrgLinked !== true;
  };

  const renderItem = ({ item }: { item: PromotionItem }) => (
    <TouchableOpacity style={styles.card} onPress={() => openDetail(item)} activeOpacity={0.8}>
      <View style={styles.cardLeft}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <View style={[styles.typeBadge, { backgroundColor: changeTypeColor(item.changeType) + "22" }]}>
            <Text style={[styles.typeBadgeText, { color: changeTypeColor(item.changeType) }]}>
              {changeTypeLabel(item.changeType)}
            </Text>
          </View>
          {isMissingOrgLink(item) && (
            <View style={[styles.typeBadge, { backgroundColor: COLORS.red + "22" }]}>
              <Text style={[styles.typeBadgeText, { color: COLORS.red }]}>ORG LINK NEEDED</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardName} numberOfLines={1}>{item.entityName}</Text>
        <Text style={styles.cardMeta}>{item.workspaceName} · {ageLabel(item.ageHours)}</Text>
        {item.sourceSnapshot?.title ? (
          <Text style={styles.cardSubMeta}>{String(item.sourceSnapshot.title)}</Text>
        ) : null}
      </View>
      <View style={styles.cardRight}>
        <Feather name="chevron-right" size={18} color={COLORS.textDim} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/(tabs)/diagnostics" as Href },
        { label: "Contact Validation Queue" },
      ]} />

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
              <Text style={styles.emptyText}>No pending contact promotions</Text>
            </View>
          )
        }
      />

      {selectedItem && modalMode === "detail" && (
        <Modal transparent animationType="slide" visible onRequestClose={closeModal}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle} numberOfLines={2}>{selectedItem.entityName}</Text>
                  <TouchableOpacity onPress={closeModal}>
                    <Feather name="x" size={20} color={COLORS.textDim} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
                  <View style={styles.snapshotSection}>
                    <Text style={styles.snapshotLabel}>Workspace</Text>
                    <Text style={styles.snapshotValue}>{selectedItem.workspaceName}</Text>
                    <Text style={styles.snapshotLabel}>Change Type</Text>
                    <Text style={[styles.snapshotValue, { color: changeTypeColor(selectedItem.changeType) }]}>
                      {changeTypeLabel(selectedItem.changeType)}
                    </Text>
                    {selectedItem.sourceSnapshot?.title && (
                      <>
                        <Text style={styles.snapshotLabel}>Title</Text>
                        <Text style={styles.snapshotValue}>{String(selectedItem.sourceSnapshot.title)}</Text>
                      </>
                    )}
                    {selectedItem.sourceSnapshot?.email && (
                      <>
                        <Text style={styles.snapshotLabel}>Email</Text>
                        <Text style={styles.snapshotValue}>{String(selectedItem.sourceSnapshot.email)}</Text>
                      </>
                    )}
                    {selectedItem.sourceSnapshot?.phone && (
                      <>
                        <Text style={styles.snapshotLabel}>Phone</Text>
                        <Text style={styles.snapshotValue}>{String(selectedItem.sourceSnapshot.phone)}</Text>
                      </>
                    )}
                  </View>

                  {isMissingOrgLink(selectedItem) && (
                    <View style={styles.warningBox}>
                      <Feather name="alert-triangle" size={14} color={COLORS.red} />
                      <Text style={styles.warningText}>
                        This contact's organization is not linked to a master record. Promote the org first, then come back to approve this contact.
                      </Text>
                    </View>
                  )}

                  <Text style={styles.actionSectionLabel}>Actions</Text>

                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      { borderColor: COLORS.emerald + "44", backgroundColor: COLORS.emerald + "11" },
                      isMissingOrgLink(selectedItem) && styles.actionBtnDisabled,
                    ]}
                    onPress={() => approveMutation.mutate({ id: selectedItem.id, action: "approve-new" })}
                    disabled={approveMutation.isPending || isMissingOrgLink(selectedItem)}
                  >
                    <Feather name="plus-circle" size={16} color={isMissingOrgLink(selectedItem) ? COLORS.textDim : COLORS.emerald} />
                    <Text style={[styles.actionBtnText, { color: isMissingOrgLink(selectedItem) ? COLORS.textDim : COLORS.emerald }]}>
                      Approve as New Master Contact
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: COLORS.amber + "44", backgroundColor: COLORS.amber + "11" }]}
                    onPress={() => setModalMode("merge_search")}
                    disabled={approveMutation.isPending}
                  >
                    <Feather name="git-merge" size={16} color={COLORS.amber} />
                    <Text style={[styles.actionBtnText, { color: COLORS.amber }]}>Merge into Existing Master Contact</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.actionBtn, { borderColor: COLORS.red + "44", backgroundColor: COLORS.red + "11" }]}
                    onPress={() => approveMutation.mutate({ id: selectedItem.id, action: "reject" })}
                    disabled={approveMutation.isPending}
                  >
                    <Feather name="x-circle" size={16} color={COLORS.red} />
                    <Text style={[styles.actionBtnText, { color: COLORS.red }]}>Reject</Text>
                  </TouchableOpacity>

                  {approveMutation.isPending && (
                    <View style={styles.actionLoading}><ActivityIndicator color={COLORS.amber} /></View>
                  )}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      )}

      {selectedItem && modalMode === "merge_search" && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setModalMode("detail")}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalWrap}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Find Master Contact</Text>
                  <TouchableOpacity onPress={() => setModalMode("detail")}>
                    <Feather name="arrow-left" size={20} color={COLORS.textDim} />
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={styles.searchInput}
                  placeholder="Search master contacts…"
                  placeholderTextColor={COLORS.textDim}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoFocus
                />

                {suggestLoading && <ActivityIndicator color={COLORS.amber} style={{ marginVertical: 16 }} />}

                {(suggestions?.suggestions ?? []).map(s => (
                  <TouchableOpacity
                    key={s.id}
                    style={[styles.suggestionRow, selectedMaster?.id === s.id && styles.suggestionRowSelected]}
                    onPress={() => setSelectedMaster(selectedMaster?.id === s.id ? null : s)}
                  >
                    <View style={styles.suggestionLeft}>
                      <Text style={styles.suggestionName}>{s.label}</Text>
                      {s.subtitle ? <Text style={styles.suggestionSub}>{s.subtitle}</Text> : null}
                    </View>
                    <View style={[styles.confBadge, { backgroundColor: bandColor(s.confidenceBand) + "22" }]}>
                      <Text style={[styles.confBadgeText, { color: bandColor(s.confidenceBand) }]}>
                        {Math.round(s.confidenceScore * 100)}%
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}

                {selectedMaster && (
                  <View style={styles.mergeActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: COLORS.amber + "44", backgroundColor: COLORS.amber + "11" }]}
                      onPress={() => approveMutation.mutate({ id: selectedItem.id, action: "approve-merge", masterId: selectedMaster.id })}
                      disabled={approveMutation.isPending}
                    >
                      <Feather name="git-merge" size={16} color={COLORS.amber} />
                      <Text style={[styles.actionBtnText, { color: COLORS.amber }]}>Merge + Link</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, { borderColor: COLORS.cyan + "44", backgroundColor: COLORS.cyan + "11" }]}
                      onPress={() => approveMutation.mutate({ id: selectedItem.id, action: "approve-link", masterId: selectedMaster.id })}
                      disabled={approveMutation.isPending}
                    >
                      <Feather name="link" size={16} color={COLORS.cyan} />
                      <Text style={[styles.actionBtnText, { color: COLORS.cyan }]}>Link Only</Text>
                    </TouchableOpacity>
                    {approveMutation.isPending && <ActivityIndicator color={COLORS.amber} />}
                  </View>
                )}
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
    borderColor: COLORS.amber + "22", padding: 14, marginBottom: 10,
  },
  cardLeft: { flex: 1, gap: 4 },
  cardRight: { paddingLeft: 8 },
  typeBadge: { alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  typeBadgeText: { fontSize: 10, fontFamily: "Inter_700Bold", textTransform: "uppercase", letterSpacing: 0.6 },
  cardName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardMeta: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  cardSubMeta: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },
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

  snapshotSection: { marginBottom: 16, gap: 4 },
  snapshotLabel: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8 },
  snapshotValue: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_400Regular" },

  warningBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.red + "44",
    backgroundColor: COLORS.red + "11", marginBottom: 16,
  },
  warningText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  actionSectionLabel: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  actionLoading: { alignItems: "center", marginTop: 8 },

  searchInput: {
    backgroundColor: COLORS.navyDark, color: COLORS.text, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.textDim + "33", paddingHorizontal: 14,
    paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 12,
  },
  suggestionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.textDim + "22",
    marginBottom: 6, backgroundColor: COLORS.navyDark,
  },
  suggestionRowSelected: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "11" },
  suggestionLeft: { flex: 1 },
  suggestionName: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  suggestionSub: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  confBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  confBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  mergeActions: { marginTop: 12, gap: 6 },
});
