import React, { useState, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";
import { SearchBar } from "@/components/ui/SearchBar";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useContacts, useDeleteContact } from "@/hooks/useApi";
import { useDebounce } from "@/hooks/useDebounce";

const STATUS_COLORS: Record<string, string> = {
  NEW: COLORS.amber,
  REVIEWED: COLORS.blue,
  ACTIVE: COLORS.emerald,
  INACTIVE: COLORS.textDim,
};

function ContactCard({ contact, onPress, onDelete }: any) {
  const initials = ((contact.firstName?.[0] || "") + (contact.lastName?.[0] || "")).toUpperCase() || contact.fullName?.[0]?.toUpperCase() || "?";
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(contact.id)} activeOpacity={0.75}>
      <View style={styles.avatar}>
        <Text style={styles.initials}>{initials}</Text>
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{contact.fullName}</Text>
        {contact.title && <Text style={styles.title} numberOfLines={1}>{contact.title}</Text>}
        {contact.organization && <Text style={styles.org} numberOfLines={1}>{contact.organization.name}</Text>}
        {contact.email && <Text style={styles.email} numberOfLines={1}>{contact.email}</Text>}
        {contact.tags?.length > 0 && (
          <View style={styles.tags}>
            {contact.tags.slice(0, 3).map((tag: any) => (
              <Badge key={tag.id} label={tag.name} color={tag.color || COLORS.emerald} />
            ))}
          </View>
        )}
      </View>
      <View style={styles.right}>
        <Badge label={contact.status} color={STATUS_COLORS[contact.status] || COLORS.textDim} />
      </View>
    </TouchableOpacity>
  );
}

export default function ContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const params: Record<string, string> = {};
  if (debouncedSearch) params.search = debouncedSearch;
  const { data, isLoading, refetch, isRefetching } = useContacts(params);
  const deleteContact = useDeleteContact();

  const handleDelete = useCallback((id: string, name: string) => {
    Alert.alert("Delete Contact", `Remove ${name} from your contacts?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => deleteContact.mutate(id),
      },
    ]);
  }, [deleteContact]);

  if (isLoading) return <LoadingSpinner label="Loading contacts..." />;

  const contacts = data?.contacts || [];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <Text style={styles.headerTitle}>Contacts</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push("/contact/new")}>
          <Feather name="plus" size={20} color={COLORS.emerald} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <SearchBar value={search} onChangeText={setSearch} placeholder="Search contacts..." />
      </View>

      <FlatList
        data={contacts}
        keyExtractor={(item: any) => item.id}
        contentContainerStyle={[styles.list, contacts.length === 0 && { flex: 1 }]}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.emerald} />}
        renderItem={({ item }) => (
          <ContactCard
            contact={item}
            onPress={(id: string) => router.push(`/contact/${id}`)}
            onDelete={handleDelete}
          />
        )}
        ListEmptyComponent={
          <EmptyState
            icon="users"
            title={search ? "No contacts found" : "No contacts yet"}
            subtitle={search ? "Try a different search term" : "Scan a business card or add a contact manually"}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 22, color: COLORS.text },
  addBtn: { width: 36, height: 36, backgroundColor: COLORS.emeraldMuted, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  list: { paddingHorizontal: 16, paddingBottom: 100 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.navySurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  initials: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.emerald },
  info: { flex: 1, gap: 2 },
  name: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  title: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  org: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted },
  email: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 },
  right: { alignItems: "flex-end", gap: 6 },
});
