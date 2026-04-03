import React, { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { COLORS } from "@/constants/colors";
import { AdminAuthProvider, useAdminAuthContext } from "@/contexts/AdminAuthContext";

function AdminAuthGate({ children }: { children: React.ReactNode }) {
  const { isAdminAuthenticated, isAdminLoading } = useAdminAuthContext();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isAdminLoading) return;
    const inAdminLogin = (segments as string[]).includes("login");

    if (!isAdminAuthenticated && !inAdminLogin) {
      router.replace("/admin/login");
    } else if (isAdminAuthenticated && inAdminLogin) {
      router.replace("/admin/(tabs)/dashboard");
    }
  }, [isAdminAuthenticated, isAdminLoading, segments]);

  if (isAdminLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.navyDark, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={COLORS.amber} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function AdminLayout() {
  return (
    <AdminAuthProvider>
      <AdminAuthGate>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#1C1204" },
            headerTintColor: COLORS.amber,
            headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.amber },
            contentStyle: { backgroundColor: COLORS.navyDark },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ title: "Internal Admin — Opportunity OS", headerShown: true }} />
          <Stack.Screen name="templates/new" options={{ title: "New Template", presentation: "modal" }} />
          <Stack.Screen name="templates/[id]" options={{ title: "Edit Template" }} />
          <Stack.Screen name="workspaces/[workspaceId]/index" options={{ title: "Workspace Detail" }} />
          <Stack.Screen name="logo-scan/new" options={{ title: "Logo Scan" }} />
          <Stack.Screen name="logo-scan/[scanId]" options={{ title: "Scan Detail" }} />
          <Stack.Screen name="master-organizations/new" options={{ title: "New Master Org", presentation: "modal" }} />
          <Stack.Screen name="master-organizations/[id]/index" options={{ title: "Master Org Detail" }} />
          <Stack.Screen name="structure-scans/[id]" options={{ title: "Structure Scan" }} />
          <Stack.Screen name="diagnostics/duplicates" options={{ title: "Duplicate Finder" }} />
          <Stack.Screen name="diagnostics/structure" options={{ title: "Structure Coverage" }} />
          <Stack.Screen name="diagnostics/relationships" options={{ title: "Relationship Integrity" }} />
          <Stack.Screen name="diagnostics/confidence" options={{ title: "Confidence Review Queue" }} />
          <Stack.Screen name="diagnostics/domain" options={{ title: "Domain Diagnostics" }} />
        </Stack>
      </AdminAuthGate>
    </AdminAuthProvider>
  );
}
