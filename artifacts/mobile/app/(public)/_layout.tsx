import { Stack } from "expo-router";
import { COLORS } from "@/constants/colors";

export default function PublicLayout() {
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="pricing" options={{ title: "Pricing", headerShown: true }} />
      <Stack.Screen name="demo" options={{ title: "Book a Demo", headerShown: true }} />
    </Stack>
  );
}
