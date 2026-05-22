import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { apiFetch } from "@/hooks/useApi";
import { setPendingEvent } from "@/stores/opportunityEventStore";

const INDIGO = "#6366f1";
const EMERALD = "#10b981";

const SOURCES = [
  "Cold Outreach",
  "Referral",
  "Google Ads",
  "Organic Search",
  "Charity / Giveaway",
  "Partnership",
  "Conference / Event",
  "LinkedIn",
  "Trade Show",
  "Existing Relationship",
];

function todayLabel() {
  return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function OpportunityEventScreen() {
  const { orgId = "", orgName = "" } = useLocalSearchParams<{ orgId?: string; orgName?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [sourcePicker, setSourcePicker] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const canAnalyze = notes.trim().length >= 20 && source.length > 0;

  const handleAnalyze = async () => {
    if (!canAnalyze || analyzing) return;
    setAnalyzing(true);
    try {
      const result = await apiFetch("/opportunity-events/analyze", {
        method: "POST",
        body: JSON.stringify({
          notes,
          source,
          organizationId: orgId || undefined,
          occurredAt: new Date().toISOString(),
        }),
      });

      const eventData = {
        orgId: orgId || "",
        // Prefer the org name from URL params (came from org detail page);
        // fall back to what the AI extracted from the notes.
        orgName: orgName || result.organizationName || "",
        source,
        notes,
        occurredAt: new Date().toISOString(),
        result,
      };

      // Write to store as a backup (works on native; may or may not survive
      // Expo Web's code-split module boundary)
      setPendingEvent(eventData);

      // Primary delivery: encode the event directly in the URL query string.
      // Expo Router v6 object-form `params` only handles dynamic route segments,
      // NOT arbitrary query params — must use a URL string with encoded QS.
      const qs = encodeURIComponent(JSON.stringify(eventData));
      router.push(`/capture/opportunity-event-review?payload=${qs}` as Href);
    } catch (e: any) {
      Alert.alert("Analysis failed", e?.message || "Could not reach the server. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: COLORS.navy }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Stack.Screen
        options={{
          title: "New Opportunity Event",
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        }}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.inner, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {orgName ? (
          <View style={styles.orgStrip}>
            <View style={styles.orgIcon}>
              <Feather name="home" size={14} color={INDIGO} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.orgName} numberOfLines={1}>{orgName}</Text>
              <Text style={styles.orgSub}>Pre-filled from organization</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/organizations" as Href)}>
              <Text style={styles.orgChange}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <View style={styles.fieldWrap}>
          <View style={styles.fieldHeader}>
            <Text style={styles.fieldLabel}>Event Notes</Text>
            <Text style={styles.charCount}>{notes.length} chars</Text>
          </View>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={10}
            placeholder={
              "Tell us what happened…\n\n• Key contacts met and their roles\n• Topics discussed & decisions made\n• Pipeline changes or new opportunities\n• Objections raised\n• Marketing materials left / promised\n• Agreed next steps\n• Competitive intel heard"
            }
            placeholderTextColor={COLORS.navyBorder}
            style={styles.textarea}
            textAlignVertical="top"
          />
          <Text style={styles.fieldHint}>
            The more detail you provide, the better the AI can extract structured data.
          </Text>
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>
            Source <Text style={{ color: COLORS.red }}>*</Text>
          </Text>
          <TouchableOpacity
            style={[styles.dropdown, source ? styles.dropdownFilled : null]}
            onPress={() => setSourcePicker(true)}
            activeOpacity={0.8}
          >
            <Text style={source ? styles.dropdownValue : styles.dropdownPlaceholder}>
              {source || "Select event source…"}
            </Text>
            <Feather name="chevron-down" size={16} color={COLORS.textDim} />
          </TouchableOpacity>
        </View>

        <View style={styles.dateRow}>
          <View style={styles.dateCell}>
            <Text style={styles.dateCellLabel}>Date</Text>
            <Text style={styles.dateCellValue}>{todayLabel()}</Text>
          </View>
          <View style={styles.dateCell}>
            <Text style={styles.dateCellLabel}>Time</Text>
            <Text style={styles.dateCellValue}>
              {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.analyzeBtn, { backgroundColor: canAnalyze ? EMERALD : COLORS.navySurface }]}
          onPress={handleAnalyze}
          disabled={!canAnalyze || analyzing}
          activeOpacity={0.85}
        >
          {analyzing ? (
            <>
              <ActivityIndicator size="small" color={COLORS.white} />
              <Text style={styles.analyzeBtnText}>Analyzing with AI…</Text>
            </>
          ) : (
            <>
              <Feather name="zap" size={20} color={canAnalyze ? COLORS.white : COLORS.textDim} />
              <Text style={[styles.analyzeBtnText, !canAnalyze && { color: COLORS.textDim }]}>
                Analyze with AI
              </Text>
            </>
          )}
        </TouchableOpacity>

        {!canAnalyze && (
          <Text style={styles.analyzeHint}>
            Add event notes (20+ chars) and select a source to continue
          </Text>
        )}
      </ScrollView>

      <Modal visible={sourcePicker} transparent animationType="slide" onRequestClose={() => setSourcePicker(false)}>
        <View style={styles.pickerOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={() => setSourcePicker(false)} />
          <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>Select Source</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {SOURCES.map(s => (
                <TouchableOpacity
                  key={s}
                  style={styles.pickerRow}
                  onPress={() => { setSource(s); setSourcePicker(false); }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.pickerRowText}>{s}</Text>
                  {source === s && <Feather name="check" size={15} color={INDIGO} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  inner: { paddingHorizontal: 20, paddingTop: 20, gap: 0 },

  orgStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderColor: COLORS.navyBorder,
    borderLeftColor: INDIGO,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  orgIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: INDIGO + "22",
    alignItems: "center",
    justifyContent: "center",
  },
  orgName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
  },
  orgSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textMuted,
  },
  orgChange: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: INDIGO,
  },

  fieldWrap: { marginBottom: 20 },
  fieldHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  fieldLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  charCount: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textDim,
  },
  fieldHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textDim,
    marginTop: 6,
    paddingHorizontal: 2,
  },

  textarea: {
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    color: COLORS.text,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 20,
    minHeight: 200,
  },

  dropdown: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  dropdownFilled: { borderColor: INDIGO + "55" },
  dropdownValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
  },
  dropdownPlaceholder: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textDim,
  },

  dateRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 24,
  },
  dateCell: {
    flex: 1,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dateCellLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textDim,
    marginBottom: 2,
  },
  dateCellValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
  },

  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
    paddingVertical: 17,
    marginBottom: 10,
  },
  analyzeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: COLORS.white,
  },
  analyzeHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    textAlign: "center",
  },

  pickerOverlay: { flex: 1, justifyContent: "flex-end" },
  pickerSheet: {
    backgroundColor: COLORS.navySurface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingTop: 10,
    paddingHorizontal: 20,
    maxHeight: "70%",
  },
  pickerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.navyBorder,
    alignSelf: "center",
    marginBottom: 14,
  },
  pickerTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  pickerRowText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.text,
  },
});
