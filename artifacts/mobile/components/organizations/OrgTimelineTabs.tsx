import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useActivities, useTasks, useCompleteTask } from "@/hooks/useApi";

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
  const dt = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - dt.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDue(d: string) {
  const dt = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((dt.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, color: COLORS.red };
  if (diffDays === 0) return { label: "Due today", color: COLORS.amber };
  if (diffDays === 1) return { label: "Due tomorrow", color: COLORS.amber };
  return { label: `Due in ${diffDays}d`, color: COLORS.textDim };
}


interface Props {
  organizationId: string;
  onRequestActivity?: () => void;
  onRequestTask?: () => void;
}

export function OrgTimelineTabs({ organizationId, onRequestActivity, onRequestTask }: Props) {
  const [tab, setTab] = useState<"activity" | "tasks">("activity");

  const activitiesQuery = useActivities({ organizationId });
  const tasksQuery = useTasks({ organizationId });

  const activities: any[] = (activitiesQuery.data as { activities?: any[] })?.activities || [];
  const allTasks: any[] = (tasksQuery.data as { tasks?: any[] })?.tasks || [];
  const openTasks = allTasks.filter((t: any) => t.status !== "COMPLETED");
  const doneTasks = allTasks.filter((t: any) => t.status === "COMPLETED");

  return (
    <View>
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, tab === "activity" && styles.tabActive]}
          onPress={() => setTab("activity")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabLabel, tab === "activity" && styles.tabLabelActive]}>Activity</Text>
          {activities.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{activities.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, tab === "tasks" && styles.tabActive]}
          onPress={() => setTab("tasks")}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabLabel, tab === "tasks" && styles.tabLabelActive]}>Tasks</Text>
          {openTasks.length > 0 && (
            <View style={[styles.tabBadge, { backgroundColor: COLORS.amber + "33" }]}>
              <Text style={[styles.tabBadgeText, { color: COLORS.amber }]}>{openTasks.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {tab === "activity" && (
        <View style={styles.tabContent}>
          {activities.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="activity" size={20} color={COLORS.textDim} />
              <Text style={styles.emptyText}>No activity logged</Text>
            </View>
          ) : (
            activities.slice(0, 20).map((a: any) => (
              <View key={a.id} style={styles.activityRow}>
                <View style={styles.activityIconWrap}>
                  <Feather name={ACTIVITY_ICONS[a.type] || "activity"} size={12} color={COLORS.emerald} />
                </View>
                <View style={styles.activityContent}>
                  <Text style={styles.activitySubject} numberOfLines={2}>{a.subject || a.type}</Text>
                  <Text style={styles.activityMeta}>
                    {a.type} · {formatDate(a.occurredAt)}
                    {a.contact && ` · ${a.contact.fullName}`}
                  </Text>
                </View>
              </View>
            ))
          )}
          {onRequestActivity && (
            <TouchableOpacity style={styles.addRowBtn} onPress={onRequestActivity} activeOpacity={0.8}>
              <Feather name="plus" size={14} color={COLORS.emerald} />
              <Text style={styles.addRowText}>Log activity</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {tab === "tasks" && (
        <TasksPanel
          openTasks={openTasks}
          doneTasks={doneTasks}
          onRequestTask={onRequestTask}
        />
      )}
    </View>
  );
}

function TasksPanel({ openTasks, doneTasks, onRequestTask }: {
  openTasks: any[];
  doneTasks: any[];
  onRequestTask?: () => void;
}) {
  const [showDone, setShowDone] = useState(false);

  return (
    <View style={styles.tabContent}>
      {openTasks.length === 0 && doneTasks.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="check-square" size={20} color={COLORS.textDim} />
          <Text style={styles.emptyText}>No tasks</Text>
        </View>
      ) : (
        <>
          {openTasks.map((t: any) => (
            <CompleteableTask key={t.id} task={t} />
          ))}
          {doneTasks.length > 0 && (
            <TouchableOpacity onPress={() => setShowDone(v => !v)} style={styles.showDoneBtn}>
              <Text style={styles.showDoneText}>
                {showDone ? "Hide" : "Show"} {doneTasks.length} completed
              </Text>
              <Feather name={showDone ? "chevron-up" : "chevron-down"} size={14} color={COLORS.textDim} />
            </TouchableOpacity>
          )}
          {showDone && doneTasks.map((t: any) => (
            <CompleteableTask key={t.id} task={t} />
          ))}
        </>
      )}
      {onRequestTask && (
        <TouchableOpacity style={styles.addRowBtn} onPress={onRequestTask} activeOpacity={0.8}>
          <Feather name="plus" size={14} color={COLORS.amber} />
          <Text style={[styles.addRowText, { color: COLORS.amber }]}>Add task</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function CompleteableTask({ task }: { task: any }) {
  const complete = useCompleteTask(task.id);
  const completed = task.status === "COMPLETED";
  const due = task.dueDate ? formatDue(task.dueDate) : null;
  const isOverdue = due?.color === COLORS.red;

  return (
    <View style={[styles.taskRow, completed && styles.taskCompleted]}>
      <TouchableOpacity
        onPress={() => !completed && complete.mutate()}
        disabled={completed || complete.isPending}
        hitSlop={8}
      >
        <Feather
          name={completed ? "check-circle" : "circle"}
          size={18}
          color={completed ? COLORS.emerald : isOverdue ? COLORS.red : COLORS.textDim}
        />
      </TouchableOpacity>
      <View style={styles.taskContent}>
        <Text style={[styles.taskTitle, completed && styles.taskTitleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        {due && !completed && <Text style={[styles.taskDue, { color: due.color }]}>{due.label}</Text>}
        {task.contact && (
          <Text style={styles.taskContactName}>{task.contact.fullName}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 4,
    marginBottom: 12,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
    borderRadius: 9,
  },
  tabActive: {
    backgroundColor: COLORS.navySurface,
  },
  tabLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.textDim,
  },
  tabLabelActive: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
  },
  tabBadge: {
    backgroundColor: COLORS.emerald + "33",
    borderRadius: 10,
    minWidth: 20,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: COLORS.emerald,
  },
  tabContent: {
    gap: 6,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textDim,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 11,
  },
  activityIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: COLORS.navySurface,
    alignItems: "center",
    justifyContent: "center",
  },
  activityContent: {
    flex: 1,
  },
  activitySubject: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 2,
  },
  activityMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 11,
  },
  taskCompleted: {
    opacity: 0.5,
  },
  taskContent: {
    flex: 1,
    gap: 2,
  },
  taskTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  taskTitleDone: {
    textDecorationLine: "line-through",
    color: COLORS.textDim,
  },
  taskDue: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  taskContactName: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
  },
  showDoneBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
  },
  showDoneText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
  },
  addRowBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    marginTop: 2,
  },
  addRowText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.emerald,
  },
});
