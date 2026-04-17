import React, { useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, RefreshControl, Alert, Linking,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";


type RecordRow = {
  id: string; lineOfService: string; periodKey: string; organizationId: string | null;
  ownerRepUserId: string; amount: number; status: string; description: string | null;
  organizationName: string | null; ownerFirstName: string | null; ownerLastName: string | null;
};
type PeriodRow = { id: string; lineOfService: string; periodKey: string; isLocked: number };

import {
  useCommissionRole, useCommissionRecords, useCommissionPeriods,
  useCalculateCommissions, useLockPeriod, useUnlockPeriod, useCommissionKpi,
  getCommissionsExportUrl,
  type CommissionLine, type CommissionStatus,
} from "@/hooks/useApi";

const LINE_LABELS: Record<CommissionLine, string> = {
  EMS_INTERFACILITY: "EMS Interfacility",
  EVENT_STAFFING: "Event Staffing",
  EMT_PROGRAM: "EMT Program",
  GOVERNMENT: "Government",
};

const STATUS_COLORS: Record<CommissionStatus, string> = {
  DRAFT: COLORS.textMuted,
  APPROVED: COLORS.blue,
  LOCKED: COLORS.amber,
  PAID: COLORS.emerald,
  ADJUSTED: COLORS.purple,
};

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

export default function CommissionsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: roleData } = useCommissionRole();
  const role = roleData?.role ?? null;
  const isAdmin = role === "OWNER" || role === "ADMIN";
  const isManagerOrAbove = isAdmin || role === "MANAGER";

  const [period, setPeriod] = useState(currentPeriodKey());
  const [line, setLine] = useState<CommissionLine | "ALL">("ALL");

  const params: Record<string, string> = { periodKey: period };
  if (line !== "ALL") params.lineOfService = line;

  const { data: recordsData, isLoading, refetch, isRefetching } = useCommissionRecords(params);
  const { data: kpi } = useCommissionKpi(period);
  const { data: periodsData } = useCommissionPeriods();

  const calc = useCalculateCommissions();
  const lockMut = useLockPeriod();
  const unlockMut = useUnlockPeriod();

  const periods = previousPeriodKeys(6);

  const records: RecordRow[] = (recordsData?.records ?? []) as RecordRow[];
  const totals = recordsData?.totals ?? { count: 0, total: 0, byStatus: {} };

  const emsLockState = useMemo(() => {
    const found = (periodsData?.periods ?? []).find(
      (p: PeriodRow) => p.lineOfService === "EMS_INTERFACILITY" && p.periodKey === period,
    );
    return found?.isLocked === 1;
  }, [periodsData, period]);

  function handleCalculate() {
    if (!isAdmin) return;
    if (emsLockState) {
      Alert.alert("Period locked", "Unlock the EMS Interfacility period before recalculating.");
      return;
    }
    calc.mutate({ periodKey: period }, {
      onSuccess: (r) => {
        const missingMsg = r.missing.length > 0 ? `\n\n${r.missing.length} facility(s) skipped (no rule or owner).` : "";
        Alert.alert(
          "Calculation done",
          `Created: ${r.created}\nUpdated: ${r.updated}\nSkipped (already approved+): ${r.skipped}${missingMsg}`,
        );
      },
      onError: (e) => Alert.alert("Calculation failed", e.message),
    });
  }

  function handleToggleLock() {
    if (!isAdmin) return;
    const verb = emsLockState ? "Unlock" : "Lock";
    Alert.alert(
      `${verb} EMS Interfacility ${period}?`,
      emsLockState
        ? "This will revert LOCKED records back to APPROVED so they can be re-approved or recalculated."
        : "This will lock all APPROVED records for the period and prevent further calculation.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: verb, style: "destructive",
          onPress: () => {
            const m = emsLockState ? unlockMut : lockMut;
            m.mutate({ line: "EMS_INTERFACILITY", periodKey: period }, {
              onError: (e) => Alert.alert(`${verb} failed`, e.message),
            });
          },
        },
      ],
    );
  }

  function handleExport() {
    const exportParams: Record<string, string> = { periodKey: period };
    if (line !== "ALL") exportParams.lineOfService = line;
    const url = getCommissionsExportUrl(exportParams);
    Linking.openURL(url).catch(() => Alert.alert("Open failed", "Could not open export URL"));
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Feather name="chevron-left" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Commissions</Text>
        <TouchableOpacity onPress={handleExport} style={styles.headerBtn}>
          <Feather name="download" size={18} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {role && (
        <View style={styles.roleStrip}>
          <Feather
            name={isAdmin ? "shield" : role === "MANAGER" ? "eye" : "user"}
            size={12}
            color={isAdmin ? COLORS.emerald : role === "MANAGER" ? COLORS.cyan : COLORS.textMuted}
          />
          <Text style={styles.roleText}>
            {isAdmin ? "Admin · full access" : role === "MANAGER" ? "Manager · read-only" : "Rep · your records"}
          </Text>
        </View>
      )}

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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow} contentContainerStyle={styles.chipsContent}>
        {(["ALL", "EMS_INTERFACILITY", "EVENT_STAFFING", "EMT_PROGRAM", "GOVERNMENT"] as const).map((k: CommissionLine | "ALL") => (
          <TouchableOpacity
            key={k}
            style={[styles.lineChip, line === k && styles.lineChipActive]}
            onPress={() => setLine(k)}
          >
            <Text style={[styles.lineChipText, line === k && styles.lineChipTextActive]}>
              {k === "ALL" ? "All Lines" : LINE_LABELS[k as CommissionLine]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.kpiStrip}>
        <View style={styles.kpiItem}>
          <Text style={styles.kpiValue}>{fmt(totals.total)}</Text>
          <Text style={styles.kpiLabel}>Total {period}</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, { color: COLORS.emerald }]}>{fmt(totals.byStatus?.PAID ?? 0)}</Text>
          <Text style={styles.kpiLabel}>Paid</Text>
        </View>
        <View style={styles.kpiDivider} />
        <View style={styles.kpiItem}>
          <Text style={[styles.kpiValue, { color: COLORS.amber }]}>{fmt((totals.byStatus?.APPROVED ?? 0) + (totals.byStatus?.LOCKED ?? 0) + (totals.byStatus?.ADJUSTED ?? 0))}</Text>
          <Text style={styles.kpiLabel}>Pending</Text>
        </View>
      </View>

      {isManagerOrAbove && kpi?.ranking && kpi.ranking.length > 0 && (
        <View style={styles.rollup}>
          <View style={styles.rollupHeader}>
            <Feather name="bar-chart-2" size={12} color={COLORS.cyan} />
            <Text style={styles.rollupTitle}>Team Rollup · {period}</Text>
            <Text style={styles.rollupTeamTotal}>{fmt(kpi.teamMtdTotal ?? 0)} MTD · {fmt(kpi.teamYtdTotal ?? 0)} YTD</Text>
          </View>
          {kpi.ranking.slice(0, 3).map((r, idx) => {
            const name = [r.firstName, r.lastName].filter(Boolean).join(" ") || r.ownerRepUserId.slice(0, 6);
            return (
              <View key={r.ownerRepUserId} style={styles.rollupRow}>
                <Text style={styles.rollupRank}>#{idx + 1}</Text>
                <Text style={styles.rollupName} numberOfLines={1}>{name}</Text>
                <Text style={styles.rollupAmt}>{fmt(r.mtd)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {isAdmin && (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push("/commissions/ledger")}>
            <Feather name="dollar-sign" size={14} color={COLORS.cyan} />
            <Text style={styles.actionBtnText}>Ledger</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push("/commissions/rules")}>
            <Feather name="settings" size={14} color={COLORS.blue} />
            <Text style={styles.actionBtnText}>Rules</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, calc.isPending && { opacity: 0.5 }]}
            onPress={handleCalculate}
            disabled={calc.isPending}
          >
            <Feather name="refresh-cw" size={14} color={COLORS.emerald} />
            <Text style={styles.actionBtnText}>{calc.isPending ? "Calculating..." : "Calculate EMS"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, emsLockState && { borderColor: COLORS.amber }]}
            onPress={handleToggleLock}
          >
            <Feather name={emsLockState ? "unlock" : "lock"} size={14} color={emsLockState ? COLORS.amber : COLORS.textMuted} />
            <Text style={styles.actionBtnText}>{emsLockState ? "Unlock" : "Lock"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={records}
        keyExtractor={(r) => r.id}
        style={{ flex: 1 }}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={styles.empty}><Text style={styles.emptyText}>Loading...</Text></View>
          ) : (
            <View style={styles.empty}>
              <Feather name="inbox" size={28} color={COLORS.textDim} />
              <Text style={styles.emptyText}>No records for {period}</Text>
              {isAdmin && (
                <Text style={styles.emptyHint}>
                  Add facility revenue in Ledger, then tap "Calculate EMS".
                </Text>
              )}
            </View>
          )
        }
        renderItem={({ item }) => {
          const repName = [item.ownerFirstName, item.ownerLastName].filter(Boolean).join(" ") || "—";
          return (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/commissions/${item.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.cardLeft}>
                <Text style={styles.cardLine}>{LINE_LABELS[item.lineOfService as CommissionLine] ?? item.lineOfService}</Text>
                <Text style={styles.cardOrg} numberOfLines={1}>
                  {item.organizationName || item.description || "—"}
                </Text>
                <Text style={styles.cardRep} numberOfLines={1}>Rep: {repName}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.cardAmount}>{fmt(item.amount)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_COLORS[item.status as CommissionStatus] + "22", borderColor: STATUS_COLORS[item.status as CommissionStatus] }]}>
                  <Text style={[styles.statusText, { color: STATUS_COLORS[item.status as CommissionStatus] }]}>
                    {item.status}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rollup: { marginHorizontal: 16, marginTop: 8, padding: 10, backgroundColor: COLORS.navySurface, borderRadius: 8, borderWidth: 1, borderColor: COLORS.navyBorder },
  rollupHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  rollupTitle: { color: COLORS.textMuted, fontSize: 11, fontWeight: "600", flex: 1 },
  rollupTeamTotal: { color: COLORS.cyan, fontSize: 11, fontWeight: "600" },
  rollupRow: { flexDirection: "row", alignItems: "center", paddingVertical: 3 },
  rollupRank: { width: 22, color: COLORS.textDim, fontSize: 11, fontWeight: "700" },
  rollupName: { flex: 1, color: COLORS.text, fontSize: 13 },
  rollupAmt: { color: COLORS.emerald, fontSize: 13, fontWeight: "600" },
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderColor: COLORS.navyBorder,
  },
  headerBtn: { padding: 6 },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  roleStrip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  roleText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  chipsRow: { maxHeight: 44, flexGrow: 0 },
  chipsContent: { paddingHorizontal: 12, paddingVertical: 6, gap: 6 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  chipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.emerald, fontFamily: "Inter_600SemiBold" },
  lineChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  lineChipActive: { backgroundColor: COLORS.cyan + "22", borderColor: COLORS.cyan },
  lineChipText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  lineChipTextActive: { color: COLORS.cyan, fontFamily: "Inter_600SemiBold" },
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
  actionRow: {
    flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 6, marginBottom: 8,
  },
  actionBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  actionBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  list: { paddingHorizontal: 12, paddingBottom: 100 },
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  cardLeft: { flex: 1, gap: 2 },
  cardLine: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted, textTransform: "uppercase" },
  cardOrg: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  cardRep: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
  cardRight: { alignItems: "flex-end", gap: 4 },
  cardAmount: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text },
  statusBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1,
  },
  statusText: { fontFamily: "Inter_600SemiBold", fontSize: 9, letterSpacing: 0.3 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 6 },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textDim, marginTop: 4 },
  emptyHint: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 2, paddingHorizontal: 32, textAlign: "center" },
});
