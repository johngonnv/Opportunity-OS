import React, { useState, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, RefreshControl,
  Modal, TextInput, KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

type RecordRow = {
  id: string;
  lineOfService: string;
  periodKey: string;
  organizationId: string | null;
  ownerRepUserId: string;
  amount: number;
  status: string;
  description: string | null;
  organizationName: string | null;
  ownerFirstName: string | null;
  ownerLastName: string | null;
};
type LedgerRow = {
  id: string;
  organizationId: string;
  netRevenue: number;
  notes: string | null;
  source: string;
  organizationName: string | null;
};
type RuleRow = {
  id: string;
  lineOfService: import("@/hooks/useApi").CommissionLine;
  organizationId: string | null;
  rateType: "PERCENT_OF_REVENUE" | "FLAT" | "PER_UNIT";
  rateValue: number;
  notes: string | null;
};
type OrgRow = { id: string; name: string; city?: string | null; state?: string | null };
type AdjustmentRow = { id: string; deltaAmount: number; reason: string; createdAt: string };
type PeriodRow = { id: string; lineOfService: string; periodKey: string; isLocked: number };

import {
  useCommissionLedger, useUpsertLedgerEntry, useDeleteLedgerEntry, useBulkLedgerUpload,
  useOrganizations, useCommissionRole,
} from "@/hooks/useApi";

function currentPeriodKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function previousPeriodKeys(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}

export default function LedgerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: roleData } = useCommissionRole();
  const role = roleData?.role ?? null;
  const isAdmin = role === "OWNER" || role === "ADMIN";

  const [period, setPeriod] = useState(currentPeriodKey());
  const { data, isLoading, refetch, isRefetching } = useCommissionLedger({ periodKey: period });
  const { data: orgsData } = useOrganizations({ limit: "500" });

  const upsert = useUpsertLedgerEntry();
  const del = useDeleteLedgerEntry();
  const bulk = useBulkLedgerUpload();

  const [editorOpen, setEditorOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [orgPickerOpen, setOrgPickerOpen] = useState(false);
  const [orgSearch, setOrgSearch] = useState("");
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [revenue, setRevenue] = useState("");
  const [notes, setNotes] = useState("");
  const [csvText, setCsvText] = useState("");

  const periods = previousPeriodKeys(6);
  const entries: LedgerRow[] = (data?.entries ?? []) as LedgerRow[];
  const totalRevenue = useMemo(() => entries.reduce((s, e) => s + Number(e.netRevenue || 0), 0), [entries]);

  const orgs: OrgRow[] = (orgsData?.organizations ?? []) as OrgRow[];
  const filteredOrgs = orgSearch
    ? orgs.filter((o: OrgRow) => o.name?.toLowerCase().includes(orgSearch.toLowerCase()))
    : orgs;
  const selectedOrg = orgs.find((o: OrgRow) => o.id === selectedOrgId);

  function openEditor() {
    setSelectedOrgId(null); setRevenue(""); setNotes(""); setEditorOpen(true);
  }
  function saveEntry() {
    if (!selectedOrgId) { Alert.alert("Select facility"); return; }
    const r = parseFloat(revenue);
    if (Number.isNaN(r)) { Alert.alert("Invalid revenue"); return; }
    upsert.mutate({ organizationId: selectedOrgId, periodKey: period, netRevenue: r, notes: notes.trim() || undefined }, {
      onSuccess: () => { setEditorOpen(false); refetch(); },
      onError: (e) => Alert.alert("Save failed", e.message),
    });
  }
  function deleteEntry(id: string) {
    Alert.alert("Delete entry?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => del.mutate(id, {
        onSuccess: () => refetch(),
        onError: (e) => Alert.alert("Delete failed", e.message),
      })},
    ]);
  }
  function processCsv() {
    // Format per row: facilityId,periodMonth,netRevenue[,notes]  -- periodMonth is YYYY-MM
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsed: Array<{ organizationId: string; periodKey: string; netRevenue: number; notes?: string }> = [];
    const errors: string[] = [];
    lines.forEach((line, i) => {
      const parts = line.split(",").map(p => p.trim());
      if (parts.length < 3) { errors.push(`Line ${i + 1}: need facilityId,periodMonth,netRevenue`); return; }
      const [facilityId, periodMonth, rev, ...rest] = parts;
      if (!/^\d{4}-\d{2}$/.test(periodMonth)) { errors.push(`Line ${i + 1}: bad periodMonth "${periodMonth}" (need YYYY-MM)`); return; }
      const num = parseFloat(rev);
      if (Number.isNaN(num)) { errors.push(`Line ${i + 1}: bad revenue "${rev}"`); return; }
      parsed.push({ organizationId: facilityId, periodKey: periodMonth, netRevenue: num, notes: rest.join(",") || undefined });
    });
    if (errors.length > 0) {
      Alert.alert("Parse errors", errors.slice(0, 5).join("\n") + (errors.length > 5 ? `\n+${errors.length - 5} more` : ""));
      return;
    }
    if (parsed.length === 0) { Alert.alert("No rows"); return; }
    bulk.mutate({ entries: parsed }, {
      onSuccess: (r) => {
        const errMsg = r.errors.length > 0 ? `\n${r.errors.length} failed.` : "";
        Alert.alert("Upload done", `Saved: ${r.ok}${errMsg}`);
        setBulkOpen(false); setCsvText(""); refetch();
      },
      onError: (e) => Alert.alert("Upload failed", e.message),
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="chevron-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Facility Ledger</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
        {periods.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, period === p && styles.chipActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.chipText, period === p && styles.chipTextActive]}>{p}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.kpiStrip}>
        <View style={styles.kpiItem}>
          <Text style={styles.kpiValue}>{entries.length}</Text>
          <Text style={styles.kpiLabel}>Entries</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, { color: COLORS.emerald }]}>{fmt(totalRevenue)}</Text>
          <Text style={styles.kpiLabel}>Total Revenue {period}</Text>
        </View>
      </View>

      {isAdmin && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={openEditor}>
            <Feather name="plus" size={14} color={COLORS.emerald} />
            <Text style={styles.actionBtnText}>Add Entry</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => setBulkOpen(true)}>
            <Feather name="upload" size={14} color={COLORS.cyan} />
            <Text style={styles.actionBtnText}>Bulk Upload</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="dollar-sign" size={28} color={COLORS.textDim} />
            <Text style={styles.emptyText}>{isLoading ? "Loading..." : `No revenue recorded for ${period}`}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowOrg}>{item.organizationName ?? "—"}</Text>
              <Text style={styles.rowMeta}>
                {item.source} {item.notes ? `· ${item.notes}` : ""}
              </Text>
            </View>
            <Text style={styles.rowAmount}>{fmt(Number(item.netRevenue))}</Text>
            {isAdmin && (
              <TouchableOpacity onPress={() => deleteEntry(item.id)} style={{ paddingHorizontal: 6 }}>
                <Feather name="trash-2" size={14} color={COLORS.red} />
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {/* Single-entry editor */}
      <Modal visible={editorOpen} transparent animationType="slide" onRequestClose={() => setEditorOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Revenue Entry · {period}</Text>
            <TouchableOpacity style={styles.input} onPress={() => setOrgPickerOpen(true)}>
              <Text style={{ fontFamily: "Inter_500Medium", fontSize: 13, color: selectedOrg ? COLORS.text : COLORS.textDim }}>
                {selectedOrg ? selectedOrg.name : "Select facility..."}
              </Text>
            </TouchableOpacity>
            <TextInput placeholder="Net revenue" placeholderTextColor={COLORS.textDim}
              value={revenue} onChangeText={setRevenue} keyboardType="decimal-pad"
              style={styles.input}
            />
            <TextInput placeholder="Notes (optional)" placeholderTextColor={COLORS.textDim}
              value={notes} onChangeText={setNotes}
              style={styles.input}
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setEditorOpen(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={saveEntry} disabled={upsert.isPending}>
                <Text style={[styles.modalBtnText, { color: COLORS.navy }]}>{upsert.isPending ? "Saving..." : "Save"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Org picker */}
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
            keyExtractor={(o: OrgRow) => o.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pickerRow} onPress={() => { setSelectedOrgId(item.id); setOrgPickerOpen(false); }}>
                <Text style={styles.pickerRowText}>{item.name}</Text>
                {[item.city, item.state].filter(Boolean).length > 0 && (
                  <Text style={styles.pickerRowMeta}>{[item.city, item.state].filter(Boolean).join(", ")}</Text>
                )}
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>

      {/* Bulk CSV upload */}
      <Modal visible={bulkOpen} transparent animationType="slide" onRequestClose={() => setBulkOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <View style={[styles.modalCard, { maxHeight: "80%" }]}>
            <Text style={styles.modalTitle}>Bulk Upload · {period}</Text>
            <Text style={styles.modalSub}>One row per line: facilityId,periodMonth,netRevenue[,notes]</Text>
            <TextInput
              placeholder={"facility-id-1,2026-04,12500\nfacility-id-2,2026-04,8200,Q1 final"}
              placeholderTextColor={COLORS.textDim}
              value={csvText} onChangeText={setCsvText}
              style={[styles.input, { height: 200, textAlignVertical: "top" }]}
              multiline
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setBulkOpen(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={processCsv} disabled={bulk.isPending}>
                <Text style={[styles.modalBtnText, { color: COLORS.navy }]}>{bulk.isPending ? "Uploading..." : "Upload"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
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
  headerBtn: { padding: 6, minWidth: 34 },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  chipsRow: { maxHeight: 44, flexGrow: 0 },
  chipsContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  chipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.emerald, fontFamily: "Inter_600SemiBold" },
  kpiStrip: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    marginHorizontal: 12, marginTop: 4, marginBottom: 8,
    backgroundColor: COLORS.navySurface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, paddingVertical: 10,
  },
  kpiItem: { flex: 1, alignItems: "center" },
  kpiValue: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  kpiLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  kpiDivider: { width: 1, height: 28, backgroundColor: COLORS.navyBorder },
  actionRow: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  actionBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  list: { paddingHorizontal: 12, paddingBottom: 100 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.navyCard, borderRadius: 10, padding: 12, marginBottom: 6,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  rowOrg: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  rowMeta: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 2 },
  rowAmount: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.emerald },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textDim, marginTop: 4 },
  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: COLORS.navySurface, padding: 16,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderColor: COLORS.navyBorder, gap: 10,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  input: {
    backgroundColor: COLORS.navy, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text,
  },
  modalRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: COLORS.navyBorder },
  modalBtnPrimary: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  modalBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  pickerRow: {
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderColor: COLORS.navyBorder,
  },
  pickerRowText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  pickerRowMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 2 },
});
