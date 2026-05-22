import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { apiFetch } from "@/hooks/useApi";

const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#818cf8";
const EMERALD = "#10b981";
const AMBER = "#f59e0b";
const RED = "#ef4444";

interface BriefData {
  orgName: string;
  orgType: string;
  generatedAt: string;
  visitPurpose: string;
  contacts: Array<{ name: string; title: string; strength: "HOT" | "WARM" | "COLD"; note: string }>;
  lastInteractions: Array<{ icon: string; text: string; when: string }>;
  pipeline: Array<{ title: string; stage: string; value: string; pct: number }>;
  painPoints: string[];
  talkingPoints: string[];
  competitive: string;
}

const STRENGTH_COLORS: Record<string, string> = {
  HOT: EMERALD,
  WARM: AMBER,
  COLD: COLORS.textDim,
};

function AccordionSection({
  title,
  color,
  count,
  open,
  onToggle,
  children,
}: {
  title: string;
  color: string;
  count?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.accordion}>
      <TouchableOpacity style={styles.accordionHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={styles.accordionLeft}>
          <View style={[styles.accordionDot, { backgroundColor: color }]} />
          <Text style={styles.accordionTitle}>{title}</Text>
          {count !== undefined && (
            <View style={[styles.countBadge, { backgroundColor: color + "22" }]}>
              <Text style={[styles.countBadgeText, { color }]}>{count}</Text>
            </View>
          )}
        </View>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={14} color={COLORS.textDim} />
      </TouchableOpacity>
      {open && <View style={styles.accordionBody}>{children}</View>}
    </View>
  );
}

export default function PreVisitBriefScreen() {
  const { orgId = "", orgName = "" } = useLocalSearchParams<{ orgId?: string; orgName?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [generating, setGenerating] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    contacts: true,
    interactions: true,
    pipeline: true,
    pain: false,
    talking: false,
    competitive: false,
  });

  const toggle = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const handleGenerate = async () => {
    if (!orgId) {
      Alert.alert("No organization", "Launch this screen from an organization page.");
      return;
    }
    setGenerating(true);
    try {
      const data = await apiFetch(`/organizations/${orgId}/pre-visit-brief`, { method: "POST" });
      setBrief(data);
    } catch (e: any) {
      Alert.alert("Generation failed", e?.message || "Could not generate brief. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  const displayName = brief?.orgName || orgName || "Organization";

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: "Pre-Visit Brief",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        }}
      />

      {!brief ? (
        <View style={[styles.generateScreen, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.orgCard}>
            <View style={styles.orgAvatar}>
              <Feather name="home" size={22} color={INDIGO_LIGHT} />
            </View>
            <View>
              <Text style={styles.orgCardName}>{displayName}</Text>
              <Text style={styles.orgCardSub}>Powered by AI · Uses your CRM data</Text>
            </View>
          </View>

          <View style={styles.generateCenter}>
            <View style={styles.generateIcon}>
              <Feather name="file-text" size={36} color={INDIGO_LIGHT} />
            </View>
            <Text style={styles.generateTitle}>Generate Pre-Visit Brief</Text>
            <Text style={styles.generateDesc}>
              AI will summarize key contacts, recent interactions, pipeline status, pain points, and personalized talking points for your visit.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.generateBtn, generating && { backgroundColor: COLORS.navySurface }]}
            onPress={handleGenerate}
            disabled={generating}
            activeOpacity={0.85}
          >
            {generating ? (
              <>
                <ActivityIndicator size="small" color={COLORS.white} />
                <Text style={styles.generateBtnText}>Generating Brief…</Text>
              </>
            ) : (
              <>
                <Feather name="zap" size={18} color={COLORS.white} />
                <Text style={styles.generateBtnText}>Generate Pre-Visit Brief</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.briefInner, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.briefHeader}>
            <View style={styles.briefHeaderLeft}>
              <Text style={styles.briefOrgName}>{brief.orgName}</Text>
              <Text style={styles.briefTimestamp}>
                Generated {new Date(brief.generatedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.shareBtn}
              onPress={() => Alert.alert("Share", "Share functionality coming soon.")}
              activeOpacity={0.7}
            >
              <Feather name="share" size={14} color={COLORS.textDim} />
            </TouchableOpacity>
          </View>

          <View style={styles.purposeCard}>
            <Text style={styles.purposeLabel}>Visit Purpose</Text>
            <Text style={styles.purposeText}>{brief.visitPurpose}</Text>
          </View>

          {brief.contacts.length > 0 && (
            <AccordionSection title="Key Contacts" color={INDIGO} count={brief.contacts.length} open={expanded.contacts} onToggle={() => toggle("contacts")}>
              <View style={{ gap: 12 }}>
                {brief.contacts.map((c, i) => {
                  const sc = STRENGTH_COLORS[c.strength] || COLORS.textDim;
                  const initials = c.name.split(" ").map(n => n[0] || "").slice(0, 2).join("").toUpperCase();
                  return (
                    <View key={i} style={styles.contactRow}>
                      <View style={[styles.contactAvatar, { backgroundColor: sc + "28" }]}>
                        <Text style={[styles.contactInitials, { color: sc }]}>{initials}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={styles.contactNameRow}>
                          <Text style={styles.contactName}>{c.name}</Text>
                          <View style={[styles.strengthBadge, { backgroundColor: sc + "22" }]}>
                            <Text style={[styles.strengthBadgeText, { color: sc }]}>{c.strength}</Text>
                          </View>
                        </View>
                        <Text style={styles.contactTitle}>{c.title}</Text>
                        {c.note ? <Text style={styles.contactNote}>{c.note}</Text> : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            </AccordionSection>
          )}

          {brief.lastInteractions.length > 0 && (
            <AccordionSection title="Last Interactions" color={COLORS.blue} count={brief.lastInteractions.length} open={expanded.interactions} onToggle={() => toggle("interactions")}>
              <View style={{ gap: 10 }}>
                {brief.lastInteractions.map((i, idx) => (
                  <View key={idx} style={styles.interactionRow}>
                    <Text style={styles.interactionIcon}>{i.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.interactionText}>{i.text}</Text>
                      <Text style={styles.interactionWhen}>{i.when}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </AccordionSection>
          )}

          {brief.pipeline.length > 0 && (
            <AccordionSection title="Pipeline Status" color={AMBER} count={brief.pipeline.length} open={expanded.pipeline} onToggle={() => toggle("pipeline")}>
              <View style={{ gap: 10 }}>
                {brief.pipeline.map((p, i) => (
                  <View key={i} style={styles.pipelineRow}>
                    <View style={[styles.pipelineAccent, { backgroundColor: COLORS.blue }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pipelineTitle} numberOfLines={1}>{p.title}</Text>
                      <View style={styles.pipelineMeta}>
                        <Text style={styles.pipelineStage}>{p.stage}</Text>
                        <View style={styles.pipelineBarWrap}>
                          <View style={[styles.pipelineBar, { width: `${Math.min(100, p.pct)}%` as any, backgroundColor: COLORS.blue }]} />
                        </View>
                        <Text style={styles.pipelinePct}>{p.pct}%</Text>
                      </View>
                    </View>
                    {p.value ? <Text style={styles.pipelineValue}>{p.value}</Text> : null}
                  </View>
                ))}
              </View>
            </AccordionSection>
          )}

          {brief.painPoints.length > 0 && (
            <AccordionSection title="Pain Points" color={RED} count={brief.painPoints.length} open={expanded.pain} onToggle={() => toggle("pain")}>
              <View style={{ gap: 8 }}>
                {brief.painPoints.map((p, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Text style={[styles.bulletIcon, { color: RED }]}>⚠</Text>
                    <Text style={styles.bulletText}>{p}</Text>
                  </View>
                ))}
              </View>
            </AccordionSection>
          )}

          {brief.talkingPoints.length > 0 && (
            <AccordionSection title="Talking Points" color={EMERALD} count={brief.talkingPoints.length} open={expanded.talking} onToggle={() => toggle("talking")}>
              <View style={{ gap: 8 }}>
                {brief.talkingPoints.map((p, i) => (
                  <View key={i} style={styles.bulletRow}>
                    <Feather name="arrow-right" size={12} color={EMERALD} style={{ marginTop: 1 }} />
                    <Text style={styles.bulletText}>{p}</Text>
                  </View>
                ))}
              </View>
            </AccordionSection>
          )}

          {brief.competitive ? (
            <AccordionSection title="Competitive Intel" color="#8b5cf6" open={expanded.competitive} onToggle={() => toggle("competitive")}>
              <Text style={[styles.bulletText, { marginTop: 4 }]}>{brief.competitive}</Text>
            </AccordionSection>
          ) : null}

          <View style={styles.poweredBy}>
            <Feather name="zap" size={10} color={COLORS.navyBorder} />
            <Text style={styles.poweredByText}>Generated by AI · {new Date(brief.generatedAt).toLocaleDateString()}</Text>
          </View>

          <TouchableOpacity
            style={styles.regenerateBtn}
            onPress={() => setBrief(null)}
            activeOpacity={0.75}
          >
            <Feather name="refresh-cw" size={13} color={COLORS.textDim} />
            <Text style={styles.regenerateBtnText}>Regenerate</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.navy },
  scroll: { flex: 1 },

  generateScreen: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
    justifyContent: "space-between",
  },
  orgCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: COLORS.navyBorder,
    borderLeftColor: INDIGO,
    borderRadius: 16,
    padding: 16,
  },
  orgAvatar: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: INDIGO + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  orgCardName: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text },
  orgCardSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  generateCenter: { alignItems: "center", gap: 12 },
  generateIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: INDIGO + "15",
    borderWidth: 1,
    borderColor: INDIGO + "33",
    alignItems: "center",
    justifyContent: "center",
  },
  generateTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, textAlign: "center" },
  generateDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 300,
  },

  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: INDIGO,
    borderRadius: 16,
    paddingVertical: 17,
  },
  generateBtnText: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.white },

  briefInner: { paddingHorizontal: 20, paddingTop: 16 },

  briefHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  briefHeaderLeft: { flex: 1 },
  briefOrgName: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  briefTimestamp: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  shareBtn: {
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 10,
    padding: 8,
  },

  purposeCard: {
    backgroundColor: INDIGO + "12",
    borderWidth: 1,
    borderColor: INDIGO + "30",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  purposeLabel: { fontFamily: "Inter_700Bold", fontSize: 9, color: INDIGO_LIGHT, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  purposeText: { fontFamily: "Inter_500Medium", fontSize: 12, color: INDIGO_LIGHT },

  accordion: {
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 10,
  },
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  accordionLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  accordionDot: { width: 7, height: 7, borderRadius: 4 },
  accordionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  countBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  countBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10 },
  accordionBody: {
    borderTopWidth: 1,
    borderTopColor: COLORS.navyBorder,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },

  contactRow: { flexDirection: "row", gap: 10 },
  contactAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  contactInitials: { fontFamily: "Inter_700Bold", fontSize: 11 },
  contactNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  contactName: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text },
  strengthBadge: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  strengthBadgeText: { fontFamily: "Inter_700Bold", fontSize: 9 },
  contactTitle: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  contactNote: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 3, lineHeight: 15 },

  interactionRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  interactionIcon: { fontSize: 14, flexShrink: 0 },
  interactionText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.text, lineHeight: 16 },
  interactionWhen: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 2 },

  pipelineRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  pipelineAccent: { width: 3, height: 36, borderRadius: 2, flexShrink: 0 },
  pipelineTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.text, marginBottom: 4 },
  pipelineMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  pipelineStage: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  pipelineBarWrap: { flex: 1, height: 4, backgroundColor: COLORS.navyBorder, borderRadius: 2, overflow: "hidden" },
  pipelineBar: { height: 4, borderRadius: 2 },
  pipelinePct: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  pipelineValue: { fontFamily: "Inter_700Bold", fontSize: 12, color: AMBER, flexShrink: 0 },

  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletIcon: { fontSize: 12, flexShrink: 0, marginTop: 1 },
  bulletText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, lineHeight: 17 },

  poweredBy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 14,
    marginBottom: 10,
  },
  poweredByText: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.navyBorder },

  regenerateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  regenerateBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textDim },
});
