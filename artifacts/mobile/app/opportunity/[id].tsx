import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useOpportunity } from "@/hooks/useApi";

const STATUS_COLORS: Record<string, string> = {
  OPEN: COLORS.emerald,
  WON: COLORS.blue,
  LOST: COLORS.red,
  ON_HOLD: COLORS.amber,
};

const JURISDICTION_COLORS: Record<string, string> = {
  "Eligible": COLORS.emerald,
  "Review Needed": COLORS.amber,
  "Out of Territory": COLORS.red,
};

const AGREEMENT_COLORS: Record<string, string> = {
  "Not Started": COLORS.textDim,
  "In Review": COLORS.amber,
  "Operationally Aligned": COLORS.blue,
  "Go-Live Ready": COLORS.emerald,
};

function formatValue(v?: number | null) {
  if (!v) return "";
  if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
  return `$${v.toLocaleString()}`;
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function InfoRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Feather name={icon as any} size={14} color={COLORS.textMuted} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.statusBadge, { borderColor: color }]}>
      <Text style={[styles.statusBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function IndicatorBadge({ value, trueLabel, falseLabel, trueColor, falseColor }: {
  value: boolean;
  trueLabel: string;
  falseLabel: string;
  trueColor?: string;
  falseColor?: string;
}) {
  const color = value ? (trueColor ?? COLORS.emerald) : (falseColor ?? COLORS.textMuted);
  const label = value ? trueLabel : falseLabel;
  return (
    <View style={[styles.indicatorBadge, { borderColor: color }]}>
      <Feather name={value ? "check-circle" : "alert-circle"} size={11} color={color} />
      <Text style={[styles.indicatorBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

function ServiceMixChips({ profile }: { profile: any }) {
  const services = [
    { key: "serviceMixBls", label: "BLS" },
    { key: "serviceMixAls", label: "ALS" },
    { key: "serviceMixCct", label: "CCT" },
  ];
  const active = services.filter(s => profile[s.key] === true);
  if (active.length === 0) return null;
  return (
    <View style={styles.chipRow}>
      {active.map(s => (
        <View key={s.key} style={styles.serviceChip}>
          <Text style={styles.serviceChipText}>{s.label}</Text>
        </View>
      ))}
    </View>
  );
}

function EmsTransportProfileCard({ profile }: { profile: any }) {
  const jurisdictionColor = profile.jurisdictionEligibility
    ? (JURISDICTION_COLORS[profile.jurisdictionEligibility] ?? COLORS.textDim)
    : null;

  const agreementColor = profile.agreementStatus
    ? (AGREEMENT_COLORS[profile.agreementStatus] ?? COLORS.textDim)
    : null;

  const payerMixItems = [
    { label: "Medicare", value: profile.payerMixMedicarePercent },
    { label: "Medicaid", value: profile.payerMixMedicaidPercent },
    { label: "Private", value: profile.payerMixPrivatePercent },
    { label: "Other", value: profile.payerMixOtherPercent },
  ].filter(i => i.value != null);

  const hasAutomation = profile.automationSuggestions && profile.automationSuggestions.length > 0;

  return (
    <View style={styles.section}>
      <SectionHeader title="EMS Transport Profile" />
      <Card>
        <View style={styles.emsBadgeRow}>
          {profile.jurisdictionEligibility && jurisdictionColor && (
            <StatusBadge label={profile.jurisdictionEligibility} color={jurisdictionColor} />
          )}
          {profile.agreementStatus && agreementColor && (
            <StatusBadge label={profile.agreementStatus} color={agreementColor} />
          )}
        </View>

        <View style={styles.indicatorRow}>
          <IndicatorBadge
            value={!!profile.discoveryComplete}
            trueLabel="Discovery Complete"
            falseLabel="Discovery Incomplete"
            trueColor={COLORS.emerald}
            falseColor={COLORS.amber}
          />
          <IndicatorBadge
            value={!!profile.activeAccountEligible}
            trueLabel="Active Account Eligible"
            falseLabel="Not Yet Eligible"
            trueColor={COLORS.blue}
            falseColor={COLORS.textDim}
          />
        </View>

        <ServiceMixChips profile={profile} />

        {profile.currentProviderName && (
          <>
            <View style={styles.emsDivider} />
            <InfoRow icon="truck" label="Current Provider" value={profile.currentProviderName} />
          </>
        )}

        {profile.estimatedMonthlyTransports != null && (
          <>
            <View style={styles.emsDivider} />
            <View style={styles.emsStatRow}>
              <View style={styles.emsStat}>
                <Text style={styles.emsStatValue}>{profile.estimatedMonthlyTransports}</Text>
                <Text style={styles.emsStatLabel}>Est. Transports/mo</Text>
              </View>
              {profile.qualifiedTransportsLast30Days != null && (
                <View style={styles.emsStat}>
                  <Text style={styles.emsStatValue}>{profile.qualifiedTransportsLast30Days}</Text>
                  <Text style={styles.emsStatLabel}>Qualified (30d)</Text>
                </View>
              )}
              {profile.avgQualifiedTransportsPerWeek != null && (
                <View style={styles.emsStat}>
                  <Text style={styles.emsStatValue}>{Number(profile.avgQualifiedTransportsPerWeek).toFixed(1)}</Text>
                  <Text style={styles.emsStatLabel}>Avg/Week</Text>
                </View>
              )}
            </View>
          </>
        )}

        {payerMixItems.length > 0 && (
          <>
            <View style={styles.emsDivider} />
            <Text style={styles.emsSubLabel}>Payer Mix</Text>
            <View style={styles.emsStatRow}>
              {payerMixItems.map(item => (
                <View key={item.label} style={styles.emsStat}>
                  <Text style={styles.emsStatValue}>{item.value}%</Text>
                  <Text style={styles.emsStatLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {profile.primaryPainPoints && (
          <>
            <View style={styles.emsDivider} />
            <Text style={styles.emsSubLabel}>Primary Pain Points</Text>
            <Text style={styles.emsNotes}>{profile.primaryPainPoints}</Text>
          </>
        )}

        {(profile.protocolGoLiveDate || profile.activeConsistencyStartDate || profile.activeLastQualifiedTransportAt) && (
          <>
            <View style={styles.emsDivider} />
            {profile.protocolGoLiveDate && (
              <InfoRow icon="zap" label="Protocol Go-Live Date" value={formatDate(profile.protocolGoLiveDate)} />
            )}
            {profile.activeConsistencyStartDate && (
              <InfoRow icon="clock" label="Active Consistency Start" value={formatDate(profile.activeConsistencyStartDate)} />
            )}
            {profile.activeLastQualifiedTransportAt && (
              <InfoRow icon="check-circle" label="Last Qualified Transport" value={formatDate(profile.activeLastQualifiedTransportAt)} />
            )}
          </>
        )}

        {profile.jurisdictionNotes && (
          <>
            <View style={styles.emsDivider} />
            <Text style={styles.emsSubLabel}>Jurisdiction Notes</Text>
            <Text style={styles.emsNotes}>{profile.jurisdictionNotes}</Text>
          </>
        )}

        {hasAutomation && (
          <>
            <View style={styles.emsDivider} />
            <Text style={styles.emsSubLabel}>Suggested Actions</Text>
            {profile.automationSuggestions.map((s: string, i: number) => (
              <View key={i} style={styles.automationItem}>
                <Feather name="zap" size={11} color={COLORS.amber} />
                <Text style={styles.automationText}>{s}</Text>
              </View>
            ))}
          </>
        )}
      </Card>
    </View>
  );
}

export default function OpportunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: opp, isLoading } = useOpportunity(id);

  if (isLoading) return <LoadingSpinner label="Loading opportunity..." />;
  if (!opp) return null;

  const isEms = opp.pipeline?.category === "EMS";

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: opp.title }} />

      <View style={styles.headerSection}>
        <Text style={styles.title}>{opp.title}</Text>
        <View style={styles.headerMeta}>
          <Badge label={opp.status} color={STATUS_COLORS[opp.status] || COLORS.textDim} />
          {isEms && <Badge label="EMS" color={COLORS.amber} />}
          {!isEms && opp.vertical && <Badge label={opp.vertical} color={COLORS.blue} />}
          {/* P2.2: Business model badge in detail (recurring vs project for industrial clients) */}
          {opp.businessModel && (
            <Badge 
              label={opp.businessModel.replace("_", " ")} 
              color={opp.businessModel === "RECURRING" ? "#0ea5e9" : opp.businessModel === "PROJECT_BASED" ? "#f59e0b" : COLORS.cyan} 
            />
          )}
        </View>
        {opp.valueEstimate && (
          <Text style={styles.value}>{formatValue(opp.valueEstimate)}</Text>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Pipeline" />
        <Card>
          <InfoRow icon="git-branch" label="Pipeline" value={opp.pipeline?.name || "—"} />
          <InfoRow icon="arrow-right" label="Stage" value={opp.pipelineStage?.name || "—"} />
          {opp.closeDateEstimate && (
            <InfoRow icon="calendar" label="Est. Close Date" value={formatDate(opp.closeDateEstimate)} />
          )}
          {/* P2.2: Surface business model + renewal date (key for recurring industrial contracts) */}
          {opp.businessModel && (
            <InfoRow icon="briefcase" label="Business Model" value={opp.businessModel.replace("_", " ")} />
          )}
          {opp.renewalDate && (
            <InfoRow icon="refresh-cw" label="Renewal / End Date" value={formatDate(opp.renewalDate)} />
          )}
          {opp.businessModel === "RECURRING" && (
            <Text style={{ fontSize: 11, color: COLORS.textDim, marginTop: 6 }}>Recurring: Track optimization cycles & renewal reminders</Text>
          )}
          {(opp.businessModel === "PROJECT_BASED" || opp.businessModel === "HYBRID") && (
            <Text style={{ fontSize: 11, color: COLORS.textDim, marginTop: 6 }}>Project: Focus on milestones, assessments, and conversion to recurring if successful</Text>
          )}
        </Card>
      </View>

      {(opp.organization || opp.primaryContact) && (
        <View style={styles.section}>
          <SectionHeader title="Linked Records" />
          {opp.organization && (
            <TouchableOpacity style={styles.linkedCard} onPress={() => router.push(`/organization/${opp.organization.id}`)} activeOpacity={0.75}>
              <Feather name="briefcase" size={16} color={COLORS.blue} />
              <Text style={styles.linkedName}>{opp.organization.name}</Text>
              <Feather name="chevron-right" size={14} color={COLORS.textDim} />
            </TouchableOpacity>
          )}
          {opp.primaryContact && (
            <TouchableOpacity style={styles.linkedCard} onPress={() => router.push(`/contact/${opp.primaryContact.id}`)} activeOpacity={0.75}>
              <Feather name="user" size={16} color={COLORS.emerald} />
              <Text style={styles.linkedName}>{opp.primaryContact.fullName}</Text>
              <Feather name="chevron-right" size={14} color={COLORS.textDim} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {isEms && opp.emsProfile && (
        <EmsTransportProfileCard profile={opp.emsProfile} />
      )}

      {isEms && !opp.emsProfile && (
        <View style={styles.section}>
          <SectionHeader title="EMS Transport Profile" />
          <Card>
            <Text style={styles.emsEmptyText}>No EMS transport data yet. Profile will appear once intake data is captured.</Text>
          </Card>
        </View>
      )}

      {opp.description && (
        <View style={styles.section}>
          <SectionHeader title="Description" />
          <Card><Text style={styles.description}>{opp.description}</Text></Card>
        </View>
      )}

      {opp.activities?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Activity" />
          {opp.activities.map((a: any) => (
            <Card key={a.id} style={{ marginBottom: 6 }} padding={12}>
              <Text style={styles.actSubject}>{a.subject}</Text>
              <Text style={styles.actDate}>{a.type} · {formatDate(a.occurredAt)}</Text>
            </Card>
          ))}
        </View>
      )}

      {opp.tasks?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Tasks" />
          {opp.tasks.map((t: any) => (
            <Card key={t.id} style={{ marginBottom: 6 }} padding={12}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Feather name={t.status === "COMPLETED" ? "check-circle" : "circle"} size={14} color={t.status === "COMPLETED" ? COLORS.emerald : COLORS.textDim} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.actSubject}>{t.title}</Text>
                  {t.dueDate && <Text style={styles.actDate}>Due {formatDate(t.dueDate)}</Text>}
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      {opp.notes?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Notes" />
          {opp.notes.map((n: any) => (
            <Card key={n.id} style={{ marginBottom: 6 }} padding={12}>
              <Text style={styles.noteText}>{n.content}</Text>
              <Text style={styles.actDate}>{formatDate(n.createdAt)}</Text>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  headerSection: { paddingVertical: 20 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, marginBottom: 10 },
  headerMeta: { flexDirection: "row", gap: 8, marginBottom: 10 },
  value: { fontFamily: "Inter_700Bold", fontSize: 32, color: COLORS.emerald },
  section: { marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "88", gap: 10 },
  infoContent: { flex: 1 },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  linkedCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.navyCard, borderRadius: 10, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: COLORS.navyBorder, gap: 10 },
  linkedName: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  description: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text, lineHeight: 20 },
  actSubject: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  actDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, lineHeight: 18 },
  emsBadgeRow: { flexDirection: "row", gap: 8, marginBottom: 6, flexWrap: "wrap" },
  indicatorRow: { flexDirection: "row", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  statusBadgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  indicatorBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  indicatorBadgeText: { fontFamily: "Inter_500Medium", fontSize: 10 },
  emsDivider: { height: 1, backgroundColor: COLORS.navyBorder + "88", marginVertical: 10 },
  emsStatRow: { flexDirection: "row", gap: 16, marginVertical: 4, flexWrap: "wrap" },
  emsStat: { alignItems: "center" },
  emsStatValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  emsStatLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 2 },
  emsSubLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  emsNotes: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, lineHeight: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  serviceChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: "#1a2f4a", borderWidth: 1, borderColor: COLORS.blue + "66" },
  serviceChipText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.blue },
  emsEmptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  automationItem: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginBottom: 4 },
  automationText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.amber, lineHeight: 16, flex: 1 },
});
