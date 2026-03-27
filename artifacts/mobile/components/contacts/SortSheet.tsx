import React from "react";
import { View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

export type SortKey = "createdAt" | "updatedAt" | "fullName" | "source" | "status";
export type SortOrder = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string; ascLabel: string; descLabel: string }[] = [
  { key: "createdAt",  label: "Date Added",     descLabel: "Newest first",   ascLabel: "Oldest first" },
  { key: "updatedAt",  label: "Last Updated",   descLabel: "Recently updated", ascLabel: "Least updated" },
  { key: "fullName",   label: "Name",           descLabel: "Z → A",          ascLabel: "A → Z" },
  { key: "source",     label: "Source",         descLabel: "Z → A",          ascLabel: "A → Z" },
  { key: "status",     label: "Status",         descLabel: "Z → A",          ascLabel: "A → Z" },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  sortBy: SortKey;
  sortOrder: SortOrder;
  onChange: (sortBy: SortKey, sortOrder: SortOrder) => void;
};

export function SortSheet({ visible, onClose, sortBy, sortOrder, onChange }: Props) {
  const insets = useSafeAreaInsets();

  const handleSelect = (key: SortKey, order: SortOrder) => {
    onChange(key, order);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Sort Contacts</Text>
        <ScrollView showsVerticalScrollIndicator={false}>
          {SORT_OPTIONS.map(opt => (
            <View key={opt.key}>
              <Text style={styles.groupLabel}>{opt.label}</Text>
              <View style={styles.row}>
                {(["desc", "asc"] as SortOrder[]).map(ord => {
                  const isActive = sortBy === opt.key && sortOrder === ord;
                  const label = ord === "desc" ? opt.descLabel : opt.ascLabel;
                  return (
                    <TouchableOpacity
                      key={ord}
                      style={[styles.optBtn, isActive && styles.optBtnActive]}
                      onPress={() => handleSelect(opt.key, ord)}
                    >
                      <Text style={[styles.optText, isActive && styles.optTextActive]}>{label}</Text>
                      {isActive && <Feather name="check" size={14} color={COLORS.emerald} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
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
    maxHeight: "75%",
  },
  handle: { width: 36, height: 4, backgroundColor: COLORS.navyBorder, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text, marginBottom: 16 },
  groupLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
  row: { flexDirection: "row", gap: 8, marginBottom: 4 },
  optBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: COLORS.navySurface, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  optBtnActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  optText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted },
  optTextActive: { color: COLORS.emerald },
});
