import React, { useState } from "react";
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl } from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
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

function OrgCard({ org, onPress }: any) {
  const icon = ["HOSPITAL", "HEALTH_SYSTEM", "HOSPICE", "HOME_HEALTH"].includes(org.organizationType)
    ? "activity" : "briefcase";
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(org.id)} activeOpacity={0.75}>
      <View style={[styles.orgIcon, { backgroundColor: (ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim) + "20" }]}>
        <Feather name={icon} size={20} color={ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim} />
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{org.name}</Text>
        {org.city && <Text style={styles.location} numberOfLines={1}>{[org.city, org.state].filter(Boolean).join(", ")}</Text>}
        <View style={styles.meta}>
          <Badge label={ORG_TYPE_LABELS[org.organizationType] || org.organizationType} color={ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim} />
          {org._count?.contacts > 0 && (
            <View style={styles.contactCount}>
              <Feather name="users" size={11} color={COLORS.textMuted} />
              <Text style={styles.contactCountText}>{org._count.contacts}</Text>
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
  const debouncedSearch = useDebounce(search, 300);
  const params: Record<string, string> = {};
  if (debouncedSearch) params.search = debouncedSearch;
  const { data, isLoading, refetch, isRefetching } = useOrganizations(params);

  if (isLoading) return <LoadingSpinner label="Loading organizations..." />;

  const orgs = data?.organizations || [];

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

      <FlatList
        data={orgs}
        keyExtractor={(item: any) => item.id}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  addBtn: { width: 36, height: 36, backgroundColor: COLORS.emeraldMuted, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    gap: 12,
  },
  orgIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  info: { flex: 1, gap: 3 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  location: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  meta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 },
  contactCount: { flexDirection: "row", alignItems: "center", gap: 3 },
  contactCountText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
});
