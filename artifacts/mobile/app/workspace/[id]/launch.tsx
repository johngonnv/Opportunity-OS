import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing, ViewStyle,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import type { Href } from "expo-router";

interface Day1Summary {
  pipelines: number;
  savedViews: number;
  tasks: number;
  opportunities: number;
  intelligenceInitialized: boolean;
}

interface Day1InitResponse {
  initialized: boolean;
  alreadyDone: boolean;
  summary: Day1Summary;
}

interface LaunchChecklistItem {
  id: string;
  itemKey: string;
  label: string;
  status: "PENDING" | "COMPLETED" | "SKIPPED";
  completedAt?: string | null;
}

interface Day1DashboardData {
  vertical?: string;
  engagement?: {
    tasksCompleted: number;
    totalTasks: number;
    contactsAdded: number;
    activitiesLogged: number;
    opportunitiesCreated: number;
  };
  primaryAction?: {
    title: string;
    why: string;
    expectedImpact: string;
    actionLabel: string;
    route: string;
  };
  intelligence?: {
    competitors: string[];
    painPoints: string[];
    positioning: string;
  };
  warnings?: Array<{ label: string; nextStep: string; route: string; severity: string }>;
  day1Tasks?: Array<any>;
  savedViews?: Array<any>;
}

function SummaryTile({
  icon,
  label,
  value,
  color,
  delay,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: number | string;
  color: string;
  delay: number;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[styles.summaryTile, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.summaryTileIcon, { backgroundColor: color + "22", borderColor: color + "44" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.summaryTileValue, { color }]}>{value}</Text>
      <Text style={styles.summaryTileLabel}>{label}</Text>
    </Animated.View>
  );
}

function CheckRow({ 
  label, 
  done, 
  onPress 
}: { 
  label: string; 
  done: boolean; 
  onPress?: () => void;
}) {
  const content = (
    <View style={styles.checkRow}>
      <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
        <Feather name={done ? "check" : "circle"} size={12} color={done ? COLORS.white : COLORS.navyBorder} />
      </View>
      <Text style={[styles.checkLabel, done && styles.checkLabelDone]} numberOfLines={2}>{label}</Text>
      {onPress && <Feather name="edit-2" size={12} color={COLORS.textDim} />}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }
  return content;
}

function QuickStartCard({ 
  icon, 
  label, 
  desc, 
  onPress, 
  accent 
}: { 
  icon: React.ComponentProps<typeof Feather>["name"]; 
  label: string; 
  desc: string; 
  onPress: () => void;
  accent?: string;
}) {
  return (
    <TouchableOpacity 
      style={[styles.quickCard, accent && { borderColor: accent + "44" }]} 
      onPress={onPress} 
      activeOpacity={0.85}
    >
      <View style={[styles.quickIconWrap, accent && { backgroundColor: accent + "22" }]}>
        <Feather name={icon} size={18} color={accent || COLORS.emerald} />
      </View>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickDesc} numberOfLines={2}>{desc}</Text>
      <View style={styles.quickCta}>
        <Text style={styles.quickCtaText}>Go</Text>
        <Feather name="arrow-right" size={12} color={COLORS.textDim} />
      </View>
    </TouchableOpacity>
  );
}

export default function WorkspaceLaunchScreen() {
  const { id: workspaceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [initDone, setInitDone] = useState(false);
  const [day1InitSummary, setDay1InitSummary] = useState<Day1Summary | null>(null);

  const initMutation = useMutation<Day1InitResponse, Error>({
    mutationFn: () =>
      adminFetch(`/admin/workspaces/${workspaceId}/day1-init`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      setInitDone(true);
      if (data.summary) setDay1InitSummary(data.summary);
    },
  });

  // Auto-trigger Day 1 init on mount for seamless post-provisioning experience
  useEffect(() => {
    if (workspaceId && !initDone && !initMutation.isPending) {
      initMutation.mutate();
    }
  }, [workspaceId, initDone]);

  const { data: checklistData, isLoading: checklistLoading } = useQuery<{ items: LaunchChecklistItem[]; workspace?: { id: string; name: string; industryFocus?: string | null } }>({
    queryKey: ["workspaceLaunchChecklist", workspaceId],
    queryFn: () => adminFetch(`/admin/workspaces/${workspaceId}/checklist`),
    enabled: !!workspaceId,
    staleTime: 1000 * 60,
  });
  const checklistItems: LaunchChecklistItem[] = checklistData?.items || [];
  const workspaceMeta = checklistData?.workspace;

  const { data: day1Data, isLoading: day1Loading } = useQuery<Day1DashboardData>({
    queryKey: ["launchDay1Summary", workspaceId],
    queryFn: () => adminFetch(`/admin/workspaces/${workspaceId}/day1-summary`),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  // Checklist progress
  const completedCount = checklistItems.filter(i => i.status === "COMPLETED" || i.status === "SKIPPED").length;
  const totalChecklist = checklistItems.length || 6;
  const progressPct = totalChecklist > 0 ? Math.round((completedCount / totalChecklist) * 100) : 0;

  // Vertical awareness from day1 data (enriched in backend) or workspace industryFocus
  const rawVertical = day1Data?.vertical || workspaceMeta?.industryFocus || "general";
  const verticalKey = String(rawVertical).toLowerCase();
  const isIndustrialServices = verticalKey.includes("industrial") || verticalKey.includes("water") || verticalKey === "industrial_services";
  const verticalLabel = isIndustrialServices 
    ? "Industrial Services" 
    : rawVertical.charAt(0).toUpperCase() + String(rawVertical).slice(1).replace(/_/g, " ");

  const s = day1InitSummary || (day1Data ? { 
    pipelines: 0, 
    savedViews: (day1Data.savedViews || []).length, 
    tasks: day1Data.engagement?.totalTasks || 0, 
    opportunities: day1Data.engagement?.opportunitiesCreated || 0, 
    intelligenceInitialized: true 
  } : null);

  const isLoading = (checklistLoading || day1Loading || initMutation.isPending) && !s && checklistItems.length === 0;

  // Interactive checklist toggle (self-service polish)
  const patchMutation = useMutation({
    mutationFn: ({ key, status }: { key: string; status: "PENDING" | "COMPLETED" | "SKIPPED" }) =>
      adminFetch(`/admin/workspaces/${workspaceId}/checklist/${key}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["workspaceLaunchChecklist", workspaceId] });
    },
  });

  const toggleChecklistItem = (item: LaunchChecklistItem) => {
    const newStatus = item.status === "COMPLETED" ? "PENDING" : "COMPLETED";
    patchMutation.mutate({ key: item.itemKey, status: newStatus });
  };

  // Vertical-aware quick start actions for polished Day 1 experience
  const quickStarts = isIndustrialServices ? [
    { 
      icon: "git-merge" as const, 
      label: "Review Water Treatment Pipelines", 
      desc: "Recurring optimization + pilot templates pre-loaded for industrial clients", 
      route: "/workspace/pipelines" as Href 
    },
    { 
      icon: "list" as const, 
      label: "Add First Target Industrial Account", 
      desc: "Manufacturing, F&B, Pharma, Power Gen or Data Center sites", 
      route: "/organizations" as Href 
    },
    { 
      icon: "eye" as const, 
      label: "Set Up Monitoring Views", 
      desc: "IoT, cooling towers, boilers, wastewater optimization dashboards", 
      route: `/dashboard/priority?workspaceId=${workspaceId}` as Href 
    },
    { 
      icon: "tool" as const, 
      label: "Explore Industrial Services Intelligence", 
      desc: "Competitor maps, pain points, EHS positioning for water treatment vertical", 
      route: "/organizations?vertical=industrial_services" as Href 
    },
    { 
      icon: "user-plus" as const, 
      label: "Add EHS / Plant Contact", 
      desc: "Decision makers at your top target facilities", 
      route: "/contact/new" as Href 
    },
    { 
      icon: "trending-up" as const, 
      label: "Seed First Recurring Opportunity", 
      desc: "Water treatment program with renewal tracking", 
      route: "/opportunity/new" as Href 
    },
  ] : [
    { 
      icon: "git-merge" as const, 
      label: "Review Pipeline Templates", 
      desc: "Vertical-specific stages and workflows ready", 
      route: "/workspace/pipelines" as Href 
    },
    { 
      icon: "user-plus" as const, 
      label: "Add Your First Contact", 
      desc: "Key decision maker from a target account", 
      route: "/contact/new" as Href 
    },
    { 
      icon: "target" as const, 
      label: "Confirm Top Target Accounts", 
      desc: "Qualify the AI-suggested list for your territory", 
      route: "/organizations" as Href 
    },
    { 
      icon: "check-square" as const, 
      label: "Complete Day 1 Tasks", 
      desc: "High-priority actions seeded for fast start", 
      route: `/dashboard/priority?workspaceId=${workspaceId}` as Href 
    },
    { 
      icon: "trending-up" as const, 
      label: "Log First Opportunity", 
      desc: "Activate pipeline reporting and forecasting", 
      route: "/opportunity/new" as Href 
    },
    { 
      icon: "eye" as const, 
      label: "Explore Saved Views", 
      desc: "Pre-built filters for your vertical", 
      route: `/dashboard/priority?workspaceId=${workspaceId}` as Href 
    },
  ];

  const headerAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  const primaryAction = day1Data?.primaryAction;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Back breadcrumb - professional handoff from provisioning */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="chevron-left" size={16} color={COLORS.textDim} />
          <Text style={styles.backText}>Back to Provisioning</Text>
        </TouchableOpacity>

        {/* Polished Hero - "Welcome to your workspace" */}
        <Animated.View
          style={[
            styles.heroCard,
            { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
          ]}
        >
          <View style={styles.heroIconWrap}>
            <Feather name="zap" size={32} color={isIndustrialServices ? "#14B8A6" : COLORS.emerald} />
          </View>
          
          <View style={styles.verticalBadge}>
            <Text style={[styles.verticalBadgeText, { color: isIndustrialServices ? "#14B8A6" : COLORS.emerald }]}>
              {verticalLabel.toUpperCase()}
            </Text>
          </View>

          <Text style={styles.heroTitle}>Welcome to Your New Workspace</Text>
          <Text style={styles.heroSub}>
            {isIndustrialServices 
              ? "Your industrial services workspace is fully activated. Water treatment pipelines (recurring + project), monitoring views, EHS contact roles, target industry profiles, and Industrial Services Intelligence have been pre-loaded from your onboarding review."
              : "Everything is pre-loaded and ready to generate revenue. Your workspace is no longer empty. Vertical-specific pipelines, buyer role maps, and territory intelligence are ready for Day 1."}
          </Text>

          {/* Progress indicator - engaging visual for completion */}
          <View style={styles.progressWrap}>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: `${progressPct}%` }]} />
            </View>
            <Text style={styles.progressText}>
              {progressPct}% complete • {completedCount} of {totalChecklist} launch items ready
            </Text>
          </View>
        </Animated.View>

        {/* Activation summary grid */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.emerald} />
            <Text style={styles.loadingText}>Initializing your personalized Day 1 experience…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>ACTIVATION SUMMARY</Text>
            <View style={styles.summaryGrid}>
              <SummaryTile icon="git-merge" label="Pipelines" value={s?.pipelines ?? 0} color={COLORS.blue} delay={200} />
              <SummaryTile icon="eye" label="Saved Views" value={s?.savedViews ?? 0} color={COLORS.cyan} delay={350} />
              <SummaryTile icon="check-square" label="Tasks Added" value={s?.tasks ?? 0} color={COLORS.emerald} delay={500} />
              <SummaryTile icon="trending-up" label="Opportunities" value={s?.opportunities ?? 0} color={COLORS.amber} delay={650} />
            </View>

            {/* Improved Onboarding Checklist - interactive, polished presentation */}
            <Text style={styles.sectionLabel}>YOUR LAUNCH CHECKLIST</Text>
            <View style={styles.checklistCard}>
              {checklistItems.length > 0 ? (
                checklistItems.map((item, i) => (
                  <CheckRow 
                    key={item.id || i} 
                    label={item.label} 
                    done={item.status === "COMPLETED" || item.status === "SKIPPED"} 
                    onPress={() => toggleChecklistItem(item)}
                  />
                ))
              ) : (
                // Fallback for older workspaces
                ["Pipeline templates published", "Target facility views created", "Day 1 high-priority tasks added", "Opportunity seed created", "Saved views configured", "Intelligence layer initialized"].map((item, i) => (
                  <CheckRow key={i} label={item} done={!isLoading} />
                ))
              )}
              <Text style={styles.checklistHint}>Tap any item to mark complete — this is your self-service Day 1 control center.</Text>
            </View>

            {/* Primary Recommended Action (from day1-summary, personalized) */}
            {primaryAction && (
              <>
                <Text style={styles.sectionLabel}>RECOMMENDED FIRST MOVE</Text>
                <View style={styles.actionCard}>
                  <View style={styles.actionBadge}>
                    <Feather name="target" size={12} color={COLORS.amber} />
                    <Text style={styles.actionBadgeText}>TOP REVENUE ACTION</Text>
                  </View>
                  <Text style={styles.actionTitle}>{primaryAction.title}</Text>
                  <Text style={styles.actionWhy}>{primaryAction.why}</Text>
                  <TouchableOpacity 
                    style={styles.actionBtn} 
                    onPress={() => router.push(primaryAction.route as Href)}
                    activeOpacity={0.85}
                  >
                    <Feather name="arrow-right" size={16} color={COLORS.navyDark} />
                    <Text style={styles.actionBtnText}>{primaryAction.actionLabel}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* Vertical-aware Quick Start Actions - core of polished welcome */}
            <Text style={styles.sectionLabel}>QUICK START ACTIONS — TAILORED FOR {verticalLabel.toUpperCase()}</Text>
            <View style={styles.quickGrid}>
              {quickStarts.map((qs, idx) => (
                <QuickStartCard
                  key={idx}
                  icon={qs.icon}
                  label={qs.label}
                  desc={qs.desc}
                  onPress={() => router.push(qs.route)}
                  accent={isIndustrialServices ? "#14B8A6" : undefined}
                />
              ))}
            </View>

            {/* Intelligence Layer Callout - enhanced with vertical context */}
            <View style={[styles.intelCard, isIndustrialServices && styles.industrialIntelCard]}>
              <Feather name="cpu" size={18} color={isIndustrialServices ? "#14B8A6" : COLORS.purple} />
              <View style={styles.intelCardBody}>
                <Text style={styles.intelCardTitle}>Intelligence Layer Active</Text>
                <Text style={styles.intelCardDesc}>
                  {isIndustrialServices 
                    ? "Competitor maps, pain point profiles for EHS/plant ops, target industry lists (Manufacturing, F&B, Pharma, Power, Data Centers), and positioning guides pre-loaded from your onboarding. Use the Industrial Services Intelligence section on account pages."
                    : "Competitor maps, pain point profiles, and positioning guides are pre-loaded from your onboarding review."}
                </Text>
              </View>
            </View>

            {/* Rule / promise callout */}
            <View style={styles.ruleCard}>
              <Feather name="shield" size={16} color={COLORS.amber} />
              <Text style={styles.ruleText}>
                Your workspace is configured to never show an empty state. Actions will be suggested automatically at every step. No blank screens — ever.
              </Text>
            </View>

            {/* Primary CTAs - clear, engaging, professional handoff to self-service */}
            <TouchableOpacity
              style={[styles.launchBtn, isIndustrialServices && { backgroundColor: "#14B8A6" }]}
              onPress={() =>
                router.push(`/dashboard/priority?workspaceId=${workspaceId}` as Href)
              }
              activeOpacity={0.85}
            >
              <Feather name="arrow-right-circle" size={20} color={COLORS.navyDark} />
              <Text style={styles.launchBtnText}>Open Priority Dashboard — Start Revenue Activation</Text>
            </TouchableOpacity>

            <View style={styles.secondaryCtas}>
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => router.push(`/admin/workspaces/${workspaceId}` as Href)}
              >
                <Feather name="external-link" size={14} color={COLORS.textDim} />
                <Text style={styles.secondaryBtnText}>View Workspace Admin</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => router.push("/(tabs)/dashboard" as Href)}
              >
                <Feather name="home" size={14} color={COLORS.textDim} />
                <Text style={styles.secondaryBtnText}>Go to Main Dashboard</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.footerNote}>
              Transition complete. Your admin has handed off a fully provisioned, vertical-aware workspace. Welcome aboard.
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  scroll: {
    padding: 20,
    paddingBottom: 48,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
  },
  backText: {
    color: COLORS.textDim,
    fontSize: 13,
  },
  heroCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.emerald + "33",
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.emeraldMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  verticalBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.navy,
    borderWidth: 1,
    borderColor: COLORS.emerald + "44",
    marginBottom: 12,
  },
  verticalBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  heroSub: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  progressWrap: {
    width: "100%",
    marginTop: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: COLORS.navyBorder,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: COLORS.emerald,
    borderRadius: 3,
  },
  progressText: {
    color: COLORS.textDim,
    fontSize: 11,
    textAlign: "center",
    marginTop: 6,
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: COLORS.textDim,
    fontSize: 14,
  },
  sectionLabel: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    marginBottom: 10,
    marginTop: 8,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 20,
  },
  summaryTile: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    alignItems: "center",
    gap: 4,
  },
  summaryTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  summaryTileValue: {
    fontSize: 24,
    fontWeight: "800",
  },
  summaryTileLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: "500",
  },
  checklistCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    gap: 8,
    marginBottom: 16,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleDone: {
    backgroundColor: COLORS.emerald,
    borderColor: COLORS.emerald,
  },
  checkLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    flex: 1,
  },
  checkLabelDone: {
    color: COLORS.text,
  },
  checklistHint: {
    color: COLORS.textDim,
    fontSize: 11,
    fontStyle: "italic",
    marginTop: 6,
    textAlign: "center",
  },
  actionCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.amber + "33",
    padding: 16,
    marginBottom: 16,
  },
  actionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  actionBadgeText: {
    color: COLORS.amber,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
  },
  actionTitle: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  actionWhy: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.emerald,
    borderRadius: 10,
    paddingVertical: 12,
  },
  actionBtnText: {
    color: COLORS.navyDark,
    fontWeight: "700",
    fontSize: 14,
  },
  // Quick starts grid - engaging mobile UX
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  quickCard: {
    flex: 1,
    minWidth: "47%",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    gap: 6,
  },
  quickIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: COLORS.emerald + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  quickLabel: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: "600",
  },
  quickDesc: {
    color: COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  quickCta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  quickCtaText: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "600",
  },
  intelCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#8B5CF611",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.purple + "33",
    padding: 14,
    marginBottom: 12,
  },
  industrialIntelCard: {
    backgroundColor: "#14B8A611",
    borderColor: "#14B8A644",
  },
  intelCardBody: {
    flex: 1,
    gap: 4,
  },
  intelCardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  intelCardDesc: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  ruleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: COLORS.amber + "11",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.amber + "33",
    padding: 14,
    marginBottom: 20,
  },
  ruleText: {
    color: COLORS.textMuted,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  launchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.emerald,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
  },
  launchBtnText: {
    color: COLORS.navyDark,
    fontWeight: "700",
    fontSize: 15,
  },
  secondaryCtas: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: COLORS.textDim,
    fontSize: 13,
    fontWeight: "500",
  },
  footerNote: {
    color: COLORS.textDim,
    fontSize: 11,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 8,
  },
});
