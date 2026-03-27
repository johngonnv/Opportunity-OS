import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking, Image, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useContact, useDeleteContact, useCreateActivity, useCreateNote, getStorageUrl } from "@/hooks/useApi";

function resolveImageUri(path: string): string {
  if (!path) return "";
  if (path.startsWith("/objects/")) return getStorageUrl(path);
  return path;
}

const STATUS_COLORS: Record<string, string> = {
  NEW: COLORS.amber,
  REVIEWED: COLORS.blue,
  ACTIVE: COLORS.emerald,
  INACTIVE: COLORS.textDim,
};

const ACTIVITY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  CALL: "phone",
  EMAIL: "mail",
  MEETING: "calendar",
  CARD_SCAN: "credit-card",
  NOTE: "file-text",
  FOLLOW_UP: "repeat",
  EVENT: "star",
  INTRO: "user-plus",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: contact, isLoading, refetch } = useContact(id);
  const deleteContact = useDeleteContact();
  const logActivity = useCreateActivity();
  const [addingNote, setAddingNote] = useState(false);

  if (isLoading) return <LoadingSpinner label="Loading contact..." />;
  if (!contact) return null;

  const initials = ((contact.firstName?.[0] || "") + (contact.lastName?.[0] || "")).toUpperCase() || contact.fullName?.[0]?.toUpperCase() || "?";

  const handleDelete = () => {
    const doDelete = async () => {
      await deleteContact.mutateAsync(id);
      router.back();
    };
    if (Platform.OS === "web") {
      if (window.confirm(`Delete ${contact.fullName}? This cannot be undone.`)) doDelete();
    } else {
      Alert.alert("Delete Contact", `Remove ${contact.fullName}? This cannot be undone.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleLogActivity = (type: string) => {
    Alert.prompt(
      `Log ${type}`,
      "Add a note or subject for this activity",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log",
          onPress: (subject) => {
            if (!subject) return;
            logActivity.mutate({ contactId: id, type, subject, occurredAt: new Date().toISOString() });
            setTimeout(() => refetch(), 500);
          },
        },
      ],
      "plain-text",
      "",
    );
  };

  const quickActions = [
    { icon: "phone" as const, label: "Call", onPress: () => contact.phone && Linking.openURL(`tel:${contact.phone}`) },
    { icon: "mail" as const, label: "Email", onPress: () => contact.email && Linking.openURL(`mailto:${contact.email}`) },
    { icon: "repeat" as const, label: "Follow-up", onPress: () => handleLogActivity("FOLLOW_UP") },
    { icon: "file-text" as const, label: "Note", onPress: () => handleLogActivity("NOTE") },
  ];

  return (
    <ScrollView style={[styles.container]} contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: contact.fullName, headerRight: () => (
        <TouchableOpacity onPress={handleDelete} style={{ marginRight: 4 }}>
          <Feather name="trash-2" size={18} color={COLORS.red} />
        </TouchableOpacity>
      )}} />

      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.initials}>{initials}</Text>
        </View>
        <Text style={styles.name}>{contact.fullName}</Text>
        {contact.title && <Text style={styles.title}>{contact.title}</Text>}
        {contact.organization && (
          <TouchableOpacity onPress={() => router.push(`/organization/${contact.organization.id}`)}>
            <Text style={styles.orgLink}>{contact.organization.name}</Text>
          </TouchableOpacity>
        )}
        <View style={styles.statusRow}>
          <Badge label={contact.status} color={STATUS_COLORS[contact.status] || COLORS.textDim} />
        </View>
        {contact.tags?.length > 0 && (
          <View style={styles.tagsRow}>
            {contact.tags.map((tag: any) => (
              <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.quickActionsRow}>
        {quickActions.map(({ icon, label, onPress }) => (
          <TouchableOpacity key={label} style={styles.quickAction} onPress={onPress} activeOpacity={0.75}>
            <View style={styles.quickActionIcon}>
              <Feather name={icon} size={18} color={COLORS.emerald} />
            </View>
            <Text style={styles.quickActionLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {contact.businessCards?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Business Card" />
          {contact.businessCards.map((bc: any) => {
            const frontUri = bc.imageUrlFront ? resolveImageUri(bc.imageUrlFront) : null;
            const backUri = bc.imageUrlBack ? resolveImageUri(bc.imageUrlBack) : null;
            return (
              <TouchableOpacity key={bc.id} activeOpacity={0.85} onPress={() => router.push(`/card/${bc.id}`)}>
                <View style={styles.cardImagesRow}>
                  {frontUri && (
                    <View style={[styles.cardImageWrap, !backUri && { flex: 1 }]}>
                      <Image source={{ uri: frontUri }} style={styles.cardImage} resizeMode="cover" />
                      <Text style={styles.cardImageLabel}>Front</Text>
                    </View>
                  )}
                  {backUri && (
                    <View style={styles.cardImageWrap}>
                      <Image source={{ uri: backUri }} style={styles.cardImage} resizeMode="cover" />
                      <Text style={styles.cardImageLabel}>Back</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardTapHint}>Tap to review or rescan</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <View style={styles.section}>
        <SectionHeader title="Contact Info" />
        <Card>
          {[
            { icon: "mail", label: "Email", value: contact.email, href: contact.email ? `mailto:${contact.email}` : null },
            { icon: "phone", label: "Phone", value: contact.phone, href: contact.phone ? `tel:${contact.phone}` : null },
            { icon: "smartphone", label: "Mobile", value: contact.mobile, href: contact.mobile ? `tel:${contact.mobile}` : null },
            { icon: "link", label: "LinkedIn", value: contact.linkedinUrl, href: contact.linkedinUrl },
            { icon: "tag", label: "Source", value: contact.source, href: null },
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
                <Text style={[styles.infoValue, href && styles.infoValueLink]}>{value}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </Card>
      </View>

      {contact.activities?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Activity" />
          {contact.activities.map((a: any) => (
            <Card key={a.id} style={{ marginBottom: 6 }} padding={12}>
              <View style={styles.actRow}>
                <View style={[styles.actIcon, { backgroundColor: COLORS.navySurface }]}>
                  <Feather name={ACTIVITY_ICONS[a.type] || "activity"} size={12} color={COLORS.emerald} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actSubject}>{a.subject}</Text>
                  <Text style={styles.actDate}>{a.type} · {formatDate(a.occurredAt)}</Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      )}

      {contact.tasks?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Tasks" />
          {contact.tasks.map((t: any) => (
            <Card key={t.id} style={{ marginBottom: 6 }} padding={12}>
              <View style={styles.taskRow}>
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

      {contact.notes?.length > 0 && (
        <View style={styles.section}>
          <SectionHeader title="Notes" />
          {contact.notes.map((n: any) => (
            <Card key={n.id} style={{ marginBottom: 6 }} padding={12}>
              <Text style={styles.noteText}>{n.content}</Text>
              <Text style={styles.noteDate}>{formatDate(n.createdAt)}</Text>
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  profileSection: { alignItems: "center", paddingVertical: 24 },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: COLORS.navySurface, alignItems: "center", justifyContent: "center", marginBottom: 12, borderWidth: 2, borderColor: COLORS.emerald },
  initials: { fontFamily: "Inter_700Bold", fontSize: 28, color: COLORS.emerald },
  name: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  title: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
  orgLink: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.blue, marginTop: 4 },
  statusRow: { marginTop: 10, flexDirection: "row", gap: 8 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8, justifyContent: "center" },
  quickActionsRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  quickAction: { flex: 1, alignItems: "center", backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.navyBorder },
  quickActionIcon: { width: 36, height: 36, backgroundColor: COLORS.emeraldMuted, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  quickActionLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  section: { marginBottom: 20 },
  infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "88" },
  infoIcon: { width: 28, alignItems: "center" },
  infoContent: { flex: 1 },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 2 },
  infoValue: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  infoValueLink: { color: COLORS.blue },
  actRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  actIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  actSubject: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  actDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  taskRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noteText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, lineHeight: 18 },
  noteDate: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 6 },
  cardImagesRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
  cardImageWrap: { flex: 1, borderRadius: 10, overflow: "hidden", backgroundColor: COLORS.navySurface },
  cardImage: { width: "100%", aspectRatio: 1.75, borderRadius: 10 },
  cardImageLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, textAlign: "center", paddingVertical: 4 },
  cardTapHint: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, textAlign: "center", marginBottom: 4 },
});
