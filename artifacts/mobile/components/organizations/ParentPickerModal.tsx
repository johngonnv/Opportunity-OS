import React, { useState, useMemo } from "react";
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, FlatList,
  TextInput, ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useOrganizations } from "@/hooks/useApi";

const LEVEL_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  group: "Group",
  facility: "Facility",
};

interface Props {
  visible: boolean;
  currentOrgId: string;
  currentParentId?: string | null;
  onSelect: (org: { id: string; name: string } | null) => void;
  onClose: () => void;
}

export function ParentPickerModal({ visible, currentOrgId, currentParentId, onSelect, onClose }: Props) {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useOrganizations({ limit: "200" });

  const orgs = useMemo(() => {
    const all = data?.organizations || [];
    const filtered = all.filter(o => o.id !== currentOrgId);
    if (!search.trim()) return filtered;
    return filtered.filter(o => o.name.toLowerCase().includes(search.toLowerCase()));
  }, [data, currentOrgId, search]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Set Parent Organization</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Feather name="x" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Feather name="search" size={14} color={COLORS.textDim} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search organizations..."
            placeholderTextColor={COLORS.textDim}
            autoFocus
          />
        </View>

        {currentParentId && (
          <TouchableOpacity style={styles.removeRow} onPress={() => { onSelect(null); onClose(); }}>
            <View style={styles.removeIcon}>
              <Feather name="x-circle" size={16} color={COLORS.red} />
            </View>
            <Text style={styles.removeText}>Remove parent (make standalone)</Text>
          </TouchableOpacity>
        )}

        {isLoading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={COLORS.emerald} />
          </View>
        ) : (
          <FlatList
            data={orgs}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No organizations found</Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.orgRow, item.id === currentParentId && styles.orgRowActive]}
                onPress={() => { onSelect({ id: item.id, name: item.name }); onClose(); }}
                activeOpacity={0.75}
              >
                <View style={styles.orgMeta}>
                  <Text style={styles.orgName} numberOfLines={1}>{item.name}</Text>
                  {item.organizationLevel && (
                    <Text style={styles.orgLevel}>{LEVEL_LABELS[item.organizationLevel] ?? item.organizationLevel}</Text>
                  )}
                </View>
                {item.id === currentParentId && (
                  <Feather name="check" size={16} color={COLORS.emerald} />
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  closeBtn: { padding: 4 },
  searchWrap: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: COLORS.navySurface,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text },
  removeRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginBottom: 8,
    padding: 12, backgroundColor: COLORS.navyCard,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.red + "44",
  },
  removeIcon: {},
  removeText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.red },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  empty: { paddingTop: 40, alignItems: "center" },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  orgRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 14, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "66",
  },
  orgRowActive: { backgroundColor: COLORS.emerald + "11", borderRadius: 8, paddingHorizontal: 8 },
  orgMeta: { flex: 1 },
  orgName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  orgLevel: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});
