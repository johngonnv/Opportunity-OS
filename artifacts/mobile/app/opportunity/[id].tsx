import React from "react";
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from "react-native";
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

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OpportunityDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: opp, isLoading } = useOpportunity(id);

  if (isLoading) return <LoadingSpinner label="Loading opportunity..." />;
  if (!opp) return null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: opp.title }} />

      <View style={styles.headerSection}>
        <Text style={styles.title}>{opp.title}</Text>
        <View style={styles.headerMeta}>
          <Badge label={opp.status} color={STATUS_COLORS[opp.status] || COLORS.textDim} />
          <Badge label={opp.vertical} color={COLORS.blue} />
        </View>
        {opp.valueEstimate && (
          <Text style={styles.value}>{formatValue(opp.valueEstimate)}</Text>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Pipeline" />
        <Card>
          <View style={styles.infoRow}>
            <Feather name="git-branch" size={14} color={COLORS.textMuted} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Pipeline</Text>
              <Text style={styles.infoValue}>{opp.pipeline?.name || "—"}</Text>
            </View>
          </View>
          <View style={styles.infoRow}>
            <Feather name="arrow-right" size={14} color={COLORS.textMuted} />
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Stage</Text>
              <Text style={styles.infoValue}>{opp.pipelineStage?.name || "—"}</Text>
            </View>
          </View>
          {opp.closeDateEstimate && (
            <View style={styles.infoRow}>
              <Feather name="calendar" size={14} color={COLORS.textMuted} />
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Est. Close Date</Text>
                <Text style={styles.infoValue}>{formatDate(opp.closeDateEstimate)}</Text>
              </View>
            </View>
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
});
