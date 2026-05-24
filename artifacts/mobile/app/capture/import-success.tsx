import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
  Modal, TextInput, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { getApiToken } from "@/hooks/tokenStore";

const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#a5b4fc";
const AMBER = "#f59e0b";

function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  if (Platform.OS === "android") return "http://10.0.2.2:8080/api";
  return "http://localhost:8080/api";
}

interface PlaceholderContact {
  id: string;
  fullName: string;
  title: string;
  orgName: string;
}

interface DraftContact extends PlaceholderContact {
  draftName: string;
  draftTitle: string;
  saved: boolean;
  saving: boolean;
  error: string | null;
}

export default function ImportSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    created,
    skipped,
    errors,
    importType,
    since,
    errorDetails,
    placeholderContacts: placeholderContactsParam,
  } = useLocalSearchParams<{
    created: string;
    skipped: string;
    errors: string;
    importType: string;
    since: string;
    errorDetails: string;
    placeholderContacts: string;
  }>();

  const createdCount = parseInt(created ?? "0", 10);
  const skippedCount = parseInt(skipped ?? "0", 10);
  const errorsCount = parseInt(errors ?? "0", 10);
  const isOrgs = (importType ?? "organizations") === "organizations";
  const errorList: string[] = errorDetails ? JSON.parse(decodeURIComponent(errorDetails)) : [];

  const rawPlaceholders: PlaceholderContact[] = React.useMemo(() => {
    try {
      return placeholderContactsParam
        ? JSON.parse(decodeURIComponent(placeholderContactsParam))
        : [];
    } catch {
      return [];
    }
  }, [placeholderContactsParam]);

  const [drafts, setDrafts] = useState<DraftContact[]>(() =>
    rawPlaceholders.map((c) => ({
      ...c,
      draftName: c.fullName,
      draftTitle: c.title,
      saved: false,
      saving: false,
      error: null,
    }))
  );

  const [resolveModalVisible, setResolveModalVisible] = useState(false);

  const savedCount = drafts.filter((d) => d.saved).length;
  const pendingCount = drafts.length - savedCount;

  const handleStartWorking = () => {
    const sinceParam = since ? `&since=${encodeURIComponent(since)}` : "";
    router.replace(`/(tabs)/organizations?from=bulk_import&count=${createdCount}${sinceParam}` as never);
  };

  const handleImportAnother = () => {
    router.replace("/capture/bulk" as never);
  };

  const handleSaveContact = async (idx: number) => {
    const draft = drafts[idx];
    if (!draft) return;
    const name = draft.draftName.trim();
    if (!name) {
      setDrafts((prev) =>
        prev.map((d, i) => i === idx ? { ...d, error: "Name cannot be empty" } : d)
      );
      return;
    }

    setDrafts((prev) =>
      prev.map((d, i) => i === idx ? { ...d, saving: true, error: null } : d)
    );

    try {
      const base = getBaseUrl();
      const token = getApiToken();
      const res = await fetch(`${base}/contacts/${draft.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fullName: name,
          title: draft.draftTitle.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Update failed (${res.status})`);
      }

      setDrafts((prev) =>
        prev.map((d, i) =>
          i === idx
            ? { ...d, fullName: name, title: draft.draftTitle.trim(), saving: false, saved: true, error: null }
            : d
        )
      );
    } catch (e) {
      setDrafts((prev) =>
        prev.map((d, i) =>
          i === idx
            ? { ...d, saving: false, error: e instanceof Error ? e.message : "Save failed" }
            : d
        )
      );
    }
  };

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Import Complete", headerBackVisible: false }} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroIconWrap}>
            <View style={s.heroIcon}>
              <Feather name="check-circle" size={38} color={COLORS.emerald} />
            </View>
            <View style={s.grokBadge}>
              <Feather name="zap" size={10} color={COLORS.white} />
            </View>
          </View>
          <Text style={s.heroTitle}>
            {createdCount} Record{createdCount !== 1 ? "s" : ""} Imported!
          </Text>
          <Text style={s.heroSub}>
            {isOrgs ? "Grok enriched each org with verified data" : "Contacts added to your CRM"}
          </Text>
        </View>

        {/* Stat cards */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={[s.statNum, { color: COLORS.emerald }]}>{createdCount}</Text>
            <Text style={s.statLabel}>{isOrgs ? "Orgs added" : "Contacts added"}</Text>
          </View>
          {skippedCount > 0 && (
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: COLORS.amber }]}>{skippedCount}</Text>
              <Text style={s.statLabel}>Already existed</Text>
            </View>
          )}
          {errorsCount > 0 && (
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: COLORS.red }]}>{errorsCount}</Text>
              <Text style={s.statLabel}>Errors</Text>
            </View>
          )}
          {skippedCount === 0 && errorsCount === 0 && (
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: COLORS.textDim }]}>0</Text>
              <Text style={s.statLabel}>Skipped</Text>
            </View>
          )}
        </View>

        {/* Placeholder contacts banner */}
        {drafts.length > 0 && (
          <TouchableOpacity
            style={[s.placeholderBanner, savedCount === drafts.length && s.placeholderBannerDone]}
            onPress={() => setResolveModalVisible(true)}
            activeOpacity={0.82}
          >
            <View style={s.placeholderBannerLeft}>
              <View style={[s.placeholderIconWrap, savedCount === drafts.length && s.placeholderIconWrapDone]}>
                <Feather
                  name={savedCount === drafts.length ? "check-circle" : "user-x"}
                  size={16}
                  color={savedCount === drafts.length ? COLORS.emerald : AMBER}
                />
              </View>
              <View style={{ flex: 1 }}>
                {savedCount === drafts.length ? (
                  <Text style={[s.placeholderBannerTitle, { color: COLORS.emerald }]}>
                    All placeholder contacts updated
                  </Text>
                ) : (
                  <Text style={s.placeholderBannerTitle}>
                    {pendingCount} placeholder contact{pendingCount !== 1 ? "s" : ""} need{pendingCount === 1 ? "s" : ""} a real name
                  </Text>
                )}
                <Text style={s.placeholderBannerSub}>
                  {savedCount === drafts.length
                    ? "Names have been saved to the CRM"
                    : "Tap to add real names for Grok-suggested contacts"}
                </Text>
              </View>
            </View>
            <Feather name="chevron-right" size={16} color={savedCount === drafts.length ? COLORS.emerald : AMBER} />
          </TouchableOpacity>
        )}

        {/* Grok enrichment summary (orgs only) */}
        {isOrgs && createdCount > 0 && (
          <View style={s.grokCard}>
            <View style={s.grokIconWrap}>
              <Feather name="zap" size={13} color={COLORS.white} />
            </View>
            <View style={s.grokBody}>
              <Text style={s.grokTitle}>Grok enriched each org</Text>
              <View style={s.grokItems}>
                {[
                  "Facility addresses verified",
                  "Main phone numbers found",
                  "Contacts sourced from web",
                  "Org types classified",
                ].map((item, i) => (
                  <View key={i} style={s.grokItem}>
                    <Feather name="check" size={9} color={COLORS.emerald} />
                    <Text style={s.grokItemTxt}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Skipped duplicates notice */}
        {skippedCount > 0 && (
          <View style={s.warnCard}>
            <Feather name="alert-circle" size={14} color={COLORS.amber} style={{ marginTop: 1 }} />
            <View style={s.warnBody}>
              <Text style={s.warnTitle}>{skippedCount} {skippedCount === 1 ? "record" : "records"} already existed</Text>
              <Text style={s.warnSub}>These were skipped to avoid duplicates</Text>
            </View>
          </View>
        )}

        {/* Error list */}
        {errorList.length > 0 && (
          <View style={s.errorCard}>
            <Text style={s.errorCardTitle}>Import issues</Text>
            {errorList.slice(0, 5).map((e, i) => (
              <Text key={i} style={s.errorCardItem}>• {e}</Text>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {isOrgs && createdCount > 0 && (
          <TouchableOpacity style={s.primaryBtn} onPress={handleStartWorking} activeOpacity={0.85}>
            <Feather name="arrow-right" size={16} color={COLORS.white} />
            <Text style={s.primaryBtnTxt}>Start Working Records</Text>
          </TouchableOpacity>
        )}
        {(!isOrgs || createdCount === 0) && (
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.replace(`/(tabs)/${isOrgs ? "organizations" : "contacts"}?from=bulk_import&count=${createdCount}` as never)}
            activeOpacity={0.85}
          >
            <Feather name="arrow-right" size={16} color={COLORS.white} />
            <Text style={s.primaryBtnTxt}>View {isOrgs ? "Organizations" : "Contacts"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.secondaryBtn} onPress={handleImportAnother} activeOpacity={0.8}>
          <Text style={s.secondaryBtnTxt}>Import Another File</Text>
        </TouchableOpacity>
      </View>

      {/* Resolve Placeholders Modal */}
      <Modal
        visible={resolveModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setResolveModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={m.overlay}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={[m.sheet, { paddingBottom: insets.bottom + 12 }]}>
            {/* Modal header */}
            <View style={m.header}>
              <View style={m.headerLeft}>
                <View style={m.headerIcon}>
                  <Feather name="users" size={14} color={COLORS.white} />
                </View>
                <View>
                  <Text style={m.headerTitle}>Resolve Placeholder Contacts</Text>
                  <Text style={m.headerSub}>
                    {pendingCount > 0
                      ? `${pendingCount} still need a real name`
                      : "All contacts updated!"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setResolveModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Feather name="x" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Contact cards */}
            <ScrollView
              style={m.list}
              contentContainerStyle={m.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {drafts.map((draft, idx) => (
                <View
                  key={draft.id}
                  style={[m.card, draft.saved && m.cardSaved]}
                >
                  {/* Org + role header */}
                  <View style={m.cardHeader}>
                    <View style={m.cardOrgPill}>
                      <Feather name="home" size={9} color={COLORS.textDim} />
                      <Text style={m.cardOrgTxt} numberOfLines={1}>{draft.orgName || "Unknown org"}</Text>
                    </View>
                    {draft.saved && (
                      <View style={m.savedBadge}>
                        <Feather name="check" size={10} color={COLORS.emerald} />
                        <Text style={m.savedBadgeTxt}>Saved</Text>
                      </View>
                    )}
                  </View>

                  {/* Full name field */}
                  <Text style={m.fieldLabel}>Full Name</Text>
                  <TextInput
                    style={[m.input, draft.saved && m.inputSaved]}
                    value={draft.draftName}
                    onChangeText={(v) =>
                      setDrafts((prev) =>
                        prev.map((d, i) => i === idx ? { ...d, draftName: v, saved: false } : d)
                      )
                    }
                    placeholder="Enter contact's real name…"
                    placeholderTextColor={COLORS.textDim}
                    editable={!draft.saving}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />

                  {/* Title field */}
                  <Text style={m.fieldLabel}>Title</Text>
                  <TextInput
                    style={[m.input, draft.saved && m.inputSaved]}
                    value={draft.draftTitle}
                    onChangeText={(v) =>
                      setDrafts((prev) =>
                        prev.map((d, i) => i === idx ? { ...d, draftTitle: v, saved: false } : d)
                      )
                    }
                    placeholder="Job title…"
                    placeholderTextColor={COLORS.textDim}
                    editable={!draft.saving}
                    returnKeyType="done"
                  />

                  {/* Error */}
                  {draft.error && (
                    <View style={m.errorRow}>
                      <Feather name="alert-circle" size={11} color={COLORS.red} />
                      <Text style={m.errorTxt}>{draft.error}</Text>
                    </View>
                  )}

                  {/* Save button */}
                  {!draft.saved && (
                    <TouchableOpacity
                      style={[m.saveBtn, draft.saving && m.saveBtnDisabled]}
                      onPress={() => handleSaveContact(idx)}
                      disabled={draft.saving}
                      activeOpacity={0.85}
                    >
                      {draft.saving ? (
                        <ActivityIndicator size="small" color={COLORS.white} />
                      ) : (
                        <>
                          <Feather name="check" size={13} color={COLORS.white} />
                          <Text style={m.saveBtnTxt}>Save Name</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </ScrollView>

            {/* Done button */}
            <View style={m.footer}>
              <TouchableOpacity
                style={m.doneBtn}
                onPress={() => setResolveModalVisible(false)}
                activeOpacity={0.85}
              >
                <Text style={m.doneBtnTxt}>
                  {pendingCount === 0 ? "Done" : "Close"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { flex: 1 },
  content: { padding: 20 },

  hero: { alignItems: "center", paddingVertical: 24, gap: 10 },
  heroIconWrap: { position: "relative", marginBottom: 4 },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.emerald + "22",
    borderWidth: 1, borderColor: COLORS.emerald + "44",
    alignItems: "center", justifyContent: "center",
  },
  grokBadge: {
    position: "absolute", top: -4, right: -4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.navyDark,
  },
  heroTitle: { fontSize: 22, fontWeight: "800", color: COLORS.white, letterSpacing: -0.5, textAlign: "center" },
  heroSub: { fontSize: 13, color: COLORS.textDim, textAlign: "center" },

  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: COLORS.navyMid, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center", gap: 4,
  },
  statNum: { fontSize: 26, fontWeight: "800" },
  statLabel: { fontSize: 10, color: COLORS.textDim, textAlign: "center", lineHeight: 13 },

  placeholderBanner: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: AMBER + "14",
    borderWidth: 1, borderColor: AMBER + "40",
    borderRadius: 14, padding: 14, marginBottom: 14,
    gap: 10,
  },
  placeholderBannerDone: {
    backgroundColor: COLORS.emerald + "12",
    borderColor: COLORS.emerald + "35",
  },
  placeholderBannerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  placeholderIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: AMBER + "25",
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  placeholderIconWrapDone: { backgroundColor: COLORS.emerald + "22" },
  placeholderBannerTitle: { fontSize: 13, fontWeight: "700", color: AMBER, marginBottom: 2 },
  placeholderBannerSub: { fontSize: 11, color: COLORS.textDim, lineHeight: 15 },

  grokCard: {
    flexDirection: "row", gap: 12,
    backgroundColor: INDIGO + "18",
    borderWidth: 1, borderColor: INDIGO + "33",
    borderRadius: 14, padding: 14, marginBottom: 14,
  },
  grokIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 2,
  },
  grokBody: { flex: 1 },
  grokTitle: { fontSize: 12, fontWeight: "700", color: INDIGO_LIGHT, marginBottom: 8 },
  grokItems: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  grokItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  grokItemTxt: { fontSize: 10, color: COLORS.textMuted },

  warnCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: COLORS.amber + "12",
    borderWidth: 1, borderColor: COLORS.amber + "33",
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  warnBody: { flex: 1 },
  warnTitle: { fontSize: 12, fontWeight: "600", color: COLORS.amber },
  warnSub: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },

  errorCard: {
    backgroundColor: COLORS.navyMid, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 12, marginBottom: 12,
  },
  errorCardTitle: { fontSize: 12, fontWeight: "700", color: COLORS.red, marginBottom: 6 },
  errorCardItem: { fontSize: 12, color: COLORS.textMuted, marginBottom: 3 },

  footer: {
    paddingHorizontal: 20, paddingTop: 12, gap: 10,
    borderTopWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyDark,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.emerald, borderRadius: 14, paddingVertical: 16,
  },
  primaryBtnTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },
  secondaryBtn: { alignItems: "center", paddingVertical: 8 },
  secondaryBtnTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: "600" },
});

const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: COLORS.navyDark,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: COLORS.navyBorder,
    maxHeight: "88%",
  },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderColor: COLORS.navyBorder,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  headerIcon: {
    width: 32, height: 32, borderRadius: 9,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 15, fontWeight: "700", color: COLORS.white },
  headerSub: { fontSize: 12, color: COLORS.textDim, marginTop: 1 },

  list: { flex: 1 },
  listContent: { padding: 16, gap: 12 },

  card: {
    backgroundColor: COLORS.navyMid,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 14, gap: 6,
  },
  cardSaved: { borderColor: COLORS.emerald + "44", backgroundColor: COLORS.emerald + "08" },

  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  cardOrgPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: COLORS.navyDark, borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    maxWidth: "78%",
  },
  cardOrgTxt: { fontSize: 10, color: COLORS.textDim, fontWeight: "600" },

  savedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.emerald + "18", borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.emerald + "44",
  },
  savedBadgeTxt: { fontSize: 10, color: COLORS.emerald, fontWeight: "700" },

  fieldLabel: { fontSize: 10, fontWeight: "700", color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.6, marginTop: 4 },
  input: {
    backgroundColor: COLORS.navyDark, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: COLORS.white,
  },
  inputSaved: { borderColor: COLORS.emerald + "44" },

  errorRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  errorTxt: { fontSize: 11, color: COLORS.red, flex: 1 },

  saveBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, backgroundColor: INDIGO, borderRadius: 10, paddingVertical: 10, marginTop: 6,
  },
  saveBtnDisabled: { opacity: 0.55 },
  saveBtnTxt: { fontSize: 13, fontWeight: "700", color: COLORS.white },

  footer: {
    paddingHorizontal: 16, paddingTop: 10,
    borderTopWidth: 1, borderColor: COLORS.navyBorder,
  },
  doneBtn: {
    alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.navyMid, borderRadius: 12, paddingVertical: 13,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  doneBtnTxt: { fontSize: 14, fontWeight: "700", color: COLORS.textMuted },
});
