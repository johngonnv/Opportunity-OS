import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { apiFetch } from "@/hooks/useApi";

interface ParsedBusinessCard {
  fullName: string;
  firstName: string;
  lastName: string;
  title: string;
  organizationName: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  address: string;
  cardNotes: string;
  rawText: string;
}

const INDIGO = "#6366f1";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";

function CheckRow({
  text,
  sub,
  badge,
  badgeColor,
  checked,
  onToggle,
}: {
  text: string;
  sub?: string;
  badge?: string;
  badgeColor?: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.checkRow, !checked && styles.checkRowUnchecked]}
      onPress={onToggle}
      activeOpacity={0.75}
    >
      <View
        style={[
          styles.checkCircle,
          { borderColor: checked ? EMERALD : COLORS.navyBorder, backgroundColor: checked ? EMERALD : "transparent" },
        ]}
      >
        {checked && <Feather name="check" size={10} color={COLORS.white} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.checkText} numberOfLines={3}>{text}</Text>
        {sub ? <Text style={styles.checkSub} numberOfLines={2}>{sub}</Text> : null}
      </View>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: (badgeColor || EMERALD) + "22" }]}>
          <Text style={[styles.badgeText, { color: badgeColor || EMERALD }]}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function SectionHead({ title, color }: { title: string; color: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionDot, { backgroundColor: color }]} />
      <Text style={[styles.sectionTitle, { color }]}>{title.toUpperCase()}</Text>
    </View>
  );
}

type ParseStatus = "loading" | "ready" | "failed";

export default function ScanCardReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { cardId } = useLocalSearchParams<{ cardId: string }>();

  const [parseStatus, setParseStatus] = useState<ParseStatus>("loading");
  const [parsed, setParsed] = useState<ParsedBusinessCard | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const [contactChecked, setContactChecked] = useState(true);
  const [orgChecked, setOrgChecked] = useState(true);
  const [notesChecked, setNotesChecked] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedContact, setSavedContact] = useState<{ id: string; fullName: string } | null>(null);
  const [savedOrg, setSavedOrg] = useState<{ id: string; name: string } | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);

  const [showOrgPrompt, setShowOrgPrompt] = useState(false);
  const [orgNameInput, setOrgNameInput] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgCreateError, setOrgCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!cardId) {
      setParseStatus("failed");
      setParseError("No card ID provided.");
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const poll = async () => {
      try {
        const card = await apiFetch(`/business-cards/${cardId}`);
        if (cancelled) return;
        if (card.processingStatus === "PARSED") {
          const p = card.parsedJson as ParsedBusinessCard | null;
          if (p && !("ocrError" in (p as any))) {
            setParsed(p);
            setParseStatus("ready");
          } else {
            setParseStatus("failed");
            setParseError((p as any)?.message || "OCR could not extract data from this image.");
          }
        } else if (card.processingStatus === "FAILED") {
          setParseStatus("failed");
          const errJson = card.parsedJson as any;
          setParseError(errJson?.message || "OCR failed. You can fill in the details manually.");
        } else {
          timer = setTimeout(poll, 2000);
        }
      } catch (e: any) {
        if (!cancelled) {
          setParseStatus("failed");
          setParseError(e?.message || "Failed to check scan status.");
        }
      }
    };

    poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [cardId]);

  const fullName = parsed
    ? parsed.fullName || [parsed.firstName, parsed.lastName].filter(Boolean).join(" ")
    : "";
  const hasContact = !!fullName;
  const hasOrg = !!parsed?.organizationName;
  const hasNotes = !!parsed?.cardNotes;

  const handleSave = async () => {
    if (!parsed || !cardId) return;
    setSaving(true);
    setSaveError(null);
    setIsDuplicate(false);

    const nothingApproved = !contactChecked && !orgChecked;
    if (nothingApproved) {
      try {
        await apiFetch(`/business-cards/${cardId}/reject`, { method: "POST" });
      } catch { /* best-effort */ }
      router.replace("/(tabs)/signals" as Href);
      return;
    }

    try {
      const body: Record<string, unknown> = {
        approvedContact: contactChecked && hasContact,
        approvedOrg: orgChecked && hasOrg,
        approvedNotes: notesChecked && hasNotes,
      };

      if (contactChecked && hasContact) {
        body.contactData = {
          fullName,
          firstName: parsed.firstName || null,
          lastName: parsed.lastName || null,
          title: parsed.title || null,
          email: parsed.email || null,
          phone: parsed.phone || null,
          mobile: parsed.mobile || null,
          source: "CARD_SCAN",
          status: "NEW",
        };
      }

      if (orgChecked && hasOrg) {
        body.organizationData = {
          name: parsed.organizationName,
          website: parsed.website || null,
          organizationType: "OTHER",
          vertical: "healthcare",
        };
      }

      if (notesChecked && hasNotes) {
        body.cardNotes = parsed.cardNotes;
      }

      const result = await apiFetch(`/business-cards/${cardId}/review-save`, {
        method: "POST",
        body: JSON.stringify(body),
      });

      setSavedContact(result.contact || null);
      setSavedOrg(result.organization || null);
      setSaved(true);

      if (result.organization) {
        // Org was created — navigate directly
      } else if (!orgChecked && hasOrg) {
        // Contact created but no org — show prompt to create one
        setOrgNameInput(parsed.organizationName || "");
        setShowOrgPrompt(true);
      }
    } catch (e: any) {
      if (e?.status === 409) {
        setSaveError(e?.body?.message || "A matching contact already exists.");
        setIsDuplicate(true);
      } else {
        setSaveError(e?.message || "Could not save. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveForce = async () => {
    if (!parsed || !cardId) return;
    setSaving(true);
    setSaveError(null);
    setIsDuplicate(false);
    try {
      const body: Record<string, unknown> = {
        approvedContact: contactChecked && hasContact,
        approvedOrg: orgChecked && hasOrg,
        approvedNotes: notesChecked && hasNotes,
        force: true,
      };
      if (contactChecked && hasContact) {
        body.contactData = {
          fullName,
          firstName: parsed.firstName || null,
          lastName: parsed.lastName || null,
          title: parsed.title || null,
          email: parsed.email || null,
          phone: parsed.phone || null,
          mobile: parsed.mobile || null,
          source: "CARD_SCAN",
          status: "NEW",
        };
      }
      if (orgChecked && hasOrg) {
        body.organizationData = { name: parsed.organizationName, website: parsed.website || null, organizationType: "OTHER", vertical: "healthcare" };
      }
      if (notesChecked && hasNotes) body.cardNotes = parsed.cardNotes;

      const result = await apiFetch(`/business-cards/${cardId}/review-save`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSavedContact(result.contact || null);
      setSavedOrg(result.organization || null);
      setSaved(true);
      if (!result.organization && !orgChecked && hasOrg) {
        setOrgNameInput(parsed.organizationName || "");
        setShowOrgPrompt(true);
      }
    } catch (e: any) {
      setSaveError(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrg = async () => {
    const name = orgNameInput.trim();
    if (!name) { setOrgCreateError("Please enter an organization name."); return; }
    setCreatingOrg(true);
    setOrgCreateError(null);
    try {
      let orgId: string;
      try {
        const org = await apiFetch("/organizations", {
          method: "POST",
          body: JSON.stringify({ name, organizationType: "OTHER", vertical: "healthcare" }),
        });
        orgId = org.id;
      } catch (e: any) {
        if (e?.status === 409 && e?.body?.existing?.id) {
          orgId = e.body.existing.id;
        } else {
          throw e;
        }
      }

      if (cardId) {
        await apiFetch(`/business-cards/${cardId}/link-org`, {
          method: "POST",
          body: JSON.stringify({ organizationId: orgId }),
        }).catch(() => {});
      }

      router.replace(`/organization/${orgId}` as Href);
    } catch (e: any) {
      setOrgCreateError(e?.message || "Could not create organization.");
      setCreatingOrg(false);
    }
  };

  const handleDone = () => {
    if (savedOrg) {
      router.replace(`/organization/${savedOrg.id}` as Href);
    } else {
      router.replace("/(tabs)/signals" as Href);
    }
  };

  const renderLoading = () => (
    <View style={styles.centeredState}>
      <ActivityIndicator size="large" color={EMERALD} />
      <Text style={styles.stateTitle}>Reading card…</Text>
      <Text style={styles.stateSub}>Extracting contact info with OCR. Usually takes a few seconds.</Text>
    </View>
  );

  const renderFailed = () => (
    <View style={styles.centeredState}>
      <Feather name="alert-circle" size={40} color={COLORS.red} />
      <Text style={styles.stateTitle}>OCR could not read this card</Text>
      <Text style={styles.stateSub}>{parseError || "Could not extract data from the image."}</Text>
      <TouchableOpacity
        style={styles.manualBtn}
        onPress={() => router.replace("/capture/new?source=CARD_SCAN" as Href)}
        activeOpacity={0.8}
      >
        <Text style={styles.manualBtnText}>Fill In Manually</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.backLink}
        onPress={() => router.replace("/capture/scan-card" as Href)}
        activeOpacity={0.7}
      >
        <Text style={styles.backLinkText}>Scan Again</Text>
      </TouchableOpacity>
    </View>
  );

  if (parseStatus === "loading") {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: "Scan Review", headerStyle: { backgroundColor: COLORS.navyMid }, headerTintColor: COLORS.text, headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 } }} />
        {renderLoading()}
      </View>
    );
  }

  if (parseStatus === "failed") {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: "Scan Review", headerStyle: { backgroundColor: COLORS.navyMid }, headerTintColor: COLORS.text, headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 } }} />
        {renderFailed()}
      </View>
    );
  }

  const contactSub = [parsed?.title, parsed?.email, parsed?.phone || parsed?.mobile].filter(Boolean).join(" · ");
  const orgSub = [parsed?.website, parsed?.address].filter(Boolean).join(" · ");

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Review Scan",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
          headerRight: () => (
            <View style={styles.stepBadge}>
              <Text style={styles.stepText}>Step 2 of 2</Text>
            </View>
          ),
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introCard}>
          <Feather name="credit-card" size={13} color={EMERALD} />
          <Text style={styles.introText}>
            Review what was extracted. Uncheck anything you don't want saved to the CRM.
          </Text>
        </View>

        {hasContact && (
          <View style={styles.section}>
            <SectionHead title="Contact" color={EMERALD} />
            <CheckRow
              text={fullName}
              sub={contactSub || undefined}
              badge="CONTACT"
              badgeColor={EMERALD}
              checked={contactChecked}
              onToggle={() => setContactChecked(v => !v)}
            />
          </View>
        )}

        {hasOrg && (
          <View style={styles.section}>
            <SectionHead title="Organization" color={INDIGO} />
            <CheckRow
              text={parsed!.organizationName}
              sub={orgSub || undefined}
              badge="ORG"
              badgeColor={INDIGO}
              checked={orgChecked}
              onToggle={() => setOrgChecked(v => !v)}
            />
          </View>
        )}

        {hasNotes && (
          <View style={styles.section}>
            <SectionHead title="Notes" color={AMBER} />
            <CheckRow
              text={parsed!.cardNotes.length > 120 ? parsed!.cardNotes.slice(0, 120) + "…" : parsed!.cardNotes}
              badge="NOTES"
              badgeColor={AMBER}
              checked={notesChecked}
              onToggle={() => setNotesChecked(v => !v)}
            />
          </View>
        )}

        {!hasContact && !hasOrg && !hasNotes && (
          <View style={styles.noItems}>
            <Text style={styles.noItemsText}>Nothing was extracted from this scan. Try scanning again or fill in manually.</Text>
          </View>
        )}

        {saveError && (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.errorBannerText}>{saveError}</Text>
          </View>
        )}

        {isDuplicate && !saved && (
          <TouchableOpacity
            style={styles.forceBtn}
            onPress={handleSaveForce}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={styles.forceBtnText}>Save Anyway (Create Duplicate)</Text>
          </TouchableOpacity>
        )}

        {saved ? (
          <>
            <View style={styles.savedCard}>
              <View style={styles.savedHeader}>
                <Feather name="check-circle" size={16} color={EMERALD} />
                <Text style={styles.savedHeaderText}>Saved to CRM</Text>
              </View>
              <View style={styles.savedStats}>
                {savedContact && <Text style={styles.savedStat}>Contact created: {savedContact.fullName}</Text>}
                {savedOrg && <Text style={styles.savedStat}>Organization: {savedOrg.name}</Text>}
                {!savedContact && !savedOrg && <Text style={styles.savedStat}>Scan recorded.</Text>}
              </View>
            </View>

            {showOrgPrompt ? (
              <View style={styles.orgPromptCard}>
                <View style={styles.orgPromptHeader}>
                  <Feather name="home" size={15} color={INDIGO} />
                  <Text style={styles.orgPromptTitle}>Add to Organizations?</Text>
                </View>
                <Text style={styles.orgPromptBody}>
                  Create an organization record so this contact and future visits connect automatically.
                </Text>
                <TextInput
                  style={styles.orgPromptInput}
                  value={orgNameInput}
                  onChangeText={setOrgNameInput}
                  placeholder="Organization name…"
                  placeholderTextColor={COLORS.textDim}
                  autoCorrect={false}
                  editable={!creatingOrg}
                />
                {orgCreateError ? <Text style={styles.orgPromptError}>{orgCreateError}</Text> : null}
                <View style={styles.orgPromptActions}>
                  <TouchableOpacity
                    style={styles.orgPromptYes}
                    onPress={handleCreateOrg}
                    disabled={creatingOrg}
                    activeOpacity={0.8}
                  >
                    {creatingOrg
                      ? <ActivityIndicator size="small" color={COLORS.white} />
                      : <Text style={styles.orgPromptYesText}>Create Organization</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.orgPromptSkip}
                    onPress={() => { setShowOrgPrompt(false); handleDone(); }}
                    disabled={creatingOrg}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.orgPromptSkipText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.doneBtn} onPress={handleDone} activeOpacity={0.8}>
                <Text style={styles.doneBtnText}>
                  {savedOrg ? "View Organization" : "Done"}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.saveBtn, (saving || (!hasContact && !hasOrg)) && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving || (!hasContact && !hasOrg)}
              activeOpacity={0.85}
            >
              {saving ? (
                <>
                  <ActivityIndicator size="small" color={COLORS.white} />
                  <Text style={styles.saveBtnText}>Saving…</Text>
                </>
              ) : (
                <>
                  <Feather name="save" size={18} color={COLORS.white} />
                  <Text style={styles.saveBtnText}>Save to CRM</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backLink}
              onPress={() => router.replace("/capture/scan-card" as Href)}
              disabled={saving}
              activeOpacity={0.7}
            >
              <Text style={styles.backLinkText}>Go Back — Scan Again</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.navy },
  scroll: { flex: 1 },
  inner: { paddingHorizontal: 20, paddingTop: 16 },

  centeredState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 32,
  },
  stateTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: COLORS.text,
    textAlign: "center",
  },
  stateSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
  },
  manualBtn: {
    backgroundColor: EMERALD,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
  },
  manualBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.white },

  stepBadge: {
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginRight: 4,
  },
  stepText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },

  introCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: EMERALD + "10",
    borderWidth: 1,
    borderColor: EMERALD + "30",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 18,
  },
  introText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
  },

  section: { marginBottom: 18 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  sectionDot: { width: 7, height: 7, borderRadius: 4 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 },

  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 6,
  },
  checkRowUnchecked: { opacity: 0.4 },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  checkText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text, lineHeight: 17 },
  checkSub: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, flexShrink: 0 },
  badgeText: { fontFamily: "Inter_700Bold", fontSize: 9 },

  noItems: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 18,
    alignItems: "center",
  },
  noItemsText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, textAlign: "center", lineHeight: 18 },

  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.red + "15",
    borderWidth: 1,
    borderColor: COLORS.red + "40",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  errorBannerText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.red, flex: 1, lineHeight: 17 },

  forceBtn: {
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 4,
  },
  forceBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, textDecorationLine: "underline" },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: INDIGO,
    borderRadius: 16,
    paddingVertical: 17,
    marginBottom: 10,
  },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.white },

  backLink: { alignItems: "center", paddingVertical: 10 },
  backLinkText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },

  savedCard: {
    backgroundColor: EMERALD + "12",
    borderWidth: 1,
    borderColor: EMERALD + "35",
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  savedHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  savedHeaderText: { fontFamily: "Inter_700Bold", fontSize: 14, color: EMERALD },
  savedStats: { gap: 3 },
  savedStat: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },

  doneBtn: {
    backgroundColor: EMERALD,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  doneBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.white },

  orgPromptCard: {
    backgroundColor: INDIGO + "12",
    borderWidth: 1,
    borderColor: INDIGO + "40",
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
    marginBottom: 4,
    gap: 10,
  },
  orgPromptHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  orgPromptTitle: { fontFamily: "Inter_700Bold", fontSize: 13, color: INDIGO },
  orgPromptBody: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  orgPromptInput: {
    backgroundColor: COLORS.navy,
    borderWidth: 1,
    borderColor: INDIGO + "55",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.text,
  },
  orgPromptError: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.red },
  orgPromptActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  orgPromptYes: {
    flex: 1,
    backgroundColor: INDIGO,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  orgPromptYesText: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.white },
  orgPromptSkip: { paddingHorizontal: 18, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  orgPromptSkipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
});
