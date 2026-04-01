import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, Alert, ActivityIndicator,
  Modal, FlatList, TextInput,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { TemplateForm } from "@/components/admin/TemplateForm";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

export default function EditTemplateScreen() {
  const { id, publish } = useLocalSearchParams<{ id: string; publish?: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [publishVisible, setPublishVisible] = useState(publish === "1");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [selectedWsId, setSelectedWsId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["adminTemplate", id],
    queryFn: () => adminFetch(`/admin/pipeline-templates/${id}`),
    enabled: isAdminAuthenticated && !!id,
  });

  const { data: wsData } = useQuery({
    queryKey: ["adminWorkspaces"],
    queryFn: () => adminFetch("/admin/workspaces"),
    enabled: isAdminAuthenticated && publishVisible,
  });

  const template = data?.template;
  const workspaces = (wsData?.workspaces ?? []).filter((w: any) =>
    w.name.toLowerCase().includes(workspaceSearch.toLowerCase())
  );

  async function handleSave(formData: Record<string, any>) {
    await adminFetch(`/admin/pipeline-templates/${id}`, {
      method: "PUT",
      body: JSON.stringify(formData),
    });
    qc.invalidateQueries({ queryKey: ["adminTemplates"] });
    qc.invalidateQueries({ queryKey: ["adminTemplate", id] });
    router.back();
  }

  async function handleClone() {
    try {
      await adminFetch(`/admin/pipeline-templates/${id}/clone`, { method: "POST" });
      qc.invalidateQueries({ queryKey: ["adminTemplates"] });
      Alert.alert("Cloned", "Template cloned as draft.");
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message);
    }
  }

  async function handleArchive() {
    Alert.alert(
      "Archive Template",
      "Archive this template? It will no longer be available for publishing.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Archive", style: "destructive",
          onPress: async () => {
            try {
              await adminFetch(`/admin/pipeline-templates/${id}/archive`, { method: "POST" });
              qc.invalidateQueries({ queryKey: ["adminTemplates"] });
              router.back();
            } catch (e: any) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ]
    );
  }

  async function handlePublish() {
    if (!selectedWsId) {
      Alert.alert("Select Workspace", "Please select a workspace to publish to.");
      return;
    }
    setPublishing(true);
    try {
      await adminFetch(`/admin/pipeline-templates/${id}/publish`, {
        method: "POST",
        body: JSON.stringify({ workspaceId: selectedWsId }),
      });
      setPublishVisible(false);
      Alert.alert("Published", "Template has been published to the workspace.");
    } catch (e: any) {
      Alert.alert("Error", e.message);
    } finally {
      setPublishing(false);
    }
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[{ label: "Templates", href: "/admin/templates" }, { label: "Edit" }]} />
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.amber} />
        </View>
      </View>
    );
  }

  if (!template) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[{ label: "Templates", href: "/admin/templates" }, { label: "Not Found" }]} />
        <View style={styles.center}>
          <Text style={styles.errorText}>Template not found.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[{ label: "Templates", href: "/admin/templates" }, { label: template.name }]} />

      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleClone}>
          <Text style={styles.actionBtnText}>Clone</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setPublishVisible(true)}>
          <Text style={styles.actionBtnText}>Publish to Workspace</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnDanger]} onPress={handleArchive}>
          <Text style={[styles.actionBtnText, styles.actionBtnTextDanger]}>Archive</Text>
        </TouchableOpacity>
      </View>

      <TemplateForm
        initialData={{
          name: template.name,
          vertical: template.vertical ?? "",
          subVertical: template.subVertical ?? "",
          description: template.description ?? "",
          status: template.status,
          isLocked: template.isLocked,
          isClientEditable: template.isClientEditable,
          configJson: template.configJson,
        }}
        onSave={handleSave}
        onCancel={() => router.back()}
      />

      <Modal visible={publishVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <Text style={styles.modalTitle}>Publish to Workspace</Text>
          <Text style={styles.modalSubtitle}>Choose a workspace to publish "{template.name}"</Text>
          <TextInput
            style={styles.searchInput}
            value={workspaceSearch}
            onChangeText={setWorkspaceSearch}
            placeholder="Search workspaces..."
            placeholderTextColor={COLORS.textDim}
          />
          <FlatList
            data={workspaces}
            keyExtractor={(w: any) => w.id}
            style={styles.wsList}
            renderItem={({ item: w }: { item: any }) => (
              <TouchableOpacity
                style={[styles.wsRow, selectedWsId === w.id && styles.wsRowSelected]}
                onPress={() => setSelectedWsId(w.id)}
              >
                <Text style={styles.wsName}>{w.name}</Text>
                <Text style={styles.wsMeta}>{w.memberCount} members · {w.activePipelineViewCount} active views</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptyText}>No workspaces found.</Text>}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setPublishVisible(false); setSelectedWsId(null); }}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, !selectedWsId && styles.confirmBtnDisabled]}
              onPress={handlePublish}
              disabled={!selectedWsId || publishing}
            >
              {publishing ? <ActivityIndicator color={COLORS.navyDark} size="small" /> : <Text style={styles.confirmBtnText}>Publish</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.red, fontSize: 14 },
  actionBar: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyMid,
  },
  actionBtn: {
    borderWidth: 1,
    borderColor: COLORS.amber,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnDanger: { borderColor: COLORS.red },
  actionBtnText: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_500Medium" },
  actionBtnTextDanger: { color: COLORS.red },
  modal: { flex: 1, backgroundColor: COLORS.navyMid, padding: 20 },
  modalTitle: { color: COLORS.text, fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 6, marginTop: 8 },
  modalSubtitle: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular", marginBottom: 16 },
  searchInput: {
    backgroundColor: COLORS.navySurface,
    borderColor: COLORS.navyBorder,
    borderWidth: 1,
    borderRadius: 8,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  wsList: { flex: 1 },
  wsRow: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  wsRowSelected: { borderColor: COLORS.amber, backgroundColor: "#2D1B00" },
  wsName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium" },
  wsMeta: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  emptyText: { color: COLORS.textMuted, fontSize: 14, textAlign: "center", paddingTop: 24 },
  modalActions: { flexDirection: "row", gap: 12, paddingTop: 16, paddingBottom: 8 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: COLORS.navyBorder, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_500Medium" },
  confirmBtn: { flex: 1, backgroundColor: COLORS.amber, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  confirmBtnDisabled: { opacity: 0.4 },
  confirmBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
