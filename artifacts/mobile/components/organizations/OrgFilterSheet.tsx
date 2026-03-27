import React from "react";
import { View, Text, Modal, TouchableOpacity, TouchableWithoutFeedback, StyleSheet, ScrollView } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

export type OrgFilterKey =
  | "hasContacts" | "noContacts"
  | "hasOpenOpps" | "hasWonOpps" | "noOpps"
  | "stale30" | "stale90"
  | "missingWebsite" | "missingPhone"
  | "missingVertical" | "missingStructure";

export type OrgTagFilter = "healthcare" | "govcon" | "hot_lead" | "hospital" | "teaming_partner" | "";

export const ORG_FILTER_GROUPS: { label: string; filters: { key: OrgFilterKey; label: string; icon: string }[] }[] = [
  {
    label: "Contacts & Pipeline",
    filters: [
      { key: "hasContacts",  label: "Has contacts",           icon: "users" },
      { key: "noContacts",   label: "No contacts",            icon: "user-x" },
      { key: "hasOpenOpps",  label: "Has open opportunities", icon: "trending-up" },
      { key: "hasWonOpps",   label: "Has won opportunities",  icon: "award" },
      { key: "noOpps",       label: "No opportunities",       icon: "minus-circle" },
    ],
  },
  {
    label: "Activity",
    filters: [
      { key: "stale30", label: "No activity in 30 days", icon: "clock" },
      { key: "stale90", label: "No activity in 90 days", icon: "clock" },
    ],
  },
  {
    label: "Data Quality",
    filters: [
      { key: "missingWebsite",   label: "Missing website",          icon: "globe" },
      { key: "missingPhone",     label: "Missing phone",            icon: "phone" },
      { key: "missingVertical",  label: "No vertical assigned",     icon: "layers" },
      { key: "missingStructure", label: "No structure type assigned", icon: "grid" },
    ],
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  activeFilters: Set<OrgFilterKey>;
  tagFilter: OrgTagFilter;
  onChange: (filters: Set<OrgFilterKey>, tag: OrgTagFilter) => void;
};

export function OrgFilterSheet({ visible, onClose, activeFilters, tagFilter, onChange }: Props) {
  const insets = useSafeAreaInsets();
  const [localFilters, setLocalFilters] = React.useState<Set<OrgFilterKey>>(activeFilters);
  const [localTag, setLocalTag] = React.useState<OrgTagFilter>(tagFilter);

  React.useEffect(() => {
    if (visible) {
      setLocalFilters(new Set(activeFilters));
      setLocalTag(tagFilter);
    }
  }, [visible]);

  const toggle = (key: OrgFilterKey) => {
    setLocalFilters(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const apply = () => {
    onChange(localFilters, localTag);
    onClose();
  };

  const clear = () => {
    setLocalFilters(new Set());
    setLocalTag("");
  };

  const totalActive = localFilters.size + (localTag ? 1 : 0);

  const TAG_OPTIONS: { key: OrgTagFilter; label: string }[] = [
    { key: "healthcare", label: "Healthcare" },
    { key: "govcon", label: "GovCon" },
    { key: "hospital", label: "Hospital" },
    { key: "hot_lead", label: "Hot Lead" },
    { key: "teaming_partner", label: "Teaming Partner" },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Filter Organizations</Text>
          {totalActive > 0 && (
            <TouchableOpacity onPress={clear}>
              <Text style={styles.clearBtn}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
          <Text style={styles.groupLabel}>Tag</Text>
          <View style={styles.chipRow}>
            {TAG_OPTIONS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.chip, localTag === t.key && styles.chipActive]}
                onPress={() => setLocalTag(localTag === t.key ? "" : t.key)}
              >
                <Text style={[styles.chipText, localTag === t.key && styles.chipTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {ORG_FILTER_GROUPS.map(group => (
            <View key={group.label}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.filters.map(f => {
                const active = localFilters.has(f.key);
                return (
                  <TouchableOpacity key={f.key} style={[styles.row, active && styles.rowActive]} onPress={() => toggle(f.key)}>
                    <Feather name={f.icon as any} size={16} color={active ? COLORS.emerald : COLORS.textDim} />
                    <Text style={[styles.rowText, active && styles.rowTextActive]}>{f.label}</Text>
                    {active && <Feather name="check" size={16} color={COLORS.emerald} style={{ marginLeft: "auto" }} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </ScrollView>
        <TouchableOpacity style={styles.applyBtn} onPress={apply}>
          <Text style={styles.applyText}>
            {totalActive > 0 ? `Apply ${totalActive} filter${totalActive > 1 ? "s" : ""}` : "Apply"}
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
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 12, maxHeight: "85%", flex: 0,
  },
  handle: { width: 36, height: 4, backgroundColor: COLORS.navyBorder, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  title: { fontFamily: "Inter_700Bold", fontSize: 17, color: COLORS.text },
  clearBtn: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.emerald },
  groupLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 12 },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  chipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.emerald },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: COLORS.navySurface, borderRadius: 10,
    marginBottom: 6, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  rowActive: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted },
  rowText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.textMuted, flex: 1 },
  rowTextActive: { color: COLORS.emerald },
  applyBtn: { backgroundColor: COLORS.emerald, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 12 },
  applyText: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#000" },
});
