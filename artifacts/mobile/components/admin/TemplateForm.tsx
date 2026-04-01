import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, ActivityIndicator, Alert,
} from "react-native";
import { COLORS } from "@/constants/colors";

type TemplateStatus = "draft" | "active" | "inactive" | "archived";

interface TemplateData {
  name: string;
  vertical: string;
  subVertical: string;
  description: string;
  status: TemplateStatus;
  isLocked: boolean;
  isClientEditable: boolean;
  configJson: string;
}

interface TemplateFormProps {
  initialData?: Partial<TemplateData>;
  onSave: (data: Record<string, any>) => Promise<void>;
  onCancel: () => void;
}

const STATUS_OPTIONS: TemplateStatus[] = ["draft", "active", "inactive", "archived"];

export function TemplateForm({ initialData, onSave, onCancel }: TemplateFormProps) {
  const [name, setName] = useState(initialData?.name ?? "");
  const [vertical, setVertical] = useState(initialData?.vertical ?? "");
  const [subVertical, setSubVertical] = useState(initialData?.subVertical ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [status, setStatus] = useState<TemplateStatus>(initialData?.status ?? "draft");
  const [isLocked, setIsLocked] = useState(initialData?.isLocked ?? false);
  const [isClientEditable, setIsClientEditable] = useState(initialData?.isClientEditable ?? true);
  const [configJson, setConfigJson] = useState(
    initialData?.configJson
      ? (typeof initialData.configJson === "string" ? initialData.configJson : JSON.stringify(initialData.configJson, null, 2))
      : "{}"
  );
  const [saving, setSaving] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  function validateJson(text: string): boolean {
    try {
      JSON.parse(text);
      setJsonError(null);
      return true;
    } catch (e: any) {
      setJsonError(e.message);
      return false;
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert("Validation Error", "Template name is required.");
      return;
    }
    if (!validateJson(configJson)) {
      Alert.alert("Validation Error", "Config JSON is not valid.");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        vertical: vertical.trim() || null,
        subVertical: subVertical.trim() || null,
        description: description.trim() || null,
        status,
        isLocked,
        isClientEditable,
        configJson: JSON.parse(configJson),
      });
    } catch (e: any) {
      Alert.alert("Save Error", e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.field}>
        <Text style={styles.label}>Name *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Template name" placeholderTextColor={COLORS.textDim} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Vertical</Text>
        <TextInput style={styles.input} value={vertical} onChangeText={setVertical} placeholder="e.g. Real Estate" placeholderTextColor={COLORS.textDim} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Sub-Vertical</Text>
        <TextInput style={styles.input} value={subVertical} onChangeText={setSubVertical} placeholder="e.g. Residential" placeholderTextColor={COLORS.textDim} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Description</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Optional description..."
          placeholderTextColor={COLORS.textDim}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Status</Text>
        <View style={styles.statusRow}>
          {STATUS_OPTIONS.map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.statusOption, status === s && styles.statusOptionSelected]}
              onPress={() => setStatus(s)}
            >
              <Text style={[styles.statusOptionText, status === s && styles.statusOptionTextSelected]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Locked</Text>
          <Text style={styles.switchHint}>Prevent client workspaces from modifying this template</Text>
        </View>
        <Switch value={isLocked} onValueChange={setIsLocked} trackColor={{ true: COLORS.amber }} thumbColor={COLORS.white} />
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Client Editable</Text>
          <Text style={styles.switchHint}>Allow workspace admins to customize this view</Text>
        </View>
        <Switch value={isClientEditable} onValueChange={setIsClientEditable} trackColor={{ true: COLORS.emerald }} thumbColor={COLORS.white} />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Config JSON</Text>
        <TextInput
          style={[styles.input, styles.codeArea, jsonError ? styles.inputError : null]}
          value={configJson}
          onChangeText={text => { setConfigJson(text); validateJson(text); }}
          placeholder="{}"
          placeholderTextColor={COLORS.textDim}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
        {jsonError && <Text style={styles.errorText}>JSON error: {jsonError}</Text>}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={COLORS.navyDark} size="small" /> : <Text style={styles.saveBtnText}>Save Template</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  field: { marginBottom: 16 },
  label: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_500Medium", marginBottom: 6 },
  input: {
    backgroundColor: COLORS.navySurface,
    borderColor: COLORS.navyBorder,
    borderWidth: 1,
    borderRadius: 8,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  inputError: { borderColor: COLORS.red },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  codeArea: { minHeight: 160, fontFamily: "Inter_400Regular", fontSize: 13, textAlignVertical: "top" },
  errorText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  statusRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statusOption: {
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: COLORS.navySurface,
  },
  statusOptionSelected: { borderColor: COLORS.amber, backgroundColor: "#2D1B00" },
  statusOptionText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },
  statusOptionTextSelected: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  switchInfo: { flex: 1, marginRight: 12 },
  switchLabel: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" },
  switchHint: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  actions: { flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 32 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_500Medium" },
  saveBtn: {
    flex: 2,
    backgroundColor: COLORS.amber,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  saveBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
