import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, Switch, ActivityIndicator, Alert,
} from "react-native";
import { COLORS } from "@/constants/colors";

type EntityType = "vertical" | "subVertical" | "serviceLine";

interface VerticalFormProps {
  entityType: EntityType;
  initialData?: Record<string, any>;
  onSave: (data: Record<string, any>) => Promise<void>;
  onCancel: () => void;
  // Optional context for service lines
  parentVerticalId?: string;
  availableSubVerticals?: Array<{ id: string; label: string; key: string }>;
}

export function VerticalForm({
  entityType,
  initialData,
  onSave,
  onCancel,
  parentVerticalId,
  availableSubVerticals = [],
}: VerticalFormProps) {
  const isVertical = entityType === "vertical";
  const isSub = entityType === "subVertical";
  const isService = entityType === "serviceLine";

  // Common fields
  const [key, setKey] = useState(initialData?.key ?? "");
  const [label, setLabel] = useState(initialData?.label ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [naicsInput, setNaicsInput] = useState(
    Array.isArray(initialData?.naicsCodes) ? initialData.naicsCodes.join(", ") : ""
  );
  const [pscInput, setPscInput] = useState(
    Array.isArray(initialData?.pscCodes) ? initialData.pscCodes.join(", ") : ""
  );
  const [icon, setIcon] = useState(initialData?.icon ?? "");
  const [color, setColor] = useState(initialData?.color ?? "");
  const [isActive, setIsActive] = useState(initialData?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(
    initialData?.sortOrder != null ? String(initialData.sortOrder) : "0"
  );

  // Service line specific
  const [subVerticalId, setSubVerticalId] = useState<string | null>(
    initialData?.subVerticalId ?? null
  );
  const [defaultPipelineTemplateKey, setDefaultPipelineTemplateKey] = useState(
    initialData?.defaultPipelineTemplateKey ?? ""
  );
  const [defaultConfigJson, setDefaultConfigJson] = useState(
    initialData?.defaultConfig
      ? (typeof initialData.defaultConfig === "string"
          ? initialData.defaultConfig
          : JSON.stringify(initialData.defaultConfig, null, 2))
      : "{}"
  );
  const [jsonError, setJsonError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  function parseArray(input: string): string[] {
    return input
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function validateJson(text: string): boolean {
    if (!text.trim() || text.trim() === "{}") {
      setJsonError(null);
      return true;
    }
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
    if (!key.trim() || !label.trim()) {
      Alert.alert("Validation Error", "Key and Label are required.");
      return;
    }
    if (isService && !validateJson(defaultConfigJson)) {
      Alert.alert("Validation Error", "Default Config JSON is invalid.");
      return;
    }

    setSaving(true);
    try {
      const base: Record<string, any> = {
        key: key.trim(),
        label: label.trim(),
        description: description.trim() || null,
        naicsCodes: parseArray(naicsInput),
        pscCodes: parseArray(pscInput),
        icon: icon.trim() || null,
        color: color.trim() || null,
        isActive,
        sortOrder: parseInt(sortOrder, 10) || 0,
      };

      if (isVertical) {
        await onSave(base);
      } else if (isSub) {
        await onSave({
          ...base,
          verticalId: parentVerticalId, // provided by caller if needed
        });
      } else if (isService) {
        await onSave({
          ...base,
          verticalId: parentVerticalId,
          subVerticalId: subVerticalId || null,
          defaultPipelineTemplateKey: defaultPipelineTemplateKey.trim() || null,
          defaultConfig: JSON.parse(defaultConfigJson || "{}"),
        });
      }
    } catch (e: any) {
      Alert.alert("Save Error", e.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const title = isVertical
    ? "Vertical"
    : isSub
    ? "Sub-Vertical"
    : "Service Line";

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.formTitle}>{initialData?.id ? "Edit" : "New"} {title}</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Key * (lowercase, underscores)</Text>
        <TextInput
          style={styles.input}
          value={key}
          onChangeText={setKey}
          placeholder="e.g. industrial_services or water_treatment"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Label *</Text>
        <TextInput
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          placeholder="Human readable name"
          placeholderTextColor={COLORS.textDim}
        />
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
          numberOfLines={2}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>NAICS Codes (comma separated)</Text>
        <TextInput
          style={styles.input}
          value={naicsInput}
          onChangeText={setNaicsInput}
          placeholder="221310, 325180, 541620"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>PSC Codes (comma separated, mainly GovCon)</Text>
        <TextInput
          style={styles.input}
          value={pscInput}
          onChangeText={setPscInput}
          placeholder="e.g. R425, 611430"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.field, { flex: 1, marginRight: 8 }]}>
          <Text style={styles.label}>Icon (Feather name)</Text>
          <TextInput
            style={styles.input}
            value={icon}
            onChangeText={setIcon}
            placeholder="droplet, briefcase, activity"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
          />
        </View>
        <View style={[styles.field, { flex: 1 }]}>
          <Text style={styles.label}>Color (hex)</Text>
          <TextInput
            style={styles.input}
            value={color}
            onChangeText={setColor}
            placeholder="#0ea5e9"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
          />
        </View>
      </View>

      <View style={styles.switchRow}>
        <View style={styles.switchInfo}>
          <Text style={styles.switchLabel}>Active</Text>
          <Text style={styles.switchHint}>Inactive items are hidden from new onboarding and normalizers</Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ true: COLORS.emerald }}
          thumbColor={COLORS.white}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Sort Order</Text>
        <TextInput
          style={styles.input}
          value={sortOrder}
          onChangeText={setSortOrder}
          keyboardType="numeric"
          placeholder="0"
        />
      </View>

      {/* Service Line specific fields */}
      {isService && (
        <>
          <View style={styles.field}>
            <Text style={styles.label}>Parent Sub-Vertical (optional)</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, subVerticalId === null && styles.chipActive]}
                onPress={() => setSubVerticalId(null)}
              >
                <Text style={[styles.chipText, subVerticalId === null && styles.chipTextActive]}>None (top-level)</Text>
              </TouchableOpacity>
              {availableSubVerticals.map((sv) => (
                <TouchableOpacity
                  key={sv.id}
                  style={[styles.chip, subVerticalId === sv.id && styles.chipActive]}
                  onPress={() => setSubVerticalId(sv.id)}
                >
                  <Text style={[styles.chipText, subVerticalId === sv.id && styles.chipTextActive]} numberOfLines={1}>
                    {sv.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Default Pipeline Template Key</Text>
            <TextInput
              style={styles.input}
              value={defaultPipelineTemplateKey}
              onChangeText={setDefaultPipelineTemplateKey}
              placeholder="water_treatment_recurring_v1 or ems_interfacility_transport_v1"
              placeholderTextColor={COLORS.textDim}
              autoCapitalize="none"
            />
            <Text style={styles.hint}>Used during provisioning to auto-create pipelines for this service line.</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Default Config (JSON)</Text>
            <TextInput
              style={[styles.input, styles.codeArea, jsonError ? styles.inputError : null]}
              value={defaultConfigJson}
              onChangeText={(t) => {
                setDefaultConfigJson(t);
                validateJson(t);
              }}
              placeholder='{"foo": "bar"}'
              placeholderTextColor={COLORS.textDim}
              multiline
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            {jsonError && <Text style={styles.errorText}>JSON error: {jsonError}</Text>}
          </View>
        </>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={saving}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={COLORS.navyDark} size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Save {title}</Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  formTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 16,
  },
  field: { marginBottom: 14 },
  label: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_500Medium", marginBottom: 5 },
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
  textArea: { minHeight: 60, textAlignVertical: "top" },
  codeArea: { minHeight: 120, fontFamily: "Inter_400Regular", fontSize: 13, textAlignVertical: "top" },
  errorText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  row: { flexDirection: "row" },
  hint: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 3 },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  switchInfo: { flex: 1, marginRight: 12 },
  switchLabel: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" },
  switchHint: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLORS.navySurface,
  },
  chipActive: { borderColor: COLORS.amber, backgroundColor: "#2D1B00" },
  chipText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_500Medium" },
  chipTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  actions: { flexDirection: "row", gap: 12, marginTop: 16, marginBottom: 24 },
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
