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
    const inAdminLogin = segments.includes("login" as any);

    if (!isAdminAuthenticated && !inAdminLogin) {
      router.replace("/admin/login");
    } else if (isAdminAuthenticated && inAdminLogin) {
      router.replace("/admin/dashboard");
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
          <Stack.Screen name="login" options={{ title: "Internal Admin — Opportunity OS", headerShown: true }} />
          <Stack.Screen name="dashboard" options={{ title: "Internal Admin — Opportunity OS" }} />
          <Stack.Screen name="templates/index" options={{ title: "Internal Admin — Opportunity OS" }} />
          <Stack.Screen name="templates/new" options={{ title: "Internal Admin — Opportunity OS", presentation: "modal" }} />
          <Stack.Screen name="templates/[id]" options={{ title: "Internal Admin — Opportunity OS" }} />
          <Stack.Screen name="workspaces/index" options={{ title: "Internal Admin — Opportunity OS" }} />
          <Stack.Screen name="workspaces/[workspaceId]/index" options={{ title: "Internal Admin — Opportunity OS" }} />
          <Stack.Screen name="master-organizations/index" options={{ title: "Internal Admin — Opportunity OS" }} />
          <Stack.Screen name="master-organizations/new" options={{ title: "Internal Admin — Opportunity OS", presentation: "modal" }} />
          <Stack.Screen name="master-organizations/[id]/index" options={{ title: "Internal Admin — Opportunity OS" }} />
        </Stack>
      </AdminAuthGate>
    </AdminAuthProvider>
  );
}
