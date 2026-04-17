import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Modal, TextInput,
  KeyboardAvoidingView, Platform, Alert, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import {
  useCommissionRules, useUpsertCommissionRule, useDeleteCommissionRule,
  useOrganizations, useCommissionRole,
  type CommissionLine,
} from "@/hooks/useApi";

const LINE_LABELS: Record<CommissionLine, string> = {
  EMS_INTERFACILITY: "EMS Interfacility",
  EVENT_STAFFING: "Event Staffing",
  EMT_PROGRAM: "EMT Program",
  GOVERNMENT: "Government",
};

const RATE_TYPES = ["PERCENT_OF_REVENUE", "FLAT", "PER_UNIT"] as const;
type RateType = typeof RATE_TYPES[number];

export default function RulesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: roleData } = useCommissionRole();
  const role = roleData?.role ?? null;
  const isAdmin = role === "OWNER" || role === "ADMIN";

  const { data, refetch, isRefetching } = useCommissionRules();
  const { data: orgsData } = useOrganizations({ limit: "500" });
  const upsert = useUpsertCommissionRule();
  const del = useDeleteCommissionRule();

  const rules: any[] = data?.rules ?? [];
  const orgs: any[] = orgsData?.organizations ?? [];
  const orgNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orgs) m.set(o.id, o.name);
    return m;
  }, [orgs]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [line, setLine] = useState<CommissionLine>("EMS_INTERFACILITY");
  const [orgId, setOrgId] = useState<string | null>(null);
  const [rateType, setRateType] = useState<RateType>("PERCENT_OF_REVENUE");
  const [rateValue, setRateValue] = useState("");
  const [notes, setNotes] = useState("");
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");

  function openNew() {
    setEditingId(null); setLine("EMS_INTERFACILITY"); setOrgId(null);
    setRateType("PERCENT_OF_REVENUE"); setRateValue(""); setNotes("");
    setEditorOpen(true);
  }
  function openEdit(r: any) {
    setEditingId(r.id); setLine(r.lineOfService); setOrgId(r.organizationId);
    setRateType(r.rateType); setRateValue(String(r.rateValue)); setNotes(r.notes ?? "");
    setEditorOpen(true);
  }
  function save() {
    const v = parseFloat(rateValue);
    if (Number.isNaN(v) || v < 0) { Alert.alert("Invalid rate value"); return; }
    upsert.mutate({
      id: editingId ?? undefined,
      lineOfService: line, organizationId: orgId, rateType, rateValue: v,
      notes: notes.trim() || undefined,
    }, {
      onSuccess: () => { setEditorOpen(false); refetch(); },
      onError: (e) => Alert.alert("Save failed", e.message),
    });
  }
  function deleteRule(id: string) {
    Alert.alert("Delete rule?", "Existing records keep their snapshot rate.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => del.mutate(id, {
        onSuccess: () => refetch(),
        onError: (e) => Alert.alert("Delete failed", e.message),
      }) },
    ]);
  }

  const filteredOrgs = orgSearch ? orgs.filter((o: any) => o.name?.toLowerCase().includes(orgSearch.toLowerCase())) : orgs;
  const selectedOrgName = orgId ? orgNameById.get(orgId) ?? "Unknown" : "Workspace default (all facilities)";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="chevron-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Commission Rules</Text>
        {isAdmin ? (
          <TouchableOpacity onPress={openNew} style={styles.headerBtn}>
            <Feather name="plus" size={20} color={COLORS.emerald} />
          </TouchableOpacity>
        ) : <View style={styles.headerBtn} />}
      </View>

      <FlatList
        data={rules}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="settings" size={28} color={COLORS.textDim} />
            <Text style={styles.emptyText}>No rules yet. Add one to enable calculation.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => isAdmin && openEdit(item)} disabled={!isAdmin}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardLine}>{LINE_LABELS[item.lineOfService as CommissionLine] ?? item.lineOfService}</Text>
              <Text style={styles.cardOrg} numberOfLines={1}>
                {item.organizationId ? (orgNameById.get(item.organizationId) ?? "Specific facility") : "All facilities (default)"}
              </Text>
              <Text style={styles.cardRate}>
                {item.rateType === "PERCENT_OF_REVENUE" ? `${item.rateValue}%` :
                 item.rateType === "FLAT" ? `Flat $${item.rateValue}` :
                 `${item.rateValue} per unit`}
              </Text>
              {item.notes && <Text style={styles.cardNotes} numberOfLines={2}>{item.notes}</Text>}
            </View>
            {isAdmin && (
              <TouchableOpacity onPress={() => deleteRule(item.id)} style={{ padding: 6 }}>
                <Feather name="trash-2" size={14} color={COLORS.red} />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        )}
      />

      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <ScrollView style={styles.modalCard} contentContainerStyle={{ gap: 10 }}>
            <Text style={styles.modalTitle}>{editingId ? "Edit Rule" : "New Rule"}</Text>

            <Text style={styles.fieldLabel}>Line of Service</Text>
            <View style={styles.chipRow}>
              {(Object.keys(LINE_LABELS) as CommissionLine[]).map((l) => (
                <TouchableOpacity key={l} style={[styles.smallChip, line === l && styles.smallChipActive]} onPress={() => setLine(l)}>
                  <Text style={[styles.smallChipText, line === l && styles.smallChipTextActive]}>{LINE_LABELS[l]}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Facility (optional)</Text>
            <TouchableOpacity style={styles.input} onPress={() => setOrgPickerOpen(true)}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text }}>{selectedOrgName}</Text>
            </TouchableOpacity>
            {orgId && (
              <TouchableOpacity onPress={() => setOrgId(null)}>
                <Text style={{ fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.cyan }}>Clear (use as workspace default)</Text>
              </TouchableOpacity>
            )}

            <Text style={styles.fieldLabel}>Rate Type</Text>
            <View style={styles.chipRow}>
              {RATE_TYPES.map((t) => (
                <TouchableOpacity key={t} style={[styles.smallChip, rateType === t && styles.smallChipActive]} onPress={() => setRateType(t)}>
                  <Text style={[styles.smallChipText, rateType === t && styles.smallChipTextActive]}>{t.replace(/_/g, " ")}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>
              Rate Value {rateType === "PERCENT_OF_REVENUE" ? "(% of revenue)" : rateType === "FLAT" ? "($)" : "(per unit)"}
            </Text>
            <TextInput value={rateValue} onChangeText={setRateValue} keyboardType="decimal-pad"
              placeholder="e.g. 5" placeholderTextColor={COLORS.textDim} style={styles.input}
            />

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput value={notes} onChangeText={setNotes} placeholder="Optional"
              placeholderTextColor={COLORS.textDim} style={styles.input}
            />

            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setEditorOpen(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={save} disabled={upsert.isPending}>
                <Text style={[styles.modalBtnText, { color: COLORS.navy }]}>{upsert.isPending ? "Saving..." : "Save Rule"}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={orgPickerOpen} animationType="slide" onRequestClose={() => setOrgPickerOpen(false)}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => setOrgPickerOpen(false)} style={styles.headerBtn}>
              <Feather name="x" size={22} color={COLORS.text} />
            </TouchableOpacity>
            <Text style={styles.title}>Select Facility</Text>
            <View style={styles.headerBtn} />
          </View>
          <TextInput placeholder="Search..." placeholderTextColor={COLORS.textDim}
            value={orgSearch} onChangeText={setOrgSearch}
            style={[styles.input, { margin: 12 }]}
          />
          <FlatList
            data={filteredOrgs}
            keyExtractor={(o: any) => o.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerRow} onPress={() => { setOrgId(item.id); setOrgPickerOpen(false); }}>
                <Text style={styles.pickerRowText}>{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: COLORS.navyBorder,
  },
  headerBtn: { padding: 6, minWidth: 34, alignItems: "center" },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  list: { padding: 12, paddingBottom: 80 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  cardLine: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase" },
  cardOrg: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text, marginTop: 2 },
  cardRate: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.emerald, marginTop: 4 },
  cardNotes: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textDim, marginTop: 4, paddingHorizontal: 32, textAlign: "center" },
  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: COLORS.navySurface, padding: 16,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderColor: COLORS.navyBorder, maxHeight: "85%",
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, marginBottom: 4 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  input: {
    backgroundColor: COLORS.navy, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  smallChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: COLORS.navy, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  smallChipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  smallChipText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  smallChipTextActive: { color: COLORS.emerald, fontFamily: "Inter_600SemiBold" },
  modalRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: COLORS.navyBorder },
  modalBtnPrimary: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  modalBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  pickerRow: { paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: COLORS.navyBorder },
  pickerRowText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
});
