import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import type { EnrichedContact, CoverageGap } from "@/hooks/useApi";

const ROLE_LABELS: Record<string, string> = {
  DECISION_MAKER: "Decision Maker",
  INFLUENCER: "Influencer",
  CHAMPION: "Champion",
  BLOCKER: "Blocker",
  OTHER: "Other",
};

const ROLE_COLORS: Record<string, string> = {
  DECISION_MAKER: COLORS.emerald,
  INFLUENCER: COLORS.blue,
  CHAMPION: COLORS.purple,
  BLOCKER: COLORS.red,
  OTHER: COLORS.textDim,
};

const INFLUENCE_LABELS: Record<string, string> = {
  HIGH: "High",
  MEDIUM: "Med",
  LOW: "Low",
};

const STRENGTH_COLORS: Record<string, string> = {
  STRATEGIC: COLORS.emerald,
  STRONG: COLORS.blue,
  DEVELOPING: COLORS.amber,
  COLD: COLORS.textDim,
};

function StrengthBar({ value }: { value: number }) {
  const color = value >= 70 ? COLORS.emerald : value >= 40 ? COLORS.blue : value >= 20 ? COLORS.amber : COLORS.textDim;
  const clamped = Math.min(100, Math.max(2, value));
  return (
    <View style={styles.strTrack}>
      <View style={{ flex: clamped, height: 3, backgroundColor: color, borderRadius: 2 }} />
      {clamped < 100 && <View style={{ flex: 100 - clamped }} />}
    </View>
  );
}

function formatEngagement(d: string | null): string | null {
  if (!d) return null;
  const dt = new Date(d);
  const diffDays = Math.floor((Date.now() - dt.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function initials(name: string): string {
  const parts = name.trim().split(" ");
  return ((parts[0]?.[0] || "") + (parts[parts.length - 1]?.[0] || "")).toUpperCase();
}

interface ContactRowProps {
  contact: EnrichedContact;
  onPress: (id: string) => void;
}

function ContactRow({ contact, onPress }: ContactRowProps) {
  const roleColor = contact.stakeholderRole ? ROLE_COLORS[contact.stakeholderRole] : COLORS.textDim;
  const roleLabel = contact.stakeholderRole ? ROLE_LABELS[contact.stakeholderRole] : "Unclassified";
  const influenceLabel = contact.influenceLevel ? INFLUENCE_LABELS[contact.influenceLevel] : null;

  return (
    <TouchableOpacity style={styles.contactRow} onPress={() => onPress(contact.id)} activeOpacity={0.8}>
      <View style={[styles.avatar, { borderColor: roleColor + "55" }]}>
        <Text style={[styles.avatarInitials, { color: roleColor }]}>{initials(contact.fullName)}</Text>
        {contact.isPrimaryRelationship && (
          <View style={styles.primaryDot} />
        )}
      </View>
      <View style={styles.contactInfo}>
        <View style={styles.nameRow}>
          <Text style={styles.contactName} numberOfLines={1}>{contact.fullName}</Text>
          {contact.isOnOpenOpp && (
            <View style={styles.oppDot} />
          )}
        </View>
        {contact.title && (
          <Text style={styles.contactTitle} numberOfLines={1}>{contact.title}</Text>
        )}
        <View style={styles.metaRow}>
          <View style={[styles.roleBadge, { backgroundColor: roleColor + "18", borderColor: roleColor + "44" }]}>
            <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
          </View>
          {influenceLabel && (
            <Text style={styles.influenceText}>{influenceLabel} Influence</Text>
          )}
        </View>
        <View style={styles.engagementRow}>
          <StrengthBar value={contact.computedStrength} />
          <Text style={styles.engagementDate}>
            {formatEngagement(contact.lastEngagementAt) || "No activity"}
          </Text>
        </View>
      </View>
      {contact.hasOverdueTask && (
        <Feather name="alert-circle" size={14} color={COLORS.red} style={{ alignSelf: "center" }} />
      )}
      <Feather name="chevron-right" size={16} color={COLORS.textDim} style={{ alignSelf: "center" }} />
    </TouchableOpacity>
  );
}

interface GapRowProps {
  gap: CoverageGap;
}

function GapRow({ gap }: GapRowProps) {
  return (
    <View style={styles.gapRow}>
      <Feather name="alert-triangle" size={13} color={COLORS.amber} />
      <View style={styles.gapContent}>
        <Text style={styles.gapMessage}>{gap.message}</Text>
        <Text style={styles.gapCta}>{gap.cta}</Text>
      </View>
    </View>
  );
}

interface Props {
  contacts: EnrichedContact[];
  gaps: CoverageGap[];
  onPressContact: (id: string) => void;
  onAddContact?: () => void;
  onClassifyContacts?: () => void;
}

export function RelationshipMap({ contacts, gaps, onPressContact, onAddContact, onClassifyContacts }: Props) {
  const classified = contacts.filter(c => c.stakeholderRole && c.stakeholderRole !== "OTHER");
  const unclassified = contacts.filter(c => !c.stakeholderRole || c.stakeholderRole === "OTHER");

  const roleOrder = ["DECISION_MAKER", "CHAMPION", "INFLUENCER", "BLOCKER"];
  const grouped: Record<string, EnrichedContact[]> = {};
  for (const role of roleOrder) {
    const group = classified.filter(c => c.stakeholderRole === role);
    if (group.length > 0) grouped[role] = group;
  }

  return (
    <View>
      {Object.entries(grouped).map(([role, group]) => (
        <View key={role} style={{ marginBottom: 14 }}>
          <View style={styles.groupHeader}>
            <View style={[styles.groupDot, { backgroundColor: ROLE_COLORS[role] }]} />
            <Text style={[styles.groupLabel, { color: ROLE_COLORS[role] }]}>{ROLE_LABELS[role]}</Text>
          </View>
          {group.map(c => (
            <ContactRow key={c.id} contact={c} onPress={onPressContact} />
          ))}
        </View>
      ))}

      {unclassified.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <View style={styles.groupHeader}>
            <View style={[styles.groupDot, { backgroundColor: COLORS.textDim }]} />
            <Text style={[styles.groupLabel, { color: COLORS.textDim }]}>Unclassified</Text>
          </View>
          {unclassified.map(c => (
            <ContactRow key={c.id} contact={c} onPress={onPressContact} />
          ))}
        </View>
      )}

      {contacts.length === 0 && (
        <View style={styles.emptyContacts}>
          <Feather name="users" size={22} color={COLORS.textDim} />
          <Text style={styles.emptyText}>No contacts linked yet</Text>
        </View>
      )}

      {onAddContact && (
        <TouchableOpacity style={styles.addBtn} onPress={onAddContact} activeOpacity={0.8}>
          <Feather name="user-plus" size={14} color={COLORS.emerald} />
          <Text style={styles.addBtnText}>Add Contact</Text>
        </TouchableOpacity>
      )}

      {gaps.length > 0 && (
        <View style={styles.gapsSection}>
          <Text style={styles.gapsSectionTitle}>Coverage Gaps</Text>
          {gaps.map((g, i) => (
            <GapRow key={i} gap={g} />
          ))}
          {unclassified.length > 0 && onClassifyContacts && (
            <TouchableOpacity
              style={styles.classifyBtn}
              onPress={onClassifyContacts}
              activeOpacity={0.8}
            >
              <Feather name="tag" size={13} color={COLORS.amber} />
              <Text style={styles.classifyBtnText}>
                Classify {unclassified.length} untagged contact{unclassified.length !== 1 ? "s" : ""}
              </Text>
              <Feather name="chevron-right" size={13} color={COLORS.amber} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  groupDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  groupLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    marginBottom: 8,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: COLORS.navySurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    position: "relative",
  },
  avatarInitials: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
  },
  primaryDot: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.emerald,
    borderWidth: 1.5,
    borderColor: COLORS.navyCard,
  },
  contactInfo: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  contactName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
    flex: 1,
  },
  oppDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.blue,
  },
  contactTitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  roleBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  roleText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.3,
  },
  influenceText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
  },
  strTrack: {
    flex: 1,
    height: 3,
    backgroundColor: COLORS.navyBorder,
    borderRadius: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  engagementRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 5,
  },
  engagementDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textDim,
    flexShrink: 0,
  },
  emptyContacts: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textDim,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: COLORS.emeraldMuted,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginTop: 2,
    marginBottom: 12,
  },
  addBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.emerald,
  },
  gapsSection: {
    backgroundColor: COLORS.amber + "0D",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.amber + "33",
    padding: 14,
    gap: 10,
  },
  gapsSectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.amber,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  gapRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  gapContent: {
    flex: 1,
  },
  gapMessage: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 2,
  },
  gapCta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
  },
  classifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.amber + "22",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 4,
  },
  classifyBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.amber,
    flex: 1,
  },
});
