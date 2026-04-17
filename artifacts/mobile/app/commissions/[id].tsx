import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";


type AdjustmentRow = { id: string; deltaAmount: number; reason: string; createdAt: string };

import {
  useCommissionRecord, useApproveCommissionRecord, usePayCommissionRecord,
  useAdjustCommissionRecord, useCommissionRole, useOverrideCommissionRecord,
  type CommissionStatus,
} from "@/hooks/useApi";

const STATUS_COLORS: Record<CommissionStatus, string> = {
  DRAFT: COLORS.textMuted,
  APPROVED: COLORS.blue,
  LOCKED: COLORS.amber,
  PAID: COLORS.emerald,
  ADJUSTED: COLORS.purple,
};

function fmt(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);
}

export default function CommissionRecordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, isLoading, refetch } = useCommissionRecord(id!);
  const { data: roleData } = useCommissionRole();
  const role = roleData?.role ?? null;
  const isAdmin = role === "OWNER" || role === "ADMIN";

  const approve = useApproveCommissionRecord();
  const pay = usePayCommissionRecord();
  const adjust = useAdjustCommissionRecord();
  const override = useOverrideCommissionRecord();

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideNote, setOverrideNote] = useState("");

  if (isLoading || !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Header title="Commission Detail" onBack={() => router.back()} />
        <View style={styles.loading}><Text style={styles.loadingText}>Loading...</Text></View>
      </View>
    );
  }

  const r = data;
  const ownerName = r.owner ? [r.owner.firstName, r.owner.lastName].filter(Boolean).join(" ") : "—";
  const status: CommissionStatus = r.status;
  const canApprove = isAdmin && status === "DRAFT";
  const canPay = isAdmin && (status === "APPROVED" || status === "LOCKED");
  const canAdjust = isAdmin && status !== "DRAFT";
  const canOverride = isAdmin && status === "DRAFT";
  function doOverride() {
    const amt = parseFloat(overrideAmount);
    if (Number.isNaN(amt)) { Alert.alert("Invalid amount", "Enter a number."); return; }
    if (!overrideNote.trim()) { Alert.alert("Note required", "Override notes are required."); return; }
    override.mutate({ id: r.id, amount: amt, overrideNote: overrideNote.trim() }, {
      onSuccess: () => { setOverrideOpen(false); setOverrideAmount(""); setOverrideNote(""); },
      onError: (e) => Alert.alert("Override failed", e.message),
    });
  }

  function doApprove() {
    Alert.alert("Approve record?", `Mark ${fmt(r.amount)} as approved.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Approve", onPress: () => approve.mutate(id!, {
          onSuccess: () => refetch(),
          onError: (e) => Alert.alert("Approve failed", e.message),
        }),
      },
    ]);
  }
  function doPay() {
    Alert.alert("Mark as paid?", `Mark ${fmt(r.amount)} as paid.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark Paid", style: "destructive",
        onPress: () => pay.mutate(id!, {
          onSuccess: () => refetch(),
          onError: (e) => Alert.alert("Pay failed", e.message),
        }),
      },
    ]);
  }
  function doAdjust() {
    const d = parseFloat(delta);
    if (Number.isNaN(d)) { Alert.alert("Invalid delta", "Enter a number (positive or negative)."); return; }
    if (!reason.trim()) { Alert.alert("Reason required"); return; }
    adjust.mutate({ id: id!, deltaAmount: d, reason: reason.trim() }, {
      onSuccess: () => { setAdjustOpen(false); setDelta(""); setReason(""); refetch(); },
      onError: (e) => Alert.alert("Adjustment failed", e.message),
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Header title="Commission Detail" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.heroCard}>
          <Text style={styles.heroLine}>{r.lineOfService}</Text>
          <Text style={styles.heroAmount}>{fmt(r.amount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[status] + "22", borderColor: STATUS_COLORS[status] }]}>
            <Text style={[styles.statusText, { color: STATUS_COLORS[status] }]}>{status}</Text>
          </View>
          <Text style={styles.heroPeriod}>Period {r.periodKey}</Text>
        </View>

        <View style={styles.section}>
          <SectionTitle text="Calculation" />
          <Row label="Basis" value={`${r.revenueBasis} · ${fmt(r.basisAmount)}`} />
          {r.rateSnapshot != null && <Row label="Rate" value={String(r.rateSnapshot)} />}
          <Row label="Calculated at" value={r.calculatedAt ? new Date(r.calculatedAt).toLocaleString() : "—"} />
          {r.description && <Row label="Description" value={r.description} />}
        </View>

        <View style={styles.section}>
          <SectionTitle text="Assignment" />
          <Row label="Facility" value={r.organization?.name ?? "—"} />
          <Row label="Owner Rep" value={ownerName} />
          {r.owner?.email && <Row label="Email" value={r.owner.email} />}
        </View>

        <View style={styles.section}>
          <SectionTitle text="Lifecycle" />
          <Row label="Approved" value={r.approvedAt ? new Date(r.approvedAt).toLocaleString() : "—"} />
          <Row label="Paid" value={r.paidAt ? new Date(r.paidAt).toLocaleString() : "—"} />
          <Row label="Last Adjusted" value={r.lastAdjustedAt ? new Date(r.lastAdjustedAt).toLocaleString() : "—"} />
        </View>

        {r.adjustments && r.adjustments.length > 0 && (
          <View style={styles.section}>
            <SectionTitle text={`Adjustments (${r.adjustments.length})`} />
            {r.adjustments.map((a: AdjustmentRow) => (
              <View key={a.id} style={styles.adjRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.adjReason}>{a.reason}</Text>
                  <Text style={styles.adjMeta}>{new Date(a.createdAt).toLocaleString()}</Text>
                </View>
                <Text style={[styles.adjDelta, { color: a.deltaAmount >= 0 ? COLORS.emerald : COLORS.red }]}>
                  {a.deltaAmount >= 0 ? "+" : ""}{fmt(a.deltaAmount)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {isAdmin && (
          <View style={styles.actionsBlock}>
            {canApprove && (
              <TouchableOpacity style={[styles.lifeBtn, { backgroundColor: COLORS.blue + "22", borderColor: COLORS.blue }]} onPress={doApprove}>
                <Feather name="check" size={14} color={COLORS.blue} />
                <Text style={[styles.lifeBtnText, { color: COLORS.blue }]}>Approve</Text>
              </TouchableOpacity>
            )}
            {canPay && (
              <TouchableOpacity style={[styles.lifeBtn, { backgroundColor: COLORS.emerald + "22", borderColor: COLORS.emerald }]} onPress={doPay}>
                <Feather name="dollar-sign" size={14} color={COLORS.emerald} />
                <Text style={[styles.lifeBtnText, { color: COLORS.emerald }]}>Mark Paid</Text>
              </TouchableOpacity>
            )}
            {canOverride && (
              <TouchableOpacity style={[styles.actionBtn, { borderColor: COLORS.purple }]} onPress={() => { setOverrideAmount(String(r.amount)); setOverrideOpen(true); }}>
                <Feather name="edit-3" size={14} color={COLORS.purple} />
                <Text style={styles.actionBtnText}>Override</Text>
              </TouchableOpacity>
            )}
            {canAdjust && (
              <TouchableOpacity style={[styles.lifeBtn, { backgroundColor: COLORS.purple + "22", borderColor: COLORS.purple }]} onPress={() => setAdjustOpen(true)}>
                <Feather name="edit-2" size={14} color={COLORS.purple} />
                <Text style={[styles.lifeBtnText, { color: COLORS.purple }]}>Adjust</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      <Modal visible={adjustOpen} transparent animationType="slide" onRequestClose={() => setAdjustOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add Adjustment</Text>
            <Text style={styles.modalSub}>Current: {fmt(r.amount)}</Text>
            <TextInput
              placeholder="Delta (e.g. -50.00 or 25)"
              placeholderTextColor={COLORS.textDim}
              value={delta} onChangeText={setDelta} keyboardType="numbers-and-punctuation"
              style={styles.input}
            />
            <TextInput
              placeholder="Reason (required)"
              placeholderTextColor={COLORS.textDim}
              value={reason} onChangeText={setReason}
              style={[styles.input, { height: 70 }]}
              multiline
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setAdjustOpen(false)}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnPrimary]} onPress={doAdjust} disabled={adjust.isPending}>
                <Text style={[styles.modalBtnText, { color: COLORS.navy }]}>{adjust.isPending ? "Saving..." : "Save Adjustment"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={overrideOpen} transparent animationType="fade" onRequestClose={() => setOverrideOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Override Amount</Text>
            <Text style={styles.modalSub}>A note explaining this override is required for the audit log.</Text>
            <Text style={styles.modalLabel}>New amount (USD)</Text>
            <TextInput
              style={styles.modalInput}
              value={overrideAmount}
              onChangeText={setOverrideAmount}
              placeholder="0.00"
              placeholderTextColor={COLORS.textDim}
              keyboardType="decimal-pad"
            />
            <Text style={styles.modalLabel}>Override note (required)</Text>
            <TextInput
              style={[styles.modalInput, { minHeight: 60 }]}
              value={overrideNote}
              onChangeText={setOverrideNote}
              placeholder="Reason for overriding the calculated amount"
              placeholderTextColor={COLORS.textDim}
              multiline
            />
            <View style={styles.modalRow}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: COLORS.navySurface }]} onPress={() => setOverrideOpen(false)}>
                <Text style={[styles.modalBtnText, { color: COLORS.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.purple }, override.isPending && { opacity: 0.5 }]}
                onPress={doOverride}
                disabled={override.isPending}
              >
                <Text style={styles.modalBtnText}>{override.isPending ? "Saving..." : "Save Override"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
        <Feather name="chevron-left" size={22} color={COLORS.text} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.headerBtn} />

    </View>
  );
}

function SectionTitle({ text }: { text: string }) {
  return <Text style={styles.sectionTitle}>{text}</Text>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionBtnText: { color: COLORS.text, fontSize: 12, fontWeight: "600" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.navyCard, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.navyBorder },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 },
  modalLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: "600", marginTop: 10, marginBottom: 4 },
  modalInput: { color: COLORS.text, backgroundColor: COLORS.navySurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.navyBorder, fontSize: 14 },
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: COLORS.navyBorder,
  },
  headerBtn: { padding: 6, minWidth: 34 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textDim },
  body: { padding: 12, paddingBottom: 80 },
  heroCard: {
    alignItems: "center", padding: 20, borderRadius: 14,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
    marginBottom: 14,
  },
  heroLine: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted, letterSpacing: 0.5 },
  heroAmount: { fontFamily: "Inter_700Bold", fontSize: 32, color: COLORS.text, marginTop: 6 },
  heroPeriod: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim, marginTop: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, marginTop: 8 },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5 },
  section: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textMuted, marginBottom: 8, letterSpacing: 0.5, textTransform: "uppercase" },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, gap: 8 },
  rowLabel: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, flexShrink: 0 },
  rowValue: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.text, flex: 1, textAlign: "right" },
  adjRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 6,
    borderTopWidth: 1, borderColor: COLORS.navyBorder,
  },
  adjReason: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.text },
  adjMeta: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 2 },
  adjDelta: { fontFamily: "Inter_700Bold", fontSize: 13 },
  actionsBlock: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  lifeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
  },
  lifeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: COLORS.navySurface, padding: 16,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    borderTopWidth: 1, borderColor: COLORS.navyBorder, gap: 10,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  input: {
    backgroundColor: COLORS.navy, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text,
  },
  modalRow: { flexDirection: "row", gap: 8, marginTop: 6 },
  modalBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: "center", borderWidth: 1, borderColor: COLORS.navyBorder },
  modalBtnPrimary: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  modalBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
});
