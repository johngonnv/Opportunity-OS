import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useRouter, Stack } from "expo-router";
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

export default function PickContactScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [filtered, setFiltered] = useState<ContactRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== "granted") {
        setDenied(true);
        setLoading(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers, Contacts.Fields.Emails],
        sort: Contacts.SortTypes.LastName,
      });
      const rows: ContactRow[] = data
        .filter(c => c.name)
        .map(c => ({
          id: c.id ?? Math.random().toString(),
          name: c.name ?? "",
          phone: c.phoneNumbers?.[0]?.number ?? "",
          email: c.emails?.[0]?.email ?? "",
        }));
      setContacts(rows);
      setFiltered(rows.slice(0, 50));
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      setFiltered(contacts.slice(0, 50));
      return;
    }
    setFiltered(contacts.filter(c => c.name.toLowerCase().includes(q)).slice(0, 50));
  }, [search, contacts]);

  const selectContact = (c: ContactRow) => {
    const nameParts = c.name.split(" ");
    const firstName = nameParts[0] || "";
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

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Import Contact", headerStyle: { backgroundColor: COLORS.navyMid }, headerTintColor: COLORS.text, headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
        <ActivityIndicator size="large" color={COLORS.emerald} />
        <Text style={styles.loadingText}>Loading contacts…</Text>
      </View>
    );
  }

  if (denied) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Import Contact", headerStyle: { backgroundColor: COLORS.navyMid }, headerTintColor: COLORS.text, headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
        <Feather name="lock" size={44} color={COLORS.textDim} />
        <Text style={styles.deniedTitle}>Contacts Permission Denied</Text>
        <Text style={styles.deniedSub}>
          Please allow Contacts access in your device settings to import contacts.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Import Contact", headerStyle: { backgroundColor: COLORS.navyMid }, headerTintColor: COLORS.text, headerTitleStyle: { fontFamily: "Inter_600SemiBold" } }} />
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
      </View>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
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
          <Text style={styles.emptyText}>No contacts found matching "{search}"</Text>
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
  deniedTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text, textAlign: "center" },
  deniedSub: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textMuted, textAlign: "center", lineHeight: 20 },

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
