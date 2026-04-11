import React, { useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Href } from "expo-router";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WarningAction {
  label: string;
  nextStep: string;
  route: string;
  severity: "high" | "medium" | "low";
}

interface Day1Task {
  id: string;
  title: string;
  description: string | null;
  priority: "LOW" | "MEDIUM" | "HIGH";
  status: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELED";
  dueDate: string | null;
}

interface SavedView {
  key: string;
  label: string;
  filters: Record<string, unknown>;
}

interface Day1DashboardData {
  engagement: {
    tasksCompleted: number;
    totalTasks: number;
    contactsAdded: number;
    activitiesLogged: number;
    opportunitiesCreated: number;
  };
  primaryAction: {
    title: string;
    why: string;
    expectedImpact: string;
    actionLabel: string;
    route: string;
  };
  intelligence: {
    competitors: string[];
    painPoints: string[];
    positioning: string;
  };
  warnings: WarningAction[];
  day1Tasks: Day1Task[];
  savedViews: SavedView[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: COLORS.red,
  MEDIUM: COLORS.amber,
  LOW: COLORS.textDim,
};

function EngagementBar({
  label,
  value,
  total,
  color,
  icon,
}: {
  label: string;
  value: number;
  total?: number;
  color: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}) {
  const pct = total && total > 0 ? Math.min(1, value / total) : value > 0 ? 1 : 0;
  return (
    <View style={styles.engagementItem}>
      <View style={styles.engagementLeft}>
        <Feather name={icon} size={14} color={color} />
        <Text style={styles.engagementLabel}>{label}</Text>
      </View>
      <View style={styles.engagementRight}>
        <Text style={[styles.engagementValue, { color }]}>{value}{total !== undefined ? `/${total}` : ""}</Text>
        {total !== undefined && (
          <View style={styles.engagementBarBg}>
            <View style={[styles.engagementBarFill, { width: `${Math.round(pct * 100)}%`, backgroundColor: color }]} />
          </View>
        )}
      </View>
    </View>
  );
}

function PrimaryActionCard({ action, onPress }: { action: Day1DashboardData["primaryAction"]; onPress: () => void }) {
  return (
    <View style={styles.actionCard}>
      <View style={styles.actionCardHeader}>
        <View style={styles.actionCardBadge}>
          <Feather name="target" size={12} color={COLORS.amber} />
          <Text style={styles.actionCardBadgeText}>TOP REVENUE ACTION</Text>
        </View>
      </View>
      <Text style={styles.actionCardTitle}>{action.title}</Text>
      <View style={styles.actionCardSection}>
        <Text style={styles.actionCardSectionLabel}>WHY THIS MATTERS</Text>
        <Text style={styles.actionCardSectionText}>{action.why}</Text>
      </View>
      <View style={styles.actionCardSection}>
        <Text style={styles.actionCardSectionLabel}>EXPECTED IMPACT</Text>
        <Text style={[styles.actionCardSectionText, { color: COLORS.emerald }]}>{action.expectedImpact}</Text>
      </View>
      <TouchableOpacity style={styles.actionCardBtn} onPress={onPress} activeOpacity={0.85}>
        <Feather name="arrow-right" size={16} color={COLORS.navyDark} />
        <Text style={styles.actionCardBtnText}>{action.actionLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

function WarningCard({ warning, onPress }: { warning: WarningAction; onPress: () => void }) {
  const severityColor = warning.severity === "high" ? COLORS.red : warning.severity === "medium" ? COLORS.amber : COLORS.textDim;
  return (
    <TouchableOpacity style={[styles.warningCard, { borderColor: severityColor + "44" }]} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.warningDot, { backgroundColor: severityColor }]} />
      <View style={styles.warningBody}>
        <Text style={[styles.warningLabel, { color: severityColor }]}>{warning.label}</Text>
        <Text style={styles.warningStep}>{warning.nextStep}</Text>
      </View>
      <Feather name="chevron-right" size={16} color={COLORS.textDim} />
    </TouchableOpacity>
  );
}

function TaskRow({ task }: { task: Day1Task }) {
  const isDone = task.status === "COMPLETED";
  const isOverdue = !isDone && task.dueDate && new Date(task.dueDate) < new Date();
  const dueLabel = task.dueDate
    ? new Date(task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;
  return (
    <View style={[styles.taskRow, isDone && styles.taskRowDone]}>
      <View style={[styles.taskCheck, isDone && styles.taskCheckDone]}>
        {isDone && <Feather name="check" size={10} color={COLORS.white} />}
      </View>
      <View style={styles.taskBody}>
        <Text style={[styles.taskTitle, isDone && styles.taskTitleDone]} numberOfLines={1}>{task.title}</Text>
        <View style={styles.taskMeta}>
          <View style={[styles.priorityDot, { backgroundColor: PRIORITY_COLORS[task.priority] ?? COLORS.textDim }]} />
          <Text style={[styles.taskMetaText, { color: PRIORITY_COLORS[task.priority] ?? COLORS.textDim }]}>{task.priority}</Text>
          {dueLabel && (
            <Text style={[styles.taskMetaText, isOverdue ? { color: COLORS.red } : {}]}>
              · Due {dueLabel}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

function ViewChip({ view, onPress }: { view: SavedView; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.viewChip} onPress={onPress} activeOpacity={0.8}>
      <Feather name="eye" size={11} color={COLORS.cyan} />
      <Text style={styles.viewChipText}>{view.label}</Text>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function PriorityDashboardScreen() {
  const { workspaceId } = useLocalSearchParams<{ workspaceId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [intelTab, setIntelTab] = useState<"competitors" | "painPoints" | "positioning">("competitors");

  const { data, isLoading, refetch, isRefetching } = useQuery<Day1DashboardData>({
    queryKey: ["day1Dashboard", workspaceId],
    queryFn: () => adminFetch(`/admin/workspaces/${workspaceId}/day1-summary`),
    enabled: !!workspaceId,
    staleTime: 30_000,
  });

  if (isLoading) return <LoadingSpinner label="Loading priority dashboard…" />;
  if (!data) return null;

  const { engagement, primaryAction, intelligence, warnings, day1Tasks, savedViews } = data;

  const tasksDoneRatio = `${engagement.tasksCompleted}/${engagement.totalTasks}`;

  const highWarnings = warnings.filter(w => w.severity === "high");
  const otherWarnings = warnings.filter(w => w.severity !== "high");

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="chevron-left" size={22} color={COLORS.textDim} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Day 1 Mission Control</Text>
            <Text style={styles.headerSub}>Revenue activation dashboard</Text>
          </View>
          <View style={[styles.liveDot]} />
        </View>

        {/* ── Engagement Tracker ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="activity" size={15} color={COLORS.emerald} />
            <Text style={styles.cardTitle}>Day 1 Engagement</Text>
          </View>
          <EngagementBar label="Tasks completed" value={engagement.tasksCompleted} total={engagement.totalTasks} color={COLORS.emerald} icon="check-square" />
          <EngagementBar label="Contacts added" value={engagement.contactsAdded} color={COLORS.blue} icon="user-plus" />
          <EngagementBar label="Activities logged" value={engagement.activitiesLogged} color={COLORS.purple} icon="phone" />
          <EngagementBar label="Opportunities created" value={engagement.opportunitiesCreated} color={COLORS.amber} icon="trending-up" />
        </View>

        {/* ── Primary Action Card ────────────────────────────────────────────── */}
        <PrimaryActionCard
          action={primaryAction}
          onPress={() => router.push(primaryAction.route as Href)}
        />

        {/* ── Warning → Action Map ───────────────────────────────────────────── */}
        {warnings.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Feather name="alert-triangle" size={14} color={COLORS.red} />
              <Text style={styles.sectionTitle}>Warnings Requiring Action</Text>
              <View style={[styles.badge, { backgroundColor: COLORS.red + "22" }]}>
                <Text style={[styles.badgeText, { color: COLORS.red }]}>{warnings.length}</Text>
              </View>
            </View>
            <View style={styles.warningsWrap}>
              {highWarnings.map((w, i) => (
                <WarningCard key={i} warning={w} onPress={() => router.push(w.route as Href)} />
              ))}
              {otherWarnings.map((w, i) => (
                <WarningCard key={`other-${i}`} warning={w} onPress={() => router.push(w.route as Href)} />
              ))}
            </View>
          </>
        )}

        {/* ── Intelligence Panel ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Feather name="cpu" size={15} color={COLORS.purple} />
            <Text style={styles.cardTitle}>Intelligence Panel</Text>
          </View>
          <View style={styles.intelTabs}>
            {(["competitors", "painPoints", "positioning"] as const).map(tab => (
              <TouchableOpacity
                key={tab}
                style={[styles.intelTab, intelTab === tab && styles.intelTabActive]}
                onPress={() => setIntelTab(tab)}
              >
                <Text style={[styles.intelTabText, intelTab === tab && styles.intelTabTextActive]}>
                  {tab === "competitors" ? "Competitors" : tab === "painPoints" ? "Pain Points" : "Positioning"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {intelTab === "competitors" && (
            <View style={styles.intelBody}>
              {intelligence.competitors.length === 0 ? (
                <Text style={styles.intelEmpty}>No competitor data captured. Add during client setup or from organization profiles.</Text>
              ) : (
                intelligence.competitors.map((c, i) => (
                  <View key={i} style={styles.intelItem}>
                    <View style={styles.intelItemDot} />
                    <Text style={styles.intelItemText}>{c}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {intelTab === "painPoints" && (
            <View style={styles.intelBody}>
              {intelligence.painPoints.length === 0 ? (
                <Text style={styles.intelEmpty}>No pain points captured. These will surface from onboarding reviews and contact conversations.</Text>
              ) : (
                intelligence.painPoints.map((p, i) => (
                  <View key={i} style={styles.intelItem}>
                    <Feather name="alert-circle" size={12} color={COLORS.amber} />
                    <Text style={styles.intelItemText}>{p}</Text>
                  </View>
                ))
              )}
            </View>
          )}

          {intelTab === "positioning" && (
            <View style={styles.intelBody}>
              <Text style={styles.positioningText}>{intelligence.positioning}</Text>
            </View>
          )}
        </View>

        {/* ── Saved Views Quick Access ───────────────────────────────────────── */}
        {savedViews.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Feather name="bookmark" size={14} color={COLORS.cyan} />
              <Text style={styles.sectionTitle}>Saved Views</Text>
            </View>
            <View style={styles.viewsWrap}>
              {savedViews.map(view => (
                <ViewChip
                  key={view.key}
                  view={view}
                  onPress={() => router.push("/organizations" as Href)}
                />
              ))}
            </View>
          </>
        )}

        {/* ── Day 1 Tasks ────────────────────────────────────────────────────── */}
        <View style={styles.sectionRow}>
          <Feather name="check-square" size={14} color={COLORS.emerald} />
          <Text style={styles.sectionTitle}>Day 1 Tasks</Text>
          <View style={[styles.badge, { backgroundColor: COLORS.emerald + "22" }]}>
            <Text style={[styles.badgeText, { color: COLORS.emerald }]}>{tasksDoneRatio}</Text>
          </View>
        </View>
        <View style={styles.card}>
          {day1Tasks.length === 0 ? (
            <Text style={styles.intelEmpty}>No tasks yet. Tasks will be auto-created during Day 1 initialization.</Text>
          ) : (
            day1Tasks.map(task => <TaskRow key={task.id} task={task} />)
          )}
          <TouchableOpacity
            style={styles.viewAllBtn}
            onPress={() => router.push("/tasks" as Href)}
          >
            <Text style={styles.viewAllBtnText}>View all tasks</Text>
            <Feather name="chevron-right" size={14} color={COLORS.emerald} />
          </TouchableOpacity>
        </View>

        {/* ── Go To App ──────────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.goToAppBtn}
          onPress={() => router.push("/" as Href)}
          activeOpacity={0.85}
        >
          <Feather name="home" size={16} color={COLORS.navyDark} />
          <Text style={styles.goToAppBtnText}>Go to Main App</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  scroll: { padding: 20, paddingBottom: 48 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 24,
  },
  headerCenter: { flex: 1 },
  headerTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700" },
  headerSub: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.emerald,
  },
  card: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: "600" },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  sectionTitle: { color: COLORS.text, fontSize: 14, fontWeight: "600", flex: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },
  // Engagement
  engagementItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  engagementLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  engagementLabel: { color: COLORS.textMuted, fontSize: 13 },
  engagementRight: { alignItems: "flex-end", gap: 4, minWidth: 80 },
  engagementValue: { fontSize: 13, fontWeight: "700" },
  engagementBarBg: { height: 3, width: 80, backgroundColor: COLORS.navyBorder, borderRadius: 2, overflow: "hidden" },
  engagementBarFill: { height: 3, borderRadius: 2 },
  // Primary Action Card
  actionCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.amber + "55",
    padding: 20,
    marginBottom: 16,
    gap: 14,
  },
  actionCardHeader: { flexDirection: "row", alignItems: "center" },
  actionCardBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.amber + "22",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  actionCardBadgeText: { color: COLORS.amber, fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  actionCardTitle: { color: COLORS.text, fontSize: 18, fontWeight: "700", lineHeight: 24 },
  actionCardSection: { gap: 4 },
  actionCardSectionLabel: { color: COLORS.textDim, fontSize: 10, fontWeight: "600", letterSpacing: 1 },
  actionCardSectionText: { color: COLORS.textMuted, fontSize: 14, lineHeight: 20 },
  actionCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    paddingVertical: 12,
  },
  actionCardBtnText: { color: COLORS.navyDark, fontWeight: "700", fontSize: 14 },
  // Warnings
  warningsWrap: { gap: 8, marginBottom: 16 },
  warningCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  warningDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  warningBody: { flex: 1, gap: 3 },
  warningLabel: { fontSize: 13, fontWeight: "600" },
  warningStep: { color: COLORS.textMuted, fontSize: 12, lineHeight: 17 },
  // Intelligence
  intelTabs: { flexDirection: "row", gap: 6, marginBottom: 14 },
  intelTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.navyBorder + "88",
  },
  intelTabActive: { backgroundColor: COLORS.purple + "33", borderWidth: 1, borderColor: COLORS.purple + "55" },
  intelTabText: { color: COLORS.textDim, fontSize: 12, fontWeight: "500" },
  intelTabTextActive: { color: COLORS.purple, fontWeight: "600" },
  intelBody: { gap: 8 },
  intelItem: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  intelItemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.textDim, marginTop: 5 },
  intelItemText: { color: COLORS.textMuted, fontSize: 13, flex: 1, lineHeight: 18 },
  intelEmpty: { color: COLORS.textDim, fontSize: 13, fontStyle: "italic", lineHeight: 18 },
  positioningText: { color: COLORS.textMuted, fontSize: 13, lineHeight: 20 },
  // Saved views
  viewsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  viewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.cyan + "18",
    borderWidth: 1,
    borderColor: COLORS.cyan + "44",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  viewChipText: { color: COLORS.cyan, fontSize: 12, fontWeight: "500" },
  // Tasks
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  taskRowDone: { opacity: 0.5 },
  taskCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  taskCheckDone: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  taskBody: { flex: 1, gap: 4 },
  taskTitle: { color: COLORS.text, fontSize: 13, fontWeight: "500" },
  taskTitleDone: { color: COLORS.textDim, textDecorationLine: "line-through" },
  taskMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  taskMetaText: { color: COLORS.textDim, fontSize: 11 },
  viewAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 12,
    marginTop: 4,
  },
  viewAllBtnText: { color: COLORS.emerald, fontSize: 13, fontWeight: "600" },
  // Bottom CTA
  goToAppBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.emerald,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 4,
  },
  goToAppBtnText: { color: COLORS.navyDark, fontWeight: "700", fontSize: 15 },
});
