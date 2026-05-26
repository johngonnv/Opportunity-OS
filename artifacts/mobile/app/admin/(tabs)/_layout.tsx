import React from "react";
import { Tabs, useRouter } from "expo-router";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

function SignOutButton() {
  const { adminLogout } = useAdminAuthContext();
  const router = useRouter();

  async function handleSignOut() {
    await adminLogout();
    router.replace("/admin/login");
  }

  return (
    <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
      <Text style={styles.signOutText}>Sign Out</Text>
    </TouchableOpacity>
  );
}

const HEADER_OPTIONS = {
  headerStyle: { backgroundColor: "#1C1204" },
  headerTintColor: COLORS.amber,
  headerTitleStyle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.amber },
  headerRight: () => <SignOutButton />,
};

export default function AdminTabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: COLORS.amber,
        tabBarInactiveTintColor: COLORS.textDim,
        tabBarStyle: {
          backgroundColor: "#1C1204",
          borderTopWidth: 1,
          borderTopColor: "#3D2A00",
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontFamily: "Inter_500Medium",
          fontSize: 10,
        },
        ...HEADER_OPTIONS,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => <Feather name="home" size={22} color={color} />,
          ...HEADER_OPTIONS,
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: "Templates",
          tabBarIcon: ({ color }) => <Feather name="layout" size={22} color={color} />,
          ...HEADER_OPTIONS,
        }}
      />
      <Tabs.Screen
        name="config"
        options={{
          title: "Config",
          tabBarIcon: ({ color }) => <Feather name="settings" size={22} color={color} />,
          ...HEADER_OPTIONS,
        }}
      />
      <Tabs.Screen
        name="workspaces"
        options={{
          title: "Workspaces",
          tabBarIcon: ({ color }) => <Feather name="briefcase" size={22} color={color} />,
          ...HEADER_OPTIONS,
        }}
      />
      <Tabs.Screen
        name="master-organizations"
        options={{
          title: "Master Orgs",
          tabBarIcon: ({ color }) => <Feather name="database" size={22} color={color} />,
          ...HEADER_OPTIONS,
        }}
      />
      <Tabs.Screen
        name="diagnostics"
        options={{
          title: "Diagnostics",
          tabBarIcon: ({ color }) => <Feather name="activity" size={22} color={color} />,
          ...HEADER_OPTIONS,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  signOutBtn: {
    backgroundColor: "#2D1B00",
    borderColor: COLORS.amber,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 12,
  },
  signOutText: { color: COLORS.amber, fontSize: 12, fontFamily: "Inter_500Medium" },
});
