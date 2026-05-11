import { Stack } from "expo-router";
import { COLORS } from "@/constants/colors";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.navy },
        headerTintColor: COLORS.text,
        headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
        contentStyle: { backgroundColor: COLORS.navy },
        headerShown: false,
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="accept-invite" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ title: "Create Account", headerShown: true }} />
      <Stack.Screen name="forgot-password" options={{ title: "Reset Password", headerShown: true }} />
    </Stack>
  );
}
