import React, { useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface Workspace {
  id: string;
  name: string;
  adminNames: string[];
  memberCount: number;
  activePipelineViewCount: number;
}

export default function AdminWorkspacesScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["adminWorkspaces"],
    queryFn: () => adminFetch("/admin/workspaces"),
    enabled: isAdminAuthenticated,
  });

  const workspaces: Workspace[] = data?.workspaces ?? [];

  const renderItem = useCallback(({ item }: { item: Workspace }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() => router.push(`/admin/workspaces/${item.id}` as any)}
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowName}>{item.name}</Text>
        <Text style={styles.rowMeta}>
          {item.adminNames.length > 0
            ? `Admin: ${item.adminNames.join(", ")}`
            : "No admins"
          }
        </Text>
        <Text style={styles.rowMeta}>
          {item.memberCount} member{item.memberCount !== 1 ? "s" : ""} · {item.activePipelineViewCount} active view{item.activePipelineViewCount !== 1 ? "s" : ""}
        </Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  ), []);

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[{ label: "Workspaces" }]} />
      <View style={styles.toolbar}>
        <Text style={styles.sectionTitle}>Client Workspaces</Text>
      </View>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.amber} />
        </View>
      ) : (
        <FlatList
          data={workspaces}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={COLORS.amber} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No workspaces found.</Text>
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  list: { paddingBottom: 32 },
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
  rowLeft: { flex: 1 },
  rowName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium", marginBottom: 4 },
  rowMeta: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  chevron: { color: COLORS.textDim, fontSize: 20, marginLeft: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
});
