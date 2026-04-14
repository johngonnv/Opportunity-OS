import { BlurView } from "expo-blur";
import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, StyleSheet, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import CaptureBottomSheet from "@/components/CaptureBottomSheet";

function CaptureFAB({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      style={styles.captureFab}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityLabel="Capture contact"
    >
      <Feather name="plus" size={26} color={COLORS.navy} />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";
  const insets = useSafeAreaInsets();
  const tabBarHeight = 54 + insets.bottom;
  const [showCaptureSheet, setShowCaptureSheet] = useState(false);

  const openSheet = () => setShowCaptureSheet(true);
  const closeSheet = () => setShowCaptureSheet(false);

  const tabBarBg = () => {
    if (isIOS) {
      return <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />;
    }
    return null;
  };

  return (
    <React.Fragment>
      <CaptureBottomSheet visible={showCaptureSheet} onClose={closeSheet} />
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: COLORS.emerald,
          tabBarInactiveTintColor: COLORS.textDim,
          headerStyle: { backgroundColor: COLORS.navyMid },
          headerTintColor: COLORS.text,
          headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
          tabBarStyle: {
            position: "absolute",
            ...Platform.select({ web: { bottom: 0, left: 0, right: 0 } }),
            backgroundColor: isIOS ? "transparent" : COLORS.navyMid,
            borderTopWidth: 1,
            borderTopColor: COLORS.navyBorder,
            elevation: 0,
            height: isWeb ? 54 + insets.bottom : tabBarHeight,
            paddingBottom: isWeb ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 20),
            paddingTop: 6,
          },
          tabBarLabelStyle: {
            fontFamily: "Inter_500Medium",
            fontSize: 10,
            marginBottom: 0,
          },
          tabBarBackground: tabBarBg,
        }}
      >
        <Tabs.Screen
          name="dashboard"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: "Contacts",
            tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="organizations"
          options={{
            title: "Orgs",
            tabBarIcon: ({ color }) => <Feather name="briefcase" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="capture"
          options={{
            title: "",
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: () => <CaptureFAB onPress={openSheet} />,
          }}
        />
        <Tabs.Screen
          name="opportunities"
          options={{
            title: "Pipeline",
            tabBarIcon: ({ color }) => <Feather name="trending-up" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="cards"
          options={{
            title: "Cards",
            tabBarIcon: ({ color }) => <Feather name="credit-card" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: "Tasks",
            tabBarIcon: ({ color }) => <Feather name="check-square" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} />,
          }}
        />
      </Tabs>
    </React.Fragment>
  );
}

const styles = StyleSheet.create({
  captureFab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.emerald,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    shadowColor: COLORS.emerald,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    alignSelf: "center",
  },
});
