import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { AdminHeader } from "@/components/admin/AdminHeader";
import type { Href } from "expo-router";

interface SessionData {
  session: {
    id: string;
    status: string;
    clientType: string;
    intakePayload: Record<string, unknown>;
    grokRawPayload: Record<string, unknown> | null;
    grokConfidence: number | null;
    grokModelVersion: string | null;
    normalizedRecommendation: Record<string, unknown> | null;
    normalizedAt: string | null;
  };
}

type ConfidenceBand = "HIGH" | "MEDIUM" | "LOW";

function confidenceBand(score: number | null | undefined): ConfidenceBand {
  if (score == null) return "LOW";
  if (score >= 0.75) return "HIGH";
  if (score >= 0.45) return "MEDIUM";
  return "LOW";
}

function bandColor(band: ConfidenceBand): string {
  if (band === "HIGH") return COLORS.emerald;
  if (band === "MEDIUM") return COLORS.amber;
  return COLORS.red;
}

interface CollapsibleSectionProps {
  title: string;
  color: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  confidence?: number | null;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, color, icon, confidence, children, defaultOpen }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const band = confidenceBand(confidence);
  const bc = bandColor(band);
  return (
    <View style={[styles.section, { borderColor: color + "33" }]}>
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => setOpen(o => !o)}
        activeOpacity={0.8}
      >
        <View style={[styles.sectionIconWrap, { backgroundColor: color + "18" }]}>
          <Feather name={icon} size={16} color={color} />
        </View>
        <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
        {confidence != null && (
          <View style={[styles.confBadge, { backgroundColor: bc + "22" }]}>
            <Text style={[styles.confBadgeText, { color: bc }]}>
              {Math.round(confidence * 100)}% {band}
            </Text>
          </View>
        )}
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={COLORS.textDim}
          style={{ marginLeft: "auto" }}
        />
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function KVRow({ label, value }: { label: string; value?: unknown }) {
  if (value == null || value === "") return null;
  const displayValue = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{displayValue}</Text>
    </View>
  );
}

function isUnresolved(obj: Record<string, unknown> | null): boolean {
  if (!obj) return false;
  return obj.id == null && (obj.needsManualAssignment === true || obj.unresolved === true || (obj.key != null && obj.label != null && obj.dbId == null));
}

function ArraySection({ items, labelKey = "label" }: { items: unknown[]; labelKey?: string }) {
  if (!items || items.length === 0) return <Text style={styles.emptySection}>—</Text>;
  return (
    <>
      {items.map((item, i) => {
        const obj = typeof item === "object" && item !== null ? item as Record<string, unknown> : null;
        const label = obj?.[labelKey] ?? obj?.key ?? obj?.name ?? String(item);
        const sub = obj?.description ?? obj?.subtitle ?? null;
        const unresolved = isUnresolved(obj);
        return (
          <View key={i} style={[styles.listItem, unresolved && styles.listItemUnresolved]}>
            <Feather
              name={unresolved ? "alert-circle" : "check-circle"}
              size={12}
              color={unresolved ? COLORS.amber : COLORS.emerald}
            />
            <View style={{ flex: 1 }}>
              <View style={styles.listItemTop}>
                <Text style={[styles.listItemLabel, unresolved && { color: COLORS.amber }]}>
                  {String(label)}
                </Text>
                {unresolved && (
                  <View style={styles.unresolvedBadge}>
                    <Text style={styles.unresolvedBadgeText}>Assign manually</Text>
                  </View>
                )}
              </View>
              {sub ? <Text style={styles.listItemSub}>{String(sub)}</Text> : null}
            </View>
          </View>
        );
      })}
    </>
  );
}

export default function RecommendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, refetch, isRefetching } = useQuery<SessionData>({
    queryKey: ["adminOnboardingSession", id],
    queryFn: () => adminFetch(`/admin/onboarding/sessions/${id}`),
    enabled: isAdminAuthenticated && !!id,
    refetchInterval: (query) => {
      const d = (query.state.data as SessionData | undefined);
      const status = d?.session?.status;
      return (status === "AWAITING_RECOMMENDATION" || status === "NORMALIZING") ? 2000 : false;
    },
  });

  const session = data?.session;
  const rec = session?.normalizedRecommendation as Record<string, unknown> | null;
  const isProcessing = session?.status === "AWAITING_RECOMMENDATION" || session?.status === "NORMALIZING";
  const isReady = session?.status === "REVIEW" && rec != null;
  const confidence = session?.grokConfidence;

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Onboarding", href: "/admin/onboarding" as Href },
        { label: session?.intakePayload?.clientName as string ?? "Session", href: `/admin/onboarding/${id}` as Href },
        { label: "Recommendation" },
      ]} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching && !isLoading}
            onRefresh={refetch}
            tintColor={COLORS.amber}
          />
        }
      >
        {isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={COLORS.amber} />
          </View>
        )}

        {isProcessing && (
          <View style={styles.processingBox}>
            <ActivityIndicator color={COLORS.cyan} size="large" />
            <Text style={styles.processingTitle}>
              {session?.status === "NORMALIZING" ? "Normalizing Response…" : "Generating Recommendation…"}
            </Text>
            <Text style={styles.processingHint}>
              {session?.status === "NORMALIZING"
                ? "Grok's response is being parsed and validated. This takes a few seconds."
                : "Sending intake data to Grok. Refresh to check for updates."}
            </Text>
          </View>
        )}

        {isReady && rec && (
          <>
            <View style={styles.summaryRow}>
              <View style={[styles.confOverall, { borderColor: bandColor(confidenceBand(confidence)) + "44" }]}>
                <Text style={styles.confLabel}>Overall Confidence</Text>
                <Text style={[styles.confValue, { color: bandColor(confidenceBand(confidence)) }]}>
                  {confidence != null ? `${Math.round(confidence * 100)}%` : "—"}
                </Text>
                <Text style={[styles.confBandLabel, { color: bandColor(confidenceBand(confidence)) }]}>
                  {confidenceBand(confidence)}
                </Text>
              </View>
              {session.grokModelVersion && (
                <View style={styles.modelBadge}>
                  <Feather name="cpu" size={11} color={COLORS.textDim} />
                  <Text style={styles.modelText}>{session.grokModelVersion}</Text>
                </View>
              )}
            </View>

            {rec.vertical != null && (
              <CollapsibleSection
                title="Vertical"
                color={COLORS.amber}
                icon="layers"
                confidence={(rec.vertical as Record<string, unknown>)?.confidence as number}
              >
                <KVRow label="Key" value={(rec.vertical as Record<string, unknown>)?.key} />
                <KVRow label="Label" value={(rec.vertical as Record<string, unknown>)?.label} />
                <KVRow label="Rationale" value={(rec.vertical as Record<string, unknown>)?.rationale} />
              </CollapsibleSection>
            )}

            {rec.subVertical != null && (
              <CollapsibleSection
                title="Sub-Vertical"
                color={COLORS.amber}
                icon="git-branch"
                confidence={(rec.subVertical as Record<string, unknown>)?.confidence as number}
              >
                <KVRow label="Key" value={(rec.subVertical as Record<string, unknown>)?.key} />
                <KVRow label="Label" value={(rec.subVertical as Record<string, unknown>)?.label} />
                <KVRow label="Rationale" value={(rec.subVertical as Record<string, unknown>)?.rationale} />
              </CollapsibleSection>
            )}

            {rec.clientType != null && (
              <CollapsibleSection
                title="Client Type"
                color={COLORS.cyan}
                icon="user"
                confidence={(rec.clientType as Record<string, unknown>)?.confidence as number}
              >
                <KVRow label="Value" value={(rec.clientType as Record<string, unknown>)?.value} />
                <KVRow label="Rationale" value={(rec.clientType as Record<string, unknown>)?.rationale} />
              </CollapsibleSection>
            )}

            {Array.isArray(rec.serviceLines) && (
              <CollapsibleSection title="Service Lines" color={COLORS.emerald} icon="briefcase">
                <ArraySection items={rec.serviceLines as unknown[]} labelKey="label" />
              </CollapsibleSection>
            )}

            {Array.isArray(rec.pipelineTemplates) && (
              <CollapsibleSection title="Pipeline Templates" color={COLORS.blue} icon="git-merge">
                <ArraySection items={rec.pipelineTemplates as unknown[]} labelKey="label" />
              </CollapsibleSection>
            )}

            {Array.isArray(rec.contactRoles) && (
              <CollapsibleSection title="Contact Roles" color={COLORS.purple} icon="users">
                <ArraySection items={rec.contactRoles as unknown[]} labelKey="label" />
              </CollapsibleSection>
            )}

            {Array.isArray(rec.suggestedTags) && (
              <CollapsibleSection title="Suggested Tags" color={COLORS.textDim} icon="tag">
                <ArraySection items={rec.suggestedTags as unknown[]} labelKey="name" />
              </CollapsibleSection>
            )}

            {Array.isArray(rec.addOns) && (
              <CollapsibleSection title="Add-Ons" color={COLORS.cyan} icon="plus-square">
                <ArraySection items={rec.addOns as unknown[]} labelKey="label" />
              </CollapsibleSection>
            )}

            {Array.isArray(rec.dashboards) && (
              <CollapsibleSection
                title="Dashboards"
                color={COLORS.blue}
                icon="monitor"
                confidence={(rec.dashboards as Record<string, unknown>[])[0]?.confidence as number | undefined}
              >
                <ArraySection items={rec.dashboards as unknown[]} labelKey="label" />
              </CollapsibleSection>
            )}

            {Array.isArray(rec.warningFlags) && rec.warningFlags.length > 0 && (
              <CollapsibleSection
                title="Warning Flags"
                color={COLORS.red}
                icon="alert-triangle"
                defaultOpen
              >
                {(rec.warningFlags as Array<Record<string, unknown>>).map((flag, i) => (
                  <View key={i} style={styles.warningFlagRow}>
                    <Feather name="alert-circle" size={12} color={COLORS.red} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.warningFlagLabel}>
                        {String(flag.label ?? flag.message ?? flag.key ?? "Warning")}
                      </Text>
                      {flag.rationale != null && (
                        <Text style={styles.warningFlagSub}>{String(flag.rationale)}</Text>
                      )}
                      {flag.severity != null && (
                        <View style={[styles.severityBadge, { backgroundColor: COLORS.red + "22" }]}>
                          <Text style={[styles.severityText, { color: COLORS.red }]}>
                            {String(flag.severity).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </CollapsibleSection>
            )}

            <TouchableOpacity
              style={styles.reviewBtn}
              onPress={() => router.push(`/admin/onboarding/${id}/review` as Href)}
            >
              <Feather name="check-square" size={16} color={COLORS.navyDark} />
              <Text style={styles.reviewBtnText}>Proceed to Review</Text>
            </TouchableOpacity>
          </>
        )}

        {!isLoading && !isProcessing && !isReady && session && (
          <View style={styles.center}>
            <Feather name="alert-circle" size={28} color={COLORS.amber} />
            <Text style={styles.stateText}>
              Session is in <Text style={{ color: COLORS.amber }}>{session.status}</Text> — no recommendation available yet.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  center: { alignItems: "center", paddingTop: 60, gap: 12 },
  stateText: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },

  processingBox: {
    alignItems: "center", gap: 14, paddingVertical: 48,
    backgroundColor: COLORS.navyCard, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.cyan + "33", marginBottom: 16,
  },
  processingTitle: { color: COLORS.text, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  processingHint: {
    color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular",
    textAlign: "center", paddingHorizontal: 24,
  },

  summaryRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 16,
  },
  confOverall: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    padding: 14, alignItems: "center", flex: 1, marginRight: 10,
  },
  confLabel: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  confValue: { fontSize: 28, fontFamily: "Inter_700Bold" },
  confBandLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  modelBadge: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: COLORS.navyCard, borderRadius: 8, borderWidth: 1,
    borderColor: COLORS.navyBorder, paddingHorizontal: 10, paddingVertical: 8,
  },
  modelText: { color: COLORS.textDim, fontSize: 11, fontFamily: "Inter_400Regular" },

  section: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, borderWidth: 1,
    marginBottom: 10, overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 14,
  },
  sectionIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: "center", justifyContent: "center",
  },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 6 },
  confBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  confBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  emptySection: { color: COLORS.textDim, fontSize: 13, fontFamily: "Inter_400Regular" },

  kvRow: { marginBottom: 6 },
  kvLabel: { color: COLORS.textMuted, fontSize: 10, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8 },
  kvValue: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },

  listItem: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    paddingVertical: 4,
  },
  listItemUnresolved: {
    backgroundColor: COLORS.amber + "0a", borderRadius: 8, paddingHorizontal: 6,
    borderWidth: 1, borderColor: COLORS.amber + "22",
  },
  listItemTop: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  listItemLabel: { color: COLORS.text, fontSize: 13, fontFamily: "Inter_500Medium" },
  listItemSub: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular" },
  unresolvedBadge: {
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1,
    backgroundColor: COLORS.amber + "22", borderWidth: 1, borderColor: COLORS.amber + "55",
  },
  unresolvedBadgeText: { color: COLORS.amber, fontSize: 9, fontFamily: "Inter_700Bold", textTransform: "uppercase" },
  warningFlagRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 5 },
  warningFlagLabel: { color: COLORS.red, fontSize: 13, fontFamily: "Inter_500Medium" },
  warningFlagSub: { color: COLORS.textMuted, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  severityBadge: { borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1, alignSelf: "flex-start", marginTop: 4 },
  severityText: { fontSize: 9, fontFamily: "Inter_700Bold" },

  reviewBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.amber, borderRadius: 12,
    paddingVertical: 14, marginTop: 8,
  },
  reviewBtnText: { color: COLORS.navyDark, fontSize: 15, fontFamily: "Inter_700Bold" },
});
