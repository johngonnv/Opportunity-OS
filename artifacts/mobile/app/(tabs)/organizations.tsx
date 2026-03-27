import React, { useState, useMemo } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useOrganizations } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";

const ORG_TYPE_COLORS: Record<string, string> = {
  HOSPITAL: COLORS.red,
  HEALTH_SYSTEM: COLORS.emerald,
  HOSPICE: COLORS.purple,
  HOME_HEALTH: COLORS.cyan,
  GOVERNMENT_AGENCY: COLORS.blue,
  PRIME_CONTRACTOR: COLORS.amber,
  SUBCONTRACTOR: COLORS.amber,
  CONSULTANT: COLORS.textMuted,
  OTHER: COLORS.textDim,
};

const ORG_TYPE_LABELS: Record<string, string> = {
  HOSPITAL: "Hospital",
  HEALTH_SYSTEM: "Health System",
  HOSPICE: "Hospice",
  HOME_HEALTH: "Home Health",
  GOVERNMENT_AGENCY: "Gov Agency",
  PRIME_CONTRACTOR: "Prime",
  SUBCONTRACTOR: "Sub",
  CONSULTANT: "Consultant",
  VENDOR: "Vendor",
  OTHER: "Other",
};

const LEVEL_COLORS: Record<string, string> = {
  enterprise: COLORS.emerald,
  group: COLORS.blue,
  facility: COLORS.amber,
};

const LEVEL_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  group: "Group",
  facility: "Facility",
};

interface SavedView {
  id: string;
  label: string;
  params: Record<string, string>;
}

const SAVED_VIEWS: SavedView[] = [
  { id: "all", label: "All", params: {} },
  { id: "enterprise", label: "Enterprise", params: { level: "enterprise" } },
  { id: "group", label: "Group", params: { level: "group" } },
  { id: "facility", label: "Facility", params: { level: "facility" } },
  { id: "parents", label: "Parent Orgs", params: { isParent: "true" } },
  { id: "has_parent", label: "Has Parent", params: { hasParent: "true" } },
  { id: "standalone", label: "Standalone", params: { standalone: "true" } },
];

function OrgCard({ org, onPress }: any) {
  const icon = ["HOSPITAL", "HEALTH_SYSTEM", "HOSPICE", "HOME_HEALTH"].includes(org.organizationType)
    ? "activity" : "briefcase";
  const typeColor = ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim;
  const levelColor = org.organizationLevel ? (LEVEL_COLORS[org.organizationLevel] || COLORS.textDim) : null;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(org.id)} activeOpacity={0.75}>
      <View style={[styles.orgIcon, { backgroundColor: typeColor + "20" }]}>
        <Feather name={icon} size={20} color={typeColor} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{org.name}</Text>
        {org.parentName && (
          <Text style={styles.parentName} numberOfLines={1}>↳ {org.parentName}</Text>
        )}
        {org.city && <Text style={styles.location} numberOfLines={1}>{[org.city, org.state].filter(Boolean).join(", ")}</Text>}
        <View style={styles.meta}>
          <Badge label={ORG_TYPE_LABELS[org.organizationType] || org.organizationType} color={typeColor} />
          {levelColor && org.organizationLevel && (
            <Badge label={LEVEL_LABELS[org.organizationLevel]} color={levelColor} />
          )}
          {org._count?.contacts > 0 && (
            <View style={styles.contactCount}>
              <Feather name="users" size={11} color={COLORS.textMuted} />
              <Text style={styles.contactCountText}>{org._count.contacts}</Text>
            </View>
          )}
          {org._count?.children > 0 && (
            <View style={styles.contactCount}>
              <Feather name="git-branch" size={11} color={COLORS.textMuted} />
              <Text style={styles.contactCountText}>{org._count.children}</Text>
            </View>
          )}
        </View>
        {org.tags?.length > 0 && (
          <View style={styles.tags}>
            {org.tags.slice(0, 3).map((tag: any) => (
              <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
            ))}
          </View>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.textDim} />
    </TouchableOpacity>
  );
}

export default function OrganizationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const [activeViewId, setActiveViewId] = useState("all");
  const debouncedSearch = useDebounce(search, 300);

  const activeView = SAVED_VIEWS.find(v => v.id === activeViewId) ?? SAVED_VIEWS[0];

  const params = useMemo(() => {
    const p: Record<string, string> = { ...activeView.params, limit: "50" };
    if (debouncedSearch) p.search = debouncedSearch;
    return p;
  }, [debouncedSearch, activeView]);

  const { data, isLoading, refetch, isRefetching } = useOrganizations(params);
  const orgs = data?.organizations || [];
  const total = data?.total || 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.headerTitle}>Organizations</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/organization/new")}>
          <Feather name="plus" size={20} color={COLORS.emerald} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search organizations..." />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.viewsScroll}
        contentContainerStyle={styles.viewsContent}
      >
        {SAVED_VIEWS.map(view => (
          <TouchableOpacity
            key={view.id}
            style={[styles.viewChip, activeViewId === view.id && styles.viewChipActive]}
            onPress={() => { setActiveViewId(view.id); setSearch(""); }}
          >
            <Text style={[styles.viewChipText, activeViewId === view.id && styles.viewChipTextActive]}>
              {view.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.toolbar}>
        <Text style={styles.totalCount}>
          {isLoading ? "Loading..." : `${total.toLocaleString()} organization${total !== 1 ? "s" : ""}`}
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.listLoading}>
          <View style={{ alignItems: "center", gap: 8 }}>
            <Feather name="briefcase" size={24} color={COLORS.textDim} />
            <Text style={{ fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textDim }}>Loading organizations...</Text>
          </View>
        </View>
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={(item: any) => item.id}
          style={styles.flatList}
          contentContainerStyle={[styles.list, orgs.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
          renderItem={({ item }) => (
            <OrgCard org={item} onPress={(id: string) => router.push(`/organization/${id}`)} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase"
              title={search ? "No organizations found" : "No organizations yet"}
              subtitle="Add hospitals, agencies, or companies you work with"
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  addBtn: { width: 36, height: 36, backgroundColor: COLORS.emeraldMuted, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  viewsScroll: { height: 48, flexGrow: 0, flexShrink: 0 },
  viewsContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  viewChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  viewChipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  viewChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  viewChipTextActive: { color: COLORS.emerald },
  toolbar: { paddingHorizontal: 16, paddingVertical: 6 },
  totalCount: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
  flatList: { flex: 1 },
  listLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.navyBorder, gap: 12,
  },
  orgIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 3 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  parentName: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, fontStyle: "italic" },
  location: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  meta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "wrap" },
  contactCount: { flexDirection: "row", alignItems: "center", gap: 3 },
  contactCountText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
});
