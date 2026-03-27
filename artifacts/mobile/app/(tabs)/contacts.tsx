import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Pressable,
  RefreshControl, ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useContacts } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";
import { SortSheet, SortKey, SortOrder } from "@/components/contacts/SortSheet";
import { FilterSheet, FilterKey, TagFilter } from "@/components/contacts/FilterSheet";
import { BulkTaskModal } from "@/components/contacts/BulkTaskModal";

// ── Types ──────────────────────────────────────────────────────────────────

type SavedView = {
  id: string;
  label: string;
  sortBy: SortKey;
  sortOrder: SortOrder;
  filters: FilterKey[];
  tag?: TagFilter;
};

// ── Saved View Definitions ──────────────────────────────────────────────────

const SAVED_VIEWS: SavedView[] = [
  { id: "all",         label: "All",               sortBy: "createdAt",  sortOrder: "desc", filters: [] },
  { id: "new",         label: "New Contacts",       sortBy: "createdAt",  sortOrder: "desc", filters: ["statusNew"] },
  { id: "followup",    label: "Needs Follow-Up",    sortBy: "createdAt",  sortOrder: "desc", filters: ["noTask"] },
  { id: "stale",       label: "Stale Contacts",     sortBy: "createdAt",  sortOrder: "asc",  filters: ["stale30"] },
  { id: "hot",         label: "Hot Opportunities",  sortBy: "createdAt",  sortOrder: "desc", filters: ["hasOpportunity"] },
  { id: "missing",     label: "Missing Data",       sortBy: "createdAt",  sortOrder: "desc", filters: ["missingData"] },
  { id: "duplicates",  label: "Possible Duplicates",sortBy: "fullName",   sortOrder: "asc",  filters: ["duplicates"] },
  { id: "healthcare",  label: "Healthcare",         sortBy: "createdAt",  sortOrder: "desc", filters: [], tag: "healthcare" },
  { id: "govcon",      label: "GovCon",             sortBy: "createdAt",  sortOrder: "desc", filters: [], tag: "govcon" },
  { id: "cardscans",   label: "Card Scans",         sortBy: "createdAt",  sortOrder: "desc", filters: ["sourceCard"] },
  { id: "workqueue",   label: "⚡ Work Queue",       sortBy: "createdAt",  sortOrder: "asc",  filters: ["noTask", "sourceCard"] },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  NEW: COLORS.amber,
  REVIEWED: COLORS.blue,
  ACTIVE: COLORS.emerald,
  INACTIVE: COLORS.textDim,
};

function timeAgo(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function formatDue(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return "Overdue";
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  if (days < 7) return `Due in ${days}d`;
  return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

// ── Contact Card ─────────────────────────────────────────────────────────────

function ContactCard({ contact, onPress, onLongPress, selected, selectMode }: any) {
  const initials = ((contact.firstName?.[0] || "") + (contact.lastName?.[0] || "")).toUpperCase()
    || contact.fullName?.[0]?.toUpperCase() || "?";
  const ago = timeAgo(contact.lastActivityAt);
  const due = formatDue(contact.nextTaskDue);

  return (
    <Pressable
      style={[styles.card, selected && styles.cardSelected]}
      onPress={() => onPress(contact.id)}
      onLongPress={() => onLongPress(contact.id)}
    >
      {/* Selection indicator */}
      {selectMode && (
        <View style={[styles.selectCircle, selected && styles.selectCircleActive]}>
          {selected && <Feather name="check" size={12} color="#000" />}
        </View>
      )}

      {/* Avatar */}
      <View style={[styles.avatar, selected && styles.avatarSelected]}>
        <Text style={styles.initials}>{initials}</Text>
      </View>

      {/* Main info */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{contact.fullName}</Text>
        {contact.title && <Text style={styles.title} numberOfLines={1}>{contact.title}</Text>}
        {contact.organization && <Text style={styles.org} numberOfLines={1}>{contact.organization.name}</Text>}
        {contact.email && <Text style={styles.email} numberOfLines={1}>{contact.email}</Text>}

        {due && (
          <View style={styles.duePill}>
            <Feather name="calendar" size={10} color={due === "Overdue" ? COLORS.red : COLORS.amber} />
            <Text style={[styles.dueText, due === "Overdue" && { color: COLORS.red }]}>{due}</Text>
          </View>
        )}

        {contact.tags?.length > 0 && (
          <View style={styles.tags}>
            {contact.tags.slice(0, 2).map((tag: any) => (
              <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
            ))}
            {contact.tags.length > 2 && (
              <Text style={styles.moreTags}>+{contact.tags.length - 2}</Text>
            )}
          </View>
        )}
      </View>

      {/* Right column */}
      <View style={styles.right}>
        <Badge label={contact.status} color={STATUS_COLORS[contact.status] || COLORS.textDim} />
        {ago && <Text style={styles.ago}>{ago}</Text>}
        {contact.openOpportunityCount > 0 && (
          <View style={styles.oppPill}>
            <Feather name="trending-up" size={10} color={COLORS.emerald} />
            <Text style={styles.oppText}>{contact.openOpportunityCount}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────

export default function ContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // Search
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  // Sort + filter state
  const [sortBy, setSortBy] = useState<SortKey>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [tagFilter, setTagFilter] = useState<TagFilter>("");
  const [activeViewId, setActiveViewId] = useState<string>("all");

  // Sheet visibility
  const [sortOpen, setSortOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTaskOpen, setBulkTaskOpen] = useState(false);
  const selectMode = selectedIds.size > 0;

  // Build API params
  const params = useMemo(() => {
    const p: Record<string, string> = { sortBy, sortOrder };
    if (debouncedSearch) p.search = debouncedSearch;
    if (activeFilters.size > 0) p.filter = Array.from(activeFilters).join(",");
    if (tagFilter) p.tag = tagFilter;
    return p;
  }, [debouncedSearch, sortBy, sortOrder, activeFilters, tagFilter]);

  const { data, isLoading, refetch, isRefetching } = useContacts(params);

  const contacts = data?.contacts || [];
  const total = data?.total || 0;
  const filterCount = activeFilters.size + (tagFilter ? 1 : 0);

  // Active view helper
  const applyView = useCallback((view: SavedView) => {
    setSortBy(view.sortBy);
    setSortOrder(view.sortOrder);
    setActiveFilters(new Set(view.filters));
    setTagFilter(view.tag || "");
    setActiveViewId(view.id);
    setSelectedIds(new Set());
  }, []);

  const handleSortChange = (newSortBy: SortKey, newSortOrder: SortOrder) => {
    setSortBy(newSortBy);
    setSortOrder(newSortOrder);
    setActiveViewId("");
  };

  const handleFilterChange = (filters: Set<FilterKey>, tag: TagFilter) => {
    setActiveFilters(filters);
    setTagFilter(tag);
    setActiveViewId("");
  };

  // Select logic
  const handlePress = useCallback((id: string) => {
    if (selectMode) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      router.push(`/contact/${id}`);
    }
  }, [selectMode, router]);

  const handleLongPress = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  const clearSelection = () => setSelectedIds(new Set());
  const selectAll = () => setSelectedIds(new Set(contacts.map((c: any) => c.id)));

  // Sort label for toolbar
  const sortLabel = useMemo(() => {
    const labels: Record<string, string> = {
      createdAt: "Date Added",
      updatedAt: "Updated",
      fullName: "Name",
      source: "Source",
      status: "Status",
    };
    return `${labels[sortBy] || sortBy} ${sortOrder === "asc" ? "↑" : "↓"}`;
  }, [sortBy, sortOrder]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Top Bar */}
      <View style={styles.topBar}>
        {selectMode ? (
          <>
            <TouchableOpacity onPress={clearSelection} style={styles.cancelBtn}>
              <Feather name="x" size={18} color={COLORS.textMuted} />
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.selectedCount}>{selectedIds.size} selected</Text>
            <TouchableOpacity onPress={selectAll} style={styles.selectAllBtn}>
              <Text style={styles.selectAllText}>All</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.headerTitle}>Contacts</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/contact/new")}>
              <Feather name="plus" size={20} color={COLORS.emerald} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Search */}
      {!selectMode && (
        <View style={styles.searchWrap}>
          <SearchBar value={search} onChangeText={setSearch} placeholder="Search name, email, title..." />
        </View>
      )}

      {/* Saved Views Strip */}
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
            onPress={() => applyView(view)}
          >
            <Text style={[styles.viewChipText, activeViewId === view.id && styles.viewChipTextActive]}>
              {view.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Sort + Filter Toolbar */}
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
        <Text style={styles.totalCount}>{total.toLocaleString()} contact{total !== 1 ? "s" : ""}</Text>
      </View>

      {/* Contact List */}
      {isLoading ? (
        <View style={styles.listLoading}>
          <LoadingSpinner label="Loading contacts..." />
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item: any) => item.id}
          style={styles.flatList}
          contentContainerStyle={[styles.list, contacts.length === 0 && { flex: 1 }]}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
          renderItem={({ item }) => (
            <ContactCard
              contact={item}
              onPress={handlePress}
              onLongPress={handleLongPress}
              selected={selectedIds.has(item.id)}
              selectMode={selectMode}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title={search || filterCount > 0 ? "No contacts match" : "No contacts yet"}
              subtitle={
                search || filterCount > 0
                  ? "Try adjusting your search or filters"
                  : "Scan a business card or add a contact manually"
              }
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Bulk Action Bar */}
      {selectMode && (
        <View style={[styles.bulkBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={styles.bulkAction} onPress={() => setBulkTaskOpen(true)}>
            <Feather name="check-square" size={18} color={COLORS.emerald} />
            <Text style={styles.bulkActionText}>Create Tasks</Text>
          </TouchableOpacity>
          <View style={styles.bulkDivider} />
          <TouchableOpacity style={styles.bulkAction} onPress={clearSelection}>
            <Feather name="x-circle" size={18} color={COLORS.textMuted} />
            <Text style={[styles.bulkActionText, { color: COLORS.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sheets + Modals */}
      <SortSheet
        visible={sortOpen}
        onClose={() => setSortOpen(false)}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onChange={handleSortChange}
      />
      <FilterSheet
        visible={filterOpen}
        onClose={() => setFilterOpen(false)}
        activeFilters={activeFilters}
        tagFilter={tagFilter}
        onChange={handleFilterChange}
      />
      <BulkTaskModal
        visible={bulkTaskOpen}
        onClose={() => setBulkTaskOpen(false)}
        contactIds={Array.from(selectedIds)}
        onSuccess={clearSelection}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },

  // Top Bar
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  addBtn: { width: 36, height: 36, backgroundColor: COLORS.emeraldMuted, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cancelBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  cancelText: { fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.textMuted },
  selectedCount: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text },
  selectAllBtn: { paddingHorizontal: 8 },
  selectAllText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald },

  // Search
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },

  // Saved Views
  viewsScroll: { height: 48, flexGrow: 0, flexShrink: 0 },
  viewsContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  viewChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  viewChipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  viewChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  viewChipTextActive: { fontFamily: "Inter_600SemiBold", color: COLORS.emerald },

  // Toolbar
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

  // List
  flatList: { flex: 1 },
  listLoading: { flex: 1, justifyContent: "center", alignItems: "center" },
  list: { paddingHorizontal: 16, paddingBottom: 120 },

  // Contact Card
  card: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: COLORS.navyCard, borderRadius: 12,
    padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.navyBorder, gap: 10,
  },
  cardSelected: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  selectCircle: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: COLORS.navyBorder,
    alignItems: "center", justifyContent: "center",
    alignSelf: "center",
  },
  selectCircleActive: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.navySurface,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  avatarSelected: { borderColor: COLORS.emerald },
  initials: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  title: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  org: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  email: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
  duePill: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 },
  dueText: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.amber },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  moreTags: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textDim, alignSelf: "center" },
  right: { alignItems: "flex-end", gap: 4, minWidth: 80 },
  ago: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim },
  oppPill: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.emeraldMuted, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  oppText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.emerald },

  // Bulk Bar
  bulkBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.navyCard,
    borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
    flexDirection: "row", alignItems: "center",
    paddingTop: 12, paddingHorizontal: 16,
  },
  bulkAction: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 4 },
  bulkActionText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald },
  bulkDivider: { width: 1, height: 32, backgroundColor: COLORS.navyBorder },
});
