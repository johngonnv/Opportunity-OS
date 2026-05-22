import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { normalizeLocalCapture } from "@/lib/captureNormalize";
import { Button } from "@/components/ui/Button";
import {
  useCaptureNormalize,
  useCaptureContact,
  useCapturePlay,
  useOrganizations,
  type CaptureDuplicate,
  type CaptureNormalized,
} from "@/hooks/useApi";

type PlayType = "OPEN_ACCOUNT" | "GROW_ACCOUNT" | "DISPLACE_VENDOR" | "PURSUE_CONTRACT";
type Step = 0 | 1 | 2 | 3;

interface OrgOption {
  id: string;
  name: string;
  organizationType: string | null;
}

const STEP_LABELS = ["Identify", "Org", "Note", "Confirm"] as const;

const PLAY_OPTIONS: { type: PlayType; label: string; sub: string; icon: string; color: string }[] = [
  { type: "OPEN_ACCOUNT", label: "Open Account", sub: "New logo, no prior relationship", icon: "user-plus", color: COLORS.emerald },
  { type: "GROW_ACCOUNT", label: "Grow Account", sub: "Expand existing customer relationship", icon: "trending-up", color: "#60a5fa" },
  { type: "DISPLACE_VENDOR", label: "Displace Vendor", sub: "Replace a competitor currently in use", icon: "repeat", color: "#f59e0b" },
  { type: "PURSUE_CONTRACT", label: "Pursue Contract", sub: "GovCon RFP or vehicle opportunity", icon: "file-text", color: "#a78bfa" },
];

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  autoCapitalize,
  autoFocus,
  returnKeyType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "email-address" | "phone-pad" | "url";
  autoCapitalize?: "none" | "words" | "sentences";
  autoFocus?: boolean;
  returnKeyType?: "next" | "done";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
      />
    </View>
  );
}

function StepBar({ step }: { step: Step }) {
  return (
    <View style={styles.stepBar}>
      {STEP_LABELS.map((label, i) => (
        <React.Fragment key={label}>
          <View style={styles.stepItem}>
            <View style={[
              styles.stepDot,
              i < step && styles.stepDotDone,
              i === step && styles.stepDotActive,
            ]}>
              {i < step
                ? <Feather name="check" size={10} color={COLORS.navy} />
                : <Text style={[styles.stepNum, i === step && styles.stepNumActive]}>{i + 1}</Text>
              }
            </View>
            <Text style={[styles.stepText, i === step && styles.stepTextActive]}>{label}</Text>
          </View>
          {i < STEP_LABELS.length - 1 && (
            <View style={[styles.stepLine, i < step && styles.stepLineDone]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

export default function CaptureNewScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    firstName?: string;
    lastName?: string;
    phone?: string;
    mobile?: string;
    email?: string;
    title?: string;
    source?: string;
    organizationId?: string;
    orgName?: string;
  }>();
  const captureNormalize = useCaptureNormalize();
  const captureContact = useCaptureContact();
  const capturePlay = useCapturePlay();
  const { data: orgsData } = useOrganizations({ limit: "200" });

  const [step, setStep] = useState<Step>(0);

  const [firstName, setFirstName] = useState(params.firstName ?? "");
  const [lastName, setLastName] = useState(params.lastName ?? "");
  const [phone, setPhone] = useState(params.phone ?? "");
  const [mobile, setMobile] = useState(params.mobile ?? "");
  const [email, setEmail] = useState(params.email ?? "");
  const [source, setSource] = useState(params.source ?? "");
  const [title, setTitle] = useState(params.title ?? "");
  const cardOrgName = params.orgName ?? "";

  const [normalized, setNormalized] = useState<CaptureNormalized | null>(null);
  const [duplicate, setDuplicate] = useState<CaptureDuplicate | null>(null);
  const [dupResolution, setDupResolution] = useState<"new" | "merge" | null>(null);

  const [orgMode, setOrgMode] = useState<"search" | "create" | "independent">("search");
  const [orgSearch, setOrgSearch] = useState("");
  const [selectedOrg, setSelectedOrg] = useState<OrgOption | null>(null);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgType, setNewOrgType] = useState("OTHER");

  const [notes, setNotes] = useState("");

  const [savedContactId, setSavedContactId] = useState<string | null>(null);
  const [savedContactHasOrg, setSavedContactHasOrg] = useState(false);
  const [showPlayModal, setShowPlayModal] = useState(false);
  const [playType, setPlayType] = useState<PlayType | null>(null);

  const allOrgs: OrgOption[] = (orgsData?.organizations || []) as OrgOption[];
  const filteredOrgs = orgSearch.trim()
    ? allOrgs.filter(o => o.name.toLowerCase().includes(orgSearch.toLowerCase()))
    : allOrgs.slice(0, 30);

  React.useEffect(() => {
    if (params.organizationId && allOrgs.length > 0 && !selectedOrg) {
      const match = allOrgs.find(o => o.id === params.organizationId);
      if (match) {
        setSelectedOrg(match);
        setOrgMode("search");
      }
    }
  }, [params.organizationId, allOrgs.length]);

  const orgSeeded = React.useRef(false);
  React.useEffect(() => {
    if (!cardOrgName || orgSeeded.current || !orgsData) return;
    orgSeeded.current = true;
    if (allOrgs.length === 0) {
      setNewOrgName(cardOrgName);
      setOrgMode("create");
      return;
    }
    const q = cardOrgName.toLowerCase();
    const match = allOrgs.find(o =>
      o.name.toLowerCase().includes(q) || q.includes(o.name.toLowerCase())
    );
    if (match) {
      setOrgSearch(cardOrgName);
      setSelectedOrg(match);
      setOrgMode("search");
    } else {
      setOrgSearch(cardOrgName);
      setNewOrgName(cardOrgName);
      setOrgMode("create");
    }
  }, [orgsData, cardOrgName]);

  const goNext = () => setStep(s => Math.min(s + 1, 3) as Step);
  const goBack = () => {
    if (step === 0) { router.back(); return; }
    setStep(s => Math.max(s - 1, 0) as Step);
  };

  const handleStep0Next = async () => {
    if (!firstName.trim() && !lastName.trim()) {
      Alert.alert("Name required", "Please enter at least a first or last name.");
      return;
    }
    const local = normalizeLocalCapture({ firstName, lastName, phone, email });
    if (local.firstName) setFirstName(local.firstName);
    if (local.lastName) setLastName(local.lastName);
    if (local.email) setEmail(local.email);
    if (local.phone) setPhone(local.phone);
    try {
      const result = await captureNormalize.mutateAsync({
        firstName: local.firstName ?? firstName,
        lastName: local.lastName ?? lastName,
        phone: local.phone ?? phone,
        email: local.email ?? email,
      });
      setNormalized(result.normalized);
      setDuplicate(result.duplicate);
      setDupResolution(null);
      goNext();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to validate contact";
      Alert.alert("Error", msg);
    }
  };

  const handleStep1Next = () => {
    if (duplicate && !dupResolution) {
      Alert.alert("Duplicate not resolved", "Please choose to merge this contact or save as new before continuing.");
      return;
    }
    if (orgMode === "search" && !selectedOrg) {
      Alert.alert(
        "Organization required",
        "Please select an existing organization, create a new one, or mark this contact as Independent.",
      );
      return;
    }
    if (orgMode === "create" && !newOrgName.trim()) {
      Alert.alert("Organization name required", "Please enter a name for the new organization, or switch to Find or Independent.");
      return;
    }
    goNext();
  };

  const handleSubmit = async () => {
    const orgPayload =
      orgMode === "search" && selectedOrg
        ? { id: selectedOrg.id }
        : orgMode === "create" && newOrgName.trim()
        ? { name: newOrgName.trim(), organizationType: newOrgType }
        : undefined;

    const isIndependent = orgMode === "independent";

    const contactPayload = {
      firstName: normalized?.firstName ?? firstName,
      lastName: normalized?.lastName ?? lastName,
      fullName: (normalized?.fullName ?? [firstName, lastName].filter(Boolean).join(" ")) || "Unknown",
      phone: (normalized?.phone ?? phone) || undefined,
      mobile: mobile || undefined,
      email: (normalized?.email ?? email) || undefined,
      title: title || undefined,
      notes: notes || undefined,
      source: source || "CAPTURE",
    };

    try {
      const resolvedPhone = (normalized?.phone ?? phone) || undefined;
      const result = await captureContact.mutateAsync({
        contact: contactPayload,
        org: orgPayload,
        phoneType: resolvedPhone ? "work" : undefined,
        isIndependent,
        force: dupResolution === "new" ? true : undefined,
        mergeWithContactId: dupResolution === "merge" && duplicate ? duplicate.id : undefined,
      });

      const contactId = result.contact?.id as string | undefined;
      const hasOrg = !!(orgPayload || result.organization);

      if (contactId) {
        setSavedContactId(contactId);
        setSavedContactHasOrg(hasOrg);
        if (hasOrg) {
          setShowPlayModal(true);
        } else {
          router.back();
          router.push(`/contact/${contactId}` as Href);
        }
      } else {
        router.back();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to capture contact";
      Alert.alert("Capture failed", msg);
    }
  };

  const navigateAfterCapture = () => {
    setShowPlayModal(false);
    router.back();
    if (savedContactId) {
      router.push(`/contact/${savedContactId}` as Href);
    }
  };

  const renderStep0 = () => (
    <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>Identify Contact</Text>
      <Text style={styles.stepSub}>Enter contact details. We'll check for duplicates automatically.</Text>

      <View style={styles.nameRow}>
        <View style={{ flex: 1 }}>
          <Field label="First Name" value={firstName} onChangeText={setFirstName} placeholder="Jane" autoFocus returnKeyType="next" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last Name" value={lastName} onChangeText={setLastName} placeholder="Smith" returnKeyType="next" />
        </View>
      </View>

      <Field label="Title / Role" value={title} onChangeText={setTitle} placeholder="Director of Operations" returnKeyType="next" />
      <Field label="Phone (Office)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoCapitalize="none" returnKeyType="next" />
      <Field label="Mobile / Cell" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" autoCapitalize="none" returnKeyType="next" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" returnKeyType="next" />
      <Field label="Source" value={source} onChangeText={setSource} placeholder="Conference, referral…" returnKeyType="done" />

      <View style={styles.navRow}>
        <Button title="Cancel" onPress={goBack} variant="ghost" style={{ flex: 1 }} />
        <Button title="Next" onPress={handleStep0Next} loading={captureNormalize.isPending} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );

  const renderDupAlert = () => {
    if (!duplicate) return null;
    return (
      <View style={styles.dupAlert}>
        <Feather name="alert-triangle" size={14} color={COLORS.amber} />
        <View style={{ flex: 1 }}>
          <Text style={styles.dupTitle}>Possible duplicate: {duplicate.fullName}</Text>
          <Text style={styles.dupSub}>Matched by name + {duplicate.matchReason}</Text>
          <TouchableOpacity
            onPress={() => router.push(`/contact/${duplicate.id}` as Href)}
            style={styles.dupViewLink}
          >
            <Feather name="external-link" size={11} color={COLORS.emerald} />
            <Text style={styles.dupViewLinkText}>View existing contact</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.dupBtns}>
          <TouchableOpacity
            style={[styles.dupBtn, dupResolution === "merge" && styles.dupBtnOn]}
            onPress={() => setDupResolution("merge")}
          >
            <Text style={[styles.dupBtnText, dupResolution === "merge" && styles.dupBtnTextOn]}>Merge</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.dupBtn, dupResolution === "new" && styles.dupBtnOn]}
            onPress={() => setDupResolution("new")}
          >
            <Text style={[styles.dupBtnText, dupResolution === "new" && styles.dupBtnTextOn]}>Save New</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStep1 = () => (
    <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.stepTitle}>Assign Organization</Text>
      <Text style={styles.stepSub}>Link to an org, create one inline, or mark as independent.</Text>

      {renderDupAlert()}

      <View style={styles.orgModeRow}>
        {(["search", "create", "independent"] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.orgBtn, orgMode === m && styles.orgBtnOn]}
            onPress={() => setOrgMode(m)}
          >
            <Text style={[styles.orgBtnText, orgMode === m && styles.orgBtnTextOn]}>
              {m === "search" ? "Find" : m === "create" ? "Create" : "Independent"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {orgMode === "search" && (
        <>
          <Field label="Search orgs" value={orgSearch} onChangeText={setOrgSearch} autoCapitalize="words" />
          <View style={styles.orgList}>
            {filteredOrgs.map(o => (
              <TouchableOpacity
                key={o.id}
                style={[styles.orgRow, selectedOrg?.id === o.id && styles.orgRowOn]}
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
              <Text style={styles.emptyText}>No orgs found. Try "Create" to add a new one.</Text>
            )}
          </View>
        </>
      )}

      {orgMode === "create" && (
        <>
          <Field label="Organization Name" value={newOrgName} onChangeText={setNewOrgName} placeholder="Acme Corp" />
          <Text style={styles.fieldLabel}>Type</Text>
          <View style={styles.chipRow}>
            {["OTHER", "HOSPITAL", "GOVERNMENT_AGENCY", "PRIME_CONTRACTOR", "CONSULTANT"].map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.chip, newOrgType === t && styles.chipOn]}
                onPress={() => setNewOrgType(t)}
              >
                <Text style={[styles.chipText, newOrgType === t && styles.chipTextOn]}>
                  {t.replace(/_/g, " ")}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {orgMode === "independent" && (
        <View style={styles.infoCard}>
          <Feather name="user" size={15} color={COLORS.textMuted} />
          <Text style={styles.infoText}>Contact will be saved without an org affiliation.</Text>
        </View>
      )}

      <View style={styles.navRow}>
        <Button title="Back" onPress={goBack} variant="ghost" style={{ flex: 1 }} />
        <Button title="Next" onPress={handleStep1Next} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );

  const renderStep3 = () => {
    return (
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>Conversation Note</Text>
        <Text style={styles.stepSub}>
          Optional — capture any context while it's fresh.
        </Text>

        <View style={styles.field}>
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={notes}
            onChangeText={setNotes}
            placeholder="How you met, what you discussed, follow-up items…"
            placeholderTextColor={COLORS.textDim}
            multiline
            numberOfLines={6}
            autoCapitalize="sentences"
            autoFocus
          />
        </View>

        {duplicate && dupResolution === "new" && (
          <View style={styles.infoCard}>
            <Feather name="alert-circle" size={14} color={COLORS.amber} />
            <Text style={styles.infoText}>
              Existing contact "{duplicate.fullName}" was found (matched by {duplicate.matchReason}). Add a note to distinguish this new record.
            </Text>
          </View>
        )}

        <View style={styles.navRow}>
          <Button title="Back" onPress={goBack} variant="ghost" style={{ flex: 1 }} />
          <Button title="Next" onPress={goNext} style={{ flex: 2 }} />
        </View>
      </ScrollView>
    );
  };

  const renderStep4 = () => {
    const displayName = (normalized?.fullName ?? [firstName, lastName].filter(Boolean).join(" ")) || "Unknown";
    const displayPhone = (normalized?.phone ?? phone) || "—";
    const displayEmail = (normalized?.email ?? email) || "—";
    const orgLabel =
      orgMode === "independent"
        ? "Independent"
        : orgMode === "create" && newOrgName
        ? `${newOrgName} (new)`
        : selectedOrg?.name || "None";

    return (
      <ScrollView style={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.stepTitle}>Confirm</Text>
        <Text style={styles.stepSub}>Review the contact details before saving.</Text>

        <View style={styles.summaryCard}>
          <SummaryRow icon="user" label="Name" value={displayName} />
          <SummaryRow icon="phone" label="Phone" value={displayPhone} />
          <SummaryRow icon="mail" label="Email" value={displayEmail} />
          <SummaryRow icon="briefcase" label="Title" value={title || "—"} />
          <SummaryRow icon="building" label="Org" value={orgLabel} />
          {notes ? <SummaryRow icon="message-square" label="Note" value={notes} /> : null}
          <SummaryRow icon="tag" label="Source" value={source || "CAPTURE"} />
          {duplicate && dupResolution && (
            <SummaryRow
              icon="git-merge"
              label="Duplicate"
              value={dupResolution === "merge" ? `Merge into ${duplicate.fullName}` : "Save as new contact"}
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
          title: params.source === "CARD_SCAN"
            ? "Review Card Scan"
            : params.source === "IOS_CONTACTS"
            ? "Import Contact"
            : "Manual Entry",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        }}
      />

      <StepBar step={step} />
      {step === 0 && renderStep0()}
      {step === 1 && renderStep1()}
      {step === 2 && renderStep3()}
      {step === 3 && renderStep4()}

      <Modal
        visible={showPlayModal}
        transparent
        animationType="slide"
        onRequestClose={navigateAfterCapture}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Contact saved!</Text>
            <Text style={styles.modalSub}>
              What are you trying to do with {(normalized?.fullName ?? [firstName, lastName].filter(Boolean).join(" ")) || "this contact"}?
            </Text>

            <View style={styles.playGrid}>
              {PLAY_OPTIONS.map(p => (
                <TouchableOpacity
                  key={p.type}
                  style={[styles.playCard, playType === p.type && { borderColor: p.color, backgroundColor: p.color + "20" }]}
                  onPress={async () => {
                    setPlayType(p.type);
                    if (savedContactId) {
                      try {
                        await capturePlay.mutateAsync({ contactId: savedContactId, playType: p.type });
                        navigateAfterCapture();
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : "Failed to start play";
                        Alert.alert("Play failed", msg);
                      }
                    }
                  }}
                  disabled={capturePlay.isPending}
                  activeOpacity={0.8}
                >
                  <Feather name={p.icon as "user-plus"} size={20} color={playType === p.type ? p.color : COLORS.textMuted} />
                  <Text style={[styles.playLabel, playType === p.type && { color: p.color }]}>{p.label}</Text>
                  <Text style={styles.playSub} numberOfLines={2}>{p.sub}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Button title="Skip" onPress={navigateAfterCapture} variant="ghost" style={{ flex: 1 }} />
              <Button
                title="View Contact"
                onPress={navigateAfterCapture}
                loading={capturePlay.isPending}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Feather name={icon as "user"} size={13} color={COLORS.textMuted} style={{ width: 18 }} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },

  stepBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: COLORS.navyMid,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  stepItem: { alignItems: "center", gap: 3 },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  stepDotDone: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  stepNum: { fontFamily: "Inter_500Medium", fontSize: 9, color: COLORS.textDim },
  stepNumActive: { color: COLORS.emerald },
  stepText: { fontFamily: "Inter_400Regular", fontSize: 8, color: COLORS.textDim },
  stepTextActive: { color: COLORS.text, fontFamily: "Inter_600SemiBold" },
  stepLine: { flex: 1, height: 1, backgroundColor: COLORS.navyBorder, marginBottom: 12 },
  stepLineDone: { backgroundColor: COLORS.emerald },

  body: { flex: 1, padding: 16 },
  stepTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 6 },
  stepSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginBottom: 20, lineHeight: 19 },

  nameRow: { flexDirection: "row", gap: 10 },
  navRow: { flexDirection: "row", gap: 10, marginTop: 24 },

  field: { marginBottom: 14 },
  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
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
  notesInput: { height: 90, textAlignVertical: "top" },

  dupAlert: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: 10,
    backgroundColor: COLORS.amber + "18",
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.amber + "44",
  },
  dupTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  dupSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  dupBtns: { flexDirection: "row", gap: 8, marginTop: 4 },
  dupBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navySurface,
  },
  dupBtnOn: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  dupBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  dupBtnTextOn: { color: COLORS.emerald },
  dupViewLink: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  dupViewLinkText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.emerald },

  orgModeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  orgBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navySurface,
  },
  orgBtnOn: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  orgBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  orgBtnTextOn: { color: COLORS.emerald },

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
  orgRowOn: { backgroundColor: COLORS.emeraldMuted },
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
  chipOn: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  chipTextOn: { color: COLORS.emerald },

  phoneRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  phoneCard: {
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
  phoneCardOn: { borderColor: COLORS.emerald, backgroundColor: COLORS.emerald },
  phoneLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.textMuted },
  phoneLabelOn: { color: COLORS.navy },

  domainHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.emeraldMuted,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.emerald + "44",
  },
  domainText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.emerald },

  summaryCard: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    overflow: "hidden",
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  summaryLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted, width: 52 },
  summaryValue: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, flex: 1 },

  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: COLORS.navyMid,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: COLORS.navyBorder,
  },
  modalTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 6 },
  modalSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, marginBottom: 20, lineHeight: 20 },

  playGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  playCard: {
    width: "47%",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navySurface,
  },
  playLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted, textAlign: "center" },
  playSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, textAlign: "center", lineHeight: 14 },
  playSection: { marginTop: 20, marginBottom: 4 },
  playSectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.textMuted, marginBottom: 12 },
  clearPlay: { alignSelf: "flex-end", marginTop: 2 },
  clearPlayText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim },
  modalActions: { flexDirection: "row", gap: 10 },

  suggestionList: { gap: 10, marginBottom: 4 },
  suggestionCard: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    overflow: "hidden",
  },
  suggestionPromptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },
  suggestionIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  suggestionPrompt: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  suggestionBtns: { flexDirection: "row", alignItems: "center", gap: 6 },
  acceptBtn: {
    backgroundColor: COLORS.emeraldMuted,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.emerald + "55",
  },
  acceptBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.emerald },
  dismissBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: COLORS.navyBorder,
  },

  suggestionAccepted: { padding: 12 },
  suggestionAcceptedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  dismissAccepted: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    backgroundColor: COLORS.navyBorder,
  },

  allDismissed: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
  },
  allDismissedText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
  },
});
