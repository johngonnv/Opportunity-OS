import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Platform } from "react-native";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import { COLORS } from "@/constants/colors";
import { ACCOUNT_STRUCTURE_LABELS, VERTICAL_LABELS } from "@/constants/orgLabels";
import { Button } from "@/components/ui/Button";
import { useOrganization, useUpdateOrganization, useTags } from "@/hooks/useApi";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

const ORG_TYPES = [
  "HOSPITAL", "HEALTH_SYSTEM", "HOSPICE", "HOME_HEALTH",
  "GOVERNMENT_AGENCY", "PRIME_CONTRACTOR", "SUBCONTRACTOR",
  "CONSULTANT", "VENDOR", "OTHER",
] as const;

const ORG_TYPE_LABELS: Record<string, string> = {
  HOSPITAL: "Hospital", HEALTH_SYSTEM: "Health System", HOSPICE: "Hospice",
  HOME_HEALTH: "Home Health", GOVERNMENT_AGENCY: "Gov Agency", PRIME_CONTRACTOR: "Prime Contractor",
  SUBCONTRACTOR: "Subcontractor", CONSULTANT: "Consultant", VENDOR: "Vendor", OTHER: "Other",
};

const STRUCT_TYPES = ["enterprise", "parent", "regional", "local_entity"] as const;
const VERTICALS = ["healthcare", "govcon", "general_business", "government", "nonprofit", "vendor", "other"] as const;

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "numeric" | "phone-pad" | "url";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={COLORS.textDim}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize || "words"}
      />
    </View>
  );
}

interface ChipSelectorProps {
  label: string;
  options: readonly string[];
  labelMap: Record<string, string>;
  value: string | null;
  onChange: (v: string | null) => void;
}

function ChipSelector({ label, options, labelMap, value, onChange }: ChipSelectorProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.typeGrid}>
        {options.map((opt: string) => (
          <TouchableOpacity
            key={opt}
            style={[styles.typeChip, value === opt && styles.typeChipActive]}
            onPress={() => onChange(value === opt ? null : opt)}
          >
            <Text style={[styles.typeChipText, value === opt && styles.typeChipTextActive]}>
              {labelMap[opt] || opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function EditOrganizationScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: org, isLoading } = useOrganization(id);
  const update = useUpdateOrganization(id);
  const { data: tagsData } = useTags();

  const [form, setForm] = useState({
    name: "",
    legalName: "",
    website: "",
    phone: "",
    email: "",
    organizationType: "OTHER" as string,
    accountStructureType: null as string | null,
    vertical: null as string | null,
    industry: "",
    city: "",
    state: "",
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (org && !ready) {
      setForm({
        name: org.name || "",
        legalName: org.legalName || "",
        website: org.website || "",
        phone: org.phone || "",
        email: org.email || "",
        organizationType: org.organizationType || "OTHER",
        accountStructureType: org.accountStructureType || null,
        vertical: org.vertical || null,
        industry: org.industry || "",
        city: org.city || "",
        state: org.state || "",
      });
      setSelectedTags((org.tags || []).map((t: { id: string }) => t.id));
      setReady(true);
    }
  }, [org, ready]);

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      return Alert.alert("Name required", "Please enter an organization name.");
    }
    try {
      const payload: Record<string, unknown> = { ...form, tagIds: selectedTags };
      if (!form.accountStructureType) delete payload.accountStructureType;
      if (!form.vertical) delete payload.vertical;
      await update.mutateAsync(payload);
      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update organization";
      Alert.alert("Error", message);
    }
  };

  if (isLoading || !ready) {
    return <LoadingSpinner />;
  }

  const tags = tagsData?.tags || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "Edit Organization" }} />

      <Field label="Organization Name *" value={form.name} onChangeText={set("name")} placeholder="City Medical Center" />
      <Field label="Legal Name" value={form.legalName} onChangeText={set("legalName")} placeholder="City Medical Center, LLC" />

      <ChipSelector
        label="Account Structure"
        options={STRUCT_TYPES}
        labelMap={ACCOUNT_STRUCTURE_LABELS}
        value={form.accountStructureType}
        onChange={(v: string | null) => setForm(f => ({ ...f, accountStructureType: v }))}
      />

      <ChipSelector
        label="Vertical"
        options={VERTICALS}
        labelMap={VERTICAL_LABELS}
        value={form.vertical}
        onChange={(v: string | null) => setForm(f => ({ ...f, vertical: v }))}
      />

      <Field label="Website" value={form.website} onChangeText={set("website")} autoCapitalize="none" keyboardType="url" />
      <Field label="Phone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" autoCapitalize="none" />
      <Field label="Email" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Industry" value={form.industry} onChangeText={set("industry")} placeholder="Healthcare" />
      <Field label="City" value={form.city} onChangeText={set("city")} />
      <Field label="State" value={form.state} onChangeText={set("state")} placeholder="MD" />

      <View style={styles.field}>
        <Text style={styles.label}>Organization Type</Text>
        <View style={styles.typeGrid}>
          {ORG_TYPES.map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.typeChip, form.organizationType === t && styles.typeChipActive]}
              onPress={() => setForm(f => ({ ...f, organizationType: t }))}
            >
              <Text style={[styles.typeChipText, form.organizationType === t && styles.typeChipTextActive]}>{ORG_TYPE_LABELS[t]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tags.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Tags</Text>
          <View style={styles.tagGrid}>
            {tags.map((t: { id: string; name: string; color?: string }) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tagChip, selectedTags.includes(t.id) && { backgroundColor: (t.color || COLORS.emerald) + "30", borderColor: t.color || COLORS.emerald }]}
                onPress={() => setSelectedTags(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
              >
                <Text style={[styles.tagChipText, selectedTags.includes(t.id) && { color: t.color || COLORS.emerald }]}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <Button title="Cancel" onPress={() => router.back()} variant="ghost" style={{ flex: 1 }} />
        <Button title="Save Changes" onPress={handleSubmit} loading={update.isPending} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  content: { padding: 16, paddingBottom: 80 },
  field: { marginBottom: 14 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: { backgroundColor: COLORS.navySurface, borderRadius: 10, padding: 12, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  typeChipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  typeChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  typeChipTextActive: { color: COLORS.emerald },
  tagGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  tagChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
});
