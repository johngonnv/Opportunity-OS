import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Alert, Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
import { COLORS } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { useCreateContact, useTags, useOrganizations, ApiError } from "@/hooks/useApi";

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={COLORS.textDim}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize || "words"}
        returnKeyType="done"
      />
    </View>
  );
}

export default function NewContactScreen() {
  const router = useRouter();
  const createContact = useCreateContact();
  const { data: tagsData } = useTags();
  const { data: orgsData } = useOrganizations();

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    title: "",
    email: "",
    phone: "",
    mobile: "",
    linkedinUrl: "",
    source: "",
    status: "NEW",
    organizationId: "",
  });
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  const doCreate = async (force = false) => {
    const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ") || "Unknown";
    await createContact.mutateAsync({
      ...form,
      fullName,
      tagIds: selectedTags,
      organizationId: form.organizationId || null,
      force,
    });
    router.back();
  };

  const handleSubmit = async () => {
    const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ") || "Unknown";
    if (!form.firstName.trim() && !form.lastName.trim()) {
      return Alert.alert("Name required", "Please enter a first or last name.");
    }
    try {
      await doCreate(false);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409 && err.existing) {
        const existingId = err.existing.id;
        if (Platform.OS === "web") {
          const choice = window.confirm(
            `${err.message}\n\nPress OK to view the existing contact, or Cancel to save as new anyway.`
          );
          if (choice) {
            router.back();
            router.push(`/contact/${existingId}`);
          } else {
            await doCreate(true).catch(e => Alert.alert("Error", e.message));
          }
        } else {
          Alert.alert(
            "Possible Duplicate",
            err.message,
            [
              { text: "View Existing", onPress: () => { router.back(); router.push(`/contact/${existingId}`); } },
              { text: "Save Anyway", onPress: () => doCreate(true).catch(e => Alert.alert("Error", e.message)) },
              { text: "Cancel", style: "cancel" },
            ]
          );
        }
      } else {
        Alert.alert("Error", err.message || "Failed to create contact");
      }
    }
  };

  const tags = tagsData?.tags || [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: "New Contact" }} />

      <Text style={styles.sectionTitle}>Name</Text>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Field label="First Name" value={form.firstName} onChangeText={set("firstName")} placeholder="Jane" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Last Name" value={form.lastName} onChangeText={set("lastName")} placeholder="Smith" />
        </View>
      </View>

      <Field label="Title / Role" value={form.title} onChangeText={set("title")} placeholder="Director of Operations" />
      <Field label="Email" value={form.email} onChangeText={set("email")} keyboardType="email-address" autoCapitalize="none" />
      <Field label="Phone" value={form.phone} onChangeText={set("phone")} keyboardType="phone-pad" autoCapitalize="none" />
      <Field label="Mobile" value={form.mobile} onChangeText={set("mobile")} keyboardType="phone-pad" autoCapitalize="none" />
      <Field label="LinkedIn URL" value={form.linkedinUrl} onChangeText={set("linkedinUrl")} autoCapitalize="none" />
      <Field label="Source" value={form.source} onChangeText={set("source")} placeholder="Conference, referral, etc." />

      {tags.length > 0 && (
        <View style={styles.field}>
          <Text style={styles.label}>Tags</Text>
          <View style={styles.tagGrid}>
            {tags.map((t: any) => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tagChip, selectedTags.includes(t.id) && { backgroundColor: (t.color || COLORS.emerald) + "30", borderColor: t.color || COLORS.emerald }]}
                onPress={() => setSelectedTags(prev => prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id])}
              >
                <Text style={[styles.tagChipText, selectedTags.includes(t.id) && { color: t.color || COLORS.emerald }]}>{t.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.actions}>
        <Button title="Cancel" onPress={() => router.back()} variant="ghost" style={{ flex: 1 }} />
        <Button title="Create Contact" onPress={handleSubmit} loading={createContact.isPending} style={{ flex: 2 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  content: { padding: 16, paddingBottom: 80 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginTop: 8 },
  row: { flexDirection: "row", gap: 10 },
  field: { marginBottom: 14 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    padding: 12,
    color: COLORS.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  tagGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tagChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  tagChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.textMuted },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
});
