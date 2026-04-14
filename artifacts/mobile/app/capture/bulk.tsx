import React, { useState, useCallback, useEffect, useMemo } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, Modal,
  ActivityIndicator, TextInput, Alert, ScrollView,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as Contacts from "expo-contacts";
import { COLORS } from "@/constants/colors";
import { parseCSV } from "@/utils/csvParser";
import {
  useNormalizeBatch, useContactsBatch, useOrganizations,
  NormalizeBatchResultItem,
} from "@/hooks/useApi";

// ── Types ─────────────────────────────────────────────────────────────────────

type ImportStatus = "ready" | "duplicate" | "needs_review";
type PhoneType = "work" | "personal";
type Phase = "source" | "contacts_picker" | "normalizing" | "review" | "saving" | "summary";

interface ImportRow {
  rowId: string;
  rawFirstName?: string;
  rawLastName?: string;
  rawEmail?: string;
  rawPhone?: string;
  rawTitle?: string;
  rawCompany?: string;
  fullName: string;
  email: string;
  phone: string;
  status: ImportStatus;
  duplicate: { id: string; fullName: string } | null;
  orgId?: string;
  orgLabel?: string;
  isIndependent: boolean;
  phoneType?: PhoneType;
  approved: boolean;
  discarded: boolean;
}

interface DeviceContact {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

interface OrgOption { id: string; name: string; }

type OrgSelection =
  | { type: "id"; id: string; label: string }
  | { type: "name"; name: string }
  | { type: "independent" };

// ── OrgPickerModal ────────────────────────────────────────────────────────────

function OrgPickerModal({
  visible, onClose, onSelect, preselectedName,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (sel: OrgSelection) => void;
  preselectedName?: string;
}) {
  const [search, setSearch] = useState(preselectedName ?? "");
  const { data: rawOrgsData } = useOrganizations();
  const orgs = (rawOrgsData as { organizations?: OrgOption[] } | undefined)?.organizations ?? [];

  const filtered = useMemo(
    () => orgs.filter((o) => o.name.toLowerCase().includes(search.toLowerCase())),
    [orgs, search],
  );

  useEffect(() => {
    if (visible) setSearch(preselectedName ?? "");
  }, [visible, preselectedName]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ms.overlay}>
        <View style={ms.sheet}>
          <View style={ms.sheetHead}>
            <Text style={ms.sheetTitle}>Assign Organization</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={ms.search}
            placeholder="Search or enter org name…"
            placeholderTextColor={COLORS.textDim}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={ms.orgRow} onPress={() => onSelect({ type: "independent" })}>
              <Feather name="user" size={15} color={COLORS.emerald} />
              <Text style={[ms.orgRowTxt, { color: COLORS.emerald }]}>Independent (No Org)</Text>
            </TouchableOpacity>
            {search.trim().length > 0 && !filtered.find((o) => o.name.toLowerCase() === search.toLowerCase()) && (
              <TouchableOpacity
                style={ms.orgRow}
                onPress={() => onSelect({ type: "name", name: search.trim() })}
              >
                <Feather name="plus-circle" size={15} color={COLORS.cyan} />
                <Text style={[ms.orgRowTxt, { color: COLORS.cyan }]}>Create "{search.trim()}"</Text>
              </TouchableOpacity>
            )}
            {filtered.map((o) => (
              <TouchableOpacity
                key={o.id}
                style={ms.orgRow}
                onPress={() => onSelect({ type: "id", id: o.id, label: o.name })}
              >
                <Feather name="briefcase" size={15} color={COLORS.textMuted} />
                <Text style={ms.orgRowTxt}>{o.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── ReviewRow ─────────────────────────────────────────────────────────────────

function ReviewRow({
  row, selected, onToggleSelect, onApprove, onDiscard, onOpenOrgPicker, onSetPhoneType,
}: {
  row: ImportRow;
  selected: boolean;
  onToggleSelect: () => void;
  onApprove: () => void;
  onDiscard: () => void;
  onOpenOrgPicker: () => void;
  onSetPhoneType: (t: PhoneType) => void;
}) {
  const isDuplicate = row.status === "duplicate";
  const isNeedsReview = row.status === "needs_review";
  const statusColor = isDuplicate ? COLORS.amber : isNeedsReview ? COLORS.purple : COLORS.emerald;
  const statusLabel = isDuplicate ? "duplicate" : isNeedsReview ? "review" : "ready";
  const orgLabel = row.isIndependent ? "Independent" : row.orgId ? row.orgLabel ?? "Org" : row.orgLabel ?? "Assign org";
  const orgColor = row.isIndependent || row.orgId || row.orgLabel ? COLORS.textMuted : COLORS.amber;

  if (row.discarded) {
    return (
      <View style={[rr.card, rr.discarded]}>
        <View style={rr.nameRow}>
          <Text style={[rr.name, { color: COLORS.textDim, textDecorationLine: "line-through" }]}>{row.fullName}</Text>
          <Text style={[rr.badge, { backgroundColor: COLORS.textDim + "33", color: COLORS.textDim }]}>discarded</Text>
        </View>
        <TouchableOpacity onPress={onApprove}><Text style={rr.undoTxt}>Undo</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[rr.card, row.approved && rr.approvedCard]}>
      <View style={rr.topRow}>
        <TouchableOpacity onPress={onToggleSelect} style={rr.checkbox}>
          <Feather
            name={selected ? "check-square" : "square"}
            size={18}
            color={selected ? COLORS.emerald : COLORS.navyBorder}
          />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <View style={rr.nameRow}>
            <Text style={rr.name} numberOfLines={1}>{row.fullName}</Text>
            <View style={[rr.statusPill, { backgroundColor: statusColor + "22" }]}>
              <Text style={[rr.badge, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
          {(row.email || row.phone) && (
            <Text style={rr.sub} numberOfLines={1}>
              {[row.email, row.phone].filter(Boolean).join("  ·  ")}
            </Text>
          )}
        </View>
      </View>

      {isDuplicate && row.duplicate && (
        <View style={rr.dupWarn}>
          <Feather name="alert-triangle" size={13} color={COLORS.amber} />
          <Text style={rr.dupTxt}>Matches "{row.duplicate.fullName}" already in contacts.</Text>
        </View>
      )}

      <View style={rr.fieldRow}>
        <TouchableOpacity style={[rr.orgBtn, { borderColor: orgColor }]} onPress={onOpenOrgPicker}>
          <Feather name="briefcase" size={12} color={orgColor} />
          <Text style={[rr.fieldTxt, { color: orgColor }]} numberOfLines={1}>{orgLabel}</Text>
          <Feather name="chevron-down" size={12} color={orgColor} />
        </TouchableOpacity>
        {row.phone ? (
          <View style={rr.phonePills}>
            {(["work", "personal"] as PhoneType[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[rr.pill, row.phoneType === t && rr.pillActive]}
                onPress={() => onSetPhoneType(t)}
              >
                <Text style={[rr.pillTxt, row.phoneType === t && rr.pillTxtActive]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>

      <View style={rr.actionRow}>
        {row.approved ? (
          <View style={rr.approvedBadge}>
            <Feather name="check-circle" size={13} color={COLORS.emerald} />
            <Text style={rr.approvedTxt}>Approved</Text>
          </View>
        ) : (
          <TouchableOpacity style={rr.approveBtn} onPress={onApprove}>
            <Feather name="check" size={13} color={COLORS.white} />
            <Text style={rr.approveTxt}>{isDuplicate ? "Force-Approve" : "Approve"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={rr.discardBtn} onPress={onDiscard}>
          <Feather name="trash-2" size={13} color={COLORS.red} />
          <Text style={rr.discardTxt}>Discard</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── ContactsPickerView ────────────────────────────────────────────────────────

function ContactsPickerView({
  onConfirm, onBack,
}: {
  onConfirm: (contacts: DeviceContact[]) => void;
  onBack: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setError("Contacts permission denied. Enable it in Settings to use this feature.");
        setLoading(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.FirstName, Contacts.Fields.LastName,
          Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers,
        ],
        sort: Contacts.SortTypes.FirstName,
      });
      const mapped: DeviceContact[] = data
        .filter((c) => c.firstName || c.lastName || (c.emails && c.emails.length > 0))
        .map((c) => ({
          id: c.id ?? Math.random().toString(36),
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unknown",
          firstName: c.firstName ?? undefined,
          lastName: c.lastName ?? undefined,
          email: c.emails?.[0]?.email ?? undefined,
          phone: c.phoneNumbers?.[0]?.number ?? undefined,
        }));
      setDeviceContacts(mapped);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(
    () => deviceContacts.filter(
      (c) => c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.email ?? "").toLowerCase().includes(search.toLowerCase()),
    ),
    [deviceContacts, search],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((c) => c.id)));
  }, [filtered, selected.size]);

  if (loading) {
    return (
      <View style={cp.center}>
        <ActivityIndicator color={COLORS.emerald} />
        <Text style={cp.loadTxt}>Loading contacts…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={cp.center}>
        <Feather name="alert-circle" size={36} color={COLORS.amber} />
        <Text style={cp.errorTxt}>{error}</Text>
        <TouchableOpacity style={cp.backBtn} onPress={onBack}>
          <Text style={cp.backBtnTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TextInput
        style={cp.search}
        placeholder="Search contacts…"
        placeholderTextColor={COLORS.textDim}
        value={search}
        onChangeText={setSearch}
      />
      <TouchableOpacity style={cp.selectAll} onPress={toggleAll}>
        <Feather
          name={selected.size === filtered.length && filtered.length > 0 ? "check-square" : "square"}
          size={16} color={COLORS.emerald}
        />
        <Text style={cp.selectAllTxt}>
          {selected.size === filtered.length && filtered.length > 0 ? "Deselect All" : "Select All"}
        </Text>
        <Text style={cp.selectCount}>{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} contacts`}</Text>
      </TouchableOpacity>
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        renderItem={({ item: c }) => (
          <TouchableOpacity style={cp.row} onPress={() => toggle(c.id)}>
            <Feather
              name={selected.has(c.id) ? "check-square" : "square"}
              size={18} color={selected.has(c.id) ? COLORS.emerald : COLORS.navyBorder}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={cp.rowName}>{c.name}</Text>
              {c.email ? <Text style={cp.rowSub}>{c.email}</Text> : null}
            </View>
            {c.phone ? <Text style={cp.rowPhone}>{c.phone}</Text> : null}
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 120 }}
      />
      <View style={cp.footer}>
        <TouchableOpacity style={cp.backSmBtn} onPress={onBack}>
          <Feather name="arrow-left" size={16} color={COLORS.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[cp.importBtn, selected.size === 0 && cp.disabled]}
          disabled={selected.size === 0}
          onPress={() => onConfirm(deviceContacts.filter((c) => selected.has(c.id)))}
        >
          <Text style={cp.importBtnTxt}>
            {selected.size > 0 ? `Import ${selected.size} Selected` : "Select Contacts"}
          </Text>
          <Feather name="arrow-right" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type RawContactInput = {
  name?: string; firstName?: string; lastName?: string;
  email?: string; phone?: string; title?: string; company?: string;
};

function buildRowsFromResults(
  rawList: RawContactInput[],
  results: NormalizeBatchResultItem[],
): ImportRow[] {
  return results.map((r, i) => {
    const raw = rawList[i] ?? {};
    return {
      rowId: `row-${i}-${Date.now()}`,
      rawFirstName: raw.firstName,
      rawLastName: raw.lastName,
      rawEmail: raw.email,
      rawPhone: raw.phone,
      rawTitle: raw.title,
      rawCompany: raw.company,
      fullName: r.normalized.fullName,
      email: r.normalized.email,
      phone: r.normalized.phone,
      status: r.status,
      duplicate: r.duplicate ? { id: r.duplicate.id, fullName: r.duplicate.fullName } : null,
      orgId: undefined,
      orgLabel: raw.company || undefined,
      isIndependent: false,
      phoneType: undefined,
      approved: false,
      discarded: false,
    };
  });
}

// ── BulkImportScreen ──────────────────────────────────────────────────────────

export default function BulkImportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>("source");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [orgPickerForRowId, setOrgPickerForRowId] = useState<string | null>(null);
  const [savingProgress, setSavingProgress] = useState(0);
  const [summary, setSummary] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [normalizeError, setNormalizeError] = useState<string | null>(null);

  const normalizeBatch = useNormalizeBatch();
  const contactsBatch = useContactsBatch();
  const rawListRef = React.useRef<RawContactInput[]>([]);

  const runNormalize = useCallback(async (rawList: RawContactInput[]) => {
    setPhase("normalizing");
    setNormalizeError(null);
    rawListRef.current = rawList;
    try {
      const payload = rawList.map((r) => ({
        name: r.name, firstName: r.firstName, lastName: r.lastName,
        phone: r.phone, email: r.email,
      }));
      const result = await normalizeBatch.mutateAsync({ contacts: payload });
      const built = buildRowsFromResults(rawList, result.results);
      setRows(built);
      setPhase("review");
    } catch (e: unknown) {
      setNormalizeError(e instanceof Error ? e.message : "Failed to normalize contacts.");
      setPhase("source");
    }
  }, [normalizeBatch]);

  const handlePickCSV = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["text/csv", "text/plain", "application/csv", "public.comma-separated-values-text"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const text = await fetch(asset.uri).then((r) => r.text());
      const parsed = parseCSV(text);
      if (parsed.length === 0) {
        Alert.alert("No contacts found", "The CSV had no recognizable rows. Check column headers: name, email, phone, company, title.");
        return;
      }
      await runNormalize(parsed);
    } catch (e: unknown) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not read the file.");
    }
  }, [runNormalize]);

  const handleContactsConfirm = useCallback(async (contacts: DeviceContact[]) => {
    const mapped: RawContactInput[] = contacts.map((c) => ({
      firstName: c.firstName, lastName: c.lastName,
      name: c.name, email: c.email, phone: c.phone,
    }));
    await runNormalize(mapped);
  }, [runNormalize]);

  const updateRow = useCallback((rowId: string, patch: Partial<ImportRow>) => {
    setRows((prev) => prev.map((r) => r.rowId === rowId ? { ...r, ...patch } : r));
  }, []);

  const handleApprove = useCallback((rowId: string) => {
    const row = rows.find((r) => r.rowId === rowId);
    if (!row) return;
    if (row.phone && !row.phoneType) {
      Alert.alert("Phone type required", "Set Work or Personal before approving.");
      return;
    }
    if (!row.orgId && !row.orgLabel && !row.isIndependent) {
      Alert.alert("Org required", "Assign an organization or mark as Independent first.");
      return;
    }
    updateRow(rowId, { approved: true, discarded: false });
  }, [rows, updateRow]);

  const handleApproveAllReady = useCallback(() => {
    let skipped = 0;
    setRows((prev) => prev.map((r) => {
      if (r.status !== "ready" || r.discarded) return r;
      if (r.phone && !r.phoneType) { skipped++; return r; }
      if (!r.orgId && !r.orgLabel && !r.isIndependent) { skipped++; return r; }
      return { ...r, approved: true };
    }));
    if (skipped > 0) {
      Alert.alert("Some rows skipped", `${skipped} row${skipped > 1 ? "s" : ""} still need org/phone-type assignment.`);
    }
  }, []);

  const handleDiscardDuplicates = useCallback(() => {
    setRows((prev) => prev.map((r) =>
      r.status === "duplicate" ? { ...r, discarded: true, approved: false } : r,
    ));
  }, []);

  const handleOrgSelect = useCallback((sel: OrgSelection) => {
    const patch: Partial<ImportRow> =
      sel.type === "independent" ? { isIndependent: true, orgId: undefined, orgLabel: undefined }
      : sel.type === "id" ? { isIndependent: false, orgId: sel.id, orgLabel: sel.label }
      : { isIndependent: false, orgId: undefined, orgLabel: sel.name };

    if (orgPickerForRowId === "__batch__") {
      setRows((prev) => prev.map((r) => selectedRowIds.has(r.rowId) ? { ...r, ...patch } : r));
    } else if (orgPickerForRowId) {
      updateRow(orgPickerForRowId, patch);
    }
    setOrgPickerForRowId(null);
  }, [orgPickerForRowId, selectedRowIds, updateRow]);

  const handleBatchPhoneType = useCallback(() => {
    Alert.alert("Set Phone Type", "Apply to all selected rows:", [
      { text: "Work", onPress: () => setRows((prev) => prev.map((r) => selectedRowIds.has(r.rowId) ? { ...r, phoneType: "work" as PhoneType } : r)) },
      { text: "Personal", onPress: () => setRows((prev) => prev.map((r) => selectedRowIds.has(r.rowId) ? { ...r, phoneType: "personal" as PhoneType } : r)) },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [selectedRowIds]);

  const handleConfirmImport = useCallback(async () => {
    const approved = rows.filter((r) => r.approved && !r.discarded);
    if (approved.length === 0) {
      Alert.alert("No rows approved", "Approve at least one contact before confirming.");
      return;
    }
    setPhase("saving");
    setSavingProgress(0);

    const payload = approved.map((r) => ({
      contact: {
        firstName: r.rawFirstName, lastName: r.rawLastName, fullName: r.fullName,
        phone: r.phone || undefined, email: r.email || undefined,
        title: r.rawTitle, source: "BULK_IMPORT",
      },
      org: r.isIndependent ? undefined
        : r.orgId ? ({ id: r.orgId } as { id: string })
        : r.orgLabel ? ({ name: r.orgLabel } as { name: string })
        : undefined,
      phoneType: r.phoneType,
      isIndependent: r.isIndependent,
      force: r.status === "duplicate",
    }));

    try {
      const CHUNK = 20;
      let created = 0; let skipped = 0; let errors = 0;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const chunk = payload.slice(i, i + CHUNK);
        const result = await contactsBatch.mutateAsync({ contacts: chunk });
        result.results.forEach((r) => {
          if (r.status === "created") created++;
          else if (r.status === "skipped") skipped++;
          else errors++;
        });
        setSavingProgress(Math.min(i + CHUNK, payload.length));
      }
      setSummary({ created, skipped, errors });
      setPhase("summary");
    } catch (e: unknown) {
      Alert.alert("Import failed", e instanceof Error ? e.message : "Unknown error");
      setPhase("review");
    }
  }, [rows, contactsBatch]);

  const approvedCount = useMemo(() => rows.filter((r) => r.approved && !r.discarded).length, [rows]);
  const readyCount = useMemo(() => rows.filter((r) => r.status === "ready" && !r.discarded && !r.approved).length, [rows]);
  const dupCount = useMemo(() => rows.filter((r) => r.status === "duplicate" && !r.discarded).length, [rows]);

  const pickerRow = orgPickerForRowId && orgPickerForRowId !== "__batch__"
    ? rows.find((r) => r.rowId === orgPickerForRowId) : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  const renderPhase = () => {
    if (phase === "source") return (
      <ScrollView contentContainerStyle={s.sourcePad}>
        {normalizeError ? (
          <View style={s.errorBanner}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={s.errorTxt}>{normalizeError}</Text>
          </View>
        ) : null}
        <Text style={s.sourceTitle}>How would you like to import?</Text>
        <TouchableOpacity style={s.sourceCard} onPress={handlePickCSV} activeOpacity={0.8}>
          <View style={[s.iconCircle, { backgroundColor: COLORS.emerald + "22" }]}>
            <Feather name="upload-cloud" size={28} color={COLORS.emerald} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Upload CSV</Text>
            <Text style={s.cardSub}>Import a spreadsheet with columns: name, email, phone, company, title.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={COLORS.textDim} />
        </TouchableOpacity>
        <TouchableOpacity style={s.sourceCard} onPress={() => setPhase("contacts_picker")} activeOpacity={0.8}>
          <View style={[s.iconCircle, { backgroundColor: COLORS.cyan + "22" }]}>
            <Feather name="users" size={28} color={COLORS.cyan} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle}>Import from Contacts</Text>
            <Text style={s.cardSub}>Pick contacts directly from your phone's address book.</Text>
          </View>
          <Feather name="chevron-right" size={18} color={COLORS.textDim} />
        </TouchableOpacity>
      </ScrollView>
    );

    if (phase === "contacts_picker") return (
      <ContactsPickerView onConfirm={handleContactsConfirm} onBack={() => setPhase("source")} />
    );

    if (phase === "normalizing") return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.emerald} />
        <Text style={s.centerTxt}>Normalizing and checking for duplicates…</Text>
      </View>
    );

    if (phase === "review") return (
      <View style={{ flex: 1 }}>
        <View style={s.reviewHeader}>
          <Text style={s.reviewCount}>{rows.length} contacts to review</Text>
          <TouchableOpacity
            style={[s.confirmBtn, approvedCount === 0 && s.confirmDisabled]}
            disabled={approvedCount === 0}
            onPress={handleConfirmImport}
          >
            <Text style={s.confirmTxt}>Confirm Import ({approvedCount})</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.rowId}
          renderItem={({ item }) => (
            <ReviewRow
              row={item}
              selected={selectedRowIds.has(item.rowId)}
              onToggleSelect={() => setSelectedRowIds((prev) => {
                const next = new Set(prev);
                if (next.has(item.rowId)) next.delete(item.rowId); else next.add(item.rowId);
                return next;
              })}
              onApprove={() => handleApprove(item.rowId)}
              onDiscard={() => updateRow(item.rowId, { discarded: true, approved: false })}
              onOpenOrgPicker={() => setOrgPickerForRowId(item.rowId)}
              onSetPhoneType={(t) => updateRow(item.rowId, { phoneType: t })}
            />
          )}
          contentContainerStyle={{ paddingBottom: 160, paddingHorizontal: 16 }}
        />
        <View style={[s.batchBar, { paddingBottom: insets.bottom + 8 }]}>
          {selectedRowIds.size > 0 && (
            <View style={s.batchRow}>
              <TouchableOpacity style={s.batchBtn} onPress={() => setOrgPickerForRowId("__batch__")}>
                <Feather name="briefcase" size={13} color={COLORS.cyan} />
                <Text style={[s.batchTxt, { color: COLORS.cyan }]}>Assign Org ({selectedRowIds.size})</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.batchBtn} onPress={handleBatchPhoneType}>
                <Feather name="phone" size={13} color={COLORS.cyan} />
                <Text style={[s.batchTxt, { color: COLORS.cyan }]}>Set Phone Type</Text>
              </TouchableOpacity>
            </View>
          )}
          <View style={s.batchRow}>
            {readyCount > 0 && (
              <TouchableOpacity style={s.batchBtn} onPress={handleApproveAllReady}>
                <Feather name="check-circle" size={13} color={COLORS.emerald} />
                <Text style={[s.batchTxt, { color: COLORS.emerald }]}>Approve All Ready ({readyCount})</Text>
              </TouchableOpacity>
            )}
            {dupCount > 0 && (
              <TouchableOpacity style={s.batchBtn} onPress={handleDiscardDuplicates}>
                <Feather name="trash-2" size={13} color={COLORS.amber} />
                <Text style={[s.batchTxt, { color: COLORS.amber }]}>Discard Duplicates ({dupCount})</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );

    if (phase === "saving") {
      const total = rows.filter((r) => r.approved && !r.discarded).length;
      return (
        <View style={s.center}>
          <ActivityIndicator size="large" color={COLORS.emerald} />
          <Text style={s.centerTxt}>Saving {Math.min(savingProgress, total)} of {total}…</Text>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${total ? (savingProgress / total) * 100 : 0}%` as `${number}%` }]} />
          </View>
        </View>
      );
    }

    if (phase === "summary" && summary) return (
      <View style={s.center}>
        <View style={[s.iconCircle, { backgroundColor: COLORS.emerald + "22", width: 80, height: 80, borderRadius: 40 }]}>
          <Feather name="check-circle" size={36} color={COLORS.emerald} />
        </View>
        <Text style={s.summaryTitle}>Import Complete</Text>
        <View style={s.summaryStats}>
          <View style={s.stat}>
            <Text style={s.statNum}>{summary.created}</Text>
            <Text style={s.statLabel}>Created</Text>
          </View>
          <View style={s.stat}>
            <Text style={[s.statNum, { color: COLORS.textMuted }]}>{summary.skipped}</Text>
            <Text style={s.statLabel}>Skipped</Text>
          </View>
          {summary.errors > 0 && (
            <View style={s.stat}>
              <Text style={[s.statNum, { color: COLORS.red }]}>{summary.errors}</Text>
              <Text style={s.statLabel}>Errors</Text>
            </View>
          )}
        </View>
        <TouchableOpacity
          style={s.viewContactsBtn}
          onPress={() => router.replace("/(tabs)/contacts" as never)}
        >
          <Feather name="users" size={16} color={COLORS.white} />
          <Text style={s.viewContactsTxt}>View Contacts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.doneLink} onPress={() => router.back()}>
          <Text style={s.doneLinkTxt}>Done</Text>
        </TouchableOpacity>
      </View>
    );

    return null;
  };

  return (
    <View style={s.container}>
      <Stack.Screen
        options={{
          title: phase === "review" ? "Review Import"
            : phase === "contacts_picker" ? "Select Contacts"
            : "Bulk Import",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        }}
      />
      {renderPhase()}
      <OrgPickerModal
        visible={!!orgPickerForRowId}
        onClose={() => setOrgPickerForRowId(null)}
        onSelect={handleOrgSelect}
        preselectedName={pickerRow?.orgLabel}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  centerTxt: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
  errorBanner: {
    flexDirection: "row", gap: 8, backgroundColor: COLORS.red + "22",
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  errorTxt: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, flex: 1 },
  sourcePad: { padding: 20, gap: 16 },
  sourceTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: COLORS.text, marginBottom: 4 },
  sourceCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: COLORS.navyMid, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  iconCircle: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.text, marginBottom: 2 },
  cardSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  reviewHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  reviewCount: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.textMuted },
  confirmBtn: { backgroundColor: COLORS.emerald, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  confirmDisabled: { backgroundColor: COLORS.navySurface },
  confirmTxt: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.white },
  batchBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: COLORS.navyMid, borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
    paddingTop: 10, paddingHorizontal: 16, gap: 6,
  },
  batchRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  batchBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: COLORS.navySurface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
  },
  batchTxt: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  progressBar: { width: "100%", height: 4, backgroundColor: COLORS.navySurface, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: 4, backgroundColor: COLORS.emerald, borderRadius: 2 },
  summaryTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  summaryStats: { flexDirection: "row", gap: 24 },
  stat: { alignItems: "center", gap: 4 },
  statNum: { fontFamily: "Inter_700Bold", fontSize: 28, color: COLORS.emerald },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  viewContactsBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.emerald, borderRadius: 14,
    paddingHorizontal: 24, paddingVertical: 14, marginTop: 8,
  },
  viewContactsTxt: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.white },
  doneLink: { marginTop: 4 },
  doneLinkTxt: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
});

const rr = StyleSheet.create({
  card: {
    backgroundColor: COLORS.navyMid, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder, gap: 8,
  },
  approvedCard: { borderColor: COLORS.emerald + "44" },
  discarded: { opacity: 0.5 },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  checkbox: { paddingTop: 2 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text, flex: 1 },
  statusPill: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badge: { fontFamily: "Inter_600SemiBold", fontSize: 11 },
  sub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  dupWarn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.amber + "15", borderRadius: 8, padding: 8,
  },
  dupTxt: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.amber, flex: 1 },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  orgBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 200,
  },
  fieldTxt: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1 },
  phonePills: { flexDirection: "row", gap: 4 },
  pill: {
    borderWidth: 1, borderColor: COLORS.navyBorder, borderRadius: 6,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  pillActive: { backgroundColor: COLORS.cyan + "22", borderColor: COLORS.cyan },
  pillTxt: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  pillTxtActive: { color: COLORS.cyan, fontFamily: "Inter_600SemiBold" },
  actionRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  approveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, backgroundColor: COLORS.emerald, borderRadius: 9, paddingVertical: 8,
  },
  approveTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.white },
  approvedBadge: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, backgroundColor: COLORS.emerald + "22", borderRadius: 9, paddingVertical: 8,
  },
  approvedTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald },
  discardBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9,
    backgroundColor: COLORS.red + "15",
  },
  discardTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.red },
  undoTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.cyan, textAlign: "right" },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.navyMid, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 16, paddingHorizontal: 16, paddingBottom: 32,
  },
  sheetHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12,
  },
  sheetTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.text },
  search: {
    backgroundColor: COLORS.navySurface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text, marginBottom: 8,
  },
  orgRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  orgRowTxt: { fontFamily: "Inter_400Regular", fontSize: 15, color: COLORS.text, flex: 1 },
});

const cp = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  loadTxt: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },
  errorTxt: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.amber, textAlign: "center" },
  backBtn: { backgroundColor: COLORS.navySurface, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  backBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  search: {
    margin: 12, backgroundColor: COLORS.navySurface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text,
  },
  selectAll: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  selectAllTxt: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald },
  selectCount: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginLeft: "auto" },
  row: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  rowName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  rowSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  rowPhone: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim },
  footer: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyMid, borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
    padding: 16,
  },
  backSmBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.navySurface, alignItems: "center", justifyContent: "center",
  },
  importBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.emerald, borderRadius: 12, paddingVertical: 13,
  },
  disabled: { backgroundColor: COLORS.navySurface },
  importBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.white },
});
