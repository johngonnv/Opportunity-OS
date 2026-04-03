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
    const inAdminLogin = segments.some(s => s === "login");

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
          <Stack.Screen name="ai-suggestions" options={{ headerShown: false }} />
          <Stack.Screen name="completeness-audit" options={{ headerShown: false }} />
          <Stack.Screen name="workspace-coverage" options={{ headerShown: false }} />
          <Stack.Screen name="templates/new" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="templates/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="workspaces/[workspaceId]/index" options={{ headerShown: false }} />
          <Stack.Screen name="logo-scan/new" options={{ headerShown: false }} />
          <Stack.Screen name="logo-scan/[scanId]" options={{ headerShown: false }} />
          <Stack.Screen name="master-organizations/new" options={{ headerShown: false, presentation: "modal" }} />
          <Stack.Screen name="master-organizations/[id]/index" options={{ headerShown: false }} />
          <Stack.Screen name="structure-scans/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="diagnostics/duplicates" options={{ headerShown: false }} />
          <Stack.Screen name="diagnostics/structure" options={{ headerShown: false }} />
          <Stack.Screen name="diagnostics/relationships" options={{ headerShown: false }} />
          <Stack.Screen name="diagnostics/confidence" options={{ headerShown: false }} />
          <Stack.Screen name="diagnostics/domain" options={{ headerShown: false }} />
        </Stack>
      </AdminAuthGate>
    </AdminAuthProvider>
  );
}
