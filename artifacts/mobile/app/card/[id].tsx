import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Image, ActivityIndicator, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useQuery } from "@tanstack/react-query";
import { useApproveBusinessCard, useUpdateBusinessCard, useCreateBusinessCard, apiFetch, getStorageUrl, uploadImageMultipart } from "@/hooks/useApi";

const PHI_WARNING = "Do not enter patient-identifiable information, diagnoses, insurance details, medical record numbers, or other protected health information in this MVP.";

const ORG_TYPES = ["HOSPITAL", "HEALTH_SYSTEM", "GOVERNMENT_AGENCY", "PRIME_CONTRACTOR", "CONSULTANT", "OTHER"] as const;

function Field({ label, value, onChangeText, placeholder, keyboardType, autoCapitalize }: any) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={COLORS.textDim}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize || "words"}
      />
    </View>
  );
}

function resolveImageUri(path: string): string {
  if (path.startsWith("/objects/")) return getStorageUrl(path);
  return path;
}

export default function CardReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: card, isLoading } = useQuery({
    queryKey: ["businessCard", id],
    queryFn: () => apiFetch(`/business-cards/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.processingStatus;
      if (status === "PARSING" || status === "UPLOADED") return 2000;
      return false;
    },
  });

  const approve = useApproveBusinessCard(id);
  const updateCard = useUpdateBusinessCard(id);

  const parsed = card?.parsedJson as any || {};
  const ocrError = parsed?.ocrError as string | undefined;
  const isParsingFailed = card?.processingStatus === "FAILED";
  const isParsing = card?.processingStatus === "PARSING" || card?.processingStatus === "UPLOADED";

  const [contact, setContact] = useState({ firstName: "", lastName: "", fullName: "", title: "", email: "", phone: "", mobile: "" });
  const [org, setOrg] = useState({ name: "", website: "", organizationType: "OTHER" as string });
  const [cardNotes, setCardNotes] = useState("");
  const [createOrg, setCreateOrg] = useState(false);
  const lastAutofillJson = React.useRef<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);
  const [backScanning, setBackScanning] = useState(false);
  const [backScanError, setBackScanError] = useState<string | null>(null);
  const [continueScanLoading, setContinueScanLoading] = useState(false);
  const createCard = useCreateBusinessCard();

  React.useEffect(() => {
    if (!card?.parsedJson || card.processingStatus !== "PARSED") return;
    const p = card.parsedJson as any;
    if (p.ocrError) return;
    const jsonKey = JSON.stringify(p);
    if (jsonKey === lastAutofillJson.current) return;
    lastAutofillJson.current = jsonKey;
    setContact({
      firstName: p.firstName || "",
      lastName: p.lastName || "",
      fullName: p.fullName || "",
      title: p.title || "",
      email: p.email || "",
      phone: p.phone || "",
      mobile: p.mobile || "",
    });
    setOrg({ name: p.organizationName || "", website: p.website || "", organizationType: "OTHER" });
    if (p.cardNotes) setCardNotes(p.cardNotes);
    if (p.organizationName) setCreateOrg(true);
  }, [card?.parsedJson, card?.processingStatus]);

  const setC = (k: string) => (v: string) => setContact(f => ({ ...f, [k]: v }));
  const setO = (k: string) => (v: string) => setOrg(f => ({ ...f, [k]: v }));

  const triggerBackParse = async (uri: string) => {
    setBackScanning(true);
    setBackScanError(null);
    try {
      const { objectPath } = await uploadImageMultipart(uri);
      await updateCard.mutateAsync({ imageUrlBack: objectPath, processingStatus: "UPLOADED" });
      apiFetch(`/business-cards/${id}/parse`, { method: "POST" })
        .catch((e: any) => console.log("[CARD] back parse trigger error:", e?.message));
      qc.invalidateQueries({ queryKey: ["businessCard", id] });
    } catch (err: any) {
      setBackScanError(err.message || "Failed to upload back image.");
    } finally {
      setBackScanning(false);
    }
  };

  const handleScanBack = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setBackScanError("Camera permission required to scan the back.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    await triggerBackParse(result.assets[0].uri);
  };

  const handlePickBack = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.85 });
    if (result.canceled || !result.assets[0]) return;
    await triggerBackParse(result.assets[0].uri);
  };

  const handleContinueScan = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      setBackScanError("Camera permission required to scan cards.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.85, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;

    setContinueScanLoading(true);
    try {
      const { objectPath } = await uploadImageMultipart(result.assets[0].uri);
      const newCard = await createCard.mutateAsync({
        imageUrlFront: objectPath,
        processingStatus: "UPLOADED",
        reviewStatus: "PENDING_REVIEW",
      });
      apiFetch(`/business-cards/${newCard.id}/parse`, { method: "POST" })
        .catch((e: any) => console.log("[CARD] parse trigger error:", e?.message));
      router.replace(`/card/${newCard.id}`);
    } catch (err: any) {
      setBackScanError(err.message || "Failed to start new scan.");
    } finally {
      setContinueScanLoading(false);
    }
  };

  const handleApprove = async () => {
    const fullName = contact.fullName || [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    if (!fullName) { setNameError(true); return; }
    setNameError(false);
    setApproveError(null);
    try {
      await approve.mutateAsync({
        contactData: { ...contact, fullName, status: "REVIEWED" },
        organizationData: createOrg && org.name ? { ...org } : null,
        cardNotes: cardNotes.trim() || undefined,
      });
      router.back();
    } catch (err: any) {
      setApproveError(err.message || "Failed to approve card. Please try again.");
    }
  };

  if (isLoading) return <LoadingSpinner label="Loading card..." />;
  if (!card) return null;

  const isApproved = card.reviewStatus === "APPROVED";
  const isRejected = card.reviewStatus === "REJECTED";
  const frontUri = card.imageUrlFront ? resolveImageUri(card.imageUrlFront) : null;
  const backUri = card.imageUrlBack ? resolveImageUri(card.imageUrlBack) : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{
        title: "Review Card",
        headerLeft: () => (
          <TouchableOpacity
            style={styles.headerScanBtn}
            onPress={handleContinueScan}
            disabled={continueScanLoading}
            activeOpacity={0.7}
          >
            {continueScanLoading
              ? <ActivityIndicator size="small" color={COLORS.emerald} />
              : <><Feather name="camera" size={15} color={COLORS.emerald} /><Text style={styles.headerScanText}>Scan Next</Text></>
            }
          </TouchableOpacity>
        ),
        headerRight: () => (
          <View style={statusDot(isParsing)} />
        ),
      }} />

      <View style={styles.imageSection}>
        <View style={styles.imagesRow}>
          {frontUri && (
            <View style={styles.imageBox}>
              <Image source={{ uri: frontUri }} style={styles.cardImage} resizeMode="contain" />
              <Text style={styles.imageSideLabel}>FRONT</Text>
            </View>
          )}
          {backUri ? (
            <View style={styles.imageBox}>
              <Image source={{ uri: backUri }} style={styles.cardImage} resizeMode="contain" />
              <TouchableOpacity style={styles.rescanOverlay} onPress={handleScanBack} disabled={backScanning}>
                {backScanning
                  ? <ActivityIndicator size="small" color={COLORS.white} />
                  : <><Feather name="refresh-cw" size={13} color={COLORS.white} /><Text style={styles.rescanText}>Rescan</Text></>
                }
              </TouchableOpacity>
              <Text style={styles.imageSideLabel}>BACK</Text>
            </View>
          ) : !isApproved && !isRejected && (
            <TouchableOpacity
              style={styles.scanBackBtn}
              onPress={handleScanBack}
              disabled={backScanning}
              activeOpacity={0.75}
            >
              {backScanning ? (
                <ActivityIndicator size="small" color={COLORS.emerald} />
              ) : (
                <>
                  <Feather name="rotate-cw" size={20} color={COLORS.emerald} />
                  <Text style={styles.scanBackTitle}>Scan Back</Text>
                  <Text style={styles.scanBackSubtitle}>Add more details from the back of the card</Text>
                  <TouchableOpacity onPress={handlePickBack} disabled={backScanning}>
                    <Text style={styles.scanBackAlt}>or pick from library</Text>
                  </TouchableOpacity>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        {backScanError && (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={13} color={COLORS.red} />
            <Text style={styles.errorText}>{backScanError}</Text>
          </View>
        )}

        <View style={styles.badgeRow}>
          <Badge
            label={card.reviewStatus.replace("_", " ")}
            color={isApproved ? COLORS.emerald : isRejected ? COLORS.red : COLORS.amber}
          />
          {card.imageUrlBack && (
            <Badge label="Both Sides" color={COLORS.blue} />
          )}
        </View>
      </View>

      {isParsing && (
        <View style={styles.parsingCard}>
          <ActivityIndicator size="small" color={COLORS.emerald} />
          <View style={{ flex: 1 }}>
            <Text style={styles.parsingTitle}>
              {card.imageUrlBack ? "Re-extracting with both sides…" : "Extracting card details…"}
            </Text>
            <Text style={styles.parsingSubtitle}>Reading text from the image. This usually takes a few seconds.</Text>
          </View>
        </View>
      )}

      {(isApproved || isRejected) ? (
        <Card style={styles.statusCard}>
          <Text style={styles.statusText}>
            {isApproved ? "This card has been approved and linked to a contact." : "This card has been rejected."}
          </Text>
          {card.linkedContact && (
            <TouchableOpacity style={styles.linkedBtn} onPress={() => router.push(`/contact/${card.linkedContact.id}`)}>
              <Feather name="user" size={14} color={COLORS.emerald} />
              <Text style={styles.linkedName}>{card.linkedContact.fullName}</Text>
              <Feather name="chevron-right" size={14} color={COLORS.textDim} />
            </TouchableOpacity>
          )}
        </Card>
      ) : (
        <>
          <View style={styles.warningCard}>
            <Feather name="shield" size={14} color={COLORS.amber} />
            <Text style={styles.warningText}>{PHI_WARNING}</Text>
          </View>

          {isParsingFailed && (
            <View style={styles.errorCard}>
              <Feather name="alert-circle" size={14} color={COLORS.red} />
              <Text style={styles.errorText}>
                {ocrError === "OCR_NOT_CONFIGURED"
                  ? "OCR provider not configured. Image captured successfully, but text extraction is unavailable."
                  : (parsed?.message || "Failed to extract text. Please fill in the fields manually.")}
              </Text>
            </View>
          )}

          <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Contact Information</Text>
                <View style={styles.nameRow}>
                  <View style={{ flex: 1 }}>
                    <Field label="First Name" value={contact.firstName} onChangeText={setC("firstName")} placeholder="Jane" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label="Last Name" value={contact.lastName} onChangeText={setC("lastName")} placeholder="Smith" />
                  </View>
                </View>
                <Field
                  label="Full Name"
                  value={contact.fullName}
                  onChangeText={(v: string) => { setC("fullName")(v); setNameError(false); }}
                  placeholder="Jane Smith"
                />
                {nameError && <Text style={styles.nameError}>Please enter a contact name before approving.</Text>}
                <Field label="Title" value={contact.title} onChangeText={setC("title")} placeholder="Director of Operations" />
                <Field label="Email" value={contact.email} onChangeText={setC("email")} keyboardType="email-address" autoCapitalize="none" />
                <Field label="Phone" value={contact.phone} onChangeText={setC("phone")} keyboardType="phone-pad" autoCapitalize="none" />
                <Field label="Mobile" value={contact.mobile} onChangeText={setC("mobile")} keyboardType="phone-pad" autoCapitalize="none" />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Card Notes</Text>
                <TextInput
                  style={[styles.input, styles.notesInput]}
                  value={cardNotes}
                  onChangeText={setCardNotes}
                  placeholder="Taglines, services, social handles, handwritten notes, marketing copy…"
                  placeholderTextColor={COLORS.textDim}
                  multiline
                  numberOfLines={4}
                  autoCapitalize="sentences"
                />
              </View>

              <View style={styles.section}>
                <TouchableOpacity style={styles.toggleRow} onPress={() => setCreateOrg(v => !v)} activeOpacity={0.75}>
                  <Text style={styles.sectionTitle}>Organization</Text>
                  <View style={[styles.toggle, createOrg && styles.toggleActive]}>
                    <Feather name={createOrg ? "check" : "plus"} size={14} color={createOrg ? COLORS.white : COLORS.textMuted} />
                  </View>
                </TouchableOpacity>
                {createOrg && (
                  <>
                    <Field label="Organization Name" value={org.name} onChangeText={setO("name")} placeholder="City Medical Center" />
                    <Field label="Website" value={org.website} onChangeText={setO("website")} autoCapitalize="none" />
                    <View style={styles.field}>
                      <Text style={styles.label}>Type</Text>
                      <View style={styles.chipRow}>
                        {ORG_TYPES.map(t => (
                          <TouchableOpacity
                            key={t}
                            style={[styles.chip, org.organizationType === t && styles.chipActive]}
                            onPress={() => setOrg(f => ({ ...f, organizationType: t }))}
                          >
                            <Text style={[styles.chipText, org.organizationType === t && styles.chipTextActive]}>{t.replace("_", " ")}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </>
                )}
              </View>

              {approveError && (
                <View style={styles.errorCard}>
                  <Feather name="alert-circle" size={14} color={COLORS.red} />
                  <Text style={styles.errorText}>{approveError}</Text>
                </View>
              )}
              <View style={styles.actions}>
                <Button title="Reject" onPress={() => router.back()} variant="danger" style={{ flex: 1 }} />
                <Button title="Approve & Create Contact" onPress={handleApprove} loading={approve.isPending} style={{ flex: 2 }} />
              </View>
            </>
        </>
      )}
    </ScrollView>
  );
}

const statusDot = (parsing: boolean) => ({
  width: 10, height: 10, borderRadius: 5,
  backgroundColor: parsing ? "#6B7280" : "#10B981",
  marginRight: 4,
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  imageSection: { paddingVertical: 16 },
  imagesRow: { flexDirection: "row", gap: 10 },
  imageBox: { flex: 1, position: "relative" },
  cardImage: { width: "100%", height: 130, borderRadius: 10, backgroundColor: COLORS.navySurface },
  imageSideLabel: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: COLORS.textDim, textAlign: "center", marginTop: 4, letterSpacing: 1 },
  rescanOverlay: { position: "absolute", top: 6, right: 6, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 4 },
  rescanText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.white },
  scanBackBtn: { flex: 1, height: 130, borderRadius: 10, backgroundColor: COLORS.navySurface, borderWidth: 1.5, borderColor: COLORS.emerald + "60", borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4, padding: 10 },
  scanBackTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald, textAlign: "center" },
  scanBackSubtitle: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textDim, textAlign: "center", lineHeight: 14 },
  scanBackAlt: { fontFamily: "Inter_400Regular", fontSize: 10, color: COLORS.textMuted, textDecorationLine: "underline", marginTop: 2 },
  badgeRow: { flexDirection: "row", gap: 8, marginTop: 10 },
  parsingCard: { flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: COLORS.emerald + "15", borderRadius: 10, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: COLORS.emerald + "40" },
  parsingTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald, marginBottom: 3 },
  parsingSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  errorCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.red + "15", borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.red + "40" },
  errorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.red, lineHeight: 17 },
  statusCard: { marginTop: 10 },
  statusText: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text, lineHeight: 20 },
  linkedBtn: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, backgroundColor: COLORS.navySurface, borderRadius: 10, padding: 12 },
  linkedName: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  warningCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: COLORS.amber + "15", borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: COLORS.amber + "40" },
  warningText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.amber, lineHeight: 17 },
  section: { marginBottom: 16 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, marginBottom: 12 },
  nameRow: { flexDirection: "row", gap: 10 },
  toggleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  toggle: { width: 28, height: 28, borderRadius: 8, backgroundColor: COLORS.navySurface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: COLORS.navyBorder },
  toggleActive: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  field: { marginBottom: 12 },
  label: { fontFamily: "Inter_500Medium", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  input: { backgroundColor: COLORS.navySurface, borderRadius: 10, padding: 12, color: COLORS.text, fontFamily: "Inter_400Regular", fontSize: 15, borderWidth: 1, borderColor: COLORS.navyBorder },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder },
  chipActive: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 11, color: COLORS.textMuted },
  chipTextActive: { color: COLORS.emerald },
  actions: { flexDirection: "row", gap: 10, marginTop: 10, marginBottom: 20 },
  nameError: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.red, marginTop: -8, marginBottom: 8 },
  notesInput: { minHeight: 90, textAlignVertical: "top", paddingTop: 12 },
  headerScanBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 4 },
  headerScanText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald },
});
