import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";
import { ActivityIndicator, Platform, View } from "react-native";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { COLORS } from "@/constants/colors";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { CaptureSheetProvider } from "@/contexts/CaptureSheetContext";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30000 } },
});

function getBaseUrl() {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  if (Platform.OS === "android") return "http://10.0.2.2:8080/api";
  return "http://localhost:8080/api";
}

setBaseUrl(getBaseUrl());

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const inAuth = segments[0] === "(auth)";
    const inPublic = segments[0] === "(public)";
    const inAdmin = segments[0] === "admin";

    if (inAdmin) return;

    if (isAuthenticated) {
      if (inPublic || inAuth) {
        router.replace("/(tabs)/dashboard");
      }
    } else {
      if (!inAuth && !inPublic) {
        router.replace("/");
      }
    }
  }, [isAuthenticated, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.navy, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={COLORS.emerald} />
      </View>
    );
  }

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <AuthGate>
      <CaptureSheetProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
          contentStyle: { backgroundColor: COLORS.navy },
          headerBackTitle: "Back",
        }}
      >
        <Stack.Screen name="(public)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="contact/[id]" options={{ title: "Contact" }} />
        <Stack.Screen name="contact/new" options={{ title: "New Contact", presentation: "modal" }} />
        <Stack.Screen name="organization/[id]" options={{ title: "Organization" }} />
        <Stack.Screen name="organization/new" options={{ title: "New Organization", presentation: "modal" }} />
        <Stack.Screen name="opportunity/[id]" options={{ title: "Opportunity" }} />
        <Stack.Screen name="opportunity/new" options={{ title: "New Opportunity", presentation: "modal" }} />
        <Stack.Screen name="card/[id]" options={{ title: "Review Card" }} />
        <Stack.Screen name="org-scan/new" options={{ title: "Scan Business Logo", presentation: "modal" }} />
        <Stack.Screen name="org-scan/[id]" options={{ title: "Scan Review" }} />
        <Stack.Screen name="org-scan/structure/[id]" options={{ title: "Structure Scan" }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="workspace/pipelines" options={{ title: "Pipeline Views" }} />
        <Stack.Screen name="workspace/team" options={{ title: "Team & Roles" }} />
        <Stack.Screen name="workspace/access-restricted" options={{ title: "Access Restricted" }} />
        <Stack.Screen name="+not-found" />
      </Stack>
      </CaptureSheetProvider>
    </AuthGate>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider baseUrl={getBaseUrl()}>
            <GestureHandlerRootView style={{ flex: 1, backgroundColor: COLORS.navy }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
