import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { useRouter, Stack, useFocusEffect } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Contacts from "expo-contacts";
import { COLORS } from "@/constants/colors";

interface ContactRow {
  id: string;
  name: string;
  phone: string;
  email: string;
}

type PermissionState = "loading" | "denied" | "granted";

function openAppSettings() {
  if (typeof Linking.openSettings === "function") {
    void Linking.openSettings();
  } else if (Platform.OS === "ios") {
    void Linking.openURL("app-settings:");
  }
}

export default function PickContactScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [filtered, setFiltered] = useState<ContactRow[]>([]);
  const [search, setSearch] = useState("");
  const [permState, setPermState] = useState<PermissionState>("loading");

  const loadContacts = useCallback(async () => {
    setPermState("loading");
    // expo-contacts is native-only; web browsers cannot access device contacts
    if (Platform.OS === "web") {
      setPermState("denied");
      return;
    }
    // Check existing permission first
    const { status: existing } = await Contacts.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== "granted") {
      const { status: requested } = await Contacts.requestPermissionsAsync();
      finalStatus = requested;
    }
    if (finalStatus !== "granted") {
      setPermState("denied");
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
      sort: Contacts.SortTypes.LastName,
    });
    const rows: ContactRow[] = data
      .filter((c) => c.name)
      .map((c) => ({
        id: c.id ?? Math.random().toString(),
        name: c.name ?? "",
        phone: c.phoneNumbers?.[0]?.number ?? "",
        email: c.emails?.[0]?.email ?? "",
      }));
    setContacts(rows);
    setFiltered(rows.slice(0, 50));
    setPermState("granted");
  }, []);

  // Re-check permission every time screen is focused (e.g. user returns from Settings)
  useFocusEffect(
    useCallback(() => {
      void loadContacts();
    }, [loadContacts]),
  );

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(contacts.slice(0, 50));
      return;
    }
    setFiltered(contacts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50));
  }, [search, contacts]);

  const selectContact = (c: ContactRow) => {
    const nameParts = c.name.split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ");
    const params = new URLSearchParams({
      firstName,
      lastName,
      phone: c.phone,
      email: c.email,
      source: "IOS_CONTACTS",
    });
    router.replace(`/capture/new?${params.toString()}` as Href);
  };

  const screenOptions = {
    title: "Import Contact",
    headerStyle: { backgroundColor: COLORS.navyMid },
    headerTintColor: COLORS.text,
    headerTitleStyle: { fontFamily: "Inter_600SemiBold" },
  };

  if (permState === "loading") {
    return (
      <View style={styles.center}>
        <Stack.Screen options={screenOptions} />
        <ActivityIndicator size="large" color={COLORS.emerald} />
        <Text style={styles.loadingText}>Loading contacts…</Text>
      </View>
    );
  }

  if (permState === "denied") {
    const isWeb = Platform.OS === "web";
    // Detect if web user is on a mobile device (iPhone/Android) vs desktop
    const isMobileBrowser =
      isWeb &&
      typeof navigator !== "undefined" &&
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const isIphoneBrowser =
      isWeb &&
      typeof navigator !== "undefined" &&
      /iPhone|iPad|iPod/i.test(navigator.userAgent);

    return (
      <View style={styles.center}>
        <Stack.Screen options={screenOptions} />
        <View style={styles.lockCircle}>
          <Feather name={isWeb ? "smartphone" : "lock"} size={32} color={COLORS.textDim} />
        </View>
        <Text style={styles.deniedTitle}>
          {isMobileBrowser ? "Almost There!" : isWeb ? "Use Expo Go on Your Phone" : "Contacts Access Required"}
        </Text>
        <Text style={styles.deniedSub}>
          {isMobileBrowser
            ? `You're in ${isIphoneBrowser ? "Safari" : "your browser"} — contacts aren't accessible from a web browser. Install the free Expo Go app, then open it and scan the QR code from your Replit workspace.`
            : isWeb
            ? "Device contacts can't be accessed from a web browser. Open the Expo Go app on your iPhone or Android and scan the QR code in your Replit workspace."
            : "Opportunity OS needs access to your contacts. Tap below to open Settings and enable access."}
        </Text>
        {isMobileBrowser && isIphoneBrowser && (
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => void Linking.openURL("https://apps.apple.com/app/expo-go/id982107779")}
            activeOpacity={0.8}
          >
            <Feather name="download" size={15} color={COLORS.navy} />
            <Text style={styles.settingsBtnTxt}>Get Expo Go (free)</Text>
          </TouchableOpacity>
        )}
        {!isWeb && (
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={openAppSettings}
            activeOpacity={0.8}
          >
            <Feather name="settings" size={15} color={COLORS.navy} />
            <Text style={styles.settingsBtnTxt}>Open Settings</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={() => router.back()} style={styles.cancelLink}>
          <Text style={styles.cancelTxt}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={screenOptions} />
      <View style={styles.searchBar}>
        <Feather name="search" size={16} color={COLORS.textDim} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search contacts…"
          placeholderTextColor={COLORS.textDim}
          autoCapitalize="words"
          autoFocus
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={14} color={COLORS.textDim} />
          </TouchableOpacity>
        )}
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => selectContact(item)} activeOpacity={0.75}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.rowInfo}>
              <Text style={styles.rowName}>{item.name}</Text>
              {(item.phone || item.email) && (
                <Text style={styles.rowDetail} numberOfLines={1}>
                  {item.phone || item.email}
                </Text>
              )}
            </View>
            <Feather name="chevron-right" size={14} color={COLORS.textDim} />
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            {search ? `No contacts matching "${search}"` : "No contacts found"}
          </Text>
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  center: {
    flex: 1,
    backgroundColor: COLORS.navy,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 32,
  },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted },

  lockCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.navySurface,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  deniedTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text, textAlign: "center" },
  deniedSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.emerald,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: 12,
    marginTop: 8,
  },
  settingsBtnTxt: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.navy },
  cancelLink: { marginTop: 4, padding: 8 },
  cancelTxt: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textDim },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.navySurface,
    margin: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    color: COLORS.text,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.navy,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.emeraldMuted,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  avatarText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.emerald },
  rowInfo: { flex: 1 },
  rowName: { fontFamily: "Inter_500Medium", fontSize: 15, color: COLORS.text },
  rowDetail: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  separator: { height: 1, backgroundColor: COLORS.navyBorder, marginLeft: 66 },

  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    padding: 32,
  },
});
