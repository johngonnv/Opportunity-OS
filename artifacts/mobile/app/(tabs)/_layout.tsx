import { BlurView } from "expo-blur";
import { Tabs, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

function CaptureFAB() {
  const router = useRouter();
  return (
    <TouchableOpacity
      style={styles.captureFab}
      onPress={() => router.push("/capture")}
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

  const tabBarBg = () => {
    if (isIOS) {
      return <BlurView intensity={100} tint="dark" style={StyleSheet.absoluteFill} />;
    }
    return null;
  };

  return (
    <React.Fragment>
      <Tabs
        initialRouteName="signals"
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
          name="signals"
          options={{
            headerShown: false,
            title: "Signals",
            tabBarIcon: ({ color }) => <Feather name="radio" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="organizations"
          options={{
            headerShown: false,
            title: "Orgs",
            tabBarIcon: ({ color }) => <Feather name="briefcase" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="capture"
          options={{
            headerShown: false,
            title: "",
            tabBarLabel: () => null,
            tabBarIcon: () => null,
            tabBarButton: () => <CaptureFAB />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            headerShown: false,
            title: "Contacts",
            tabBarIcon: ({ color }) => <Feather name="users" size={22} color={color} />,
          }}
        />
        <Tabs.Screen
          name="plays"
          options={{
            headerShown: false,
            title: "Plays",
            tabBarIcon: ({ color }) => <Feather name="target" size={22} color={color} />,
          }}
        />

        {/* Hidden from tab bar — still navigable via router.push */}
        <Tabs.Screen name="dashboard" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="opportunities" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="cards" options={{ href: null, headerShown: false }} />
        <Tabs.Screen name="tasks" options={{ href: null, headerShown: false }} />
        <Tabs.Screen
          name="settings"
          options={{
            href: null,
            headerShown: true,
            title: "Settings",
            headerStyle: { backgroundColor: COLORS.navyMid },
            headerTintColor: COLORS.text,
          }}
        />
      </Tabs>
    </React.Fragment>
  );
}

const styles = StyleSheet.create({
  captureFab: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
