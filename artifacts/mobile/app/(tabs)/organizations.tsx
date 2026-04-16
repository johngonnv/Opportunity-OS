import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl,
} from "react-native";
import { DraggableScrollView } from "@/components/ui/DraggableScrollView";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import {
  ACCOUNT_STRUCTURE_LABELS, ACCOUNT_STRUCTURE_COLORS,
  VERTICAL_LABELS, VERTICAL_COLORS,
  ORG_TYPE_COLORS, ORG_TYPE_LABELS,
  formatCurrency,
} from "@/constants/orgLabels";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { useOrganizations, useDashboard } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { OrgSortSheet, OrgSortKey, SortOrder } from "@/components/organizations/OrgSortSheet";
import { OrgFilterSheet, OrgFilterKey, OrgTagFilter } from "@/components/organizations/OrgFilterSheet";
import { ModeHeader } from "@/components/ui/ModeHeader";
import { useMode } from "@/contexts/ModeContext";

type SavedView = {
  id: string;
  label: string;
  sortBy: OrgSortKey;
  sortOrder: SortOrder;
  filters: OrgFilterKey[];
  tag?: OrgTagFilter;
  params?: Record<string, string>;
};

const SAVED_VIEWS: SavedView[] = [
  { id: "all",           label: "All",              sortBy: "createdAt",  sortOrder: "desc", filters: [] },
  { id: "enterprise",    label: "Enterprise",       sortBy: "name",       sortOrder: "asc",  filters: [], params: { accountStructureType: "enterprise" } },
  { id: "parent",        label: "Parent Accounts",  sortBy: "name",       sortOrder: "asc",  filters: [], params: { accountStructureType: "parent" } },
  { id: "regional",      label: "Regionals",        sortBy: "name",       sortOrder: "asc",  filters: [], params: { accountStructureType: "regional" } },
  { id: "local",         label: "Local Entities",   sortBy: "name",       sortOrder: "asc",  filters: [], params: { accountStructureType: "local_entity" } },
  { id: "no_parent",     label: "No Parent",        sortBy: "createdAt",  sortOrder: "desc", filters: [], params: { standalone: "true" } },
  { id: "has_children",  label: "Has Children",     sortBy: "name",       sortOrder: "asc",  filters: [], params: { isParent: "true" } },
  { id: "healthcare",    label: "Healthcare",       sortBy: "name",       sortOrder: "asc",  filters: [], params: { vertical: "healthcare" } },
  { id: "govcon",        label: "GovCon",           sortBy: "name",       sortOrder: "asc",  filters: [], params: { vertical: "govcon" } },
  { id: "general",       label: "General Biz",      sortBy: "name",       sortOrder: "asc",  filters: [], params: { vertical: "general_business" } },
  { id: "government",    label: "Government",       sortBy: "name",       sortOrder: "asc",  filters: [], params: { vertical: "government" } },
  { id: "has_contacts",  label: "Has Contacts",     sortBy: "name",       sortOrder: "asc",  filters: ["hasContacts"] },
  { id: "active_pipe",   label: "Active Pipeline",  sortBy: "updatedAt",  sortOrder: "desc", filters: ["hasOpenOpps"] },
  { id: "stale",         label: "Stale (90d)",      sortBy: "updatedAt",  sortOrder: "asc",  filters: ["stale90"] },
  { id: "missing_data",  label: "Missing Data",     sortBy: "name",       sortOrder: "asc",  filters: ["missingVertical", "missingStructure"] },
];

function OrgCard({ org, onPress }: any) {
  const icon = ["HOSPITAL", "HEALTH_SYSTEM", "HOSPICE", "HOME_HEALTH"].includes(org.organizationType)
    ? "activity" : "briefcase";
  const typeColor = ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim;

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
          {org.accountStructureType && (
            <Badge
              label={ACCOUNT_STRUCTURE_LABELS[org.accountStructureType] || org.accountStructureType}
              color={ACCOUNT_STRUCTURE_COLORS[org.accountStructureType] || COLORS.textDim}
            />
          )}
          {org.vertical && (
            <Badge
              label={VERTICAL_LABELS[org.vertical] || org.vertical}
              color={VERTICAL_COLORS[org.vertical] || COLORS.textDim}
            />
          )}
        </View>
        <View style={styles.metaNumbers}>
          {org._count?.contacts > 0 && (
            <View style={styles.countChip}>
              <Feather name="users" size={10} color={COLORS.textMuted} />
              <Text style={styles.countText}>{org._count.contacts}</Text>
            </View>
          )}
          {org._count?.children > 0 && (
            <View style={styles.countChip}>
              <Feather name="git-branch" size={10} color={COLORS.textMuted} />
              <Text style={styles.countText}>{org._count.children}</Text>
            </View>
          )}
          {org._opp?.openOpportunities > 0 && (
            <View style={styles.countChip}>
              <Feather name="trending-up" size={10} color={COLORS.blue} />
              <Text style={[styles.countText, { color: COLORS.blue }]}>{org._opp.openOpportunities}</Text>
            </View>
          )}
          {org._opp?.pipelineValue > 0 && (
            <Text style={styles.pipelineText}>{formatCurrency(org._opp.pipelineValue)}</Text>
          )}
        </View>
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.textDim} />
    </TouchableOpacity>
  );
}

export default function OrganizationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useMode();
  const { data: dashData } = useDashboard();
  const { data: enterpriseData } = useOrganizations({ accountStructureType: "enterprise", limit: "1" });

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const [sortBy, setSortBy] = useState<OrgSortKey>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [activeFilters, setActiveFilters] = useState<Set<OrgFilterKey>>(new Set());
  const [tagFilter, setTagFilter] = useState<OrgTagFilter>("");
  const [activeViewId, setActiveViewId] = useState<string>("all");

  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  const activeView = SAVED_VIEWS.find(v => v.id === activeViewId) ?? SAVED_VIEWS[0];

  const params = useMemo(() => {
    const p: Record<string, string> = {
      ...(activeView.params || {}),
      sortBy,
      sortOrder,
      limit: "50",
    };
    if (debouncedSearch) p.search = debouncedSearch;
    if (activeFilters.size > 0) p.filter = Array.from(activeFilters).join(",");
    if (tagFilter) p.tag = tagFilter;
    return p;
  }, [debouncedSearch, sortBy, sortOrder, activeFilters, tagFilter, activeView]);

  const { data, isLoading, refetch, isRefetching } = useOrganizations(params);
  const orgs = data?.organizations || [];
  const total = data?.total || 0;
  const filterCount = activeFilters.size + (tagFilter ? 1 : 0);

  const applyView = useCallback((view: SavedView) => {
    setSortBy(view.sortBy);
    setSortOrder(view.sortOrder);
    setActiveFilters(new Set(view.filters));
    setTagFilter(view.tag || "");
    setActiveViewId(view.id);
  }, []);

  const handleSortChange = (newSortBy: OrgSortKey, newSortOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setActiveViewId("");
  };

  const handleFilterChange = (filters: Set<OrgFilterKey>, tag: OrgTagFilter) => {
    setActiveFilters(filters);
    setTagFilter(tag);
    setActiveViewId("");
  };

  const sortLabel = useMemo(() => {
    const labels: Record<string, string> = {
      createdAt: "Date Added",
      updatedAt: "Updated",
      name: "Name",
      city: "City",
      state: "State",
      organizationType: "Type",
    };
    return `${labels[sortBy] || sortBy} ${sortOrder === "asc" ? "↑" : "↓"}`;
  }, [sortBy, sortOrder]);

  const enterpriseCount: number = (enterpriseData as { total?: number } | undefined)?.total ?? 0;
  const openOpps: number = (dashData as { openOpportunities?: number } | undefined)?.openOpportunities ?? 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ModeHeader title="Organizations" icon="briefcase" />

      {mode === "office" && (
        <View style={styles.kpiStrip}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{total.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Total Orgs</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={styles.kpiValue}>{enterpriseCount}</Text>
            <Text style={styles.kpiLabel}>Enterprise</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiValue, { color: COLORS.emerald }]}>{openOpps}</Text>
            <Text style={styles.kpiLabel}>Open Pipeline</Text>
          </View>
        </View>
      )}

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search organizations..." />
      </View>

      <DraggableScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.viewsScroll}
        contentContainerStyle={styles.viewsContent}
      >
        {SAVED_VIEWS.map(view => (
          <TouchableOpacity
            key={view.id}
            style={[styles.viewChip, activeViewId === view.id && styles.viewChipActive]}
            onPress={() => applyView(view)}
          >
            <Text style={[styles.viewChipText, activeViewId === view.id && styles.viewChipTextActive]}>
              {view.label}
            </Text>
          </TouchableOpacity>
        ))}
      </DraggableScrollView>

      <View style={styles.toolbar}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setSortOpen(true)}>
          <Feather name="sliders" size={13} color={COLORS.textMuted} />
          <Text style={styles.toolbarBtnText}>{sortLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toolbarBtn, filterCount > 0 && styles.toolbarBtnActive]}
          onPress={() => setFilterOpen(true)}
        >
          <Feather name="filter" size={13} color={filterCount > 0 ? COLORS.emerald : COLORS.textMuted} />
          <Text style={[styles.toolbarBtnText, filterCount > 0 && styles.toolbarBtnTextActive]}>
            {filterCount > 0 ? `Filters (${filterCount})` : "Filter"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.totalCount}>
          {isLoading ? "Loading..." : `${total.toLocaleString()} org${total !== 1 ? "s" : ""}`}
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
            <OrgCard org={item} onPress={(orgId: string) => router.push(`/organization/${orgId}`)} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="briefcase"
              title={search || filterCount > 0 ? "No organizations match" : "No organizations yet"}
              subtitle={
                search || filterCount > 0
                  ? "Try adjusting your search or filters"
                  : "Add hospitals, agencies, or companies you work with"
              }
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <OrgSortSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onChange={handleSortChange}
      />
      <OrgFilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        activeFilters={activeFilters}
        tagFilter={tagFilter}
        onChange={handleFilterChange}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  kpiStrip: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: COLORS.navySurface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, paddingVertical: 10,
  },
  kpiItem: { flex: 1, alignItems: "center" },
  kpiValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  kpiLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  kpiDivider: { width: 1, height: 28, backgroundColor: COLORS.navyBorder },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  viewsScroll: { height: 48, flexGrow: 0, flexShrink: 0 },
  viewsContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  viewChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  viewChipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  viewChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  viewChipTextActive: { fontFamily: "Inter_600SemiBold", color: COLORS.emerald },
  toolbar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  toolbarBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  toolbarBtnActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  toolbarBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  toolbarBtnTextActive: { color: COLORS.emerald },
  totalCount: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginLeft: "auto" },
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
  meta: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2, flexWrap: "wrap" },
  metaNumbers: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 },
  countChip: { flexDirection: "row", alignItems: "center", gap: 3 },
  countText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  pipelineText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.amber },
});
