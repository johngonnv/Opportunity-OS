import React from "react";
import { View, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { TemplateForm } from "@/components/admin/TemplateForm";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useQueryClient } from "@tanstack/react-query";

export default function NewTemplateScreen() {
  const router = useRouter();
  const qc = useQueryClient();

  async function handleSave(data: Record<string, any>) {
    await adminFetch("/admin/pipeline-templates", {
      method: "POST",
      body: JSON.stringify(data),
    });
    qc.invalidateQueries({ queryKey: ["adminTemplates"] });
    router.back();
  }

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[{ label: "Templates", href: "/admin/(tabs)/templates" }, { label: "New Template" }]} />
      <TemplateForm onSave={handleSave} onCancel={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
});
