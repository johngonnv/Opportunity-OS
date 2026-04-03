import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface DomainData {
  missingDomain: { id: string; canonical_name: string; source_type: string; created_at: string }[];
  duplicateDomains: { domain: string; ids: string[]; names: string[]; count: number }[];
  malformedDomains: { id: string; canonical_name: string; website_domain: string }[];
  totalMissing: number;
  totalDuplicate: number;
  totalMalformed: number;
}

export default function AdminDiagnosticsDomainScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [tab, setTab] = useState<"missing" | "duplicate" | "malformed">("missing");

  const { data, isLoading, refetch, isRefetching } = useQuery<DomainData>({
    queryKey: ["adminDiagnosticsDomain"],
    queryFn: () => adminFetch("/admin/diagnostics/domain"),
    enabled: isAdminAuthenticated,
  });

  const tabs = [
    { key: "missing" as const, label: "Missing", count: data?.totalMissing ?? 0 },
    { key: "duplicate" as const, label: "Duplicates", count: data?.totalDuplicate ?? 0 },
    { key: "malformed" as const, label: "Malformed", count: data?.totalMalformed ?? 0 },
  ];

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Diagnostics", href: "/admin/(tabs)/diagnostics" },
        { label: "Domain Diagnostics" },
      ]} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching && !isLoading} onRefresh={refetch} tintColor={COLORS.amber} />}
      >
        <Text style={styles.title}>Domain Diagnostics</Text>

        <View style={styles.tabRow}>
          {tabs.map(t => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
                {t.label}{t.count > 0 ? ` (${t.count})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {isLoading ? (
          <View style={styles.loadingRow}><ActivityIndicator color={COLORS.amber} /></View>
        ) : tab === "missing" ? (
          data?.missingDomain?.length === 0 ? (
            <EmptyCard message="All records have a domain." />
          ) : (
            (data?.missingDomain ?? []).map(org => (
              <TouchableOpacity
                key={org.id}
                style={styles.row}
                onPress={() => router.push(`/admin/master-organizations/${org.id}` as Href)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowName} numberOfLines={1}>{org.canonical_name}</Text>
                  <Text style={styles.rowSource}>{org.source_type}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={COLORS.textDim} />
              </TouchableOpacity>
            ))
          )
        ) : tab === "duplicate" ? (
          data?.duplicateDomains?.length === 0 ? (
            <EmptyCard message="No duplicate domains found." />
          ) : (
            (data?.duplicateDomains ?? []).map((group, i) => (
              <View key={i} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <Feather name="globe" size={14} color={COLORS.cyan} />
                  <Text style={styles.groupDomain}>{group.domain}</Text>
                  <Text style={styles.groupCount}>{group.count}×</Text>
                </View>
                {group.names.map((name, j) => (
                  <TouchableOpacity
                    key={j}
                    style={styles.groupRow}
                    onPress={() => router.push(`/admin/master-organizations/${group.ids[j]}` as Href)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.groupOrgName} numberOfLines={1}>{name}</Text>
                    <Feather name="arrow-right" size={14} color={COLORS.textDim} />
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )
        ) : (
          data?.malformedDomains?.length === 0 ? (
            <EmptyCard message="No malformed domains found." />
          ) : (
            (data?.malformedDomains ?? []).map(org => (
              <TouchableOpacity
                key={org.id}
                style={styles.row}
                onPress={() => router.push(`/admin/master-organizations/${org.id}` as Href)}
                activeOpacity={0.7}
              >
                <View style={styles.rowLeft}>
                  <Text style={styles.rowName} numberOfLines={1}>{org.canonical_name}</Text>
                  <Text style={[styles.rowSource, { color: COLORS.red }]}>{org.website_domain}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={COLORS.textDim} />
              </TouchableOpacity>
            ))
          )
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <View style={styles.emptyCard}>
      <Feather name="check-circle" size={28} color={COLORS.emerald} />
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  title: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 16 },
  tabRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  tab: {
    flex: 1, borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingVertical: 9, alignItems: "center", backgroundColor: COLORS.navyCard,
  },
  tabActive: { borderColor: COLORS.cyan, backgroundColor: "#001A2A" },
  tabText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_500Medium" },
  tabTextActive: { color: COLORS.cyan, fontFamily: "Inter_600SemiBold" },
  loadingRow: { alignItems: "center", paddingVertical: 40 },
  emptyCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 32, alignItems: "center", gap: 10,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 8,
  },
  rowLeft: { flex: 1, marginRight: 8 },
  rowName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" },
  rowSource: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  groupCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, marginBottom: 10, overflow: "hidden",
  },
  groupHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  groupDomain: { color: COLORS.cyan, fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
  groupCount: { color: COLORS.amber, fontSize: 13, fontFamily: "Inter_700Bold" },
  groupRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "55",
  },
  groupOrgName: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
});
