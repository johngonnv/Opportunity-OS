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

function formatPercent(v?: number | null) {
  if (v == null) return null;
  return `${v.toFixed(0)}%`;
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

function BoolBadge({ value, trueLabel, falseLabel }: { value?: boolean | null; trueLabel: string; falseLabel?: string }) {
  if (value == null) return null;
  return (
    <View style={[styles.boolBadge, value ? styles.boolBadgeTrue : styles.boolBadgeFalse]}>
      <Text style={[styles.boolBadgeText, value ? styles.boolBadgeTextTrue : styles.boolBadgeTextFalse]}>
        {value ? trueLabel : (falseLabel ?? `Not ${trueLabel}`)}
      </Text>
    </View>
  );
}

function ServiceMixChips({ profile }: { profile: any }) {
  const services = [
    { key: "hasAls", label: "ALS" },
    { key: "hasBls", label: "BLS" },
    { key: "hasCriticalCare", label: "Critical Care" },
    { key: "hasSct", label: "SCT" },
    { key: "hasNeonatal", label: "Neonatal" },
    { key: "hasPediatric", label: "Pediatric" },
    { key: "hasBariatric", label: "Bariatric" },
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
  const payerMixItems = [
    { label: "Medicare", value: formatPercent(profile.payerMixMedicarePercent) },
    { label: "Medicaid", value: formatPercent(profile.payerMixMedicaidPercent) },
    { label: "Private", value: formatPercent(profile.payerMixPrivatePercent) },
    { label: "Self-Pay", value: formatPercent(profile.payerMixSelfPayPercent) },
  ].filter(i => i.value !== null);

  return (
    <View style={styles.section}>
      <SectionHeader title="EMS Transport Profile" />
      <Card>
        <View style={styles.emsBadgeRow}>
          <BoolBadge value={profile.isInJurisdiction} trueLabel="In Jurisdiction" falseLabel="Out of Territory" />
          <BoolBadge value={profile.directorEngaged} trueLabel="Director Engaged" />
        </View>

        {profile.jurisdictionName && (
          <InfoRow icon="map-pin" label="Jurisdiction" value={profile.jurisdictionName} />
        )}
        {profile.directorName && (
          <InfoRow icon="user" label="Director" value={profile.directorName} />
        )}
        {profile.directorContactDate && (
          <InfoRow icon="calendar" label="Director Contact Date" value={formatDate(profile.directorContactDate)} />
        )}

        <View style={styles.emsDivider} />

        <View style={styles.emsStatRow}>
          {profile.monthlyTransportVolume != null && (
            <View style={styles.emsStat}>
              <Text style={styles.emsStatValue}>{profile.monthlyTransportVolume}</Text>
              <Text style={styles.emsStatLabel}>Transports/mo</Text>
            </View>
          )}
          {profile.avgTransportMiles != null && (
            <View style={styles.emsStat}>
              <Text style={styles.emsStatValue}>{profile.avgTransportMiles.toFixed(1)}</Text>
              <Text style={styles.emsStatLabel}>Avg Miles</Text>
            </View>
          )}
        </View>

        {profile.primarySendingFacility && (
          <InfoRow icon="arrow-up-right" label="Sending Facility" value={profile.primarySendingFacility} />
        )}
        {profile.primaryReceivingFacility && (
          <InfoRow icon="arrow-down-right" label="Receiving Facility" value={profile.primaryReceivingFacility} />
        )}

        <ServiceMixChips profile={profile} />

        {payerMixItems.length > 0 && (
          <>
            <View style={styles.emsDivider} />
            <Text style={styles.emsSubLabel}>Payer Mix</Text>
            <View style={styles.emsStatRow}>
              {payerMixItems.map(item => (
                <View key={item.label} style={styles.emsStat}>
                  <Text style={styles.emsStatValue}>{item.value}</Text>
                  <Text style={styles.emsStatLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {profile.agreementStatus && (
          <>
            <View style={styles.emsDivider} />
            <InfoRow icon="file-text" label="Agreement Status" value={profile.agreementStatus} />
            {profile.rateSchedule && (
              <InfoRow icon="dollar-sign" label="Rate Schedule" value={profile.rateSchedule} />
            )}
            {profile.agreementStartDate && (
              <InfoRow icon="calendar" label="Agreement Start" value={formatDate(profile.agreementStartDate)} />
            )}
            {profile.agreementEndDate && (
              <InfoRow icon="calendar" label="Agreement End" value={formatDate(profile.agreementEndDate)} />
            )}
          </>
        )}

        {(profile.discoveryCompletedAt || profile.goLivePlannedDate || profile.goLiveActualDate) && (
          <>
            <View style={styles.emsDivider} />
            {profile.discoveryCompletedAt && (
              <InfoRow icon="check-circle" label="Discovery Completed" value={formatDate(profile.discoveryCompletedAt)} />
            )}
            {profile.goLivePlannedDate && (
              <InfoRow icon="clock" label="Go-Live (Planned)" value={formatDate(profile.goLivePlannedDate)} />
            )}
            {profile.goLiveActualDate && (
              <InfoRow icon="zap" label="Go-Live (Actual)" value={formatDate(profile.goLiveActualDate)} />
            )}
          </>
        )}

        {profile.internalNotes && (
          <>
            <View style={styles.emsDivider} />
            <Text style={styles.emsSubLabel}>Internal Notes</Text>
            <Text style={styles.emsNotes}>{profile.internalNotes}</Text>
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
  emsBadgeRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  boolBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  boolBadgeTrue: { backgroundColor: "#0f2a20", borderColor: COLORS.emerald },
  boolBadgeFalse: { backgroundColor: COLORS.navySurface, borderColor: COLORS.navyBorder },
  boolBadgeText: { fontFamily: "Inter_500Medium", fontSize: 11 },
  boolBadgeTextTrue: { color: COLORS.emerald },
  boolBadgeTextFalse: { color: COLORS.textMuted },
  emsDivider: { height: 1, backgroundColor: COLORS.navyBorder + "88", marginVertical: 10 },
  emsStatRow: { flexDirection: "row", gap: 16, marginVertical: 4 },
  emsStat: { alignItems: "center" },
  emsStatValue: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  emsStatLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, marginTop: 2 },
  emsSubLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  emsNotes: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, lineHeight: 18 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  serviceChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: "#1a2f4a", borderWidth: 1, borderColor: COLORS.blue + "66" },
  serviceChipText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.blue },
  emsEmptyText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
});
