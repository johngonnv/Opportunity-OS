import React, { useState } from "react";
import {
  View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback,
  StyleSheet, TextInput, Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useBulkCreateTasks } from "@/hooks/useApi";

type Props = {
  visible: boolean;
  onClose: () => void;
  contactIds: string[];
  onSuccess: () => void;
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH"] as const;
type Priority = typeof PRIORITIES[number];

const QUICK_TITLES = [
  "Follow up",
  "Schedule a call",
  "Send proposal",
  "Check in",
  "Intro email",
];

export function BulkTaskModal({ visible, onClose, contactIds, onSuccess }: Props) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState("Follow up");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const bulkCreate = useBulkCreateTasks();

  const handleCreate = async () => {
    if (!title.trim()) {
      if (Platform.OS === "web") alert("Please enter a task title");
      else Alert.alert("Error", "Please enter a task title");
      return;
    }
    try {
      const payload: any = { contactIds, title: title.trim(), priority };
      if (dueDate) payload.dueDate = dueDate;
      const result = await bulkCreate.mutateAsync(payload);
      onSuccess();
      onClose();
      resetForm();
      const count = result.created ?? contactIds.length;
      if (Platform.OS === "web") {
        alert(`Created ${count} task${count !== 1 ? "s" : ""}`);
      } else {
        Alert.alert("Tasks Created", `Created ${count} follow-up task${count !== 1 ? "s" : ""}.`);
      }
    } catch (err: any) {
      if (Platform.OS === "web") alert(err.message || "Failed to create tasks");
      else Alert.alert("Error", err.message || "Failed to create tasks");
    }
  };

  const resetForm = () => {
    setTitle("Follow up");
    setPriority("MEDIUM");
    setDueDate("");
  };

  const PRIORITY_COLORS: Record<Priority, string> = {
    LOW: COLORS.textDim,
    MEDIUM: COLORS.amber,
    HIGH: COLORS.red,
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Create Follow-Up Tasks</Text>
          <TouchableOpacity onPress={onClose}>
            <Feather name="x" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>Creating tasks for {contactIds.length} contact{contactIds.length !== 1 ? "s" : ""}</Text>

        <Text style={styles.fieldLabel}>Task title</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Enter task title..."
          placeholderTextColor={COLORS.textDim}
        />

        {/* Quick titles */}
        <View style={styles.quickRow}>
          {QUICK_TITLES.map(t => (
            <TouchableOpacity key={t} style={[styles.quickChip, title === t && styles.quickChipActive]} onPress={() => setTitle(t)}>
              <Text style={[styles.quickChipText, title === t && styles.quickChipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map(p => (
            <TouchableOpacity
              key={p}
              style={[styles.priorityBtn, priority === p && { borderColor: PRIORITY_COLORS[p], backgroundColor: COLORS.navySurface }]}
              onPress={() => setPriority(p)}
            >
              <Text style={[styles.priorityText, priority === p && { color: PRIORITY_COLORS[p] }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Due date <Text style={styles.optional}>(optional, YYYY-MM-DD)</Text></Text>
        <TextInput
          style={styles.input}
          value={dueDate}
          onChangeText={setDueDate}
          placeholder="e.g. 2026-04-15"
          placeholderTextColor={COLORS.textDim}
          keyboardType="numbers-and-punctuation"
        />

        <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={bulkCreate.isPending}>
          <Feather name="check-square" size={16} color="#000" />
          <Text style={styles.createText}>
            {bulkCreate.isPending ? "Creating..." : `Create ${contactIds.length} Task${contactIds.length !== 1 ? "s" : ""}`}
          </Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheet: {
    backgroundColor: COLORS.navyCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  handle: { width: 36, height: 4, backgroundColor: COLORS.navyBorder, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  subtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginBottom: 16 },
  fieldLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 14 },
  optional: { fontFamily: "Inter_400Regular", color: COLORS.textDim, textTransform: "none", letterSpacing: 0 },
  input: {
    backgroundColor: COLORS.navySurface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text,
  },
  quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  quickChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  quickChipActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  quickChipText: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  quickChipTextActive: { color: COLORS.emerald },
  priorityRow: { flexDirection: "row", gap: 8 },
  priorityBtn: {
    flex: 1, padding: 10, borderRadius: 10, alignItems: "center",
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  priorityText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.textMuted },
  createBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: COLORS.emerald, borderRadius: 12, padding: 16, marginTop: 20 },
  createText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" },
});
