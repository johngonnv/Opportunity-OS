import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, ScrollView,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { setReviewSession } from "@/stores/adminReviewSession";

interface MasterOrg {
  id: string;
  canonicalName: string;
  normalizedName: string;
  websiteDomain: string | null;
  sourceType: string;
  sourceConfidence: number;
  industry: string | null;
  validationStatus: string;
  accountStructureType: string | null;
  city: string | null;
  state: string | null;
  aliases: string[];
  relationshipCount: number;
  createdAt: string;
}

const SOURCE_BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  MANUAL: { bg: "#1A2340", text: COLORS.textMuted },
  WORKSPACE_APPROVED: { bg: "#0D2B1A", text: COLORS.emerald },
  SEED: { bg: "#1A1A2E", text: "#8B8BFF" },
};

function SourceBadge({ sourceType }: { sourceType: string }) {
  const colors = SOURCE_BADGE_COLORS[sourceType] ?? SOURCE_BADGE_COLORS.MANUAL;
  return (
    <View style={[styles.sourceBadge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.sourceBadgeText, { color: colors.text }]}>
        {sourceType.replace(/_/g, " ")}
      </Text>
    </View>
  );
}

export default function AdminMasterOrgsScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [industryFilter, setIndustryFilter] = useState<string>("ALL");

  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSearchChange(text: string) {
    setSearch(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  }

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["adminMasterOrgs", debouncedSearch, sourceFilter, industryFilter],
    queryFn: () => {
      const params = new URLSearchParams({ limit: "50" });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (sourceFilter !== "ALL") params.set("sourceType", sourceFilter);
      if (industryFilter !== "ALL") params.set("industry", industryFilter);
      return adminFetch(`/admin/master-organizations?${params.toString()}`);
    },
    enabled: isAdminAuthenticated,
  });

  const orgs: MasterOrg[] = data?.masterOrganizations ?? [];
  const total: number = data?.total ?? 0;

  const VALIDATION_COLORS: Record<string, string> = {
    VERIFIED: COLORS.emerald,
    PENDING: COLORS.amber,
    FLAGGED: "#FF6B6B",
    REJECTED: COLORS.textMuted,
  };

  function seedSession(startId?: string) {
    setReviewSession({
      orgIds: orgs.map(o => o.id),
      filters: { search: debouncedSearch, sourceFilter, industryFilter },
    });
    if (startId) router.push(`/admin/master-organizations/${startId}` as Href);
    else if (orgs.length > 0) router.push(`/admin/master-organizations/${orgs[0].id}` as Href);
  }

  const renderItem = useCallback(({ item }: { item: MasterOrg }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => {
        setReviewSession({
          orgIds: orgs.map(o => o.id),
          filters: { search: debouncedSearch, sourceFilter, industryFilter },
        });
        router.push(`/admin/master-organizations/${item.id}` as Href);
      }}
      activeOpacity={0.7}
    >
      <View style={styles.rowLeft}>
        <View style={styles.rowTop}>
          <Text style={styles.rowName} numberOfLines={1}>{item.canonicalName}</Text>
          <SourceBadge sourceType={item.sourceType} />
        </View>
        <View style={styles.rowMidLine}>
          <Text style={styles.rowDomain} numberOfLines={1}>
            {item.websiteDomain ?? "no domain"}
          </Text>
          {item.industry && (
            <Text style={styles.industryTag}>
              {item.industry.replace(/_/g, " ")}
            </Text>
          )}
        </View>
        <View style={styles.rowBottomLine}>
          <Text style={styles.rowMeta}>
            {item.relationshipCount} rel{item.relationshipCount !== 1 ? "s" : ""}
            {item.aliases.length > 0 ? ` · ${item.aliases.length} alias${item.aliases.length !== 1 ? "es" : ""}` : ""}
            {(item.city || item.state) ? ` · ${[item.city, item.state].filter(Boolean).join(", ")}` : ""}
          </Text>
          <Text style={[styles.validationDot, { color: VALIDATION_COLORS[item.validationStatus] ?? COLORS.textMuted }]}>
            ● {item.validationStatus}
          </Text>
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  ), [orgs, debouncedSearch, sourceFilter, industryFilter]);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarRow}>
          <Text style={styles.sectionTitle}>
            Master Organizations {total > 0 ? `(${total})` : ""}
          </Text>
          <View style={styles.toolbarActions}>
            {orgs.length > 0 && (
              <TouchableOpacity
                style={styles.reviewBtn}
                onPress={() => seedSession()}
              >
                <Text style={styles.reviewBtnText}>▶ Review</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => router.push("/admin/logo-scan/new" as Href)}
            >
              <Text style={styles.scanBtnText}>Scan Logo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.newBtn}
              onPress={() => router.push("/admin/master-organizations/new" as Href)}
            >
              <Text style={styles.newBtnText}>+ New</Text>
            </TouchableOpacity>
          </View>
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name…"
          placeholderTextColor={COLORS.textDim}
          value={search}
          onChangeText={handleSearchChange}
          autoCapitalize="none"
          returnKeyType="search"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(["ALL", "MANUAL", "SEED", "WORKSPACE_APPROVED"] as const).map(src => (
            <TouchableOpacity
              key={src}
              style={[styles.filterChip, sourceFilter === src && styles.filterChipActive]}
              onPress={() => setSourceFilter(src)}
            >
              <Text style={[styles.filterChipText, sourceFilter === src && styles.filterChipTextActive]}>
                {src === "ALL" ? "All Sources" : src.replace(/_/g, " ")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
          {(["ALL", "HEALTHCARE", "GOVCON", "TECHNOLOGY", "FINANCE", "EDUCATION", "NONPROFIT", "OTHER"] as const).map(ind => (
            <TouchableOpacity
              key={ind}
              style={[styles.filterChip, industryFilter === ind && styles.filterChipActiveAlt]}
              onPress={() => setIndustryFilter(ind)}
            >
              <Text style={[styles.filterChipText, industryFilter === ind && styles.filterChipTextActiveAlt]}>
                {ind === "ALL" ? "All Industries" : ind.charAt(0) + ind.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.amber} />
        </View>
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={COLORS.amber}
            />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>
                {debouncedSearch ? `No results for "${debouncedSearch}"` : "No master organizations yet."}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    gap: 10,
  },
  toolbarRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  toolbarActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  reviewBtn: {
    backgroundColor: "#1A0D2E",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#8B8BFF",
  },
  reviewBtnText: { color: "#8B8BFF", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  scanBtn: {
    backgroundColor: "#001A2A",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.cyan,
  },
  scanBtnText: { color: COLORS.cyan, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  newBtn: {
    backgroundColor: COLORS.emeraldMuted,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.emerald,
  },
  newBtnText: { color: COLORS.emerald, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterRow: { flexGrow: 0 },
  filterChip: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginRight: 8,
    backgroundColor: COLORS.navyCard,
  },
  filterChipActive: {
    borderColor: COLORS.amber,
    backgroundColor: "#2A1F00",
  },
  filterChipText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  filterChipTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  searchInput: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
    paddingVertical: 9,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  list: { paddingBottom: 32, paddingTop: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  rowLeft: { flex: 1, gap: 4 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowMidLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowBottomLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  rowName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
  rowDomain: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  rowMeta: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  industryTag: {
    color: "#8B8BFF",
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    backgroundColor: "#1A1A2E",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  validationDot: { fontSize: 10, fontFamily: "Inter_500Medium" },
  chevron: { color: COLORS.textDim, fontSize: 20, marginLeft: 8 },
  sourceBadge: {
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.5 },
  filterChipActiveAlt: {
    borderColor: "#8B8BFF",
    backgroundColor: "#1A1A2E",
  },
  filterChipTextActiveAlt: { color: "#8B8BFF", fontFamily: "Inter_600SemiBold" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
});
