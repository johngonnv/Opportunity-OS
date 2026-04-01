import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Switch, Alert, ActivityIndicator, Modal, TextInput,
} from "react-native";
import { Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { apiFetch } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";

interface PipelineView {
  id: string;
  templateId: string;
  workspaceId: string;
  isEnabled: boolean;
  isDefault: boolean;
  sortOrder: number;
  settingsJson: Record<string, any>;
  visibilityScope: string;
  createdAt: string;
  updatedAt: string;
}

interface PipelineTemplate {
  id: string;
  key: string;
  name: string;
  vertical: string;
  subVertical: string | null;
  isLocked: boolean;
  isClientEditable: boolean;
  configJson: Record<string, any>;
}

interface ViewWithTemplate {
  view: PipelineView;
  template: PipelineTemplate | null;
}

interface DetailsSheetProps {
  item: ViewWithTemplate;
  onClose: () => void;
  workspaceId: string;
}

function DetailsSheet({ item, onClose, workspaceId }: DetailsSheetProps) {
  const qc = useQueryClient();
  const { view, template } = item;
  const config = template?.configJson as any || {};
  const stages: any[] = config.stages || [];
  const savedViews: any[] = config.savedViews || [];

  const [nameOverride, setNameOverride] = useState<string>(
    (view.settingsJson?.nameOverride as string) || ""
  );
  const [defaultSavedView, setDefaultSavedView] = useState<string>(
    (view.settingsJson?.defaultSavedView as string) || ""
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/workspaces/${workspaceId}/pipeline-views/${view.id}`, {
        method: "PUT",
        body: JSON.stringify({
          settingsJson: {
            ...view.settingsJson,
            nameOverride: nameOverride || undefined,
            defaultSavedView: defaultSavedView || undefined,
          },
        }),
      });
      qc.invalidateQueries({ queryKey: ["workspacePipelineViews", workspaceId] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={ds.overlay}>
      <TouchableOpacity style={ds.backdrop} onPress={onClose} activeOpacity={1} />
      <View style={ds.sheet}>
        <View style={ds.handle} />
        <View style={ds.sheetHeader}>
          <Text style={ds.sheetTitle}>{template?.name || "Pipeline View"}</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={ds.lockedBanner}>
            <Feather name="lock" size={13} color={COLORS.textDim} />
            <Text style={ds.lockedText}>Managed by Opportunity OS — cannot be edited</Text>
          </View>

          {stages.length > 0 && (
            <View style={ds.section}>
              <Text style={ds.sectionLabel}>STAGES</Text>
              {stages.map((stage: any, i: number) => (
                <View key={i} style={ds.stageRow}>
                  <Text style={ds.stageName}>{stage.name || stage}</Text>
                  {stage.probabilityPercent !== undefined && (
                    <Text style={ds.stagePct}>{stage.probabilityPercent}%</Text>
                  )}
                </View>
              ))}
            </View>
          )}

          {savedViews.length > 0 && (
            <View style={ds.section}>
              <Text style={ds.sectionLabel}>SAVED VIEWS</Text>
              {savedViews.map((sv: any, i: number) => (
                <View key={i} style={ds.savedViewRow}>
                  <Feather name="eye" size={13} color={COLORS.textDim} />
                  <Text style={ds.savedViewName}>{sv.name || sv}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={[ds.section, { marginTop: 4 }]}>
            <Text style={ds.sectionLabel}>WORKSPACE OVERRIDES</Text>
            <View style={ds.field}>
              <Text style={ds.fieldLabel}>Display Name Override</Text>
              <TextInput
                style={ds.input}
                value={nameOverride}
                onChangeText={setNameOverride}
                placeholder={template?.name || "Leave blank to use default"}
                placeholderTextColor={COLORS.textDim}
                autoCapitalize="none"
              />
            </View>
            {savedViews.length > 0 && (
              <View style={ds.field}>
                <Text style={ds.fieldLabel}>Default Saved View</Text>
                <TextInput
                  style={ds.input}
                  value={defaultSavedView}
                  onChangeText={setDefaultSavedView}
                  placeholder="Leave blank for none"
                  placeholderTextColor={COLORS.textDim}
                  autoCapitalize="none"
                />
              </View>
            )}
            {saveError && (
              <View style={ds.errorBox}>
                <Feather name="alert-circle" size={13} color={COLORS.red} />
                <Text style={ds.errorText}>{saveError}</Text>
              </View>
            )}
            {saveSuccess && (
              <View style={ds.successBox}>
                <Feather name="check-circle" size={13} color={COLORS.emerald} />
                <Text style={ds.successText}>Settings saved!</Text>
              </View>
            )}
            <TouchableOpacity style={ds.saveBtn} onPress={handleSave} disabled={saving}>
              {saving
                ? <ActivityIndicator size="small" color={COLORS.emerald} />
                : <Text style={ds.saveBtnText}>Save Overrides</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const ds = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: "flex-end", zIndex: 100 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { backgroundColor: COLORS.navyMid, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: "80%", minHeight: 300 },
  handle: { width: 36, height: 4, backgroundColor: COLORS.navyBorder, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  lockedBanner: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.navyBorder + "55", borderRadius: 8, padding: 10, marginBottom: 16 },
  lockedText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim, flex: 1 },
  section: { marginBottom: 16 },
  sectionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.textDim, letterSpacing: 1, marginBottom: 8 },
  stageRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "55" },
  stageName: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  stagePct: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  savedViewRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "55" },
  savedViewName: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text },
  field: { marginBottom: 12 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: { backgroundColor: COLORS.navy, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 14, borderWidth: 1, borderColor: COLORS.navyBorder },
  saveBtn: { backgroundColor: COLORS.emerald + "22", borderRadius: 10, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: COLORS.emerald + "44", marginTop: 4 },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.red + "18", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.red + "40", marginBottom: 10 },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.red },
  successBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: COLORS.emerald + "18", borderRadius: 8, padding: 10, borderWidth: 1, borderColor: COLORS.emerald + "40", marginBottom: 10 },
  successText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.emerald },
});

function verticalColor(vertical: string): string {
  const map: Record<string, string> = {
    sales: COLORS.emerald,
    marketing: COLORS.blue,
    partnerships: COLORS.purple,
    ems: COLORS.amber,
    hospitality: COLORS.cyan,
  };
  return map[vertical?.toLowerCase()] || COLORS.textMuted;
}

export default function WorkspacePipelinesScreen() {
  const { workspace, role } = useAuth();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const workspaceId = workspace?.id || "";
  const isAdmin = role === "OWNER" || role === "ADMIN";

  const [detailsItem, setDetailsItem] = useState<ViewWithTemplate | null>(null);
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["workspacePipelineViews", workspaceId],
    queryFn: () => apiFetch(`/workspaces/${workspaceId}/pipeline-views`),
    enabled: !!workspaceId,
  });

  const [localViews, setLocalViews] = useState<ViewWithTemplate[] | null>(null);
  const views: ViewWithTemplate[] = localViews ?? (data?.views || []);

  React.useEffect(() => {
    if (data?.views) setLocalViews(data.views);
  }, [data]);

  const updateViewMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, any> }) =>
      apiFetch(`/workspaces/${workspaceId}/pipeline-views/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["workspacePipelineViews", workspaceId] }),
    onError: (err: any) => {
      Alert.alert("Error", err.message || "Failed to update pipeline view.");
      qc.invalidateQueries({ queryKey: ["workspacePipelineViews", workspaceId] });
    },
  });

  const handleToggle = useCallback((item: ViewWithTemplate, newValue: boolean) => {
    if (!newValue && item.view.isDefault) {
      Alert.alert(
        "Select a New Default",
        "This is the default pipeline view. Please set another view as default before disabling it.",
        [{ text: "OK" }]
      );
      return;
    }
    setLocalViews(prev =>
      (prev || views).map(v =>
        v.view.id === item.view.id ? { ...v, view: { ...v.view, isEnabled: newValue } } : v
      )
    );
    updateViewMutation.mutate({ id: item.view.id, body: { isEnabled: newValue } });
  }, [views, updateViewMutation]);

  const handleSetDefault = useCallback((item: ViewWithTemplate) => {
    if (item.view.isDefault) return;
    setLocalViews(prev =>
      (prev || views).map(v => ({
        ...v,
        view: { ...v.view, isDefault: v.view.id === item.view.id },
      }))
    );
    updateViewMutation.mutate({ id: item.view.id, body: { isDefault: true } });
  }, [views, updateViewMutation]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    const next = [...views];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    const reordered = next.map((v, i) => ({ ...v, view: { ...v.view, sortOrder: i } }));
    setLocalViews(reordered);

    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(() => {
      const id = reordered[index - 1].view.id;
      const order = reordered[index - 1].view.sortOrder;
      apiFetch(`/workspaces/${workspaceId}/pipeline-views/${id}`, {
        method: "PUT",
        body: JSON.stringify({ sortOrder: order }),
      }).then(() => {
        qc.invalidateQueries({ queryKey: ["workspacePipelineViews", workspaceId] });
      }).catch(() => {
        qc.invalidateQueries({ queryKey: ["workspacePipelineViews", workspaceId] });
        Alert.alert("Error", "Failed to save new order.");
      });
    }, 600);
  }, [views, workspaceId, qc]);

  const handleMoveDown = useCallback((index: number) => {
    if (index === views.length - 1) return;
    const next = [...views];
    [next[index + 1], next[index]] = [next[index], next[index + 1]];
    const reordered = next.map((v, i) => ({ ...v, view: { ...v.view, sortOrder: i } }));
    setLocalViews(reordered);

    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(() => {
      const id = reordered[index + 1].view.id;
      const order = reordered[index + 1].view.sortOrder;
      apiFetch(`/workspaces/${workspaceId}/pipeline-views/${id}`, {
        method: "PUT",
        body: JSON.stringify({ sortOrder: order }),
      }).then(() => {
        qc.invalidateQueries({ queryKey: ["workspacePipelineViews", workspaceId] });
      }).catch(() => {
        qc.invalidateQueries({ queryKey: ["workspacePipelineViews", workspaceId] });
        Alert.alert("Error", "Failed to save new order.");
      });
    }, 600);
  }, [views, workspaceId, qc]);

  if (!isAdmin) {
    return (
      <View style={styles.restrictedContainer}>
        <Stack.Screen options={{ title: "Pipeline Views" }} />
        <View style={styles.restrictedContent}>
          <Feather name="lock" size={36} color={COLORS.textDim} />
          <Text style={styles.restrictedTitle}>Access Restricted</Text>
          <Text style={styles.restrictedBody}>You need Owner or Admin permissions to manage pipeline views.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Pipeline Views" }} />
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.emerald} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>Failed to load pipeline views.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.hint}>Manage which pipeline views are visible to your team. Tap a row for details.</Text>
          {views.length === 0 ? (
            <Card style={{ padding: 24, alignItems: "center" }}>
              <Feather name="inbox" size={28} color={COLORS.textDim} />
              <Text style={styles.emptyText}>No pipeline views configured yet.</Text>
            </Card>
          ) : (
            views.map((item, index) => (
              <TouchableOpacity
                key={item.view.id}
                activeOpacity={0.85}
                onPress={() => setDetailsItem(item)}
              >
                <Card style={styles.viewCard}>
                  <View style={styles.viewRow}>
                    <View style={styles.viewInfo}>
                      <View style={styles.viewNameRow}>
                        <Text style={styles.viewName}>
                          {(item.view.settingsJson?.nameOverride as string) || item.template?.name || "Unnamed View"}
                        </Text>
                        {item.view.isDefault && (
                          <View style={styles.defaultBadge}>
                            <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                          </View>
                        )}
                      </View>
                      {item.template?.vertical && (
                        <Badge
                          label={item.template.vertical}
                          color={verticalColor(item.template.vertical)}
                          style={{ marginTop: 4 }}
                        />
                      )}
                    </View>
                    <View style={styles.viewActions}>
                      <View style={styles.reorderBtns}>
                        <TouchableOpacity
                          onPress={() => handleMoveUp(index)}
                          style={[styles.reorderBtn, index === 0 && styles.reorderBtnDisabled]}
                          disabled={index === 0}
                        >
                          <Feather name="chevron-up" size={16} color={index === 0 ? COLORS.navyBorder : COLORS.textMuted} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleMoveDown(index)}
                          style={[styles.reorderBtn, index === views.length - 1 && styles.reorderBtnDisabled]}
                          disabled={index === views.length - 1}
                        >
                          <Feather name="chevron-down" size={16} color={index === views.length - 1 ? COLORS.navyBorder : COLORS.textMuted} />
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleSetDefault(item)}
                        style={[styles.radioBtn, item.view.isDefault && styles.radioBtnActive]}
                      >
                        <View style={[styles.radioInner, item.view.isDefault && styles.radioInnerActive]} />
                      </TouchableOpacity>
                      <Switch
                        value={item.view.isEnabled}
                        onValueChange={(v) => handleToggle(item, v)}
                        trackColor={{ false: COLORS.navyBorder, true: COLORS.emerald + "55" }}
                        thumbColor={item.view.isEnabled ? COLORS.emerald : COLORS.textDim}
                      />
                    </View>
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>
      )}

      {detailsItem && (
        <Modal transparent animationType="slide" visible onRequestClose={() => setDetailsItem(null)}>
          <DetailsSheet
            item={detailsItem}
            onClose={() => setDetailsItem(null)}
            workspaceId={workspaceId}
          />
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  hint: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginBottom: 16, lineHeight: 18 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.red },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, marginTop: 12, textAlign: "center" },
  viewCard: { marginBottom: 10, padding: 14 },
  viewRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  viewInfo: { flex: 1, marginRight: 12 },
  viewNameRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  viewName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  defaultBadge: { backgroundColor: COLORS.emerald + "22", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.emerald + "44" },
  defaultBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 9, color: COLORS.emerald, letterSpacing: 0.5 },
  viewActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  reorderBtns: { flexDirection: "column", alignItems: "center", gap: 2 },
  reorderBtn: { padding: 3 },
  reorderBtnDisabled: { opacity: 0.3 },
  radioBtn: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: COLORS.textDim, alignItems: "center", justifyContent: "center" },
  radioBtnActive: { borderColor: COLORS.emerald },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: "transparent" },
  radioInnerActive: { backgroundColor: COLORS.emerald },
  restrictedContainer: { flex: 1, backgroundColor: COLORS.navy },
  restrictedContent: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingHorizontal: 32 },
  restrictedTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text },
  restrictedBody: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center" },
});
