import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator,
} from "react-native";
import { alertMessage } from "@/utils/crossPlatformAlert";
import { useRouter, type Href } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";

export default function NewMasterOrgScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  const [canonicalName, setCanonicalName] = useState("");
  const [normalizedNameOverride, setNormalizedNameOverride] = useState("");
  const [websiteDomain, setWebsiteDomain] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [headquartersAddress, setHeadquartersAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceType, setSourceType] = useState("MANUAL");
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    const name = canonicalName.trim();
    if (!name) {
      alertMessage("Validation", "Canonical name is required.");
      return;
    }

    setSaving(true);
    try {
      const aliases = aliasesText
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);

      const org = await adminFetch("/admin/master-organizations", {
        method: "POST",
        body: JSON.stringify({
          canonicalName: name,
          normalizedName: normalizedNameOverride.trim() || undefined,
          websiteDomain: websiteDomain.trim() || undefined,
          aliases,
          headquartersAddress: headquartersAddress.trim() || undefined,
          notes: notes.trim() || undefined,
          sourceType,
        }),
      });

      qc.invalidateQueries({ queryKey: ["adminMasterOrgs"] });
      router.replace(`/admin/master-organizations/${org.id}` as Href);
    } catch (err) {
      alertMessage("Error", err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <AdminHeader
        breadcrumbs={[
          { label: "Master Organizations", href: "/admin/(tabs)/master-organizations" },
          { label: "New" },
        ]}
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.pageTitle}>New Master Organization</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Core Identity</Text>

          <Text style={styles.label}>Canonical Name *</Text>
          <TextInput
            style={styles.input}
            value={canonicalName}
            onChangeText={setCanonicalName}
            placeholder="e.g. HCA Healthcare"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Normalized Name (optional — auto-generated if blank)</Text>
          <TextInput
            style={styles.input}
            value={normalizedNameOverride}
            onChangeText={setNormalizedNameOverride}
            placeholder="e.g. hca healthcare"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Website Domain</Text>
          <TextInput
            style={styles.input}
            value={websiteDomain}
            onChangeText={setWebsiteDomain}
            placeholder="e.g. hcahealthcare.com"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="none"
            keyboardType="url"
          />

          <Text style={styles.label}>Aliases (comma-separated)</Text>
          <TextInput
            style={styles.input}
            value={aliasesText}
            onChangeText={setAliasesText}
            placeholder="e.g. HCA, Hospital Corporation of America"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="words"
            multiline
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Details</Text>

          <Text style={styles.label}>Headquarters Address</Text>
          <TextInput
            style={styles.input}
            value={headquartersAddress}
            onChangeText={setHeadquartersAddress}
            placeholder="e.g. One Park Plaza, Nashville, TN 37203"
            placeholderTextColor={COLORS.textDim}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Notes</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Internal notes about this organization…"
            placeholderTextColor={COLORS.textDim}
            multiline
            numberOfLines={4}
          />

          <Text style={styles.label}>Source Type</Text>
          <View style={styles.sourceRow}>
            {["MANUAL", "SEED", "WORKSPACE_APPROVED"].map(s => (
              <TouchableOpacity
                key={s}
                style={[styles.sourceBtn, sourceType === s && styles.sourceBtnActive]}
                onPress={() => setSourceType(s)}
              >
                <Text style={[styles.sourceBtnText, sourceType === s && styles.sourceBtnTextActive]}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          onPress={handleCreate}
          disabled={saving}
        >
          {saving
            ? <ActivityIndicator color={COLORS.navyDark} size="small" />
            : <Text style={styles.saveBtnText}>Create Master Organization</Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  content: { padding: 16, paddingBottom: 48 },
  pageTitle: { color: COLORS.text, fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 20 },
  section: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  sectionTitle: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_600SemiBold", letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 },
  label: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_500Medium" },
  input: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  sourceRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  sourceBtn: {
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.navySurface,
  },
  sourceBtnActive: { borderColor: COLORS.amber, backgroundColor: "#2D1B00" },
  sourceBtnText: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  sourceBtnTextActive: { color: COLORS.amber, fontFamily: "Inter_600SemiBold" },
  saveBtn: {
    backgroundColor: COLORS.emerald,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: COLORS.navyDark, fontSize: 15, fontFamily: "Inter_700Bold" },
});
