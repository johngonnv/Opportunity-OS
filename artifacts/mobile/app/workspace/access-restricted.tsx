import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stack, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { Button } from "@/components/ui/Button";

export default function AccessRestrictedScreen() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Access Restricted" }} />
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Feather name="lock" size={40} color={COLORS.textDim} />
        </View>
        <Text style={styles.title}>Access Restricted</Text>
        <Text style={styles.body}>
          You need Owner or Admin permissions to access this area. Contact your workspace administrator for access.
        </Text>
        <Button title="Go Back" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  content: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  iconWrap: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text, textAlign: "center" },
  body: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 22 },
});
