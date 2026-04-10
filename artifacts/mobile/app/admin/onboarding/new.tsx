import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Switch,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

type ClientType = "SINGLE_USER" | "SMALL_TEAM" | "ENTERPRISE";
type SalesCycleType = "Transactional" | "Complex" | "Recurring";
type TeamSizeOption = "Solo" | "Small" | "Enterprise";

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
  { value: "SINGLE_USER", label: "Solo" },
  { value: "SMALL_TEAM", label: "Team" },
  { value: "ENTERPRISE", label: "Enterprise" },
];

const SALES_CYCLE_OPTIONS: SalesCycleType[] = [
  "Transactional",
  "Complex",
  "Recurring",
];

const TEAM_SIZE_OPTIONS: TeamSizeOption[] = [
  "Solo",
  "Small",
  "Enterprise",
];

interface SegmentedControlProps<T extends string> {
  label: string;
  options: T[];
  value: string;
  onChange: (v: T) => void;
  hint?: string;
}

function SegmentedControl<T extends string>({ label, options, value, onChange, hint }: SegmentedControlProps<T>) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <View style={styles.segmentRow}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[styles.segmentChip, value === opt && styles.segmentChipActive]}
            onPress={() => onChange(opt)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segmentChipText, value === opt && styles.segmentChipTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

interface FormFieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  multiline?: boolean;
  hint?: string;
}

function FormField({ label, value, onChangeText, onBlur, placeholder, multiline, hint }: FormFieldProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textDim}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? "top" : "center"}
      />
    </View>
  );
}

function buildPayload(form: IntakeForm) {
  const { notes, clientType, govconInvolved, ...rest } = form;
  return {
    ...rest,
    govconInvolved,
    clientType,
    notes: notes || undefined,
  };
}

export default function NewOnboardingSessionScreen() {
  const router = useRouter();
  const { presetId, editId } = useLocalSearchParams<{ presetId?: string; editId?: string }>();
  const { isAdminAuthenticated } = useAdminAuthContext();
  const [form, setForm] = useState<IntakeForm>(DEFAULT_FORM);
  const [savedSessionId, setSavedSessionId] = useState<string | null>(editId ?? null);
  const [autoSaveLabel, setAutoSaveLabel] = useState<"idle" | "saving" | "saved">("idle");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedSessionIdRef = useRef<string | null>(null);

  savedSessionIdRef.current = savedSessionId;

  const { data: presetData, isLoading: presetLoading } = useQuery({
    queryKey: ["adminOnboardingPreset", presetId],
    queryFn: () => adminFetch(`/admin/onboarding/presets/${presetId}`),
    enabled: isAdminAuthenticated && !!presetId,
  });

  const { data: editSessionData, isLoading: editLoading } = useQuery({
    queryKey: ["adminOnboardingSession", editId],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${editId}`),
    enabled: isAdminAuthenticated && !!editId,
  });

  useEffect(() => {
    if (presetData?.preset) {
      const p = presetData.preset;
      const payload = (p.presetPayload ?? {}) as Record<string, unknown>;
      setForm(prev => ({
        ...prev,
        clientName: String(payload.clientName ?? ""),
        website: String(payload.website ?? ""),
        industryDescription: String(payload.industryDescription ?? ""),
        productsSold: String(payload.productsSold ?? ""),
        customerType: String(payload.customerType ?? ""),
        salesCycleType: String(payload.salesCycleType ?? ""),
        teamSize: String(payload.teamSize ?? ""),
        complianceNeeds: String(payload.complianceNeeds ?? ""),
        govconInvolved: Boolean(payload.govconInvolved ?? false),
        clientType: (payload.clientType as ClientType) ?? "SMALL_TEAM",
      }));
    }
  }, [presetData?.preset]);

  useEffect(() => {
    if (editSessionData?.session?.intakePayload) {
      const ip = editSessionData.session.intakePayload as Record<string, unknown>;
      setForm({
        clientName: String(ip.clientName ?? ""),
        website: String(ip.website ?? ""),
        industryDescription: String(ip.industryDescription ?? ""),
        productsSold: String(ip.productsSold ?? ""),
        customerType: String(ip.customerType ?? ""),
        salesCycleType: String(ip.salesCycleType ?? ""),
        teamSize: String(ip.teamSize ?? ""),
        complianceNeeds: String(ip.complianceNeeds ?? ""),
        govconInvolved: Boolean(ip.govconInvolved ?? false),
        clientType: (ip.clientType as ClientType) ?? "SMALL_TEAM",
        notes: String(editSessionData.session.notes ?? ""),
      });
    }
  }, [editSessionData?.session]);

  function set<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  const saveDraftMutation = useMutation({
    mutationFn: async (payload: object) => {
      const sid = savedSessionIdRef.current;
      if (!sid) {
        const created = await adminFetch("/admin/onboarding/sessions", {
          method: "POST",
          body: JSON.stringify({ ...payload, ...(presetId ? { presetId } : {}) }),
        });
        setSavedSessionId(created.session.id);
        return created;
      }
      return adminFetch(`/admin/onboarding/sessions/${sid}/intake`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    },
    onSuccess: (data) => {
      if (data?.session?.id && !savedSessionIdRef.current) {
        setSavedSessionId(data.session.id);
      }
      setAutoSaveLabel("saved");
      setTimeout(() => setAutoSaveLabel("idle"), 2000);
    },
    onError: () => setAutoSaveLabel("idle"),
  });

  const triggerAutoSave = useCallback((currentForm: IntakeForm) => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setAutoSaveLabel("saving");
      saveDraftMutation.mutate(buildPayload(currentForm));
    }, 800);
  }, []);

  function setAndAutoSave<K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) {
    setForm(prev => {
      const updated = { ...prev, [key]: value };
      triggerAutoSave(updated);
      return updated;
    });
  }

  const recommendMutation = useMutation({
    mutationFn: async () => {
      let sessionId = savedSessionIdRef.current;
      if (!sessionId) {
        const created = await adminFetch("/admin/onboarding/sessions", {
          method: "POST",
          body: JSON.stringify({ ...buildPayload(form), ...(presetId ? { presetId } : {}) }),
        });
        sessionId = created.session.id;
        setSavedSessionId(sessionId);
      } else {
        await adminFetch(`/admin/onboarding/sessions/${sessionId}/intake`, {
          method: "PATCH",
          body: JSON.stringify(buildPayload(form)),
        });
      }
      return adminFetch(`/admin/onboarding/sessions/${sessionId!}/recommend`, {
        method: "POST",
        body: JSON.stringify({}),
      });
    },
    onSuccess: (data) => {
      router.replace(`/admin/onboarding/${data.session.id}/recommend` as Href);
    },
  });

  const isAnyLoading = saveDraftMutation.isPending || recommendMutation.isPending || presetLoading || editLoading;
  const hasMinRequired = form.clientName.trim().length > 0;
  const isEditing = !!editId;
  const pageTitle = isEditing ? "Edit Intake" : "New Client Session";

  if ((presetLoading && presetId) || (editLoading && editId)) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[
          { label: "Onboarding", href: "/admin/onboarding" as Href },
          { label: pageTitle },
        ]} />
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.amber} size="large" />
          <Text style={styles.loadingText}>{presetLoading ? "Loading preset…" : "Loading session…"}</Text>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <AdminHeader breadcrumbs={[
        { label: "Onboarding", href: "/admin/onboarding" as Href },
        { label: pageTitle },
      ]} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {presetId && presetData?.preset && (
          <View style={styles.presetBanner}>
            <Feather name="package" size={14} color={COLORS.purple} />
            <Text style={styles.presetBannerText}>
              Pre-filled from preset: <Text style={{ color: COLORS.purple, fontFamily: "Inter_600SemiBold" }}>{presetData.preset.name}</Text>
            </Text>
          </View>
        )}

        <View style={styles.titleRow}>
          <Text style={styles.pageTitle}>Client Intake</Text>
          {autoSaveLabel !== "idle" && (
            <View style={styles.autoSaveBadge}>
              {autoSaveLabel === "saving" ? (
                <ActivityIndicator size="small" color={COLORS.textDim} />
              ) : (
                <Feather name="check" size={12} color={COLORS.emerald} />
              )}
              <Text style={[styles.autoSaveText, { color: autoSaveLabel === "saving" ? COLORS.textDim : COLORS.emerald }]}>
                {autoSaveLabel === "saving" ? "Saving…" : "Saved"}
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.sectionLabel}>Client Details</Text>

        <FormField
          label="Client Name *"
          value={form.clientName}
          onChangeText={v => setAndAutoSave("clientName", v)}
          placeholder="e.g. Acme Corp"
        />
        <FormField
          label="Website"
          value={form.website}
          onChangeText={v => setAndAutoSave("website", v)}
          placeholder="e.g. acme.com"
        />
        <FormField
          label="Industry Description"
          value={form.industryDescription}
          onChangeText={v => setAndAutoSave("industryDescription", v)}
          placeholder="e.g. Industrial staffing, B2B SaaS"
          multiline
          hint="Describe what the client does in plain language"
        />
        <FormField
          label="Products / Services Sold"
          value={form.productsSold}
          onChangeText={v => setAndAutoSave("productsSold", v)}
          placeholder="e.g. Managed services, recurring contracts"
          multiline
        />

        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>Sales Profile</Text>

        <FormField
          label="Customer Type"
          value={form.customerType}
          onChangeText={v => setAndAutoSave("customerType", v)}
          placeholder="e.g. SMB, enterprise, government"
        />

        <SegmentedControl
          label="Sales Cycle Type"
          options={SALES_CYCLE_OPTIONS}
          value={form.salesCycleType}
          onChange={v => setAndAutoSave("salesCycleType", v)}
          hint="How long is a typical deal cycle?"
        />

        <SegmentedControl
          label="Team Size"
          options={TEAM_SIZE_OPTIONS}
          value={form.teamSize}
          onChange={v => setAndAutoSave("teamSize", v)}
          hint="Number of sales reps / CRM users"
        />

        <FormField
          label="Compliance Needs"
          value={form.complianceNeeds}
          onChangeText={v => setAndAutoSave("complianceNeeds", v)}
          placeholder="e.g. HIPAA, ITAR, SOC2, none"
        />

        <View style={styles.switchRow}>
          <View style={styles.switchLeft}>
            <Text style={styles.fieldLabel}>GovCon Involved?</Text>
            <Text style={styles.fieldHint}>Does the client work with government contracts?</Text>
          </View>
          <Switch
            value={form.govconInvolved}
            onValueChange={v => setAndAutoSave("govconInvolved", v)}
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
              onPress={() => setAndAutoSave("clientType", ct.value)}
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
          onChangeText={v => setAndAutoSave("notes", v)}
          placeholder="Any other context for onboarding…"
          multiline
        />

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.recommendBtn, !hasMinRequired && styles.btnDisabled]}
            onPress={() => recommendMutation.mutate()}
            disabled={isAnyLoading || !hasMinRequired}
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

        {(saveDraftMutation.isError || recommendMutation.isError) && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.errorText}>
              {String(((saveDraftMutation.error ?? recommendMutation.error) as Error | null)?.message ?? "An error occurred")}
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },

  presetBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.purple + "18", borderRadius: 10, borderWidth: 1,
    borderColor: COLORS.purple + "44", padding: 10, marginBottom: 16,
  },
  presetBannerText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },

  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  pageTitle: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_700Bold" },
  autoSaveBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  autoSaveText: { fontSize: 11, fontFamily: "Inter_500Medium" },

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

  segmentRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segmentChip: {
    borderRadius: 8, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: COLORS.navyCard,
  },
  segmentChipActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "18" },
  segmentChipText: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_500Medium" },
  segmentChipTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },

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
    backgroundColor: COLORS.navyCard,
  },
  clientTypeChipActive: { borderColor: COLORS.amber, backgroundColor: COLORS.amber + "18" },
  clientTypeChipText: { color: COLORS.textDim, fontSize: 12, fontFamily: "Inter_600SemiBold" },
  clientTypeChipTextActive: { color: COLORS.amber },

  actionsRow: { marginTop: 8 },
  recommendBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 12, backgroundColor: COLORS.amber, paddingVertical: 14,
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
