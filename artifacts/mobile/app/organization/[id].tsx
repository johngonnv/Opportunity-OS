import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useOrganization, useDeleteOrganization } from "@/hooks/useApi";

const ORG_TYPE_COLORS: Record<string, string> = {
  HOSPITAL: COLORS.red,
  HEALTH_SYSTEM: COLORS.emerald,
  HOSPICE: COLORS.purple,
  HOME_HEALTH: COLORS.cyan,
  GOVERNMENT_AGENCY: COLORS.blue,
  PRIME_CONTRACTOR: COLORS.amber,
  SUBCONTRACTOR: COLORS.amber,
  CONSULTANT: COLORS.textMuted,
  OTHER: COLORS.textDim,
};

const ORG_TYPE_LABELS: Record<string, string> = {
  HOSPITAL: "Hospital",
  HEALTH_SYSTEM: "Health System",
  HOSPICE: "Hospice",
  HOME_HEALTH: "Home Health",
  GOVERNMENT_AGENCY: "Gov Agency",
  PRIME_CONTRACTOR: "Prime Contractor",
  SUBCONTRACTOR: "Subcontractor",
  CONSULTANT: "Consultant",
  VENDOR: "Vendor",
  OTHER: "Other",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: org, isLoading } = useOrganization(id);
  const deleteOrg = useDeleteOrganization();

  if (isLoading) return <LoadingSpinner label="Loading organization..." />;
  if (!org) return null;

  const handleDelete = () => {
    Alert.alert("Delete Organization", `Remove ${org.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: async () => {
          await deleteOrg.mutateAsync(id);
          router.back();
        },
      },
    ]);
  };

  const typeColor = ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim;
  const typeLabel = ORG_TYPE_LABELS[org.organizationType] || org.organizationType;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: org.name, headerRight: () => (
        <TouchableOpacity onPress={handleDelete} style={{ marginRight: 4 }}>
          <Feather name="trash-2" size={18} color={COLORS.red} />
        </TouchableOpacity>
      )}} />

      <View style={styles.headerSection}>
        <View style={[styles.orgIcon, { backgroundColor: typeColor + "20" }]}>
          <Feather name="briefcase" size={28} color={typeColor} />
        </View>
        <Text style={styles.name}>{org.name}</Text>
        {org.legalName && org.legalName !== org.name && <Text style={styles.legalName}>{org.legalName}</Text>}
        <Badge label={typeLabel} color={typeColor} style={{ marginTop: 8 }} />
        {org.tags?.length > 0 && (
          <View style={styles.tagsRow}>
            {org.tags.map((tag: any) => (
              <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <SectionHeader title="Details" />
        <Card>
          {[
            { icon: "globe", label: "Website", value: org.website, href: org.website },
            { icon: "phone", label: "Phone", value: org.phone, href: org.phone ? `tel:${org.phone}` : null },
            { icon: "mail", label: "Email", value: org.email, href: org.email ? `mailto:${org.email}` : null },
            { icon: "map-pin", label: "Location", value: [org.addressLine1, org.city, org.state, org.zip].filter(Boolean).join(", "), href: null },
            { icon: "tag", label: "Industry", value: org.industry, href: null },
          ].filter(f => f.value).map(({ icon, label, value, href }) => (
            <TouchableOpacity
              key={label}
              style={styles.infoRow}
              onPress={() => href && Linking.openURL(href)}
              disabled={!href}
            >
              <View style={styles.infoIcon}>
                <Feather name={icon as any} size={14} color={COLORS.textMuted} />
              </View>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>{label}</Text>
                <Text style={[styles.infoValue, !!href && styles.infoValueLink]}>{value}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </Card>
      </View>

      {org.contacts?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader
            title={`Contacts (${org.contacts.length})`}
            action={{ label: "See all", onPress: () => {} }}
          />
          {org.contacts.slice(0, 5).map((c: any) => (
            <TouchableOpacity
              key={c.id}
              style={styles.contactCard}
              onPress={() => router.push(`/contact/${c.id}`)}
              activeOpacity={0.75}
            >
              <View style={styles.contactAvatar}>
                <Text style={styles.contactInitials}>
                  {((c.firstName?.[0] || "") + (c.lastName?.[0] || "")).toUpperCase() || c.fullName?.[0]?.toUpperCase() || "?"}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactName}>{c.fullName}</Text>
                {c.title && <Text style={styles.contactTitle}>{c.title}</Text>}
              </View>
              <Feather name="chevron-right" size={14} color={COLORS.textDim} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {org.activities?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Recent Activity" />
          {org.activities.slice(0, 5).map((a: any) => (
            <Card key={a.id} style={{ marginBottom: 6 }} padding={12}>
              <Text style={styles.actSubject}>{a.subject}</Text>
              <Text style={styles.actDate}>{a.type} · {formatDate(a.occurredAt)}</Text>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  headerSection: { alignItems: "center", paddingVertical: 24 },
  orgIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  name: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  legalName: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, justifyContent: "center" },
  section: { marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "88" },
  infoIcon: { width: 28, alignItems: "center" },
  infoContent: { flex: 1 },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  infoValueLink: { color: COLORS.blue },
  contactCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.navyCard, borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: COLORS.navyBorder, gap: 10 },
  contactAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.navySurface, alignItems: "center", justifyContent: "center" },
  contactInitials: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald },
  contactName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  contactTitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  actSubject: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  actDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
