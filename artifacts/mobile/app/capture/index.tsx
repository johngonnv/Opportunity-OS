import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useCaptureNormalize, useCaptureContact, useOrganizations, type CaptureDuplicate } from "@/hooks/useApi";

type PhoneType = "work" | "personal";
type PlayType = "OPEN_ACCOUNT" | "GROW_ACCOUNT" | "DISPLACE_VENDOR" | "PURSUE_CONTRACT";

interface OrgOption {
  id: string;
  name: string;
  organizationType: string | null;
}

const PLAY_OPTIONS: { type: PlayType; label: string; icon: string; color: string }[] = [
  { type: "OPEN_ACCOUNT", label: "Open Account", icon: "user-plus", color: COLORS.emerald },
  { type: "GROW_ACCOUNT", label: "Grow Account", icon: "trending-up", color: "#60a5fa" },
  { type: "DISPLACE_VENDOR", label: "Displace Vendor", icon: "repeat", color: "#f59e0b" },
  { type: "PURSUE_CONTRACT", label: "Pursue Contract", icon: "file-text", color: "#a78bfa" },
];

const STEPS = ["Identify", "Org", "Phone Type", "Play", "Confirm"] as const;
type Step = 0 | 1 | 2 | 3 | 4;

function StepHeader({ step }: { step: Step }) {
  return (
    <View style={styles.stepHeader}>
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <View style={styles.stepItem}>
            <View style={[styles.stepDot, i < step && styles.stepDotDone, i === step && styles.stepDotActive]}>
              {i < step
                ? <Feather name="check" size={10} color={COLORS.navy} />
                : <Text style={[styles.stepNum, i === step && styles.stepNumActive]}>{i + 1}</Text>
              }
            </View>
            <Text style={[styles.stepLabel, i === step && styles.stepLabelActive]}>{label}</Text>
          </View>
          {i < STEPS.length - 1 && (
            <View style={[styles.stepLine, i < step && styles.stepLineDone]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  autoFocus,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "words" | "sentences";
  autoFocus?: boolean;
  returnKeyType?: "next" | "done";
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={COLORS.textDim}
        keyboardType={keyboardType || "default"}
        autoCapitalize={autoCapitalize || "words"}
        autoFocus={autoFocus}
        returnKeyType={returnKeyType || "done"}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

export default function CaptureScreen() {
  const router = useRouter();
  const captureNormalize = useCaptureNormalize();
  const captureContact = useCaptureContact();
  const { data: orgsData } = useOrganizations({ limit: "200" });

  const [step, setStep] = useState<Step>(0);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("");
  const [title, setTitle] = useState("");

  const [normalized, setNormalized] = useState<{ firstName: string; lastName: string; fullName: string; phone: string; email: string } | null>(null);
  const [duplicate, setDuplicate] = useState<CaptureDuplicate | null>(null);
  const [dupResolution, setDupResolution] = useState<"new" | "merge" | null>(null);

  const [orgMode, setOrgMode] = useState<"search" | "create" | "independent">("search");
  const [orgSearch, setOrgSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<OrgOption | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgType, setNewOrgType] = useState("OTHER");

  const [phoneType, setPhoneType] = useState<PhoneType | null>(null);
  const [playType, setPlayType] = useState<PlayType | null>(null);

  const allOrgs: OrgOption[] = (orgsData?.organizations || []) as OrgOption[];
  const filteredOrgs = orgSearch.trim()
    ? allOrgs.filter(o => o.name.toLowerCase().includes(orgSearch.toLowerCase()))
    : allOrgs.slice(0, 20);

  const goNext = () => setStep(s => Math.min(s + 1, 4) as Step);
  const goBack = () => {
    if (step === 0) { router.back(); return; }
    setStep(s => Math.max(s - 1, 0) as Step);
  };

  const handleStep0Next = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      Alert.alert("Name required", "Please enter at least a first or last name.");
      return;
    }
    try {
      const result = await captureNormalize.mutateAsync({ firstName, lastName, phone, email });
      setNormalized(result.normalized);
      if (result.duplicate) {
        setDuplicate(result.duplicate);
        setDupResolution(null);
      } else {
        setDuplicate(null);
        setDupResolution(null);
      }
      goNext();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to normalize contact";
      Alert.alert("Error", msg);
    }
  };

  const handleSubmit = async () => {
    const isIndependent = orgMode === "independent";
    const orgPayload =
      orgMode === "search" && selectedOrg
        ? { id: selectedOrg.id }
        : orgMode === "create" && newOrgName.trim()
        ? { name: newOrgName.trim(), organizationType: newOrgType }
        : undefined;

    const canHavePlay = !!(orgPayload || isIndependent === false);

    try {
      const result = await captureContact.mutateAsync({
        contact: {
          firstName: normalized?.firstName ?? firstName,
          lastName: normalized?.lastName ?? lastName,
          fullName: (normalized?.fullName ?? [firstName, lastName].filter(Boolean).join(" ")) || "Unknown",
          phone: normalized?.phone ?? phone,
          email: normalized?.email ?? email,
          title: title || undefined,
          source: source || "CAPTURE",
        },
        org: orgPayload,
        phoneType: phoneType ?? undefined,
        playType: playType ?? undefined,
        isIndependent,
        force: dupResolution === "new" ? true : undefined,
        mergeWithContactId: dupResolution === "merge" && duplicate ? duplicate.id : undefined,
      });

      const contactId = result.contact?.id;
      router.back();
      if (contactId) {
        router.push(`/contact/${contactId}` as Href);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to capture contact";
      Alert.alert("Capture failed", msg);
    }
  };

  const renderStep0 = () => (
    <ScrollView style={styles.stepBody} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>Identify Contact</Text>
      <Text style={styles.stepSubtitle}>Enter the contact's details. We'll check for duplicates before saving.</Text>

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="First Name" value={firstName} onChangeText={setFirstName} placeholder="Jane" autoFocus returnKeyType="next" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Smith" returnKeyType="next" />
        </View>
      </View>

      <Field label="Title / Role" value={title} onChangeText={setTitle} placeholder="Director of Operations" returnKeyType="next" />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" returnKeyType="next" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" returnKeyType="next" />
      <Field label="Source" value={source} onChangeText={setSource} placeholder="Conference, referral…" returnKeyType="done" />

      <Button
        title="Next: Assign Org"
        onPress={handleStep0Next}
        loading={captureNormalize.isPending}
        style={styles.nextBtn}
      />
    </ScrollView>
  );

  const renderDuplicateAlert = () => {
    if (!duplicate) return null;
    return (
      <View style={styles.dupAlert}>
        <Feather name="alert-triangle" size={14} color={COLORS.amber} />
        <View style={{ flex: 1 }}>
          <Text style={styles.dupTitle}>Possible duplicate: {duplicate.fullName}</Text>
          <Text style={styles.dupSub}>Matched by {duplicate.matchReason}</Text>
        </View>
        <View style={styles.dupButtons}>
          <TouchableOpacity
            style={[styles.dupBtn, dupResolution === "merge" && styles.dupBtnActive]}
            onPress={() => setDupResolution("merge")}
          >
            <Text style={[styles.dupBtnText, dupResolution === "merge" && styles.dupBtnTextActive]}>Merge</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dupBtn, dupResolution === "new" && styles.dupBtnActive]}
            onPress={() => setDupResolution("new")}
          >
            <Text style={[styles.dupBtnText, dupResolution === "new" && styles.dupBtnTextActive]}>Save New</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStep1 = () => (
    <ScrollView style={styles.stepBody} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>Assign Organization</Text>
      <Text style={styles.stepSubtitle}>Link this contact to an org, create one, or mark as independent.</Text>

      {renderDuplicateAlert()}

      <View style={styles.orgModeRow}>
        {(["search", "create", "independent"] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.orgModeBtn, orgMode === m && styles.orgModeBtnActive]}
            onPress={() => setOrgMode(m)}
          >
            <Text style={[styles.orgModeBtnText, orgMode === m && styles.orgModeBtnTextActive]}>
              {m === "search" ? "Find Org" : m === "create" ? "Create Org" : "Independent"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {orgMode === "search" && (
        <View>
          <Field label="Search organizations" value={orgSearch} onChangeText={setOrgSearch} autoCapitalize="words" />
          <View style={styles.orgList}>
            {filteredOrgs.map(o => (
              <TouchableOpacity
                key={o.id}
                style={[styles.orgRow, selectedOrg?.id === o.id && styles.orgRowSelected]}
                onPress={() => setSelectedOrg(o)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.orgName}>{o.name}</Text>
                  {o.organizationType && (
                    <Text style={styles.orgType}>{o.organizationType.replace(/_/g, " ")}</Text>
                  )}
                </View>
                {selectedOrg?.id === o.id && <Feather name="check" size={16} color={COLORS.emerald} />}
              </TouchableOpacity>
            ))}
            {filteredOrgs.length === 0 && (
              <Text style={styles.emptyText}>No organizations found. Try "Create Org" instead.</Text>
            )}
          </View>
        </View>
      )}

      {orgMode === "create" && (
        <View>
          <Field label="Organization Name" value={newOrgName} onChangeText={setNewOrgName} placeholder="Acme Corp" />
          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {["OTHER", "HOSPITAL", "GOVERNMENT_AGENCY", "PRIME_CONTRACTOR", "CONSULTANT"].map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, newOrgType === t && styles.chipActive]}
                onPress={() => setNewOrgType(t)}
              >
                <Text style={[styles.chipText, newOrgType === t && styles.chipTextActive]}>
                  {t.replace(/_/g, " ")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {orgMode === "independent" && (
        <View style={styles.infoCard}>
          <Feather name="user" size={16} color={COLORS.textMuted} />
          <Text style={styles.infoText}>
            Contact will be marked as independent — no org affiliation.
          </Text>
        </View>
      )}

      <View style={styles.navRow}>
        <Button title="Back" onPress={goBack} variant="ghost" style={{ flex: 1 }} />
        <Button
          title="Next: Phone Type"
          onPress={() => {
            if (duplicate && !dupResolution) {
              Alert.alert("Duplicate not resolved", "Please choose to merge or save as new.");
              return;
            }
            goNext();
          }}
          style={{ flex: 2 }}
        />
      </View>
    </ScrollView>
  );

  const renderStep2 = () => {
    const hasPhone = !!(normalized?.phone || phone);
    return (
      <ScrollView style={styles.stepBody} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>Phone Classification</Text>
        <Text style={styles.stepSubtitle}>
          {hasPhone
            ? `Classify ${normalized?.phone || phone} as work or personal.`
            : "No phone captured — skip this step."}
        </Text>

        {hasPhone && (
          <View style={styles.phoneTypeRow}>
            <TouchableOpacity
              style={[styles.phoneTypeBtn, phoneType === "work" && styles.phoneTypeBtnActive]}
              onPress={() => setPhoneType("work")}
            >
              <Feather name="briefcase" size={20} color={phoneType === "work" ? COLORS.navy : COLORS.textMuted} />
              <Text style={[styles.phoneTypeBtnText, phoneType === "work" && styles.phoneTypeBtnTextActive]}>
                Work
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.phoneTypeBtn, phoneType === "personal" && styles.phoneTypeBtnActive]}
              onPress={() => setPhoneType("personal")}
            >
              <Feather name="smartphone" size={20} color={phoneType === "personal" ? COLORS.navy : COLORS.textMuted} />
              <Text style={[styles.phoneTypeBtnText, phoneType === "personal" && styles.phoneTypeBtnTextActive]}>
                Personal
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.navRow}>
          <Button title="Back" onPress={goBack} variant="ghost" style={{ flex: 1 }} />
          <Button title="Next: Play" onPress={goNext} style={{ flex: 2 }} />
        </View>
      </ScrollView>
    );
  };

  const renderStep3 = () => (
    <ScrollView style={styles.stepBody} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>Start a Play</Text>
      <Text style={styles.stepSubtitle}>
        Optionally scaffold a sales play for this contact. Skip to save without one.
      </Text>

      <View style={styles.playGrid}>
        {PLAY_OPTIONS.map(p => (
          <TouchableOpacity
            key={p.type}
            style={[styles.playCard, playType === p.type && { borderColor: p.color, backgroundColor: p.color + "20" }]}
            onPress={() => setPlayType(playType === p.type ? null : p.type)}
            activeOpacity={0.8}
          >
            <Feather name={p.icon as "user-plus"} size={22} color={playType === p.type ? p.color : COLORS.textMuted} />
            <Text style={[styles.playLabel, playType === p.type && { color: p.color }]}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {playType && (orgMode === "search" && !selectedOrg) && orgMode !== "independent" && (
        <View style={styles.warnCard}>
          <Feather name="alert-circle" size={13} color={COLORS.amber} />
          <Text style={styles.warnText}>Select or create an org to scaffold a play opportunity.</Text>
        </View>
      )}

      <View style={styles.navRow}>
        <Button title="Back" onPress={goBack} variant="ghost" style={{ flex: 1 }} />
        <Button title="Next: Confirm" onPress={goNext} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );

  const renderStep4 = () => {
    const displayName = normalized?.fullName || [firstName, lastName].filter(Boolean).join(" ") || "Unknown";
    const displayPhone = normalized?.phone || phone || "—";
    const displayEmail = normalized?.email || email || "—";
    const orgLabel =
      orgMode === "independent"
        ? "Independent"
        : orgMode === "create" && newOrgName
        ? `${newOrgName} (new)`
        : selectedOrg?.name || "None";
    const playLabel = PLAY_OPTIONS.find(p => p.type === playType)?.label || "None";

    return (
      <ScrollView style={styles.stepBody} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>Confirm Capture</Text>
        <Text style={styles.stepSubtitle}>Review everything before saving.</Text>

        <View style={styles.confirmCard}>
          <Row icon="user" label="Name" value={displayName} />
          <Row icon="phone" label="Phone" value={`${displayPhone}${phoneType ? ` (${phoneType})` : ""}`} />
          <Row icon="mail" label="Email" value={displayEmail} />
          <Row icon="briefcase" label="Title" value={title || "—"} />
          <Row icon="building" label="Org" value={orgLabel} />
          <Row icon="trending-up" label="Play" value={playLabel} />
          <Row icon="tag" label="Source" value={source || "CAPTURE"} />
          {duplicate && dupResolution && (
            <Row
              icon="git-merge"
              label="Duplicate"
              value={dupResolution === "merge" ? `Merge into ${duplicate.fullName}` : "Save as new"}
            />
          )}
        </View>

        <View style={styles.navRow}>
          <Button title="Back" onPress={goBack} variant="ghost" style={{ flex: 1 }} />
          <Button
            title="Capture Contact"
            onPress={handleSubmit}
            loading={captureContact.isPending}
            style={{ flex: 2 }}
          />
        </View>
      </ScrollView>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen
        options={{
          title: "Capture",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
          presentation: "modal",
        }}
      />
      <StepHeader step={step} />
      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep2()}
      {step === 3 && renderStep3()}
      {step === 4 && renderStep4()}
    </KeyboardAvoidingView>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.confirmRow}>
      <Feather name={icon as "user"} size={14} color={COLORS.textMuted} style={{ width: 20 }} />
      <Text style={styles.confirmLabel}>{label}</Text>
      <Text style={styles.confirmValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },

  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: COLORS.navyMid,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  stepItem: { alignItems: "center", gap: 4 },
  stepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  stepDotDone: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  stepNum: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textMuted },
  stepNumActive: { color: COLORS.emerald },
  stepLabel: { fontFamily: "Inter_400Regular", fontSize: 8, color: COLORS.textDim },
  stepLabelActive: { color: COLORS.text, fontFamily: "Inter_500Medium" },
  stepLine: { flex: 1, height: 1, backgroundColor: COLORS.navyBorder, marginBottom: 14 },
  stepLineDone: { backgroundColor: COLORS.emerald },

  stepBody: { flex: 1, padding: 16 },
  stepTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 6 },
  stepSubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, marginBottom: 20, lineHeight: 20 },

  row: { flexDirection: "row", gap: 10 },
  field: { marginBottom: 14 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    padding: 12,
    color: COLORS.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },

  nextBtn: { marginTop: 8 },
  navRow: { flexDirection: "row", gap: 10, marginTop: 24 },

  dupAlert: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.amber + "18",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.amber + "44",
    flexWrap: "wrap",
  },
  dupTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  dupSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  dupButtons: { flexDirection: "row", gap: 8 },
  dupBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navySurface,
  },
  dupBtnActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  dupBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  dupBtnTextActive: { color: COLORS.emerald },

  orgModeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  orgModeBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navySurface,
  },
  orgModeBtnActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  orgModeBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  orgModeBtnTextActive: { color: COLORS.emerald },

  orgList: { gap: 1, borderRadius: 10, overflow: "hidden", marginBottom: 8 },
  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navySurface,
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  orgRowSelected: { backgroundColor: COLORS.emeraldMuted },
  orgName: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  orgType: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, padding: 12, textAlign: "center" },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, flex: 1 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  chipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.emerald },

  phoneTypeRow: { flexDirection: "row", gap: 12, marginVertical: 12 },
  phoneTypeBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navySurface,
  },
  phoneTypeBtnActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emerald },
  phoneTypeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.textMuted },
  phoneTypeBtnTextActive: { color: COLORS.navy },

  playGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginBottom: 8 },
  playCard: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 22,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navySurface,
  },
  playLabel: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.textMuted, textAlign: "center" },

  warnCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.amber + "18",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.amber + "44",
    marginBottom: 8,
  },
  warnText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.amber, flex: 1 },

  confirmCard: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    overflow: "hidden",
    marginBottom: 8,
  },
  confirmRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  confirmLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.textMuted,
    width: 56,
  },
  confirmValue: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
});
