import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface Template {
  id: string;
  name: string;
  vertical: string | null;
  subVertical: string | null;
  status: "draft" | "active" | "inactive" | "archived";
  isLocked: boolean;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  draft: COLORS.textDim,
  active: COLORS.emerald,
  inactive: COLORS.amber,
  archived: COLORS.red,
};

export default function AdminTemplatesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["adminTemplates"],
    queryFn: () => adminFetch("/admin/pipeline-templates"),
    enabled: isAdminAuthenticated,
  });

  const templates: Template[] = data?.templates ?? [];

  async function handleClone(id: string) {
    try {
      await adminFetch(`/admin/pipeline-templates/${id}/clone`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["adminTemplates"] });
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  }

  async function handleArchive(id: string, name: string) {
    Alert.alert(
      "Archive Template",
      `Archive "${name}"? It will no longer be available for publishing.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive", style: "destructive",
          onPress: async () => {
            try {
              await adminFetch(`/admin/pipeline-templates/${id}/archive`, { method: "POST" });
              qc.invalidateQueries({ queryKey: ["adminTemplates"] });
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ]
    );
  }

  function showRowActions(t: Template) {
    Alert.alert(t.name, "Choose action:", [
      { text: "Edit", onPress: () => router.push(`/admin/templates/${t.id}` as any) },
      { text: "Clone", onPress: () => handleClone(t.id) },
      { text: "Archive", style: "destructive", onPress: () => handleArchive(t.id, t.name) },
      { text: "Publish to Workspace", onPress: () => router.push({ pathname: "/admin/templates/[id]", params: { id: t.id, publish: "1" } } as any) },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  const renderItem = useCallback(({ item }: { item: Template }) => (
    <TouchableOpacity style={styles.row} onPress={() => router.push(`/admin/templates/${item.id}` as any)} onLongPress={() => showRowActions(item)}>
      <View style={styles.rowLeft}>
        <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.rowMeta}>
          {[item.vertical, item.subVertical].filter(Boolean).join(" › ") || "No vertical"}
          {item.isLocked ? "  🔒" : ""}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <View style={[styles.statusBadge, { borderColor: STATUS_COLORS[item.status] }]}>
          <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] }]}>{item.status}</Text>
        </View>
        <TouchableOpacity style={styles.menuBtn} onPress={() => showRowActions(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.menuDots}>•••</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  ), []);

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[{ label: "Templates" }]} />
      <View style={styles.toolbar}>
        <Text style={styles.sectionTitle}>Pipeline View Templates</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push("/admin/templates/new" as any)}>
          <Text style={styles.newBtnText}>+ New Template</Text>
        </TouchableOpacity>
      </View>
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.amber} />
        </View>
      ) : (
        <FlatList
          data={templates}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={COLORS.amber} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No templates yet. Create one to get started.</Text>
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  sectionTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  newBtn: {
    backgroundColor: COLORS.amber,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newBtnText: { color: COLORS.navyDark, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { paddingBottom: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  rowLeft: { flex: 1, marginRight: 8 },
  rowName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" },
  rowMeta: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 3 },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  menuBtn: { paddingLeft: 4 },
  menuDots: { color: COLORS.textMuted, fontSize: 16, letterSpacing: -1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
});
