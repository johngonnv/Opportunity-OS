import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useOrganization, useDeleteOrganization, useUpdateOrganization } from "@/hooks/useApi";
import { ParentPickerModal } from "@/components/organizations/ParentPickerModal";

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

const LEVEL_COLORS: Record<string, string> = {
  enterprise: COLORS.emerald,
  group: COLORS.blue,
  facility: COLORS.amber,
};

const LEVEL_LABELS: Record<string, string> = {
  enterprise: "Enterprise",
  group: "Group",
  facility: "Facility",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function RollupPill({ icon, label, value }: { icon: any; label: string; value: number }) {
  if (!value) return null;
  return (
    <View style={styles.rollupPill}>
      <Feather name={icon} size={13} color={COLORS.emerald} />
      <Text style={styles.rollupValue}>{value}</Text>
      <Text style={styles.rollupLabel}>{label}</Text>
    </View>
  );
}

export default function OrganizationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: org, isLoading, refetch } = useOrganization(id);
  const deleteOrg = useDeleteOrganization();
  const updateOrg = useUpdateOrganization(id);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);

  if (isLoading) return <LoadingSpinner label="Loading organization..." />;
  if (!org) return null;

  const typeColor = ORG_TYPE_COLORS[org.organizationType] || COLORS.textDim;
  const typeLabel = ORG_TYPE_LABELS[org.organizationType] || org.organizationType;
  const levelColor = org.organizationLevel ? (LEVEL_COLORS[org.organizationLevel] || COLORS.textDim) : null;
  const levelLabel = org.organizationLevel ? (LEVEL_LABELS[org.organizationLevel] || org.organizationLevel) : null;

  const handleDelete = () => {
    const doDelete = async () => {
      await deleteOrg.mutateAsync(id);
      router.back();
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${org.name}? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert("Delete Organization", `Remove ${org.name}? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleSetParent = async (selected: { id: string; name: string } | null) => {
    await updateOrg.mutateAsync({ parentOrganizationId: selected?.id ?? null });
    refetch();
  };

  const hasRollup = (org.rollup?.childCount ?? 0) > 0;

  return (
    <>
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
          <View style={styles.badgeRow}>
            <Badge label={typeLabel} color={typeColor} />
            {levelLabel && levelColor && (
              <Badge label={levelLabel} color={levelColor} />
            )}
          </View>
          {org.tags?.length > 0 && (
            <View style={styles.tagsRow}>
              {org.tags.map((tag: any) => (
                <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
              ))}
            </View>
          )}

          {hasRollup && (
            <View style={styles.rollupRow}>
              <RollupPill icon="git-branch" label="children" value={org.rollup.childCount} />
              <RollupPill icon="users" label="contacts total" value={org.rollup.totalContacts} />
              <RollupPill icon="trending-up" label="opportunities" value={org.rollup.totalOpportunities} />
            </View>
          )}
        </View>

        {/* Hierarchy Section */}
        <View style={styles.section}>
          <SectionHeader title="Hierarchy" />
          <Card>
            {/* Parent org row */}
            <View style={styles.hierarchyRow}>
              <Feather name="arrow-up-circle" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.hierarchyLabel}>Parent Organization</Text>
                {org.parentOrg ? (
                  <TouchableOpacity onPress={() => router.push(`/organization/${org.parentOrg.id}`)}>
                    <Text style={styles.hierarchyLink}>{org.parentOrg.name}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.hierarchyNone}>None</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.hierarchyAction}
                onPress={() => setParentPickerOpen(true)}
              >
                <Feather name={org.parentOrg ? "edit-2" : "plus"} size={14} color={COLORS.emerald} />
                <Text style={styles.hierarchyActionText}>{org.parentOrg ? "Change" : "Set"}</Text>
              </TouchableOpacity>
            </View>

            {org.children?.length > 0 && (
              <View style={[styles.hierarchyRow, { borderTopWidth: 1, borderTopColor: COLORS.navyBorder + "66", marginTop: 0, paddingTop: 12 }]}>
                <Feather name="git-branch" size={16} color={COLORS.textMuted} style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.hierarchyLabel}>Child Organizations ({org.children.length})</Text>
                  {org.children.map((child: any) => (
                    <TouchableOpacity key={child.id} onPress={() => router.push(`/organization/${child.id}`)} style={{ marginTop: 4 }}>
                      <Text style={styles.hierarchyLink}>
                        {child.name}
                        {child.organizationLevel ? <Text style={styles.hierarchyLinkSub}> · {LEVEL_LABELS[child.organizationLevel] ?? child.organizationLevel}</Text> : null}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
          </Card>
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
              title={`Contacts (${org.contacts.length}${hasRollup && org.rollup.totalContacts > org.contacts.length ? ` · ${org.rollup.totalContacts} total` : ""})`}
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

      <ParentPickerModal
        visible={parentPickerOpen}
        currentOrgId={id}
        currentParentId={org.parentOrganizationId}
        onSelect={handleSetParent}
        onClose={() => setParentPickerOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  headerSection: { alignItems: "center", paddingVertical: 24 },
  orgIcon: { width: 72, height: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  name: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  legalName: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap", justifyContent: "center" },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10, justifyContent: "center" },
  rollupRow: { flexDirection: "row", gap: 10, marginTop: 16, flexWrap: "wrap", justifyContent: "center" },
  rollupPill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: COLORS.emeraldMuted, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.emerald + "44",
  },
  rollupValue: { fontFamily: "Inter_700Bold", fontSize: 14, color: COLORS.emerald },
  rollupLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.emerald },
  section: { marginBottom: 20 },
  hierarchyRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 12 },
  hierarchyLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 4 },
  hierarchyLink: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.blue },
  hierarchyLinkSub: { fontFamily: "Inter_400Regular", color: COLORS.textMuted },
  hierarchyNone: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textDim, fontStyle: "italic" },
  hierarchyAction: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 12 },
  hierarchyActionText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.emerald },
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
