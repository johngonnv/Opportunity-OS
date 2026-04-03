import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView, Alert,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";

interface AiSuggestion {
  id: string;
  masterOrganizationId: string;
  canonicalName: string;
  field: string;
  currentValue: string | null;
  suggestedValue: string;
  rationale: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
}

interface SuggestionsResult {
  suggestions: AiSuggestion[];
  total: number;
  pendingCount: number;
}

type StatusFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";

const FIELD_LABELS: Record<string, string> = {
  websiteDomain: "Website Domain",
  industry: "Industry",
  accountStructureType: "Structure Type",
  subVertical: "Sub-Vertical",
  location: "Location",
  aliases: "Aliases",
  // Healthcare overlay
  "healthcare.facilityType": "Facility Type",
  "healthcare.licensedBeds": "Licensed Beds",
  "healthcare.traumaLevel": "Trauma Level",
  "healthcare.systemType": "System Type",
  "healthcare.ownershipModel": "Ownership Model",
  "healthcare.careSetting": "Care Setting",
  // GovCon overlay
  "govcon.uei": "UEI",
  "govcon.cageCode": "CAGE Code",
  "govcon.naicsCodes": "NAICS Codes",
  "govcon.primeOrSub": "Prime / Sub",
  "govcon.contractVehicles": "Contract Vehicles",
  "govcon.agencyAlignment": "Agency Alignment",
};

function getFieldCategory(field: string): { label: string; color: string } | null {
  if (field.startsWith("healthcare.")) return { label: "Healthcare Overlay", color: COLORS.cyan };
  if (field.startsWith("govcon.")) return { label: "GovCon Overlay", color: COLORS.emerald };
  return null;
}

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field.replace(/^(healthcare|govcon)\./, "");
}

function SuggestionCard({
  item,
  onApprove,
  onReject,
}: {
  item: AiSuggestion;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const isPending = item.status === "PENDING";
  const statusColor = item.status === "APPROVED" ? COLORS.emerald : item.status === "REJECTED" ? COLORS.textMuted : COLORS.amber;

  return (
    <View style={[styles.card, !isPending && styles.cardMuted]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.cardOrg} numberOfLines={1}>{item.canonicalName}</Text>
          <View style={styles.cardFieldRow}>
            <Text style={styles.cardField}>{getFieldLabel(item.field)}</Text>
            {getFieldCategory(item.field) && (
              <View style={[styles.categoryPill, { backgroundColor: getFieldCategory(item.field)!.color + "22", borderColor: getFieldCategory(item.field)!.color + "44" }]}>
                <Text style={[styles.categoryPillText, { color: getFieldCategory(item.field)!.color }]}>
                  {getFieldCategory(item.field)!.label}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={[styles.statusPill, { backgroundColor: statusColor + "22" }]}>
          <Text style={[styles.statusPillText, { color: statusColor }]}>{item.status}</Text>
        </View>
      </View>

      <View style={styles.valueRow}>
        {item.currentValue ? (
          <View style={styles.valueBox}>
            <Text style={styles.valueLabel}>CURRENT</Text>
            <Text style={styles.valueText} numberOfLines={2}>{item.currentValue}</Text>
          </View>
        ) : null}
        <View style={[styles.valueBox, styles.valueSuggested]}>
          <Text style={[styles.valueLabel, { color: COLORS.cyan }]}>SUGGESTED</Text>
          <Text style={[styles.valueText, { color: COLORS.text }]} numberOfLines={2}>{item.suggestedValue}</Text>
        </View>
      </View>

      {item.rationale ? (
        <Text style={styles.rationale} numberOfLines={3}>{item.rationale}</Text>
      ) : null}

      {isPending && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => {
              Alert.alert(
                "Approve Suggestion",
                `Apply "${item.suggestedValue}" as the ${getFieldLabel(item.field)} for ${item.canonicalName}?`,
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Approve", onPress: () => onApprove(item.id) },
                ]
              );
            }}
          >
            <Feather name="check" size={14} color={COLORS.emerald} />
            <Text style={[styles.actionBtnText, { color: COLORS.emerald }]}>Approve</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject(item.id)}
          >
            <Feather name="x" size={14} color={COLORS.textMuted} />
            <Text style={[styles.actionBtnText, { color: COLORS.textMuted }]}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function AiSuggestionsScreen() {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("PENDING");

  const { data, isLoading, refetch, isRefetching } = useQuery<SuggestionsResult>({
    queryKey: ["aiSuggestions", statusFilter],
    queryFn: () => adminFetch(`/admin/ai-suggestions?status=${statusFilter}`),
    enabled: isAdminAuthenticated,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/admin/ai-suggestions/${id}/approve`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["aiSuggestions"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/admin/ai-suggestions/${id}/reject`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["aiSuggestions"] }),
  });

  const suggestions = data?.suggestions ?? [];
  const pendingCount = data?.pendingCount ?? 0;

  return (
    <View style={styles.container}>
      <AdminHeader title="AI Enrichment Suggestions" />

      <View style={styles.headerMeta}>
        <Text style={styles.headerMetaText}>
          {pendingCount} pending review
        </Text>
        <Text style={styles.productNote}>
          AI can suggest · Human must approve · All updates are auditable
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterRowInner}>
        {(["PENDING", "APPROVED", "REJECTED", "ALL"] as StatusFilter[]).map(s => (
          <TouchableOpacity
            key={s}
            style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterChipText, statusFilter === s && styles.filterChipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.cyan} />
        </View>
      ) : (
        <FlatList
          data={suggestions}
          keyExtractor={s => s.id}
          renderItem={({ item }) => (
            <SuggestionCard
              item={item}
              onApprove={id => approveMutation.mutate(id)}
              onReject={id => rejectMutation.mutate(id)}
            />
          )}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.cyan} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Feather name="zap" size={32} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No {statusFilter.toLowerCase()} suggestions.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  headerMeta: { paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  headerMetaText: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  productNote: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_400Regular" },
  filterRow: { maxHeight: 48 },
  filterRowInner: { paddingHorizontal: 14, paddingVertical: 8, gap: 8, flexDirection: "row", alignItems: "center" },
  filterChip: {
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
    borderWidth: 1, borderColor: COLORS.navyBorder, backgroundColor: COLORS.navyCard,
  },
  filterChipActive: { backgroundColor: COLORS.cyan + "22", borderColor: COLORS.cyan + "66" },
  filterChipText: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  filterChipTextActive: { color: COLORS.cyan },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 40, gap: 10 },
  card: {
    backgroundColor: COLORS.navyCard, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, padding: 14, gap: 10,
  },
  cardMuted: { opacity: 0.7 },
  cardHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  cardHeaderLeft: { flex: 1, gap: 2 },
  cardOrg: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardFieldRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 1 },
  cardField: { color: COLORS.cyan, fontSize: 11, fontFamily: "Inter_600SemiBold" },
  categoryPill: {
    borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1,
    borderWidth: 1,
  },
  categoryPillText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  statusPillText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  valueRow: { flexDirection: "row", gap: 8 },
  valueBox: {
    flex: 1, backgroundColor: COLORS.navyDark, borderRadius: 6,
    padding: 8, gap: 2,
  },
  valueSuggested: { borderWidth: 1, borderColor: COLORS.cyan + "33" },
  valueLabel: { color: COLORS.textMuted, fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  valueText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  rationale: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
  actionRow: { flexDirection: "row", gap: 8 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    borderRadius: 8, paddingVertical: 8, borderWidth: 1,
  },
  approveBtn: { backgroundColor: COLORS.emerald + "15", borderColor: COLORS.emerald + "44" },
  rejectBtn: { backgroundColor: "#ffffff08", borderColor: COLORS.navyBorder },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyWrap: { alignItems: "center", paddingTop: 60, gap: 12 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
});
