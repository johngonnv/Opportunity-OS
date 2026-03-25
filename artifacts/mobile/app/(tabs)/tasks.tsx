import React, { useState } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useTasks, useUpdateTask } from "@/hooks/useApi";

const PRIORITY_COLORS: Record<string, string> = {
  LOW: COLORS.textDim,
  MEDIUM: COLORS.amber,
  HIGH: COLORS.red,
};

const STATUS_FILTERS = ["OPEN", "IN_PROGRESS", "COMPLETED"] as const;

function TaskItem({ task, onComplete }: any) {
  const isComplete = task.status === "COMPLETED";
  const isOverdue = !isComplete && task.dueDate && new Date(task.dueDate) < new Date();

  const formatDue = (date: string) => {
    const d = new Date(date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <View style={[styles.taskCard, isComplete && styles.taskCardDone]}>
      <TouchableOpacity
        style={[styles.checkbox, isComplete && styles.checkboxDone]}
        onPress={() => !isComplete && onComplete(task.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        {isComplete && <Feather name="check" size={12} color={COLORS.white} />}
      </TouchableOpacity>
      <View style={styles.taskContent}>
        <Text style={[styles.taskTitle, isComplete && styles.taskTitleDone]}>{task.title}</Text>
        {task.description && <Text style={styles.taskDesc} numberOfLines={2}>{task.description}</Text>}
        <View style={styles.taskMeta}>
          <Badge label={task.priority} color={PRIORITY_COLORS[task.priority] || COLORS.textDim} />
          {task.dueDate && (
            <View style={[styles.dueChip, isOverdue && { backgroundColor: COLORS.red + "20" }]}>
              <Feather name="clock" size={10} color={isOverdue ? COLORS.red : COLORS.textMuted} />
              <Text style={[styles.dueText, isOverdue && { color: COLORS.red }]}>{formatDue(task.dueDate)}</Text>
            </View>
          )}
          {task.contact && <Text style={styles.linkedText} numberOfLines={1}>{task.contact.fullName}</Text>}
        </View>
      </View>
    </View>
  );
}

export default function TasksScreen() {
  const insets = useSafeAreaInsets();
  const [statusFilter, setStatusFilter] = useState<string>("OPEN");
  const [dueFilter, setDueFilter] = useState<string | null>(null);

  const params: Record<string, string> = { status: statusFilter };
  if (dueFilter) params.dueFilter = dueFilter;

  const { data, isLoading, refetch, isRefetching } = useTasks(params);
  const updateTask = useUpdateTask("");

  const handleComplete = (id: string) => {
    Alert.alert("Complete Task", "Mark this task as completed?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Complete", style: "default",
        onPress: () => {
          const mutation = useUpdateTask(id);
          fetch(`${getBase()}/tasks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) })
            .then(() => refetch());
        },
      },
    ]);
  };

  if (isLoading) return <LoadingSpinner label="Loading tasks..." />;
  const tasks = data?.tasks || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.headerTitle}>Tasks</Text>
      </View>

      <View style={styles.filters}>
        {STATUS_FILTERS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.filterBtn, statusFilter === s && styles.filterBtnActive]}
            onPress={() => setStatusFilter(s)}
          >
            <Text style={[styles.filterText, statusFilter === s && styles.filterTextActive]}>{s.replace("_", " ")}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.dueFilters}>
        {["today", "overdue"].map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.dueBtn, dueFilter === f && styles.dueBtnActive]}
            onPress={() => setDueFilter(dueFilter === f ? null : f)}
          >
            <Text style={[styles.dueFilterText, dueFilter === f && styles.dueFilterTextActive]}>{f.charAt(0).toUpperCase() + f.slice(1)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={[styles.list, tasks.length === 0 && { flex: 1 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
        renderItem={({ item }) => (
          <TaskItem task={item} onComplete={handleComplete} />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="check-square"
            title={statusFilter === "OPEN" ? "No open tasks" : `No ${statusFilter.toLowerCase()} tasks`}
            subtitle="Tasks linked to contacts and opportunities will appear here"
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

function getBase() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  topBar: { paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  filters: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 8 },
  filterBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  filterBtnActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  filterText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  filterTextActive: { color: COLORS.emerald },
  dueFilters: { flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 10 },
  dueBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  dueBtnActive: { backgroundColor: COLORS.red + "20", borderColor: COLORS.red },
  dueFilterText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
  dueFilterTextActive: { color: COLORS.red },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  taskCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    gap: 12,
  },
  taskCardDone: { opacity: 0.6 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  checkboxDone: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  taskContent: { flex: 1 },
  taskTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, marginBottom: 3 },
  taskTitleDone: { textDecorationLine: "line-through", color: COLORS.textDim },
  taskDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 16, marginBottom: 6 },
  taskMeta: { flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" },
  dueChip: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: COLORS.navySurface, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  dueText: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted },
  linkedText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim },
});
