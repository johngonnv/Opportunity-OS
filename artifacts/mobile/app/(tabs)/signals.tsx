import React, { useEffect, useRef } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Animated, Easing, RefreshControl,
} from "react-native";
import { useRouter, type Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { StatCard } from "@/components/ui/StatCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useDashboard, useActivities, useOrganizations } from "@/hooks/useApi";
import { useAuth } from "@/contexts/AuthContext";
import { useGovconProfileData, useGovconActionFeed, useGovconRadarSummary, type ActionFeedItem } from "@/hooks/useGovcon";
import { useMode } from "@/contexts/ModeContext";
import { ModeHeader } from "@/components/ui/ModeHeader";

interface Activity {
  id: string;
  type: string;
  subject: string;
  occurredAt: string;
}

interface DashboardData {
  totalContacts?: number;
  contactsThisWeek?: number;
  openOpportunities?: number;
  cardsPendingReview?: number;
  tasksDueToday?: number;
  tasksOverdue?: number;
  recentActivities?: Activity[];
}

interface OrgsListResponse {
  organizations: unknown[];
  total: number;
}

function seededRandom(seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function generateRadarDots(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    x: 0.18 + seededRandom(i * 7) * 0.64,
    y: 0.18 + seededRandom(i * 13 + 3) * 0.64,
    delay: i * 350,
  }));
}

const SIGNAL_DOTS_GENERATED = generateRadarDots(5);

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

const RADAR_SIZE = 240;
const RADAR_CENTER = RADAR_SIZE / 2;


function SignalDot({ x, y, delay }: { x: number; y: number; delay: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
        Animated.timing(pulse, { toValue: 0, duration: 900, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
        Animated.delay(500),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.4] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.4, 1, 0.4] });

  return (
    <Animated.View
      style={[
        styles.signalDot,
        {
          left: x * RADAR_SIZE - 6,
          top: y * RADAR_SIZE - 6,
          transform: [{ scale }],
          opacity,
        },
      ]}
    />
  );
}

function RadarCanvas() {
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 3000, useNativeDriver: true, easing: Easing.linear }),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  const rotate = sweep.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.radarContainer}>
      <View style={styles.radarCanvas}>
        <View style={[styles.radarRing, { width: RADAR_SIZE * 0.4, height: RADAR_SIZE * 0.4, borderRadius: RADAR_SIZE * 0.2, top: RADAR_CENTER - RADAR_SIZE * 0.2, left: RADAR_CENTER - RADAR_SIZE * 0.2 }]} />
        <View style={[styles.radarRing, { width: RADAR_SIZE * 0.65, height: RADAR_SIZE * 0.65, borderRadius: RADAR_SIZE * 0.325, top: RADAR_CENTER - RADAR_SIZE * 0.325, left: RADAR_CENTER - RADAR_SIZE * 0.325, opacity: 0.5 }]} />
        <View style={[styles.radarRing, { width: RADAR_SIZE * 0.9, height: RADAR_SIZE * 0.9, borderRadius: RADAR_SIZE * 0.45, top: RADAR_CENTER - RADAR_SIZE * 0.45, left: RADAR_CENTER - RADAR_SIZE * 0.45, opacity: 0.25 }]} />

        <View style={[styles.radarCross, { top: RADAR_CENTER - 0.5, left: 0, right: 0, height: 1 }]} />
        <View style={[styles.radarCross, { left: RADAR_CENTER - 0.5, top: 0, bottom: 0, width: 1 }]} />

        <Animated.View style={[styles.sweepWrap, { transform: [{ rotate }] }]}>
          <View style={styles.sweepLine} />
          <View style={styles.sweepTrail} />
        </Animated.View>

        <View style={styles.radarCenter} />

        {SIGNAL_DOTS_GENERATED.map(dot => (
          <SignalDot key={dot.id} x={dot.x} y={dot.y} delay={dot.delay} />
        ))}
      </View>
    </View>
  );
}

function NextBestAction({ feedItems }: { feedItems: ActionFeedItem[] }) {
  const router = useRouter();
  const pulseAnim = useRef(new Animated.Value(0.5)).current;
  const item = feedItems[0] ?? null;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 700, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <TouchableOpacity
      style={styles.nextActionCard}
      onPress={() => item && router.push(item.route as Href)}
      activeOpacity={0.8}
    >
      <Animated.View style={[styles.nextActionDot, { opacity: pulseAnim }]} />
      <View style={styles.nextActionContent}>
        <Text style={styles.nextActionLabel}>Next Best Action</Text>
        <Text style={styles.nextActionTitle} numberOfLines={2}>
          {item?.title ?? "Scan a business card to start capturing contacts"}
        </Text>
        {item?.description && (
          <Text style={styles.nextActionDesc} numberOfLines={1}>{item.description}</Text>
        )}
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.emerald} />
    </TouchableOpacity>
  );
}

function SignalsFeed({ activities }: { activities: Activity[] }) {
  return (
    <View style={styles.feedSection}>
      <Text style={styles.feedTitle}>Live Activity</Text>
      {activities.length === 0 ? (
        <Text style={styles.feedEmpty}>No recent activity. Start capturing contacts.</Text>
      ) : (
        activities.slice(0, 5).map((activity: Activity) => (
          <View key={activity.id} style={styles.feedItem}>
            <View style={styles.feedGlowBorder} />
            <View style={[styles.feedIcon]}>
              <Feather name={ACTIVITY_ICONS[activity.type] || "activity"} size={13} color={COLORS.emerald} />
            </View>
            <View style={styles.feedText}>
              <Text style={styles.feedSubject} numberOfLines={1}>{activity.subject}</Text>
              <Text style={styles.feedMeta}>{activity.type} · {formatTime(activity.occurredAt)}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

// ── GovCon Intelligence section (admin-only, same as dashboard) ──────────────

function GagcSection() {
  const router = useRouter();
  const { data, isLoading } = useGovconProfileData();
  const { data: radarSummary } = useGovconRadarSummary();
  const { data: actionFeedData } = useGovconActionFeed();

  if (isLoading) return null;

  const profile = data?.profile;
  const isActivated = !!profile?.gagcActivatedAt;

  if (isActivated) {
    const naicsCount = data?.targetNaics.length ?? 0;
    const agencyCount = data?.targetAgencies.length ?? 0;
    const roleLabel =
      profile?.roleType === "PRIME" ? "Prime" :
      profile?.roleType === "SUB" ? "Sub" : "Prime + Sub";
    const matchCount = radarSummary?.matchedOpportunities ?? 0;
    const highFitCount = radarSummary?.highFit ?? 0;
    const feedItems = actionFeedData?.items ?? [];

    return (
      <View>
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
            <View style={gc.gcStat}>
              <Text style={gc.gcStatValue}>{naicsCount}</Text>
              <Text style={gc.gcStatLabel}>NAICS targets</Text>
            </View>
            <View style={gc.statDivider} />
            <View style={gc.gcStat}>
              <Text style={gc.gcStatValue}>{agencyCount}</Text>
              <Text style={gc.gcStatLabel}>Agencies</Text>
            </View>
            <View style={gc.statDivider} />
            <View style={gc.gcStat}>
              <Text style={gc.gcStatValue}>{roleLabel}</Text>
              <Text style={gc.gcStatLabel}>Role</Text>
            </View>
          </View>
          {profile?.region && (
            <View style={gc.regionRow}>
              <Feather name="map-pin" size={12} color={COLORS.textDim} />
              <Text style={gc.regionText}>{profile.region}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[gc.card, gc.radarCard]}
          onPress={() => router.push("/govcon/radar" as Href)}
          activeOpacity={0.85}
        >
          <View style={gc.cardHeader}>
            <View style={[gc.iconWrap, { backgroundColor: COLORS.blue + "20" }]}>
              <Feather name="target" size={16} color={COLORS.blue} />
            </View>
            <Text style={gc.cardTitle}>Radar</Text>
            {highFitCount > 0 && (
              <View style={[gc.activeBadge, { backgroundColor: COLORS.blue + "20", borderColor: COLORS.blue + "44" }]}>
                <Text style={[gc.activeBadgeText, { color: COLORS.blue }]}>{highFitCount} high fit</Text>
              </View>
            )}
          </View>
          <View style={gc.statsRow}>
            <View style={gc.gcStat}>
              <Text style={gc.gcStatValue}>{matchCount}</Text>
              <Text style={gc.gcStatLabel}>Matches</Text>
            </View>
            <View style={gc.statDivider} />
            <View style={gc.gcStat}>
              <Text style={gc.gcStatValue}>{highFitCount}</Text>
              <Text style={gc.gcStatLabel}>High fit</Text>
            </View>
            <View style={gc.statDivider} />
            <View style={gc.gcStat}>
              <Text style={[gc.gcStatValue, { color: COLORS.blue, fontSize: 13 }]}>View All</Text>
              <Text style={gc.gcStatLabel}>Opportunities</Text>
            </View>
          </View>
        </TouchableOpacity>

        {feedItems.length > 0 && (
          <View style={gc.feedSection}>
            {feedItems.slice(0, 3).map((item: ActionFeedItem) => (
              <TouchableOpacity
                key={item.type}
                style={gc.feedItem}
                onPress={() => router.push(item.route as Href)}
                activeOpacity={0.8}
              >
                <View style={[gc.feedIcon, { backgroundColor: COLORS.emerald + "20" }]}>
                  <Feather name={item.icon as React.ComponentProps<typeof Feather>["name"]} size={14} color={COLORS.emerald} />
                </View>
                <View style={gc.feedText}>
                  <Text style={gc.feedTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={gc.feedDesc} numberOfLines={1}>{item.description}</Text>
                </View>
                <Feather name="chevron-right" size={16} color={COLORS.textDim} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    );
  }

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

// ── Office Mode panel (full dashboard parity) ─────────────────────────────────

function OfficeModePanel({
  dash, activities, totalOrgs, isAdmin, refetch, isRefetching,
}: {
  dash: DashboardData | null | undefined;
  activities: Activity[];
  totalOrgs: number;
  isAdmin: boolean;
  refetch: () => void;
  isRefetching: boolean;
}) {
  const router = useRouter();

  return (
    <ScrollView
      contentContainerStyle={styles.officeContent}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
      showsVerticalScrollIndicator={false}
    >
      {isAdmin && (
        <View style={styles.gagcSection}>
          <SectionHeader title="GovCon Intelligence" />
          <GagcSection />
        </View>
      )}

      <View style={styles.statsGrid}>
        <StatCard label="Contacts this week" value={dash?.contactsThisWeek ?? 0} icon="user-plus" color={COLORS.emerald} />
        <StatCard label="Organizations" value={totalOrgs} icon="briefcase" color={COLORS.cyan} />
      </View>
      <View style={styles.statsGrid}>
        <StatCard label="Open opps" value={dash?.openOpportunities ?? 0} icon="trending-up" color={COLORS.purple} />
        <StatCard label="Total contacts" value={dash?.totalContacts ?? 0} icon="users" color={COLORS.blue} />
      </View>
      <View style={styles.statsGrid}>
        <StatCard label="Cards pending" value={dash?.cardsPendingReview ?? 0} icon="credit-card" color={COLORS.amber} />
        <StatCard label="Tasks overdue" value={dash?.tasksOverdue ?? 0} icon="alert-circle" color={COLORS.red} />
      </View>

      <View style={styles.quickActions}>
        <SectionHeader title="Quick Actions" />
        <View style={styles.actionsRow}>
          {[
            { label: "Scan Card", icon: "camera" as const, route: "/capture/scan-card", color: COLORS.emerald },
            { label: "Scan Logo", icon: "image" as const, route: "/org-scan/new", color: COLORS.cyan },
            { label: "New Contact", icon: "user-plus" as const, route: "/capture/new", color: COLORS.blue },
            { label: "New Org", icon: "briefcase" as const, route: "/organization/new", color: COLORS.purple },
            { label: "Pipeline", icon: "trending-up" as const, route: "/(tabs)/opportunities", color: COLORS.amber },
            { label: "Commissions", icon: "dollar-sign" as const, route: "/commissions", color: COLORS.emerald },
          ].map(({ label, icon, route, color }) => (
            <TouchableOpacity
              key={label}
              style={[styles.actionBtn, { borderColor: color + "44" }]}
              onPress={() => router.push(route as Href)}
              activeOpacity={0.75}
            >
              <View style={[styles.actionIcon, { backgroundColor: color + "20" }]}>
                <Feather name={icon} size={18} color={color} />
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
          activities.slice(0, 8).map((activity: Activity) => (
            <Card key={activity.id} style={styles.activityCard} padding={12}>
              <View style={styles.activityRow}>
                <View style={styles.activityIcon}>
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

export default function SignalsScreen() {
  const insets = useSafeAreaInsets();
  const { mode } = useMode();
  const { data: rawDash, isLoading, refetch, isRefetching } = useDashboard();
  const { data: rawActivitiesData, refetch: refetchAct } = useActivities({ limit: "8" });
  const { data: rawOrgsData } = useOrganizations({ limit: "1" });
  const { data: actionFeedData } = useGovconActionFeed();
  const { role } = useAuth();

  const dash = rawDash as DashboardData | undefined;
  const activitiesData = rawActivitiesData as { activities?: Activity[] } | undefined;
  const orgsData = rawOrgsData as OrgsListResponse | undefined;

  const isAdmin = role === "OWNER" || role === "ADMIN";
  const activities: Activity[] = activitiesData?.activities ?? dash?.recentActivities ?? [];
  const feedItems: ActionFeedItem[] = actionFeedData?.items ?? [];
  const totalOrgs: number = orgsData?.total ?? 0;

  const handleRefetch = () => { refetch(); refetchAct(); };

  const headerBg = mode === "work" ? COLORS.navyMid : COLORS.navySurface;
  const headerBorderColor = mode === "office" ? COLORS.cyan + "33" : "transparent";

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.headerContainer, { backgroundColor: headerBg, borderBottomColor: headerBorderColor }]}>
        <ModeHeader title="Signals" icon="radio" />
      </View>

      {mode === "work" ? (
        <ScrollView
          contentContainerStyle={styles.signalsContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={handleRefetch} tintColor={COLORS.emerald} />}
        >
          <NextBestAction feedItems={feedItems} />
          <RadarCanvas />
          <SignalsFeed activities={activities} />
        </ScrollView>
      ) : (
        isLoading ? (
          <LoadingSpinner label="Loading..." />
        ) : (
          <OfficeModePanel
            dash={dash}
            activities={activities}
            totalOrgs={totalOrgs}
            isAdmin={isAdmin}
            refetch={handleRefetch}
            isRefetching={isRefetching}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  headerContainer: { borderBottomWidth: 1 },
  signalsContent: { paddingHorizontal: 16, paddingBottom: 120 },

  nextActionCard: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navyCard,
    borderRadius: 14, borderWidth: 1,
    borderColor: COLORS.emerald + "55",
    padding: 14, marginBottom: 16, gap: 10,
  },
  nextActionDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: COLORS.emerald, flexShrink: 0,
  },
  nextActionContent: { flex: 1 },
  nextActionLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.emerald, marginBottom: 3 },
  nextActionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  nextActionDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  radarContainer: { alignItems: "center", marginBottom: 16 },
  radarCanvas: {
    width: RADAR_SIZE, height: RADAR_SIZE,
    backgroundColor: COLORS.navyDark,
    borderRadius: RADAR_SIZE / 2,
    borderWidth: 1, borderColor: COLORS.emerald + "40",
    overflow: "hidden",
    position: "relative",
  },
  radarRing: {
    position: "absolute",
    borderWidth: 1, borderColor: COLORS.emerald + "60",
  },
  radarCross: { position: "absolute", backgroundColor: COLORS.emerald + "25" },
  sweepWrap: {
    position: "absolute",
    top: 0, left: 0,
    width: RADAR_SIZE, height: RADAR_SIZE,
  },
  sweepLine: {
    position: "absolute",
    top: RADAR_CENTER - 1,
    left: RADAR_CENTER,
    width: RADAR_CENTER,
    height: 2,
    backgroundColor: COLORS.emerald,
  },
  sweepTrail: {
    position: "absolute",
    top: RADAR_CENTER - RADAR_CENTER,
    left: 0,
    width: RADAR_CENTER,
    height: RADAR_SIZE,
    backgroundColor: COLORS.emerald + "10",
  },
  radarCenter: {
    position: "absolute",
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.emerald,
    top: RADAR_CENTER - 4, left: RADAR_CENTER - 4,
  },
  signalDot: {
    position: "absolute",
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.emerald,
  },

  feedSection: { gap: 8 },
  feedTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: COLORS.text, marginBottom: 4 },
  feedEmpty: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, paddingVertical: 4 },
  feedItem: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: COLORS.navyCard, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 10, gap: 10, overflow: "hidden",
  },
  feedGlowBorder: {
    position: "absolute", left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: COLORS.emerald,
  },
  feedIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.emerald + "20",
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  feedText: { flex: 1 },
  feedSubject: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  feedMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },

  officeContent: { padding: 16, paddingBottom: 120 },
  gagcSection: { marginBottom: 16 },
  statsGrid: { flexDirection: "row", gap: 10, marginBottom: 10 },
  quickActions: { marginTop: 12, marginBottom: 10 },
  actionsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionBtn: {
    flex: 1, minWidth: 60,
    backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 10,
    alignItems: "center", borderWidth: 1,
  },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 5 },
  actionLabel: { fontFamily: "Inter_500Medium", fontSize: 10, color: COLORS.textMuted, textAlign: "center" },
  activitySection: { marginTop: 8 },
  activityCard: { marginBottom: 6 },
  activityRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  activityIcon: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: COLORS.navySurface,
    alignItems: "center", justifyContent: "center",
  },
  activityText: { flex: 1 },
  activitySubject: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  activityMeta: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", paddingVertical: 8, lineHeight: 20 },
});

// ── GovCon card styles ────────────────────────────────────────────────────────

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
    padding: 16, marginBottom: 10,
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
  gcStat: { flex: 1, alignItems: "center" },
  gcStatValue: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  gcStatLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  statDivider: { width: 1, height: 30, backgroundColor: COLORS.navyBorder, marginHorizontal: 8 },

  regionRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  regionText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim },

  radarCard: { borderColor: COLORS.blue + "44" },

  feedSection: { gap: 6, marginTop: 0 },
  feedItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.navyCard, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 12, marginBottom: 6,
  },
  feedIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  feedText: { flex: 1 },
  feedTitle: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.text },
  feedDesc: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
});
