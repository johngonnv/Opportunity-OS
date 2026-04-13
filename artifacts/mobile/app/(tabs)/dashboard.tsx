import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useDashboard, useActivities } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { useGovconProfileData } from "@/hooks/useGovcon";

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

function formatTime(date: string) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHrs = diffMs / 3600000;
  const diffDays = diffMs / 86400000;
  if (diffHrs < 1) return `${Math.round(diffHrs * 60)}m ago`;
  if (diffDays < 1) return `${Math.round(diffHrs)}h ago`;
  if (diffDays < 7) return `${Math.round(diffDays)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// GAGC section — shown to OWNER/ADMIN only
// ---------------------------------------------------------------------------

function GagcSection() {
  const router = useRouter();
  const { data, isLoading } = useGovconProfileData();

  if (isLoading) return null;

  const profile = data?.profile;
  const isActivated = !!profile?.gagcActivatedAt;

  if (isActivated) {
    // Show a summary card after activation
    const naicsCount = data?.targetNaics.length ?? 0;
    const agencyCount = data?.targetAgencies.length ?? 0;
    const roleLabel = profile?.roleType === "PRIME" ? "Prime" : profile?.roleType === "SUB" ? "Sub" : "Prime + Sub";
    return (
      <View style={gc.card}>
        <View style={gc.cardHeader}>
          <View style={gc.iconWrap}>
            <Feather name="zap" size={16} color={COLORS.emerald} />
          </View>
          <Text style={gc.cardTitle}>GovCon Profile</Text>
          <View style={gc.activeBadge}>
            <Feather name="check-circle" size={11} color={COLORS.emerald} />
            <Text style={gc.activeBadgeText}>Active</Text>
          </View>
        </View>
        <View style={gc.statsRow}>
          <View style={gc.stat}>
            <Text style={gc.statValue}>{naicsCount}</Text>
            <Text style={gc.statLabel}>NAICS targets</Text>
          </View>
          <View style={gc.statDivider} />
          <View style={gc.stat}>
            <Text style={gc.statValue}>{agencyCount}</Text>
            <Text style={gc.statLabel}>Agencies</Text>
          </View>
          <View style={gc.statDivider} />
          <View style={gc.stat}>
            <Text style={gc.statValue}>{roleLabel}</Text>
            <Text style={gc.statLabel}>Role</Text>
          </View>
        </View>
        {profile?.region && (
          <View style={gc.regionRow}>
            <Feather name="map-pin" size={12} color={COLORS.textDim} />
            <Text style={gc.regionText}>{profile.region}</Text>
          </View>
        )}
      </View>
    );
  }

  // Pre-activation: show CTA
  return (
    <TouchableOpacity
      style={gc.ctaCard}
      onPress={() => router.push("/govcon/activate" as Href)}
      activeOpacity={0.85}
    >
      <View style={gc.ctaLeft}>
        <View style={gc.ctaIconWrap}>
          <Feather name="zap" size={22} color={COLORS.emerald} />
        </View>
        <View style={gc.ctaText}>
          <Text style={gc.ctaTitle}>Activate GovCon Intelligence</Text>
          <Text style={gc.ctaDesc}>Set up your NAICS, region, and target agencies</Text>
        </View>
      </View>
      <Feather name="chevron-right" size={20} color={COLORS.emerald} />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: dash, isLoading, refetch, isRefetching } = useDashboard();
  const { data: activitiesData } = useActivities({ limit: "8" });
  const { role } = useAuth();

  const isAdmin = role === "OWNER" || role === "ADMIN";

  if (isLoading) return <LoadingSpinner label="Loading dashboard..." />;

  const activities = activitiesData?.activities || dash?.recentActivities || [];

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Opportunity OS</Text>
          <Text style={styles.subGreeting}>Healthcare & GovCon CRM</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: COLORS.emeraldMuted }]}>
          <Feather name="activity" size={16} color={COLORS.emerald} />
        </View>
      </View>

      {isAdmin && (
        <View style={styles.gagcSection}>
          <SectionHeader title="GovCon Intelligence" />
          <GagcSection />
        </View>
      )}

      <View style={styles.statsGrid}>
        <StatCard label="Contacts this week" value={dash?.contactsThisWeek ?? 0} icon="user-plus" color={COLORS.emerald} />
        <StatCard label="Cards pending" value={dash?.cardsPendingReview ?? 0} icon="credit-card" color={COLORS.amber} />
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Tasks due today" value={dash?.tasksDueToday ?? 0} icon="check-square" color={COLORS.blue} />
        <StatCard label="Tasks overdue" value={dash?.tasksOverdue ?? 0} icon="alert-circle" color={COLORS.red} />
      </View>

      <View style={styles.statsGrid}>
        <StatCard label="Open opportunities" value={dash?.openOpportunities ?? 0} icon="trending-up" color={COLORS.purple} />
        <StatCard label="Total contacts" value={dash?.totalContacts ?? 0} icon="users" color={COLORS.cyan} />
      </View>

      <View style={styles.quickActions}>
        <SectionHeader title="Quick Actions" />
        <View style={styles.actionsRow}>
          {[
            { label: "Scan Card", icon: "camera" as const, route: "/(tabs)/cards", color: COLORS.emerald },
            { label: "Scan Business Logo", icon: "image" as const, route: "/org-scan/new", color: COLORS.cyan },
            { label: "New Contact", icon: "user-plus" as const, route: "/contact/new", color: COLORS.blue },
            { label: "New Org", icon: "briefcase" as const, route: "/organization/new", color: COLORS.purple },
            { label: "Pipeline", icon: "trending-up" as const, route: "/(tabs)/opportunities", color: COLORS.amber },
          ].map(({ label, icon, route, color }) => (
            <TouchableOpacity
              key={label}
              style={[styles.actionBtn, { borderColor: color + "44" }]}
              onPress={() => router.push(route as Href)}
              activeOpacity={0.75}
            >
              <View style={[styles.actionIcon, { backgroundColor: color + "20" }]}>
                <Feather name={icon} size={20} color={color} />
              </View>
              <Text style={styles.actionLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.activitySection}>
        <SectionHeader title="Recent Activity" />
        {activities.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>No recent activity yet. Start scanning cards or adding contacts.</Text>
          </Card>
        ) : (
          activities.slice(0, 8).map((activity: any) => (
            <Card key={activity.id} style={styles.activityCard} padding={12}>
              <View style={styles.activityRow}>
                <View style={[styles.activityIcon, { backgroundColor: COLORS.navySurface }]}>
                  <Feather name={ACTIVITY_ICONS[activity.type] || "activity"} size={14} color={COLORS.emerald} />
                </View>
                <View style={styles.activityText}>
                  <Text style={styles.activitySubject} numberOfLines={1}>{activity.subject}</Text>
                  <Text style={styles.activityMeta}>{activity.type} · {formatTime(activity.occurredAt)}</Text>
                </View>
              </View>
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  content: { padding: 16, paddingBottom: 100 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  greeting: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  subGreeting: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  badge: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  gagcSection: { marginBottom: 16 },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  quickActions: { marginTop: 16, marginBottom: 10 },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: { flex: 1, backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1 },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  actionLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted, textAlign: "center" },
  activitySection: { marginTop: 16 },
  activityCard: { marginBottom: 6 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  activityIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  activityText: { flex: 1 },
  activitySubject: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  activityMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", paddingVertical: 8, lineHeight: 20 },
});

// ---------------------------------------------------------------------------
// GAGC card styles (local to this file)
// ---------------------------------------------------------------------------

const gc = StyleSheet.create({
  ctaCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navyCard, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.emerald + "55",
    padding: 16,
  },
  ctaLeft: { flexDirection: "row", alignItems: "center", gap: 14, flex: 1 },
  ctaIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: COLORS.emerald + "20",
    alignItems: "center", justifyContent: "center",
  },
  ctaText: { flex: 1 },
  ctaTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text },
  ctaDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 3 },

  card: {
    backgroundColor: COLORS.navyCard, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 16,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  iconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.emerald + "20",
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text, flex: 1 },
  activeBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: COLORS.emerald + "20", borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: COLORS.emerald + "44",
  },
  activeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.emerald },

  statsRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  statLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.navyBorder, marginHorizontal: 8 },

  regionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  regionText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim },
});
