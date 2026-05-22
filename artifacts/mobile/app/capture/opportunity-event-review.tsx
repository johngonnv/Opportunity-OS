import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { useRouter, Stack, useLocalSearchParams } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { apiFetch } from "@/hooks/useApi";
import { getPendingEvent, clearPendingEvent, type PendingEvent } from "@/stores/opportunityEventStore";

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
        <Text style={styles.checkText} numberOfLines={2}>{text}</Text>
        {sub ? <Text style={styles.checkSub} numberOfLines={1}>{sub}</Text> : null}
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

function buildIcs(orgName: string, occurredAt: string): string {
  const dt = new Date(occurredAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T` +
    `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const end = new Date(dt.getTime() + 60 * 60 * 1000);
  const uid = `${Date.now()}@opportunityos`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Opportunity OS//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(dt)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:Field Visit — ${orgName || "Account"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export default function OpportunityEventReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { payload } = useLocalSearchParams<{ payload?: string }>();

  // Primary: URL param (survives code-split, full-page-reload, any navigation strategy)
  // Fallback: module store (works on native and simple web navigations)
  const pending: PendingEvent | null = (() => {
    if (payload) {
      try { return JSON.parse(Array.isArray(payload) ? payload[0] : payload) as PendingEvent; } catch { /* fall through */ }
    }
    return getPendingEvent();
  })();

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<{
    contactsCreated: number;
    contactsUpdated: number;
    opportunitiesCreated: number;
    tasksCreated: number;
    marketingResourcesLogged: number;
  } | null>(null);

  // Org-creation prompt state (shown after save when org name is known but not linked)
  const [showOrgPrompt, setShowOrgPrompt] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [orgCreateError, setOrgCreateError] = useState<string | null>(null);

  const result = pending?.result;

  const [contacts, setContacts] = useState(
    () => (result?.contacts ?? []).map((c, i) => ({ ...c, id: String(i), checked: true }))
  );
  const [pipeline, setPipeline] = useState(
    () => (result?.pipeline ?? []).map((p, i) => ({ ...p, id: String(i), checked: true }))
  );
  const [actions, setActions] = useState(
    () => (result?.actionItems ?? []).map((a, i) => ({ ...a, id: String(i), checked: true }))
  );
  const [marketing, setMarketing] = useState(
    () => (result?.marketingResources ?? []).map((m, i) => ({ ...m, id: String(i), checked: true }))
  );

  const toggle = <T extends { id: string; checked: boolean }>(
    arr: T[],
    setArr: React.Dispatch<React.SetStateAction<T[]>>,
    id: string
  ) => setArr(arr.map(x => (x.id === id ? { ...x, checked: !x.checked } : x)));

  const handleSave = async () => {
    if (!pending) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch("/opportunity-events/save", {
        method: "POST",
        body: JSON.stringify({
          organizationId: pending.orgId || undefined,
          source: pending.source,
          notes: pending.notes,
          occurredAt: pending.occurredAt,
          summary: result?.summary || "",
          approvedContacts: contacts.filter(c => c.checked),
          approvedActionItems: actions.filter(a => a.checked),
          approvedPipeline: pipeline.filter(p => p.checked),
          approvedMarketing: marketing.filter(m => m.checked),
        }),
      });
      clearPendingEvent();
      setSaveResult(res);
      setSaved(true);
      // Prompt to create org if name was mentioned but not linked
      if (!pending.orgId && pending.orgName?.trim()) {
        setShowOrgPrompt(true);
      }
    } catch (e: any) {
      setSaveError(e?.message || "Could not save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleShareIcs = async () => {
    if (!pending) return;
    const ics = buildIcs(pending.orgName, pending.occurredAt);
    try {
      await Share.share({
        title: `Field Visit — ${pending.orgName || "Account"}`,
        message: ics,
      });
    } catch {
      // dismissed
    }
  };

  const handleDone = () => {
    if (pending?.orgId) {
      router.replace(`/organization/${pending.orgId}` as Href);
    } else {
      router.replace("/(tabs)/signals" as Href);
    }
  };

  const handleCreateOrg = async () => {
    if (!pending?.orgName?.trim()) return;
    setCreatingOrg(true);
    setOrgCreateError(null);
    try {
      const res = await apiFetch("/organizations", {
        method: "POST",
        body: JSON.stringify({
          name: pending.orgName.trim(),
          organizationType: "HOSPITAL",
          vertical: "healthcare",
        }),
      });
      // Navigate to the newly-created org detail page
      router.replace(`/organization/${res.id}` as Href);
    } catch (e: any) {
      // 409 means it already exists — follow the existing org link
      if (e?.status === 409 && e?.body?.existing?.id) {
        router.replace(`/organization/${e.body.existing.id}` as Href);
      } else {
        setOrgCreateError(e?.message || "Could not create organization.");
        setCreatingOrg(false);
      }
    }
  };

  if (!pending) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: "Review & Confirm", headerStyle: { backgroundColor: COLORS.navyMid }, headerTintColor: COLORS.text, headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
        <View style={styles.empty}>
          <Feather name="alert-circle" size={36} color={COLORS.textDim} />
          <Text style={styles.emptyText}>No event data found. Please go back and analyze again.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Review & Confirm",
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
        {pending.orgName ? (
          <View style={styles.orgStrip}>
            <Feather name="home" size={13} color={INDIGO} />
            <Text style={styles.orgStripText}>{pending.orgName}</Text>
            <Text style={styles.orgStripSub}> · {pending.source}</Text>
          </View>
        ) : null}

        {result?.summary ? (
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Feather name="zap" size={13} color={EMERALD} />
              <Text style={styles.summaryHeaderText}>AI Summary</Text>
            </View>
            <Text style={styles.summaryText}>{result.summary}</Text>
          </View>
        ) : null}

        {contacts.length > 0 && (
          <View style={styles.section}>
            <SectionHead title={`Contacts (${contacts.length})`} color={INDIGO} />
            {contacts.map(c => (
              <CheckRow
                key={c.id}
                text={c.name}
                sub={`${c.title ? c.title + " — " : ""}${c.detail}`}
                badge={c.action === "new" ? "NEW" : "UPDATE"}
                badgeColor={c.action === "new" ? EMERALD : AMBER}
                checked={c.checked}
                onToggle={() => toggle(contacts, setContacts, c.id)}
              />
            ))}
          </View>
        )}

        {pipeline.length > 0 && (
          <View style={styles.section}>
            <SectionHead title={`Pipeline (${pipeline.length})`} color={COLORS.blue} />
            {pipeline.map(p => (
              <CheckRow
                key={p.id}
                text={p.title}
                sub={p.change}
                badge={p.action === "new" ? "NEW" : "UPDATE"}
                badgeColor={p.action === "new" ? EMERALD : COLORS.blue}
                checked={p.checked}
                onToggle={() => toggle(pipeline, setPipeline, p.id)}
              />
            ))}
          </View>
        )}

        {actions.length > 0 && (
          <View style={styles.section}>
            <SectionHead title={`Action Items (${actions.length})`} color={AMBER} />
            {actions.map(a => (
              <CheckRow
                key={a.id}
                text={a.text}
                sub={`Due in ${a.dueInDays} day${a.dueInDays === 1 ? "" : "s"}`}
                checked={a.checked}
                onToggle={() => toggle(actions, setActions, a.id)}
              />
            ))}
          </View>
        )}

        {marketing.length > 0 && (
          <View style={styles.section}>
            <SectionHead title={`Marketing Resources (${marketing.length})`} color={COLORS.textMuted} />
            {marketing.map(m => (
              <CheckRow
                key={m.id}
                text={m.text}
                checked={m.checked}
                onToggle={() => toggle(marketing, setMarketing, m.id)}
              />
            ))}
          </View>
        )}

        {contacts.length === 0 && pipeline.length === 0 && actions.length === 0 && marketing.length === 0 && (
          <View style={styles.noItems}>
            <Text style={styles.noItemsText}>No structured items were extracted. The activity note will still be saved.</Text>
          </View>
        )}

        <TouchableOpacity style={styles.icsRow} onPress={handleShareIcs} activeOpacity={0.75}>
          <Feather name="calendar" size={14} color={COLORS.blue} />
          <Text style={[styles.icsText, { color: COLORS.blue }]}>Create .ics Calendar Event</Text>
          <Feather name="share" size={12} color={COLORS.blue} style={{ marginLeft: "auto" }} />
        </TouchableOpacity>

        {saveError ? (
          <View style={styles.errorBanner}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.errorBannerText}>{saveError}</Text>
          </View>
        ) : null}

        {saved && saveResult ? (
          <>
            <View style={styles.savedCard}>
              <View style={styles.savedHeader}>
                <Feather name="check-circle" size={16} color={EMERALD} />
                <Text style={styles.savedHeaderText}>Saved to CRM</Text>
              </View>
              <View style={styles.savedStats}>
                {saveResult.contactsCreated > 0 && (
                  <Text style={styles.savedStat}>+{saveResult.contactsCreated} contact{saveResult.contactsCreated !== 1 ? "s" : ""} created</Text>
                )}
                {saveResult.contactsUpdated > 0 && (
                  <Text style={styles.savedStat}>{saveResult.contactsUpdated} contact{saveResult.contactsUpdated !== 1 ? "s" : ""} updated</Text>
                )}
                {saveResult.opportunitiesCreated > 0 && (
                  <Text style={styles.savedStat}>+{saveResult.opportunitiesCreated} opportunit{saveResult.opportunitiesCreated !== 1 ? "ies" : "y"} opened</Text>
                )}
                {saveResult.tasksCreated > 0 && (
                  <Text style={styles.savedStat}>+{saveResult.tasksCreated} task{saveResult.tasksCreated !== 1 ? "s" : ""} created</Text>
                )}
                {saveResult.marketingResourcesLogged > 0 && (
                  <Text style={styles.savedStat}>{saveResult.marketingResourcesLogged} marketing resource{saveResult.marketingResourcesLogged !== 1 ? "s" : ""} logged</Text>
                )}
              </View>
            </View>

            {showOrgPrompt && pending.orgName ? (
              <View style={styles.orgPromptCard}>
                <View style={styles.orgPromptHeader}>
                  <Feather name="home" size={15} color={INDIGO} />
                  <Text style={styles.orgPromptTitle}>Add to Organizations?</Text>
                </View>
                <Text style={styles.orgPromptBody}>
                  <Text style={{ color: COLORS.text, fontFamily: "Inter_600SemiBold" }}>{pending.orgName}</Text>
                  {" "}isn't in your CRM yet. Create it so future events and contacts link automatically.
                </Text>
                {orgCreateError ? (
                  <Text style={styles.orgPromptError}>{orgCreateError}</Text>
                ) : null}
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
                  {pending.orgId ? "Back to Organization" : "Done"}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : (
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.75 }]}
            onPress={handleSave}
            disabled={saving}
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
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.navy },
  scroll: { flex: 1 },
  inner: { paddingHorizontal: 20, paddingTop: 16 },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 32 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 20 },
  backBtn: { backgroundColor: COLORS.navySurface, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  backBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },

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

  orgStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: COLORS.navyBorder,
    borderLeftColor: INDIGO,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 14,
  },
  orgStripText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text },
  orgStripSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted },

  summaryCard: {
    backgroundColor: EMERALD + "10",
    borderWidth: 1,
    borderColor: EMERALD + "30",
    borderRadius: 16,
    padding: 14,
    marginBottom: 18,
  },
  summaryHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  summaryHeaderText: { fontFamily: "Inter_700Bold", fontSize: 11, color: EMERALD },
  summaryText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },

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

  icsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.blue + "55",
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: COLORS.blue + "0a",
  },
  icsText: { fontFamily: "Inter_500Medium", fontSize: 12 },

  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: INDIGO,
    borderRadius: 16,
    paddingVertical: 17,
    marginBottom: 0,
  },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.white },

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
  errorBannerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.red,
    flex: 1,
    lineHeight: 17,
  },

  doneBtn: {
    alignItems: "center",
    paddingVertical: 13,
  },
  doneBtnText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },

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
  orgPromptSkip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  orgPromptSkipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
});
