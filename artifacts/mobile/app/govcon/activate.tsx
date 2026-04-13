import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { useGovconProfile, useGovconActivate, type PscSuggestion } from "@/hooks/useGovcon";
import { useDebounce } from "@/hooks/useDebounce";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NaicsResult {
  code: string;
  title: string;
  description: string | null;
}

type RoleType = "PRIME" | "SUB" | "BOTH";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { label: "Service Lines", icon: "layers" as const },
  { label: "Region", icon: "map-pin" as const },
  { label: "Role", icon: "briefcase" as const },
  { label: "Teaming", icon: "users" as const },
  { label: "Agencies", icon: "shield" as const },
] as const;

const TOTAL_STEPS = STEPS.length;

// ---------------------------------------------------------------------------
// StepIndicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: number }) {
  return (
    <View style={si.container}>
      {STEPS.map((step, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={step.label}>
            <View style={si.stepWrap}>
              <View style={[si.dot, done && si.dotDone, active && si.dotActive]}>
                {done ? (
                  <Feather name="check" size={10} color={COLORS.navy} />
                ) : (
                  <Feather name={step.icon} size={10} color={active ? COLORS.navy : COLORS.textDim} />
                )}
              </View>
              {active && <Text style={si.label}>{step.label}</Text>}
            </View>
            {i < STEPS.length - 1 && (
              <View style={[si.line, done && si.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const si = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  stepWrap: { alignItems: "center", gap: 4 },
  dot: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    alignItems: "center", justifyContent: "center",
  },
  dotActive: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  dotDone: { backgroundColor: COLORS.emeraldDark, borderColor: COLORS.emeraldDark },
  label: {
    fontSize: 10, fontFamily: "Inter_500Medium",
    color: COLORS.emerald, marginTop: 2, position: "absolute", bottom: -16,
  },
  line: { flex: 1, height: 1, backgroundColor: COLORS.navyBorder, marginHorizontal: 4 },
  lineDone: { backgroundColor: COLORS.emeraldDark },
});

// ---------------------------------------------------------------------------
// Step 1 — Service Lines / NAICS search + PSC suggestions
// ---------------------------------------------------------------------------

function Step1({
  selectedNaics,
  onAdd,
  onRemove,
  pscSuggestions,
  pscLoading,
}: {
  selectedNaics: NaicsResult[];
  onAdd: (n: NaicsResult) => void;
  onRemove: (code: string) => void;
  pscSuggestions: PscSuggestion[];
  pscLoading: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<NaicsResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debouncedQ = useDebounce(query, 350);
  const { searchNaics } = useGovconProfile();

  React.useEffect(() => {
    if (!debouncedQ || debouncedQ.length < 2) { setResults([]); return; }
    setSearching(true);
    searchNaics(debouncedQ)
      .then(r => setResults(r))
      .finally(() => setSearching(false));
  }, [debouncedQ]);

  return (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>Primary Service Lines</Text>
      <Text style={s.stepHint}>
        Search for your core NAICS codes — the industries you primarily serve or operate in.
        {"\n"}Example: "health", "IT consulting", "construction"
      </Text>

      <View style={s.searchRow}>
        <Feather name="search" size={16} color={COLORS.textMuted} style={s.searchIcon} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search service lines..."
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {searching && <ActivityIndicator size="small" color={COLORS.emerald} style={{ marginRight: 10 }} />}
      </View>

      {results.length > 0 && (
        <View style={s.resultsList}>
          {results.map((item) => {
            const already = selectedNaics.some(n => n.code === item.code);
            return (
              <TouchableOpacity
                key={item.code}
                style={[s.resultRow, already && s.resultRowSelected]}
                onPress={() => already ? onRemove(item.code) : onAdd(item)}
                activeOpacity={0.75}
              >
                <View style={s.resultLeft}>
                  <Text style={s.resultCode}>{item.code}</Text>
                  <Text style={s.resultTitle} numberOfLines={1}>{item.title}</Text>
                </View>
                <Feather
                  name={already ? "check-circle" : "plus-circle"}
                  size={18}
                  color={already ? COLORS.emerald : COLORS.textDim}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {selectedNaics.length > 0 && (
        <View style={s.selectedSection}>
          <Text style={s.selectedLabel}>Selected NAICS ({selectedNaics.length})</Text>
          {selectedNaics.map(n => (
            <View key={n.code} style={s.chip}>
              <View style={s.chipLeft}>
                <Text style={s.chipCode}>{n.code}</Text>
                <Text style={s.chipTitle} numberOfLines={1}>{n.title}</Text>
              </View>
              <TouchableOpacity onPress={() => onRemove(n.code)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={14} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {selectedNaics.length > 0 && (
        <View style={s.pscSection}>
          <View style={s.pscHeader}>
            <Feather name="package" size={14} color={COLORS.amber} />
            <Text style={s.pscSectionLabel}>PSC Suggestions</Text>
            {pscLoading && <ActivityIndicator size="small" color={COLORS.amber} />}
          </View>
          <Text style={s.pscHint}>
            These Product & Service Codes are typically associated with your selected service lines.
          </Text>
          {pscSuggestions.length > 0 ? (
            <View style={s.pscList}>
              {pscSuggestions.map(p => (
                <View key={p.code} style={s.pscChip}>
                  <Text style={s.pscCode}>{p.code}</Text>
                  <Text style={s.pscName} numberOfLines={1}>{p.name ?? "—"}</Text>
                </View>
              ))}
            </View>
          ) : !pscLoading ? (
            <Text style={s.optionalTag}>No PSC suggestions found for current selection.</Text>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Operating Region
// ---------------------------------------------------------------------------

function Step2({ region, onChange }: { region: string; onChange: (v: string) => void }) {
  return (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>Operating Region</Text>
      <Text style={s.stepHint}>
        Where do you primarily pursue government contracts?
        {"\n"}Example: "Mid-Atlantic", "Southeast", "National", "OCONUS"
      </Text>
      <TextInput
        style={s.textInput}
        value={region}
        onChangeText={onChange}
        placeholder="e.g. Mid-Atlantic, National..."
        placeholderTextColor={COLORS.textDim}
        autoCapitalize="words"
        returnKeyType="done"
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Prime / Sub / Both
// ---------------------------------------------------------------------------

const ROLE_OPTIONS: { value: RoleType; label: string; desc: string; icon: "star" | "link" | "git-merge" }[] = [
  { value: "PRIME", label: "Prime Contractor", desc: "You lead contracts directly with agencies", icon: "star" },
  { value: "SUB",   label: "Subcontractor",    desc: "You partner under a prime's contract",   icon: "link" },
  { value: "BOTH",  label: "Both",             desc: "You pursue prime and sub opportunities", icon: "git-merge" },
];

function Step3({ roleType, onChange }: { roleType: RoleType; onChange: (v: RoleType) => void }) {
  return (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>Contract Role</Text>
      <Text style={s.stepHint}>
        How do you typically pursue government contracts?
      </Text>
      <View style={s.roleOptions}>
        {ROLE_OPTIONS.map(opt => {
          const selected = roleType === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[s.roleCard, selected && s.roleCardSelected]}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.8}
            >
              <View style={[s.roleIconWrap, selected && s.roleIconWrapSelected]}>
                <Feather name={opt.icon} size={20} color={selected ? COLORS.navy : COLORS.emerald} />
              </View>
              <View style={s.roleTextWrap}>
                <Text style={[s.roleLabel, selected && s.roleLabelSelected]}>{opt.label}</Text>
                <Text style={s.roleDesc}>{opt.desc}</Text>
              </View>
              {selected && <Feather name="check-circle" size={20} color={COLORS.emerald} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Teaming Notes (optional)
// ---------------------------------------------------------------------------

function Step4({ notes, onChange }: { notes: string; onChange: (v: string) => void }) {
  return (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>Teaming Partners</Text>
      <Text style={s.stepHint}>
        Optional: List preferred primes or teaming partners.
        {"\n"}Example: "Leidos, Booz Allen, SAIC — 8(a) preferred"
      </Text>
      <TextInput
        style={[s.textInput, s.textArea]}
        value={notes}
        onChangeText={onChange}
        placeholder="List partners, vehicles, or notes..."
        placeholderTextColor={COLORS.textDim}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
        returnKeyType="default"
      />
      <Text style={s.optionalTag}>Optional — skip if not applicable</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Step 5 — Target Agencies + chips
// ---------------------------------------------------------------------------

function Step5({
  agencies,
  onAdd,
  onRemove,
}: {
  agencies: string[];
  onAdd: (a: string) => void;
  onRemove: (a: string) => void;
}) {
  const [draft, setDraft] = useState("");

  function handleAdd() {
    const trimmed = draft.trim();
    if (!trimmed || agencies.includes(trimmed)) return;
    onAdd(trimmed);
    setDraft("");
  }

  return (
    <View style={s.stepContainer}>
      <Text style={s.stepTitle}>Target Agencies</Text>
      <Text style={s.stepHint}>
        Which agencies do you pursue? Add as many as you like.
        {"\n"}Example: "VA", "DoD", "HHS", "DHS"
      </Text>

      <View style={s.agencyInputRow}>
        <TextInput
          style={[s.textInput, s.agencyInput]}
          value={draft}
          onChangeText={setDraft}
          placeholder="Agency name..."
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity style={s.addBtn} onPress={handleAdd} activeOpacity={0.8}>
          <Feather name="plus" size={18} color={COLORS.navy} />
        </TouchableOpacity>
      </View>

      {agencies.length > 0 && (
        <View style={s.chipRow}>
          {agencies.map(a => (
            <View key={a} style={s.agencyChip}>
              <Text style={s.agencyChipText}>{a}</Text>
              <TouchableOpacity onPress={() => onRemove(a)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
                <Feather name="x" size={12} color={COLORS.emerald} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {agencies.length === 0 && (
        <Text style={s.optionalTag}>Optional — skip if not applicable</Text>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({
  naics,
  region,
  roleType,
  teamingNotes,
  agencies,
}: {
  naics: NaicsResult[];
  region: string;
  roleType: RoleType;
  teamingNotes: string;
  agencies: string[];
}) {
  const roleLabel = ROLE_OPTIONS.find(r => r.value === roleType)?.label ?? roleType;
  return (
    <View style={s.summaryCard}>
      <Text style={s.summaryTitle}>Review Your Profile</Text>
      <SummaryRow icon="layers" label="Service Lines" value={naics.length > 0 ? naics.map(n => `${n.code} ${n.title}`).join("\n") : "None selected"} />
      <SummaryRow icon="map-pin" label="Region" value={region || "Not specified"} />
      <SummaryRow icon="briefcase" label="Role" value={roleLabel} />
      {teamingNotes ? <SummaryRow icon="users" label="Teaming" value={teamingNotes} /> : null}
      {agencies.length > 0 ? <SummaryRow icon="shield" label="Agencies" value={agencies.join(", ")} /> : null}
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={s.summaryRow}>
      <Feather name={icon} size={14} color={COLORS.emerald} style={{ marginTop: 2 }} />
      <View style={s.summaryText}>
        <Text style={s.summaryLabel}>{label}</Text>
        <Text style={s.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Success screen
// ---------------------------------------------------------------------------

function SuccessScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={s.successContainer}>
      <View style={s.successIconWrap}>
        <Feather name="zap" size={48} color={COLORS.emerald} />
      </View>
      <Text style={s.successTitle}>GovCon Intelligence Activated</Text>
      <Text style={s.successDesc}>
        Your workspace targeting profile is live. The platform will now surface contract
        opportunities, classify organizations, and prioritize your radar based on your
        NAICS codes, region, and target agencies.
      </Text>
      <TouchableOpacity style={s.primaryBtn} onPress={onContinue} activeOpacity={0.85}>
        <Text style={s.primaryBtnText}>Go to Dashboard</Text>
        <Feather name="arrow-right" size={18} color={COLORS.navy} />
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function GagcActivateScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { activate } = useGovconActivate();
  const { getPscSuggestionsForNaics } = useGovconProfile();

  const [step, setStep] = useState(0);
  const [naics, setNaics] = useState<NaicsResult[]>([]);
  const [region, setRegion] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("BOTH");
  const [teamingNotes, setTeamingNotes] = useState("");
  const [agencies, setAgencies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // PSC suggestions driven by selected NAICS
  const [pscSuggestions, setPscSuggestions] = useState<PscSuggestion[]>([]);
  const [pscLoading, setPscLoading] = useState(false);

  React.useEffect(() => {
    if (naics.length === 0) { setPscSuggestions([]); return; }
    setPscLoading(true);
    getPscSuggestionsForNaics(naics.map(n => n.code))
      .then(r => setPscSuggestions(r))
      .catch(() => setPscSuggestions([]))
      .finally(() => setPscLoading(false));
  }, [naics]);

  function addNaics(n: NaicsResult) {
    setNaics(prev => prev.some(x => x.code === n.code) ? prev : [...prev, n]);
  }
  function removeNaics(code: string) {
    setNaics(prev => prev.filter(n => n.code !== code));
  }
  function addAgency(a: string) {
    setAgencies(prev => prev.includes(a) ? prev : [...prev, a]);
  }
  function removeAgency(a: string) {
    setAgencies(prev => prev.filter(x => x !== a));
  }

  function handleNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep(s => s + 1);
    } else {
      setShowSummary(true);
    }
  }

  function handleBack() {
    if (showSummary) { setShowSummary(false); return; }
    if (step > 0) { setStep(s => s - 1); }
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await activate({ naics, region, roleType, teamingNotes, agencies });
      setShowSuccess(true);
    } catch (e: any) {
      setSaveError(e?.message ?? "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleContinue() {
    router.replace("/(tabs)/dashboard");
  }

  const canGoNext = step !== 0 || naics.length > 0;

  if (showSuccess) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.navy }}>
        <SuccessScreen onContinue={handleContinue} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.navy }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => (showSummary || step > 0) ? handleBack() : router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>Activate GovCon Intelligence</Text>
          <Text style={s.headerSub}>{showSummary ? "Review & confirm" : `Step ${step + 1} of ${TOTAL_STEPS}`}</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} style={s.skipBtn}>
          <Text style={s.skipText}>Skip</Text>
        </TouchableOpacity>
      </View>

      {!showSummary && <StepIndicator current={step} />}

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {showSummary ? (
          <SummaryCard
            naics={naics}
            region={region}
            roleType={roleType}
            teamingNotes={teamingNotes}
            agencies={agencies}
          />
        ) : (
          <>
            {step === 0 && (
              <Step1
                selectedNaics={naics}
                onAdd={addNaics}
                onRemove={removeNaics}
                pscSuggestions={pscSuggestions}
                pscLoading={pscLoading}
              />
            )}
            {step === 1 && <Step2 region={region} onChange={setRegion} />}
            {step === 2 && <Step3 roleType={roleType} onChange={setRoleType} />}
            {step === 3 && <Step4 notes={teamingNotes} onChange={setTeamingNotes} />}
            {step === 4 && <Step5 agencies={agencies} onAdd={addAgency} onRemove={removeAgency} />}
          </>
        )}
      </ScrollView>

      <View style={[s.footer, { paddingBottom: insets.bottom + 8 }]}>
        {saveError && (
          <View style={s.errorRow}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={s.errorText}>{saveError}</Text>
          </View>
        )}
        {showSummary ? (
          <TouchableOpacity
            style={[s.primaryBtn, saving && s.primaryBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator color={COLORS.navy} />
            ) : (
              <>
                <Feather name="zap" size={18} color={COLORS.navy} />
                <Text style={s.primaryBtnText}>Activate GovCon Intelligence</Text>
              </>
            )}
          </TouchableOpacity>
        ) : (
          <View style={s.footerRow}>
            {step > 0 ? (
              <TouchableOpacity style={s.secondaryBtn} onPress={handleBack} activeOpacity={0.8}>
                <Feather name="arrow-left" size={16} color={COLORS.text} />
                <Text style={s.secondaryBtnText}>Back</Text>
              </TouchableOpacity>
            ) : <View style={s.secondaryBtn} />}

            <TouchableOpacity
              style={[s.primaryBtn, s.primaryBtnFlex, !canGoNext && s.primaryBtnSoft]}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={s.primaryBtnText}>{step === TOTAL_STEPS - 1 ? "Review" : "Next"}</Text>
              <Feather name={step === TOTAL_STEPS - 1 ? "eye" : "arrow-right"} size={16} color={COLORS.navy} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.navyDark,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  backBtn: { padding: 8, marginRight: 4 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  skipBtn: { padding: 8 },
  skipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textDim },

  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  stepContainer: { paddingBottom: 16 },
  stepTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 8 },
  stepHint: {
    fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, lineHeight: 20,
    marginBottom: 20, backgroundColor: COLORS.navyCard, borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: COLORS.navyBorder,
  },

  searchRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navySurface,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder, marginBottom: 8,
  },
  searchIcon: { marginLeft: 12 },
  searchInput: {
    flex: 1, padding: 12, fontFamily: "Inter_400Regular",
    fontSize: 15, color: COLORS.text,
  },

  resultsList: {
    backgroundColor: COLORS.navyCard, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder, marginBottom: 16, overflow: "hidden",
  },
  resultRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  resultRowSelected: { backgroundColor: COLORS.emerald + "18" },
  resultLeft: { flex: 1, marginRight: 10 },
  resultCode: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald },
  resultTitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, marginTop: 2 },

  selectedSection: { marginTop: 4, marginBottom: 16 },
  selectedLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted,
    textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8,
  },
  chip: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navyCard, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.emerald + "44",
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  chipLeft: { flex: 1, marginRight: 8 },
  chipCode: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.emerald },
  chipTitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.text, marginTop: 1 },

  pscSection: {
    backgroundColor: COLORS.amber + "10", borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.amber + "33", padding: 14,
  },
  pscHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  pscSectionLabel: {
    fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.amber,
    textTransform: "uppercase", letterSpacing: 0.8, flex: 1,
  },
  pscHint: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginBottom: 10, lineHeight: 17,
  },
  pscList: { gap: 6 },
  pscChip: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.navyCard, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  pscCode: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.amber, minWidth: 40 },
  pscName: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.text, flex: 1 },

  textInput: {
    backgroundColor: COLORS.navySurface, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 14, fontFamily: "Inter_400Regular", fontSize: 15, color: COLORS.text,
  },
  textArea: { minHeight: 120 },
  optionalTag: {
    fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim,
    marginTop: 10, textAlign: "center",
  },

  roleOptions: { gap: 12 },
  roleCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: COLORS.navyCard, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder, padding: 16,
  },
  roleCardSelected: { borderColor: COLORS.emerald, backgroundColor: COLORS.emerald + "12" },
  roleIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.emerald + "20",
    alignItems: "center", justifyContent: "center",
  },
  roleIconWrapSelected: { backgroundColor: COLORS.emerald },
  roleTextWrap: { flex: 1 },
  roleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  roleLabelSelected: { color: COLORS.emerald },
  roleDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  agencyInputRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
  agencyInput: { flex: 1 },
  addBtn: {
    width: 48, height: 48, borderRadius: 10,
    backgroundColor: COLORS.emerald, alignItems: "center", justifyContent: "center",
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  agencyChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.emerald + "18", borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.emerald + "44",
    paddingHorizontal: 12, paddingVertical: 7,
  },
  agencyChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.emerald },

  summaryCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.navyBorder, padding: 16, gap: 14,
  },
  summaryTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text, marginBottom: 4 },
  summaryRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  summaryText: { flex: 1 },
  summaryLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  summaryValue: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text, marginTop: 2, lineHeight: 20 },

  successContainer: {
    flex: 1, alignItems: "center", justifyContent: "center",
    padding: 32,
  },
  successIconWrap: {
    width: 96, height: 96, borderRadius: 30,
    backgroundColor: COLORS.emerald + "20",
    borderWidth: 2, borderColor: COLORS.emerald + "44",
    alignItems: "center", justifyContent: "center",
    marginBottom: 28,
  },
  successTitle: {
    fontFamily: "Inter_700Bold", fontSize: 24, color: COLORS.text,
    textAlign: "center", marginBottom: 14,
  },
  successDesc: {
    fontFamily: "Inter_400Regular", fontSize: 15, color: COLORS.textMuted,
    textAlign: "center", lineHeight: 22, marginBottom: 36,
  },

  footer: {
    padding: 16, paddingTop: 12,
    backgroundColor: COLORS.navyDark,
    borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
  },
  footerRow: { flexDirection: "row", gap: 12 },
  errorRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: COLORS.red + "18", borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.red + "44",
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, flex: 1 },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.emerald, borderRadius: 12,
    paddingVertical: 16, gap: 8,
  },
  primaryBtnFlex: { flex: 1 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnSoft: { opacity: 0.7 },
  primaryBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.navy },
  secondaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.navySurface, borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 20, gap: 6,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  secondaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
});
