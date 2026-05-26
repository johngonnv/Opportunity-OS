import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput, ScrollView,
} from "react-native";
import { confirmAction, alertMessage } from "@/utils/crossPlatformAlert";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { VerticalForm } from "@/components/admin/VerticalForm";

interface Vertical {
  id: string;
  key: string;
  label: string;
  description: string | null;
  naicsCodes: string[];
  pscCodes: string[];
  icon: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  subVerticalCount: number;
  serviceLineCount: number;
}

interface SubVertical {
  id: string;
  key: string;
  label: string;
  description: string | null;
  naicsCodes: string[];
  pscCodes: string[];
  icon: string | null;
  color: string | null;
  isActive: boolean;
  sortOrder: number;
  verticalId: string;
}

interface ServiceLine {
  id: string;
  key: string;
  label: string;
  description: string | null;
  naicsCodes: string[];
  pscCodes: string[];
  defaultPipelineTemplateKey: string | null;
  defaultConfig: Record<string, unknown>;
  isActive: boolean;
  sortOrder: number;
  verticalId: string;
  subVerticalId: string | null;
}

export default function AdminConfigScreen() {
  const { isAdminAuthenticated } = useAdminAuthContext();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedVertical, setSelectedVertical] = useState<Vertical | null>(null);

  // Form / modal state
  const [modalMode, setModalMode] = useState<null | "verticalForm" | "subs" | "services">(null);
  const [editingVertical, setEditingVertical] = useState<Vertical | null>(null);
  const [editingSub, setEditingSub] = useState<SubVertical | null>(null);
  const [editingService, setEditingService] = useState<ServiceLine | null>(null);

  // Data queries
  const {
    data: verticalsData,
    isLoading: verticalsLoading,
    refetch: refetchVerticals,
    isRefetching: verticalsRefetching,
  } = useQuery<{ verticals: Vertical[] }>({
    queryKey: ["adminVerticals"],
    queryFn: () => adminFetch("/admin/verticals"),
    enabled: isAdminAuthenticated,
  });

  const verticals: Vertical[] = (verticalsData?.verticals ?? []).filter((v) =>
    !search || v.label.toLowerCase().includes(search.toLowerCase()) || v.key.includes(search.toLowerCase())
  );

  // Children for selected vertical (fetched when selected)
  const { data: subsData, isLoading: subsLoading, refetch: refetchSubs } = useQuery<{ subVerticals: SubVertical[] }>({
    queryKey: ["adminSubVerticals", selectedVertical?.id],
    queryFn: () => adminFetch(`/admin/verticals/${selectedVertical!.id}/sub-verticals`),
    enabled: !!selectedVertical && isAdminAuthenticated,
  });

  const { data: servicesData, isLoading: servicesLoading, refetch: refetchServices } = useQuery<{ serviceLines: ServiceLine[] }>({
    queryKey: ["adminServiceLines", selectedVertical?.id],
    queryFn: () => adminFetch(`/admin/service-lines?verticalId=${selectedVertical!.id}`),
    enabled: !!selectedVertical && isAdminAuthenticated,
  });

  const subVerticals: SubVertical[] = subsData?.subVerticals ?? [];
  const serviceLines: ServiceLine[] = servicesData?.serviceLines ?? [];

  // Mutations - Verticals
  const createVerticalMutation = useMutation({
    mutationFn: (payload: any) => adminFetch("/admin/verticals", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
      closeAllModals();
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  const updateVerticalMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      adminFetch(`/admin/verticals/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
      closeAllModals();
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  const deleteVerticalMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/admin/verticals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
      if (selectedVertical?.id === id) setSelectedVertical(null);
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  // Sub-vertical mutations
  const createSubMutation = useMutation({
    mutationFn: (payload: any) =>
      adminFetch(`/admin/verticals/${payload.verticalId}/sub-verticals`, { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminSubVerticals", selectedVertical?.id] });
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
      setEditingSub(null);
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  const updateSubMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      adminFetch(`/admin/sub-verticals/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminSubVerticals", selectedVertical?.id] });
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
      setEditingSub(null);
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  const deleteSubMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/admin/sub-verticals/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminSubVerticals", selectedVertical?.id] });
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  // Service line mutations
  const createServiceMutation = useMutation({
    mutationFn: (payload: any) =>
      adminFetch("/admin/service-lines", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminServiceLines", selectedVertical?.id] });
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
      setEditingService(null);
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      adminFetch(`/admin/service-lines/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminServiceLines", selectedVertical?.id] });
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
      setEditingService(null);
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/admin/service-lines/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adminServiceLines", selectedVertical?.id] });
      qc.invalidateQueries({ queryKey: ["adminVerticals"] });
    },
    onError: (e: any) => alertMessage("Error", e.message),
  });

  function closeAllModals() {
    setModalMode(null);
    setEditingVertical(null);
    setEditingSub(null);
    setEditingService(null);
  }

  // Vertical actions
  function openNewVertical() {
    setEditingVertical(null);
    setModalMode("verticalForm");
  }

  function openEditVertical(v: Vertical) {
    setEditingVertical(v);
    setModalMode("verticalForm");
  }

  async function handleSaveVertical(data: Record<string, any>) {
    if (editingVertical) {
      await updateVerticalMutation.mutateAsync({ id: editingVertical.id, payload: data });
    } else {
      await createVerticalMutation.mutateAsync(data);
    }
  }

  async function handleDeleteVertical(v: Vertical) {
    const ok = await confirmAction(
      "Deactivate Vertical",
      `Deactivate "${v.label}"? Sub-verticals and service lines will also be deactivated (soft delete).`,
      { confirmLabel: "Deactivate", destructive: true }
    );
    if (!ok) return;
    await deleteVerticalMutation.mutateAsync(v.id);
  }

  // Sub-vertical management
  function openManageSubs(v: Vertical) {
    setSelectedVertical(v);
    setModalMode("subs");
    setEditingSub(null);
  }

  function openNewSub() {
    setEditingSub(null);
  }

  function openEditSub(sv: SubVertical) {
    setEditingSub(sv);
  }

  async function handleSaveSub(data: Record<string, any>) {
    const payload = { ...data, verticalId: selectedVertical!.id };
    if (editingSub) {
      await updateSubMutation.mutateAsync({ id: editingSub.id, payload });
    } else {
      await createSubMutation.mutateAsync(payload);
    }
  }

  async function handleDeleteSub(sv: SubVertical) {
    const ok = await confirmAction("Deactivate Sub-Vertical", `Deactivate "${sv.label}"?`, { destructive: true });
    if (!ok) return;
    await deleteSubMutation.mutateAsync(sv.id);
  }

  // Service line management
  function openManageServices(v: Vertical) {
    setSelectedVertical(v);
    setModalMode("services");
    setEditingService(null);
  }

  function openNewService() {
    setEditingService(null);
  }

  function openEditService(sl: ServiceLine) {
    setEditingService(sl);
  }

  async function handleSaveService(data: Record<string, any>) {
    const payload = { ...data, verticalId: selectedVertical!.id };
    if (editingService) {
      await updateServiceMutation.mutateAsync({ id: editingService.id, payload });
    } else {
      await createServiceMutation.mutateAsync(payload);
    }
  }

  async function handleDeleteService(sl: ServiceLine) {
    const ok = await confirmAction("Deactivate Service Line", `Deactivate "${sl.label}"?`, { destructive: true });
    if (!ok) return;
    await deleteServiceMutation.mutateAsync(sl.id);
  }

  // Render vertical card
  const renderVertical = useCallback(({ item: v }: { item: Vertical }) => (
    <View style={styles.vCard}>
      <View style={styles.vHeader}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={styles.vLabel}>{v.label}</Text>
            {!v.isActive && <Text style={styles.inactiveBadge}>INACTIVE</Text>}
          </View>
          <Text style={styles.vKey}>{v.key}</Text>
        </View>
        <TouchableOpacity onPress={() => openEditVertical(v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="edit-2" size={18} color={COLORS.amber} />
        </TouchableOpacity>
      </View>

      {v.description ? <Text style={styles.vDesc} numberOfLines={2}>{v.description}</Text> : null}

      <View style={styles.metaRow}>
        <Text style={styles.meta}>NAICS: {v.naicsCodes?.length || 0} • PSC: {v.pscCodes?.length || 0}</Text>
        {v.color && <View style={[styles.colorSwatch, { backgroundColor: v.color }]} />}
        {v.icon && <Text style={styles.iconHint}>{v.icon}</Text>}
      </View>

      <View style={styles.countRow}>
        <TouchableOpacity style={styles.countChip} onPress={() => openManageSubs(v)}>
          <Feather name="layers" size={14} color={COLORS.amber} />
          <Text style={styles.countText}>{v.subVerticalCount} subs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.countChip} onPress={() => openManageServices(v)}>
          <Feather name="list" size={14} color={COLORS.emerald} />
          <Text style={styles.countText}>{v.serviceLineCount} services</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.vActions}>
        <TouchableOpacity style={styles.actionLink} onPress={() => openManageSubs(v)}>
          <Text style={styles.actionLinkText}>Manage Sub-Verticals →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionLink} onPress={() => openManageServices(v)}>
          <Text style={styles.actionLinkText}>Manage Service Lines →</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionLink, { marginLeft: "auto" }]} onPress={() => handleDeleteVertical(v)}>
          <Feather name="trash-2" size={15} color={COLORS.red} />
        </TouchableOpacity>
      </View>
    </View>
  ), [handleDeleteVertical]);

  const renderSub = ({ item: sv }: { item: SubVertical }) => (
    <View style={styles.childRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.childLabel}>{sv.label} {!sv.isActive && <Text style={styles.inactiveSmall}>(inactive)</Text>}</Text>
        <Text style={styles.childKey}>{sv.key}</Text>
      </View>
      <TouchableOpacity onPress={() => openEditSub(sv)} style={{ padding: 6 }}>
        <Feather name="edit-2" size={16} color={COLORS.amber} />
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDeleteSub(sv)} style={{ padding: 6 }}>
        <Feather name="trash-2" size={16} color={COLORS.red} />
      </TouchableOpacity>
    </View>
  );

  const renderService = ({ item: sl }: { item: ServiceLine }) => {
    const parentSub = subVerticals.find((s) => s.id === sl.subVerticalId);
    return (
      <View style={styles.childRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.childLabel}>
            {sl.label} {!sl.isActive && <Text style={styles.inactiveSmall}>(inactive)</Text>}
          </Text>
          <Text style={styles.childKey}>
            {sl.key} {parentSub ? `· ${parentSub.label}` : "· Top-level"}
            {sl.defaultPipelineTemplateKey ? ` · ${sl.defaultPipelineTemplateKey}` : ""}
          </Text>
        </View>
        <TouchableOpacity onPress={() => openEditService(sl)} style={{ padding: 6 }}>
          <Feather name="edit-2" size={16} color={COLORS.amber} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleDeleteService(sl)} style={{ padding: 6 }}>
          <Feather name="trash-2" size={16} color={COLORS.red} />
        </TouchableOpacity>
      </View>
    );
  };

  const currentSubsForPicker = subVerticals.map((s) => ({ id: s.id, label: s.label, key: s.key }));

  return (
    <View style={styles.container}>
      {/* Top toolbar */}
      <View style={styles.toolbar}>
        <Text style={styles.title}>Vertical Hierarchy Configuration</Text>
        <TouchableOpacity style={styles.newBtn} onPress={openNewVertical}>
          <Feather name="plus" size={16} color={COLORS.navyDark} />
          <Text style={styles.newBtnText}>New Vertical</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search verticals by label or key..."
          placeholderTextColor={COLORS.textDim}
        />
        <TouchableOpacity onPress={() => refetchVerticals()} style={styles.refreshBtn}>
          <Feather name="refresh-cw" size={18} color={COLORS.amber} />
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Manage Verticals, Sub-Verticals, and Service Lines. Changes are immediately available to the normalizer, onboarding, and provisioning.
      </Text>

      {/* Verticals list */}
      {verticalsLoading && !verticalsRefetching ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>
      ) : (
        <FlatList
          data={verticals}
          keyExtractor={(v) => v.id}
          renderItem={renderVertical}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={verticalsRefetching} onRefresh={refetchVerticals} tintColor={COLORS.amber} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="layers" size={32} color={COLORS.textDim} />
              <Text style={styles.emptyText}>No verticals found.</Text>
              <TouchableOpacity onPress={openNewVertical} style={{ marginTop: 12 }}>
                <Text style={{ color: COLORS.amber }}>Create your first vertical</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Selected vertical quick info */}
      {selectedVertical && (
        <View style={styles.selectedBar}>
          <Text style={styles.selectedText}>
            Managing: <Text style={{ fontFamily: "Inter_600SemiBold" }}>{selectedVertical.label}</Text>
          </Text>
          <TouchableOpacity onPress={() => setSelectedVertical(null)}>
            <Feather name="x" size={18} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>
      )}

      {/* ─── VERTICAL FORM MODAL ─── */}
      <Modal visible={modalMode === "verticalForm"} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAllModals}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingVertical ? "Edit Vertical" : "New Vertical"}</Text>
            <TouchableOpacity onPress={closeAllModals}><Feather name="x" size={24} color={COLORS.textDim} /></TouchableOpacity>
          </View>
          <VerticalForm
            entityType="vertical"
            initialData={editingVertical || undefined}
            onSave={handleSaveVertical}
            onCancel={closeAllModals}
          />
        </View>
      </Modal>

      {/* ─── SUB-VERTICALS MANAGEMENT MODAL ─── */}
      <Modal visible={modalMode === "subs"} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAllModals}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sub-Verticals for {selectedVertical?.label}</Text>
            <TouchableOpacity onPress={closeAllModals}><Feather name="x" size={24} color={COLORS.textDim} /></TouchableOpacity>
          </View>

          <View style={styles.childToolbar}>
            <TouchableOpacity style={styles.addChildBtn} onPress={openNewSub}>
              <Feather name="plus" size={15} color={COLORS.navyDark} />
              <Text style={styles.addChildText}>Add Sub-Vertical</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => refetchSubs()}><Feather name="refresh-cw" size={18} color={COLORS.amber} /></TouchableOpacity>
          </View>

          {editingSub !== null || (modalMode === "subs" && !editingSub) ? (
            <VerticalForm
              entityType="subVertical"
              initialData={editingSub || undefined}
              onSave={handleSaveSub}
              onCancel={() => setEditingSub(null)}
              parentVerticalId={selectedVertical?.id}
            />
          ) : (
            <FlatList
              data={subVerticals}
              keyExtractor={(s) => s.id}
              renderItem={renderSub}
              contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No sub-verticals yet for this vertical.</Text>}
            />
          )}
        </View>
      </Modal>

      {/* ─── SERVICE LINES MANAGEMENT MODAL ─── */}
      <Modal visible={modalMode === "services"} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeAllModals}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Service Lines for {selectedVertical?.label}</Text>
            <TouchableOpacity onPress={closeAllModals}><Feather name="x" size={24} color={COLORS.textDim} /></TouchableOpacity>
          </View>

          <View style={styles.childToolbar}>
            <TouchableOpacity style={styles.addChildBtn} onPress={openNewService}>
              <Feather name="plus" size={15} color={COLORS.navyDark} />
              <Text style={styles.addChildText}>Add Service Line</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => refetchServices()}><Feather name="refresh-cw" size={18} color={COLORS.amber} /></TouchableOpacity>
          </View>

          {editingService !== null || (modalMode === "services" && !editingService) ? (
            <VerticalForm
              entityType="serviceLine"
              initialData={editingService || undefined}
              onSave={handleSaveService}
              onCancel={() => setEditingService(null)}
              parentVerticalId={selectedVertical?.id}
              availableSubVerticals={currentSubsForPicker}
            />
          ) : (
            <FlatList
              data={serviceLines}
              keyExtractor={(s) => s.id}
              renderItem={renderService}
              contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
              ListEmptyComponent={<Text style={styles.emptyText}>No service lines yet for this vertical.</Text>}
            />
          )}
        </View>
      </Modal>
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
  title: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.amber,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newBtnText: { color: COLORS.navyDark, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  searchRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 8, alignItems: "center" },
  searchInput: {
    flex: 1,
    backgroundColor: COLORS.navySurface,
    borderColor: COLORS.navyBorder,
    borderWidth: 1,
    borderRadius: 8,
    color: COLORS.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
  refreshBtn: { padding: 8 },
  hint: {
    color: COLORS.textDim,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 16,
    paddingBottom: 8,
    lineHeight: 16,
  },
  listContent: { paddingHorizontal: 16, paddingBottom: 80 },
  vCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginBottom: 12,
  },
  vHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  vLabel: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  vKey: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 1 },
  vDesc: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 6, lineHeight: 17 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  meta: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },
  colorSwatch: { width: 14, height: 14, borderRadius: 3, borderWidth: 1, borderColor: COLORS.navyBorder },
  iconHint: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },
  countRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  countChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.navySurface,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  countText: { color: COLORS.text, fontSize: 12, fontFamily: "Inter_500Medium" },
  vActions: { flexDirection: "row", marginTop: 10, gap: 12, alignItems: "center" },
  actionLink: {},
  actionLinkText: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_500Medium" },
  inactiveBadge: {
    fontSize: 9,
    color: COLORS.red,
    borderWidth: 1,
    borderColor: COLORS.red + "66",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    fontFamily: "Inter_600SemiBold",
  },
  inactiveSmall: { color: COLORS.red, fontSize: 11 },

  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
  empty: { alignItems: "center", paddingTop: 40, gap: 8 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },

  selectedBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: COLORS.navyMid,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  selectedText: { color: COLORS.textMuted, fontSize: 13 },

  // Modals
  modalContainer: { flex: 1, backgroundColor: COLORS.navyDark },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  modalTitle: { color: COLORS.text, fontSize: 17, fontFamily: "Inter_600SemiBold" },

  childToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder + "88",
  },
  addChildBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.emerald,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addChildText: { color: COLORS.navyDark, fontSize: 13, fontFamily: "Inter_600SemiBold" },

  childRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  childLabel: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" },
  childKey: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});
