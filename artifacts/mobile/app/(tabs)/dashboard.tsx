import React from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useDashboard, useActivities } from "@/hooks/useApi";

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

export default function DashboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: dash, isLoading, refetch, isRefetching } = useDashboard();
  const { data: activitiesData } = useActivities({ limit: "8" });

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
            { label: "New Contact", icon: "user-plus" as const, route: "/contact/new", color: COLORS.blue },
            { label: "New Org", icon: "briefcase" as const, route: "/organization/new", color: COLORS.purple },
            { label: "Pipeline", icon: "trending-up" as const, route: "/(tabs)/opportunities", color: COLORS.amber },
          ].map(({ label, icon, route, color }) => (
            <TouchableOpacity
              key={label}
              style={[styles.actionBtn, { borderColor: color + "44" }]}
              onPress={() => router.push(route as any)}
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
