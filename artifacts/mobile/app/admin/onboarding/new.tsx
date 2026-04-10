import React, { useState, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

type ClientType = "SINGLE_USER" | "SMALL_TEAM" | "ENTERPRISE";

interface IntakeForm {
  clientName: string;
  website: string;
  industryDescription: string;
  productsSold: string;
  customerType: string;
  salesCycleType: string;
  teamSize: string;
  complianceNeeds: string;
  govconInvolved: boolean;
  clientType: ClientType;
  notes: string;
}

const DEFAULT_FORM: IntakeForm = {
  clientName: "",
  website: "",
  industryDescription: "",
  productsSold: "",
  customerType: "",
  salesCycleType: "",
  teamSize: "",
  complianceNeeds: "",
  govconInvolved: false,
  clientType: "SMALL_TEAM",
  notes: "",
};

const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: "SINGLE_USER", label: "Single User" },
  { value: "SMALL_TEAM", label: "Small Team" },
  { value: "ENTERPRISE", label: "Enterprise" },
];

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}

function FormField({ label, value, onChangeText, placeholder, multiline, hint }: FormFieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textDim}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

export default function NewOnboardingSessionScreen() {
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [form, setForm] = useState<IntakeForm>(DEFAULT_FORM);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null);

  function set<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const { notes, clientType, govconInvolved, ...rest } = form;
      return adminFetch("/admin/onboarding/sessions", {
        method: "POST",
        body: JSON.stringify({
          ...rest,
          govconInvolved,
          clientType,
          notes: notes || undefined,
        }),
      });
    },
    onSuccess: (data) => {
      setSavedSessionId(data.session.id);
    },
  });

  const recommendMutation = useMutation({
    mutationFn: async () => {
      let sessionId = savedSessionId;
      if (!sessionId) {
        const { notes, clientType, govconInvolved, ...rest } = form;
        const created = await adminFetch("/admin/onboarding/sessions", {
          method: "POST",
          body: JSON.stringify({ ...rest, govconInvolved, clientType, notes: notes || undefined }),
        });
        sessionId = created.session.id;
        setSavedSessionId(sessionId);
      } else {
        await adminFetch(`/admin/onboarding/sessions/${sessionId}/intake`, {
          method: "PATCH",
          body: JSON.stringify(form),
        });
      }
      return adminFetch(`/admin/onboarding/sessions/${sessionId}/recommend`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    onSuccess: (data) => {
      router.replace(`/admin/onboarding/${data.session.id}/recommend` as Href);
    },
  });

  const isLoading = createMutation.isPending || recommendMutation.isPending;
  const hasMinRequired = form.clientName.trim().length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AdminHeader breadcrumbs={[
        { label: "Onboarding", href: "/admin/onboarding" as Href },
        { label: "New Client Session" },
      ]} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>Client Details</Text>

        <FormField
          label="Client Name *"
          value={form.clientName}
          onChangeText={v => set("clientName", v)}
          placeholder="e.g. Acme Corp"
        />
        <FormField
          label="Website"
          value={form.website}
          onChangeText={v => set("website", v)}
          placeholder="e.g. acme.com"
        />
        <FormField
          label="Industry Description"
          value={form.industryDescription}
          onChangeText={v => set("industryDescription", v)}
          placeholder="e.g. Industrial staffing, B2B SaaS"
          multiline
          hint="Describe what the client does in plain language"
        />
        <FormField
          label="Products / Services Sold"
          value={form.productsSold}
          onChangeText={v => set("productsSold", v)}
          placeholder="e.g. Managed services, recurring contracts"
          multiline
        />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Sales Profile</Text>

        <FormField
          label="Customer Type"
          value={form.customerType}
          onChangeText={v => set("customerType", v)}
          placeholder="e.g. SMB, enterprise, government"
        />
        <FormField
          label="Sales Cycle Type"
          value={form.salesCycleType}
          onChangeText={v => set("salesCycleType", v)}
          placeholder="e.g. transactional, relationship-driven, 6–18 month"
        />
        <FormField
          label="Team Size"
          value={form.teamSize}
          onChangeText={v => set("teamSize", v)}
          placeholder="e.g. 5 reps, 2 AEs + 1 SDR"
        />
        <FormField
          label="Compliance Needs"
          value={form.complianceNeeds}
          onChangeText={v => set("complianceNeeds", v)}
          placeholder="e.g. HIPAA, ITAR, SOC2, none"
        />

        <View style={styles.switchRow}>
          <View style={styles.switchLeft}>
            <Text style={styles.fieldLabel}>GovCon Involved?</Text>
            <Text style={styles.fieldHint}>Does the client work with government contracts?</Text>
          </View>
          <Switch
            value={form.govconInvolved}
            onValueChange={v => set("govconInvolved", v)}
            trackColor={{ true: COLORS.amber + "88", false: COLORS.navyBorder }}
            thumbColor={form.govconInvolved ? COLORS.amber : COLORS.textDim}
          />
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Account Type</Text>
        <View style={styles.clientTypeRow}>
          {CLIENT_TYPES.map(ct => (
            <TouchableOpacity
              key={ct.value}
              style={[
                styles.clientTypeChip,
                form.clientType === ct.value && styles.clientTypeChipActive,
              ]}
              onPress={() => set("clientType", ct.value)}
            >
              <Text style={[
                styles.clientTypeChipText,
                form.clientType === ct.value && styles.clientTypeChipTextActive,
              ]}>
                {ct.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Notes</Text>
        <FormField
          label="Internal Notes"
          value={form.notes}
          onChangeText={v => set("notes", v)}
          placeholder="Any other context for onboarding…"
          multiline
        />

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.saveBtn, !hasMinRequired && styles.btnDisabled]}
            onPress={() => createMutation.mutate()}
            disabled={isLoading || !hasMinRequired}
          >
            {createMutation.isPending ? (
              <ActivityIndicator size="small" color={COLORS.amber} />
            ) : (
              <>
                <Feather name="save" size={16} color={COLORS.amber} />
                <Text style={styles.saveBtnText}>
                  {savedSessionId ? "Draft Saved" : "Save Draft"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.recommendBtn, !hasMinRequired && styles.btnDisabled]}
            onPress={() => recommendMutation.mutate()}
            disabled={isLoading || !hasMinRequired}
          >
            {recommendMutation.isPending ? (
              <ActivityIndicator size="small" color={COLORS.navyDark} />
            ) : (
              <>
                <Feather name="zap" size={16} color={COLORS.navyDark} />
                <Text style={styles.recommendBtnText}>Generate Recommendation</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {(createMutation.isError || recommendMutation.isError) && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.errorText}>
              {String((createMutation.error || recommendMutation.error as Error)?.message ?? "An error occurred")}
            </Text>
          </View>
        )}

        {savedSessionId && !recommendMutation.isPending && (
          <TouchableOpacity
            style={styles.viewSessionLink}
            onPress={() => router.push(`/admin/onboarding/${savedSessionId}` as Href)}
          >
            <Text style={styles.viewSessionLinkText}>View saved session →</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  sectionLabel: {
    color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_600SemiBold",
    letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12,
  },
  fieldWrap: { marginBottom: 14 },
  fieldLabel: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  fieldHint: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 6 },
  input: {
    backgroundColor: COLORS.navyCard, color: COLORS.text, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, fontFamily: "Inter_400Regular",
  },
  inputMulti: { minHeight: 72, paddingTop: 10 },

  switchRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navyCard, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 14, marginBottom: 14,
  },
  switchLeft: { flex: 1, marginRight: 12 },

  clientTypeRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  clientTypeChip: {
    flex: 1, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.navyBorder, padding: 10, alignItems: "center",
  },
  clientTypeChipActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "18" },
  clientTypeChipText: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  clientTypeChipTextActive: { color: COLORS.amber },

  actionsRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  saveBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, borderWidth: 1, borderColor: COLORS.amber + "55",
    backgroundColor: COLORS.amber + "11", paddingVertical: 13,
  },
  saveBtnText: { color: COLORS.amber, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  recommendBtn: {
    flex: 2, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, backgroundColor: COLORS.amber, paddingVertical: 13,
  },
  recommendBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_700Bold" },
  btnDisabled: { opacity: 0.4 },

  errorBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.red + "44", backgroundColor: COLORS.red + "11",
  },
  errorText: { color: COLORS.red, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  viewSessionLink: { alignItems: "center", marginTop: 16 },
  viewSessionLinkText: { color: COLORS.amber, fontSize: 13, fontFamily: "Inter_500Medium" },
});
