import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert } from "react-native";
import { useRouter, Stack } from "expo-router";
import { COLORS } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useCreateOpportunity, usePipelines, useOrganizations, useContacts } from "@/hooks/useApi";

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: any) {
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
        autoCapitalize={autoCapitalize || "sentences"}
      />
    </View>
  );
}

const VERTICALS = ["HEALTHCARE", "GOVCON", "CONSULTING", "PARTNERSHIP"] as const;

// P2.2: Business model selector for recurring vs project-based opportunities.
// Especially useful for industrial_services clients (Apex-style water treatment recurring optimization
// contracts vs one-time technical assessments/pilots/implementations). Ties to onboarding businessModel.
const BUSINESS_MODELS: { value: string; label: string; hint: string }[] = [
  { value: "RECURRING", label: "Recurring Contract", hint: "Ongoing optimization / monitoring (renewals, cycles)" },
  { value: "PROJECT_BASED", label: "Project / Pilot", hint: "One-time assessment, implementation, or pilot" },
  { value: "HYBRID", label: "Hybrid", hint: "Pilot that converts to recurring program" },
  { value: "ONE_TIME", label: "One-Time", hint: "Single engagement or deliverable" },
];

export default function NewOpportunityScreen() {
  const router = useRouter();
  const create = useCreateOpportunity();
  const { data: pipelinesData } = usePipelines();
  const { data: orgsData } = useOrganizations({ limit: "50" });

  const [form, setForm] = useState({
    title: "",
    description: "",
    vertical: "HEALTHCARE" as string,
    valueEstimate: "",
    pipelineId: "",
    pipelineStageId: "",
    organizationId: "",
    status: "OPEN",
    businessModel: "" as string,  // P2.2
    renewalDate: "", // optional ISO for recurring
  });

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const pipelines = pipelinesData?.pipelines || [];
  const orgs = orgsData?.organizations || [];
  const selectedPipeline = pipelines.find((p: any) => p.id === form.pipelineId) || pipelines[0];
  const stages = selectedPipeline?.stages || [];

  // P2.2: Smart default for businessModel based on selected org (serviceLineTags or vertical)
  // This makes creation flow model-aware and ties to onboarding data for industrial clients.
  const suggestedBusinessModel = useMemo(() => {
    if (form.businessModel) return form.businessModel;
    const selectedOrg = orgs.find((o: any) => o.id === form.organizationId);
    if (!selectedOrg) return "";
    const tags = (selectedOrg.serviceLineTags || []) as string[];
    const isIndustrial = selectedOrg.vertical === "industrial_services";
    const hasRecurringTag = tags.some((t: string) => t.toLowerCase().includes("recurring") || t.toLowerCase().includes("monitoring"));
    const hasPilotTag = tags.some((t: string) => t.toLowerCase().includes("pilot") || t.toLowerCase().includes("assessment"));
    if (hasRecurringTag || (isIndustrial && !hasPilotTag)) return "RECURRING";
    if (hasPilotTag) return "PROJECT_BASED";
    return "";
  }, [form.organizationId, form.businessModel, orgs]);

  const effectiveBusinessModel = form.businessModel || suggestedBusinessModel;

  const handleSubmit = async () => {
    if (!form.title.trim()) return Alert.alert("Title required");
    const pipeline = pipelines.find((p: any) => p.id === form.pipelineId) || pipelines[0];
    const stageId = form.pipelineStageId || pipeline?.stages?.[0]?.id;
    if (!pipeline || !stageId) return Alert.alert("No pipeline configured", "Please check that a pipeline exists.");

    try {
      await create.mutateAsync({
        ...form,
        pipelineId: pipeline.id,
        pipelineStageId: stageId,
        valueEstimate: form.valueEstimate ? parseFloat(form.valueEstimate) : null,
        organizationId: form.organizationId || null,
        businessModel: effectiveBusinessModel || undefined,
        // renewalDate can be added as Date if needed in future
      });
      router.back();
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to create opportunity");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "New Opportunity" }} />

      <Field label="Title *" value={form.title} onChangeText={set("title")} placeholder="VA Hospital Partnership" />
      <Field label="Description" value={form.description} onChangeText={set("description")} placeholder="Brief description of the opportunity..." />
      <Field label="Est. Value ($)" value={form.valueEstimate} onChangeText={set("valueEstimate")} keyboardType="numeric" autoCapitalize="none" />

      <View style={styles.field}>
        <Text style={styles.label}>Vertical</Text>
        <View style={styles.chipRow}>
          {VERTICALS.map(v => (
            <TouchableOpacity
              key={v}
              style={[styles.chip, form.vertical === v && styles.chipActive]}
              onPress={() => setForm(f => ({ ...f, vertical: v }))}
            >
              <Text style={[styles.chipText, form.vertical === v && styles.chipTextActive]}>{v}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* P2.2: Business Model selector - model-aware creation for industrial_services recurring vs project */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Business Model {effectiveBusinessModel ? `(suggested: ${effectiveBusinessModel})` : ""}
        </Text>
        <Text style={styles.hint}>Helps tailor tasks, views, and renewal tracking (especially for industrial / Apex clients)</Text>
        <View style={styles.chipRow}>
          {BUSINESS_MODELS.map(bm => {
            const isActive = effectiveBusinessModel === bm.value;
            return (
              <TouchableOpacity
                key={bm.value}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setForm(f => ({ ...f, businessModel: bm.value }))}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{bm.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {effectiveBusinessModel && (
          <Text style={styles.metaText}>
            {BUSINESS_MODELS.find(b => b.value === effectiveBusinessModel)?.hint}
          </Text>
        )}
      </View>

      {pipelines.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Pipeline</Text>
          <View style={styles.chipRow}>
            {pipelines.map((p: any) => (
              <TouchableOpacity
                key={p.id}
                style={[styles.chip, (form.pipelineId === p.id || (!form.pipelineId && p === pipelines[0])) && styles.chipActive]}
                onPress={() => setForm(f => ({ ...f, pipelineId: p.id, pipelineStageId: "" }))}
              >
                <Text style={[styles.chipText, (form.pipelineId === p.id || (!form.pipelineId && p === pipelines[0])) && styles.chipTextActive]}>{p.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {stages.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Starting Stage</Text>
          <View style={styles.chipRow}>
            {stages.slice(0, 4).map((s: any) => (
              <TouchableOpacity
                key={s.id}
                style={[styles.chip, (form.pipelineStageId === s.id || (!form.pipelineStageId && s === stages[0])) && styles.chipActive]}
                onPress={() => setForm(f => ({ ...f, pipelineStageId: s.id }))}
              >
                <Text style={[styles.chipText, (form.pipelineStageId === s.id || (!form.pipelineStageId && s === stages[0])) && styles.chipTextActive]}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {orgs.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Organization (optional)</Text>
          <View style={styles.chipRow}>
            {[{ id: "", name: "None" }, ...orgs.slice(0, 6)].map((o: any) => (
              <TouchableOpacity
                key={o.id}
                style={[styles.chip, form.organizationId === o.id && styles.chipActive]}
                onPress={() => setForm(f => ({ ...f, organizationId: o.id }))}
              >
                <Text style={[styles.chipText, form.organizationId === o.id && styles.chipTextActive]}>{o.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <Button title="Cancel" onPress={() => router.back()} variant="ghost" style={{ flex: 1 }} />
        <Button title="Create" onPress={handleSubmit} loading={create.isPending} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  content: { padding: 16, paddingBottom: 80 },
  field: { marginBottom: 16 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  hint: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 6 },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.emerald, marginTop: 4 },
  input: { backgroundColor: COLORS.navySurface, borderRadius: 10, padding: 12, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  chipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.emerald },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
});
