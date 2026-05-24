import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

const INDIGO = "#6366f1";
const INDIGO_LIGHT = "#a5b4fc";

export default function ImportSuccessScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    created,
    skipped,
    errors,
    importType,
    since,
    errorDetails,
  } = useLocalSearchParams<{
    created: string;
    skipped: string;
    errors: string;
    importType: string;
    since: string;
    errorDetails: string;
  }>();

  const createdCount = parseInt(created ?? "0", 10);
  const skippedCount = parseInt(skipped ?? "0", 10);
  const errorsCount = parseInt(errors ?? "0", 10);
  const isOrgs = (importType ?? "organizations") === "organizations";
  const errorList: string[] = errorDetails ? JSON.parse(decodeURIComponent(errorDetails)) : [];

  const handleStartWorking = () => {
    const sinceParam = since ? `&since=${encodeURIComponent(since)}` : "";
    router.replace(`/(tabs)/organizations?from=bulk_import&count=${createdCount}${sinceParam}` as never);
  };

  const handleImportAnother = () => {
    router.replace("/capture/bulk" as never);
  };

  return (
    <View style={[s.screen, { paddingBottom: insets.bottom }]}>
      <Stack.Screen options={{ title: "Import Complete", headerBackVisible: false }} />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.heroIconWrap}>
            <View style={s.heroIcon}>
              <Feather name="check-circle" size={38} color={COLORS.emerald} />
            </View>
            <View style={s.grokBadge}>
              <Feather name="zap" size={10} color={COLORS.white} />
            </View>
          </View>
          <Text style={s.heroTitle}>
            {createdCount} Record{createdCount !== 1 ? "s" : ""} Imported!
          </Text>
          <Text style={s.heroSub}>
            {isOrgs ? "Grok enriched each org with verified data" : "Contacts added to your CRM"}
          </Text>
        </View>

        {/* Stat cards */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={[s.statNum, { color: COLORS.emerald }]}>{createdCount}</Text>
            <Text style={s.statLabel}>{isOrgs ? "Orgs added" : "Contacts added"}</Text>
          </View>
          {skippedCount > 0 && (
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: COLORS.amber }]}>{skippedCount}</Text>
              <Text style={s.statLabel}>Already existed</Text>
            </View>
          )}
          {errorsCount > 0 && (
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: COLORS.red }]}>{errorsCount}</Text>
              <Text style={s.statLabel}>Errors</Text>
            </View>
          )}
          {skippedCount === 0 && errorsCount === 0 && (
            <View style={s.statCard}>
              <Text style={[s.statNum, { color: COLORS.textDim }]}>0</Text>
              <Text style={s.statLabel}>Skipped</Text>
            </View>
          )}
        </View>

        {/* Grok enrichment summary (orgs only) */}
        {isOrgs && createdCount > 0 && (
          <View style={s.grokCard}>
            <View style={s.grokIconWrap}>
              <Feather name="zap" size={13} color={COLORS.white} />
            </View>
            <View style={s.grokBody}>
              <Text style={s.grokTitle}>Grok enriched each org</Text>
              <View style={s.grokItems}>
                {[
                  "Facility addresses verified",
                  "Main phone numbers found",
                  "Contacts sourced from web",
                  "Org types classified",
                ].map((item, i) => (
                  <View key={i} style={s.grokItem}>
                    <Feather name="check" size={9} color={COLORS.emerald} />
                    <Text style={s.grokItemTxt}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Skipped duplicates notice */}
        {skippedCount > 0 && (
          <View style={s.warnCard}>
            <Feather name="alert-circle" size={14} color={COLORS.amber} style={{ marginTop: 1 }} />
            <View style={s.warnBody}>
              <Text style={s.warnTitle}>{skippedCount} {skippedCount === 1 ? "record" : "records"} already existed</Text>
              <Text style={s.warnSub}>These were skipped to avoid duplicates</Text>
            </View>
          </View>
        )}

        {/* Error list */}
        {errorList.length > 0 && (
          <View style={s.errorCard}>
            <Text style={s.errorCardTitle}>Import issues</Text>
            {errorList.slice(0, 5).map((e, i) => (
              <Text key={i} style={s.errorCardItem}>• {e}</Text>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {isOrgs && createdCount > 0 && (
          <TouchableOpacity style={s.primaryBtn} onPress={handleStartWorking} activeOpacity={0.85}>
            <Feather name="arrow-right" size={16} color={COLORS.white} />
            <Text style={s.primaryBtnTxt}>Start Working Records</Text>
          </TouchableOpacity>
        )}
        {(!isOrgs || createdCount === 0) && (
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.replace(`/(tabs)/${isOrgs ? "organizations" : "contacts"}?from=bulk_import&count=${createdCount}` as never)}
            activeOpacity={0.85}
          >
            <Feather name="arrow-right" size={16} color={COLORS.white} />
            <Text style={s.primaryBtnTxt}>View {isOrgs ? "Organizations" : "Contacts"}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.secondaryBtn} onPress={handleImportAnother} activeOpacity={0.8}>
          <Text style={s.secondaryBtnTxt}>Import Another File</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.navyDark },
  scroll: { flex: 1 },
  content: { padding: 20 },

  hero: { alignItems: "center", paddingVertical: 24, gap: 10 },
  heroIconWrap: { position: "relative", marginBottom: 4 },
  heroIcon: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.emerald + "22",
    borderWidth: 1, borderColor: COLORS.emerald + "44",
    alignItems: "center", justifyContent: "center",
  },
  grokBadge: {
    position: "absolute", top: -4, right: -4,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: COLORS.navyDark,
  },
  heroTitle: { fontSize: 22, fontWeight: "800", color: COLORS.white, letterSpacing: -0.5, textAlign: "center" },
  heroSub: { fontSize: 13, color: COLORS.textDim, textAlign: "center" },

  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: COLORS.navyMid, borderWidth: 1, borderColor: COLORS.navyBorder,
    borderRadius: 14, paddingVertical: 14, paddingHorizontal: 8, alignItems: "center", gap: 4,
  },
  statNum: { fontSize: 26, fontWeight: "800" },
  statLabel: { fontSize: 10, color: COLORS.textDim, textAlign: "center", lineHeight: 13 },

  grokCard: {
    flexDirection: "row", gap: 12,
    backgroundColor: INDIGO + "18",
    borderWidth: 1, borderColor: INDIGO + "33",
    borderRadius: 14, padding: 14, marginBottom: 14,
  },
  grokIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: INDIGO,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0, marginTop: 2,
  },
  grokBody: { flex: 1 },
  grokTitle: { fontSize: 12, fontWeight: "700", color: INDIGO_LIGHT, marginBottom: 8 },
  grokItems: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  grokItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  grokItemTxt: { fontSize: 10, color: COLORS.textMuted },

  warnCard: {
    flexDirection: "row", gap: 10, alignItems: "flex-start",
    backgroundColor: COLORS.amber + "12",
    borderWidth: 1, borderColor: COLORS.amber + "33",
    borderRadius: 12, padding: 12, marginBottom: 12,
  },
  warnBody: { flex: 1 },
  warnTitle: { fontSize: 12, fontWeight: "600", color: COLORS.amber },
  warnSub: { fontSize: 11, color: COLORS.textDim, marginTop: 2 },

  errorCard: {
    backgroundColor: COLORS.navyMid, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder,
    padding: 12, marginBottom: 12,
  },
  errorCardTitle: { fontSize: 12, fontWeight: "700", color: COLORS.red, marginBottom: 6 },
  errorCardItem: { fontSize: 12, color: COLORS.textMuted, marginBottom: 3 },

  footer: {
    paddingHorizontal: 20, paddingTop: 12, gap: 10,
    borderTopWidth: 1, borderColor: COLORS.navyBorder,
    backgroundColor: COLORS.navyDark,
  },
  primaryBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: COLORS.emerald, borderRadius: 14, paddingVertical: 16,
  },
  primaryBtnTxt: { fontSize: 15, fontWeight: "700", color: COLORS.white },
  secondaryBtn: { alignItems: "center", paddingVertical: 8 },
  secondaryBtnTxt: { fontSize: 14, color: COLORS.textDim, fontWeight: "600" },
});
