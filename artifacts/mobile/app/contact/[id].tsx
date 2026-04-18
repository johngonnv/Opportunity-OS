import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Linking, Image, Platform, Modal, Pressable, TextInput,
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
import {
  useContact, useDeleteContact, useCreateActivity, useCreateNote, usePatchContact,
  useAdoptMaster, useDismissMasterDiff, getStorageUrl,
} from "@/hooks/useApi";

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

const STAKEHOLDER_ROLES = [
  { value: "DECISION_MAKER", label: "Decision Maker", color: COLORS.emerald, icon: "star" as const },
  { value: "CHAMPION", label: "Champion", color: COLORS.purple, icon: "heart" as const },
  { value: "INFLUENCER", label: "Influencer", color: COLORS.blue, icon: "radio" as const },
  { value: "BLOCKER", label: "Blocker", color: COLORS.red, icon: "shield" as const },
  { value: "OTHER", label: "Other", color: COLORS.textDim, icon: "user" as const },
];

const INFLUENCE_LEVELS = [
  { value: "HIGH", label: "High", color: COLORS.emerald },
  { value: "MEDIUM", label: "Medium", color: COLORS.amber },
  { value: "LOW", label: "Low", color: COLORS.textDim },
];

const STRENGTH_LABELS: Record<string, string> = {
  STRATEGIC: "Strategic",
  STRONG: "Strong",
  DEVELOPING: "Developing",
  COLD: "Cold",
};

const STRENGTH_COLORS: Record<string, string> = {
  STRATEGIC: COLORS.emerald,
  STRONG: COLORS.blue,
  DEVELOPING: COLORS.amber,
  COLD: COLORS.textDim,
};

interface StakeholderPickerProps {
  visible: boolean;
  current: string | null;
  onSelect: (v: string | null) => void;
  onClose: () => void;
}

function StakeholderPicker({ visible, current, onSelect, onClose }: StakeholderPickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose}>
        <View style={pickerStyles.sheet}>
          <Text style={pickerStyles.sheetTitle}>Stakeholder Role</Text>
          {STAKEHOLDER_ROLES.map(r => (
            <TouchableOpacity
              key={r.value}
              style={[pickerStyles.option, current === r.value && { backgroundColor: r.color + "18" }]}
              onPress={() => onSelect(r.value)}
            >
              <View style={[pickerStyles.optionIcon, { backgroundColor: r.color + "22" }]}>
                <Feather name={r.icon} size={14} color={r.color} />
              </View>
              <Text style={[pickerStyles.optionLabel, { color: r.color }]}>{r.label}</Text>
              {current === r.value && <Feather name="check" size={16} color={r.color} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={pickerStyles.clearBtn} onPress={() => onSelect(null)}>
            <Text style={pickerStyles.clearText}>Clear role</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

interface InfluencePickerProps {
  visible: boolean;
  current: string | null;
  onSelect: (v: string | null) => void;
  onClose: () => void;
}

function InfluencePicker({ visible, current, onSelect, onClose }: InfluencePickerProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={pickerStyles.overlay} onPress={onClose}>
        <View style={pickerStyles.sheet}>
          <Text style={pickerStyles.sheetTitle}>Influence Level</Text>
          {INFLUENCE_LEVELS.map(l => (
            <TouchableOpacity
              key={l.value}
              style={[pickerStyles.option, current === l.value && { backgroundColor: l.color + "18" }]}
              onPress={() => onSelect(l.value)}
            >
              <Text style={[pickerStyles.optionLabel, { color: l.color }]}>{l.label}</Text>
              {current === l.value && <Feather name="check" size={16} color={l.color} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={pickerStyles.clearBtn} onPress={() => onSelect(null)}>
            <Text style={pickerStyles.clearText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: COLORS.navySurface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 20,
    paddingBottom: 40,
    gap: 6,
  },
  sheetTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: COLORS.text,
    marginBottom: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  optionIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flex: 1,
  },
  clearBtn: {
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  clearText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: COLORS.textDim,
  },
});

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: contact, isLoading, refetch } = useContact(id);
  const deleteContact = useDeleteContact();
  const logActivity = useCreateActivity();
  const patchContact = usePatchContact(id);
  const [addingNote, setAddingNote] = useState(false);
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [influencePickerOpen, setInfluencePickerOpen] = useState(false);
  const [editingRoleNotes, setEditingRoleNotes] = useState(false);
  const [roleNotesText, setRoleNotesText] = useState("");

  const handlePatchRole = (value: string | null) => {
    patchContact.mutate({ stakeholderRole: value }, { onSuccess: () => { refetch(); setRolePickerOpen(false); } });
  };

  const handleSaveRoleNotes = () => {
    patchContact.mutate({ roleNotes: roleNotesText.trim() || null }, {
      onSuccess: () => { refetch(); setEditingRoleNotes(false); },
    });
  };

  const handlePatchInfluence = (value: string | null) => {
    patchContact.mutate({ influenceLevel: value }, { onSuccess: () => { refetch(); setInfluencePickerOpen(false); } });
  };

  const handleTogglePrimary = () => {
    patchContact.mutate({ isPrimaryRelationship: !contact?.isPrimaryRelationship }, { onSuccess: () => refetch() });
  };

  const adoptMaster = useAdoptMaster(id);
  const dismissMasterDiff = useDismissMasterDiff(id);

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
          onPress: (subject: string | undefined) => {
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
    <>
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

      {contact.masterConflictDiff && contact.masterConflictDiff.length > 0 && !contact.masterDiffDismissed && (
        <View style={masterStyles.badge}>
          <View style={masterStyles.badgeHeader}>
            <Feather name="refresh-cw" size={14} color={COLORS.cyan} />
            <Text style={masterStyles.badgeTitle}>Master directory has updated info</Text>
          </View>
          {contact.masterConflictDiff.map((d: { field: string; workspaceValue: string | null; masterValue: string | null }) => (
            <View key={d.field} style={masterStyles.diffRow}>
              <Text style={masterStyles.diffField}>{d.field}</Text>
              <View style={masterStyles.diffVals}>
                <Text style={masterStyles.diffOld} numberOfLines={1}>
                  {d.workspaceValue || "—"}
                </Text>
                <Feather name="arrow-right" size={11} color={COLORS.textDim} />
                <Text style={masterStyles.diffNew} numberOfLines={1}>
                  {d.masterValue || "—"}
                </Text>
              </View>
            </View>
          ))}
          <View style={masterStyles.badgeActions}>
            <TouchableOpacity
              style={[masterStyles.badgeBtn, { backgroundColor: COLORS.cyan + "22", borderColor: COLORS.cyan + "55" }]}
              onPress={() => adoptMaster.mutate(undefined, { onSuccess: () => refetch() })}
              disabled={adoptMaster.isPending}
            >
              <Feather name="download" size={12} color={COLORS.cyan} />
              <Text style={[masterStyles.badgeBtnText, { color: COLORS.cyan }]}>
                {adoptMaster.isPending ? "Adopting…" : "Adopt"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[masterStyles.badgeBtn, { backgroundColor: "transparent", borderColor: COLORS.textDim + "55" }]}
              onPress={() =>
                contact.masterDiffHash &&
                dismissMasterDiff.mutate(contact.masterDiffHash, { onSuccess: () => refetch() })
              }
              disabled={dismissMasterDiff.isPending || !contact.masterDiffHash}
            >
              <Feather name="x" size={12} color={COLORS.textMuted} />
              <Text style={[masterStyles.badgeBtnText, { color: COLORS.textMuted }]}>
                {dismissMasterDiff.isPending ? "…" : "Ignore"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

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

      {/* ── Stakeholder Classification ── */}
      <View style={styles.section}>
        <SectionHeader title="Relationship Profile" />
        <Card>
          {/* Role Row */}
          <TouchableOpacity style={styles.classifyRow} onPress={() => setRolePickerOpen(true)} activeOpacity={0.8}>
            <View style={styles.infoIcon}>
              <Feather name="award" size={14} color={COLORS.textMuted} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Stakeholder Role</Text>
              {contact.stakeholderRole ? (
                <Text style={[styles.infoValue, { color: STAKEHOLDER_ROLES.find(r => r.value === contact.stakeholderRole)?.color || COLORS.text }]}>
                  {STAKEHOLDER_ROLES.find(r => r.value === contact.stakeholderRole)?.label || contact.stakeholderRole}
                </Text>
              ) : (
                <Text style={styles.unclassifiedText}>Tap to classify →</Text>
              )}
            </View>
            <Feather name="chevron-right" size={14} color={COLORS.textDim} />
          </TouchableOpacity>

          {/* Influence Row */}
          <TouchableOpacity style={[styles.classifyRow, styles.classifyRowBorder]} onPress={() => setInfluencePickerOpen(true)} activeOpacity={0.8}>
            <View style={styles.infoIcon}>
              <Feather name="radio" size={14} color={COLORS.textMuted} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Influence Level</Text>
              {contact.influenceLevel ? (
                <Text style={[styles.infoValue, { color: INFLUENCE_LEVELS.find(l => l.value === contact.influenceLevel)?.color || COLORS.text }]}>
                  {INFLUENCE_LEVELS.find(l => l.value === contact.influenceLevel)?.label || contact.influenceLevel}
                </Text>
              ) : (
                <Text style={styles.unclassifiedText}>Tap to set →</Text>
              )}
            </View>
            <Feather name="chevron-right" size={14} color={COLORS.textDim} />
          </TouchableOpacity>

          {/* Relationship Strength */}
          {contact.relationshipStrengthLabel && (
            <View style={[styles.classifyRow, styles.classifyRowBorder]}>
              <View style={styles.infoIcon}>
                <Feather name="activity" size={14} color={COLORS.textMuted} />
              </View>
              <View style={[styles.infoContent, { gap: 6 }]}>
                <Text style={styles.infoLabel}>Relationship Strength</Text>
                <View style={styles.strengthRow}>
                  <View style={styles.strengthTrack}>
                    {(() => {
                      const val = Math.min(100, Math.max(0, contact.relationshipStrength ?? 0));
                      const color = STRENGTH_COLORS[contact.relationshipStrengthLabel] || COLORS.textDim;
                      return (
                        <>
                          <View style={{ flex: val, height: 5, backgroundColor: color, borderRadius: 3 }} />
                          {val < 100 && <View style={{ flex: 100 - val }} />}
                        </>
                      );
                    })()}
                  </View>
                  <Badge
                    label={STRENGTH_LABELS[contact.relationshipStrengthLabel] || contact.relationshipStrengthLabel}
                    color={STRENGTH_COLORS[contact.relationshipStrengthLabel] || COLORS.textDim}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Primary Relationship Toggle */}
          <TouchableOpacity style={[styles.classifyRow, styles.classifyRowBorder]} onPress={handleTogglePrimary} activeOpacity={0.8}>
            <View style={styles.infoIcon}>
              <Feather name="star" size={14} color={contact.isPrimaryRelationship ? COLORS.amber : COLORS.textMuted} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Primary Relationship</Text>
              <Text style={[styles.infoValue, { color: contact.isPrimaryRelationship ? COLORS.amber : COLORS.textDim }]}>
                {contact.isPrimaryRelationship ? "Yes — key contact for this account" : "No"}
              </Text>
            </View>
            <View style={[styles.toggleDot, contact.isPrimaryRelationship && styles.toggleDotOn]} />
          </TouchableOpacity>

          {/* Role Notes */}
          <View style={[styles.classifyRow, styles.classifyRowBorder, { alignItems: "flex-start", paddingTop: 14 }]}>
            <View style={[styles.infoIcon, { paddingTop: 2 }]}>
              <Feather name="file-text" size={14} color={COLORS.textMuted} />
            </View>
            <View style={[styles.infoContent, { gap: 6 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.infoLabel}>Role Notes</Text>
                <TouchableOpacity
                  onPress={() => {
                    if (!editingRoleNotes) {
                      setRoleNotesText(contact.roleNotes || "");
                      setEditingRoleNotes(true);
                    } else {
                      setEditingRoleNotes(false);
                    }
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.roleNotesEditBtn}>{editingRoleNotes ? "Cancel" : contact.roleNotes ? "Edit" : "Add"}</Text>
                </TouchableOpacity>
              </View>
              {editingRoleNotes ? (
                <View style={styles.roleNotesInputWrap}>
                  <TextInput
                    value={roleNotesText}
                    onChangeText={setRoleNotesText}
                    placeholder="Notes about their role, concerns, or context..."
                    placeholderTextColor={COLORS.textDim}
                    style={styles.roleNotesInput}
                    multiline
                    numberOfLines={3}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={styles.roleNotesSaveBtn}
                    onPress={handleSaveRoleNotes}
                    disabled={patchContact.isPending}
                  >
                    <Text style={styles.roleNotesSaveBtnText}>
                      {patchContact.isPending ? "Saving…" : "Save"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : contact.roleNotes ? (
                <Text style={styles.roleNotesText}>{contact.roleNotes}</Text>
              ) : (
                <Text style={styles.unclassifiedText}>Add context about this contact's role</Text>
              )}
            </View>
          </View>
        </Card>
      </View>

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

    <StakeholderPicker
      visible={rolePickerOpen}
      current={contact.stakeholderRole}
      onSelect={handlePatchRole}
      onClose={() => setRolePickerOpen(false)}
    />
    <InfluencePicker
      visible={influencePickerOpen}
      current={contact.influenceLevel}
      onSelect={handlePatchInfluence}
      onClose={() => setInfluencePickerOpen(false)}
    />
    </>
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
  classifyRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  classifyRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder + "88" },
  unclassifiedText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textDim, fontStyle: "italic" },
  strengthRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  strengthTrack: { flex: 1, height: 5, backgroundColor: COLORS.navyBorder, borderRadius: 3, overflow: "hidden", flexDirection: "row" },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.navyBorder, borderWidth: 2, borderColor: COLORS.textDim },
  toggleDotOn: { backgroundColor: COLORS.amber, borderColor: COLORS.amber },
  roleNotesEditBtn: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.emerald },
  roleNotesInputWrap: { gap: 8 },
  roleNotesInput: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.text,
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    minHeight: 80,
    textAlignVertical: "top",
  },
  roleNotesSaveBtn: {
    backgroundColor: COLORS.emerald,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: "center",
  },
  roleNotesSaveBtnText: { fontFamily: "Inter_700Bold", fontSize: 13, color: COLORS.navy },
  roleNotesText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.text, lineHeight: 19 },
});

const masterStyles = StyleSheet.create({
  badge: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: COLORS.cyan + "0F",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.cyan + "44",
    gap: 8,
  },
  badgeHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  badgeTitle: {
    fontFamily: "Inter_600SemiBold", fontSize: 12,
    color: COLORS.cyan, textTransform: "uppercase", letterSpacing: 0.6,
  },
  diffRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  diffField: {
    fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted,
    width: 76, textTransform: "uppercase", letterSpacing: 0.5,
  },
  diffVals: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  diffOld: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim, flexShrink: 1, textDecorationLine: "line-through" },
  diffNew: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.text, flexShrink: 1 },
  badgeActions: { flexDirection: "row", gap: 8, marginTop: 4 },
  badgeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1,
  },
  badgeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
});
