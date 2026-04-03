import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface PlaceCandidate {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  phoneNumber: string | null;
  website: string | null;
  placeCategory: string | null;
  mapLink: string;
  geometry: { lat: number; lng: number } | null;
  confidence: number;
}

interface AdminMasterOrgScan {
  id: string;
  uploadedByAdminId: string | null;
  imageUrl: string;
  rawOcrText: string | null;
  parsedBusinessName: string | null;
  confidenceScore: number | null;
  matchedPlaceJson: PlaceCandidate[] | null;
  selectedMatchJson: PlaceCandidate | null;
  processingStatus: string;
  reviewStatus: string;
  createdMasterOrgId: string | null;
  createdMasterOrgName: string | null;
  createdAt: string;
  updatedAt: string;
}

const PROCESSING_STATUS_CONFIG: Record<string, { color: string; label: string; icon: React.ComponentProps<typeof Feather>["name"] }> = {
  UPLOADED: { color: COLORS.textDim, label: "Uploaded", icon: "upload" },
  PARSING: { color: COLORS.amber, label: "Parsing…", icon: "cpu" },
  PARSED: { color: COLORS.blue, label: "Parsed", icon: "file-text" },
  MATCHED: { color: COLORS.cyan, label: "Matched", icon: "map-pin" },
  FAILED: { color: COLORS.red, label: "Failed", icon: "alert-triangle" },
};

const REVIEW_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  PENDING_REVIEW: { color: COLORS.amber, label: "Pending Review" },
  APPROVED: { color: COLORS.emerald, label: "Approved" },
  REJECTED: { color: COLORS.red, label: "Rejected" },
};

export default function AdminMasterOrgScanDetailScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const [selectedCandidate, setSelectedCandidate] = useState<PlaceCandidate | null>(null);
  const [targetMasterOrgId, setTargetMasterOrgId] = useState("");
  const [matchQuery, setMatchQuery] = useState("");
  const [isMatching, setIsMatching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const { data: scan, isLoading, refetch } = useQuery<AdminMasterOrgScan>({
    queryKey: ["adminMasterOrgScan", scanId],
    queryFn: () => adminFetch(`/admin/master-org-scans/${scanId}`),
    enabled: isAdminAuthenticated && !!scanId,
    refetchInterval: (data) => {
      const s = data?.state?.data;
      if (s?.processingStatus === "PARSING") return 3000;
      return false;
    },
  });

  useEffect(() => {
    if (scan?.parsedBusinessName && !matchQuery) {
      setMatchQuery(scan.parsedBusinessName);
    }
    if (scan?.selectedMatchJson && !selectedCandidate) {
      setSelectedCandidate(scan.selectedMatchJson);
    }
  }, [scan]);

  const handleRunMatch = async () => {
    if (!matchQuery.trim()) return;
    setIsMatching(true);
    try {
      await adminFetch(`/admin/master-org-scans/${scanId}/match`, {
        method: "POST",
        body: JSON.stringify({ query: matchQuery.trim() }),
      });
      qc.invalidateQueries({ queryKey: ["adminMasterOrgScan", scanId] });
    } catch (e: any) {
      Alert.alert("Match Error", e.message);
    } finally {
      setIsMatching(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedCandidate && !targetMasterOrgId.trim()) {
      Alert.alert("Selection Required", "Please select a Google Places match or enter an existing Master Org ID to enrich.");
      return;
    }

    Alert.alert(
      "Confirm Approval",
      targetMasterOrgId.trim()
        ? `Enrich existing Master Org (ID: ${targetMasterOrgId.trim()}) with data from this scan.`
        : `Create a new Master Organization record for "${selectedCandidate?.name}" in the platform database.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Approve", onPress: async () => {
            setIsApproving(true);
            try {
              const body: Record<string, unknown> = { selectedMatch: selectedCandidate };
              if (targetMasterOrgId.trim()) body.targetMasterOrgId = targetMasterOrgId.trim();
              const result = await adminFetch(`/admin/master-org-scans/${scanId}/approve`, {
                method: "POST",
                body: JSON.stringify(body),
              });
              qc.invalidateQueries({ queryKey: ["adminMasterOrgScan", scanId] });
              if (result?.masterOrg?.id) {
                router.replace(`/admin/master-organizations/${result.masterOrg.id}` as Href);
              }
            } catch (e: any) {
              Alert.alert("Approval Failed", e.message);
            } finally {
              setIsApproving(false);
            }
          }
        },
      ]
    );
  };

  const handleReject = async () => {
    Alert.alert("Reject Scan", "Mark this scan as rejected?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive", onPress: async () => {
          setIsRejecting(true);
          try {
            await adminFetch(`/admin/master-org-scans/${scanId}/reject`, { method: "POST" });
            qc.invalidateQueries({ queryKey: ["adminMasterOrgScan", scanId] });
          } catch (e: any) {
            Alert.alert("Error", e.message);
          } finally {
            setIsRejecting(false);
          }
        }
      },
    ]);
  };

  if (isLoading || !scan) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[{ label: "Dashboard", href: "/admin/dashboard" as Href }, { label: "Logo Scan", href: "/admin/logo-scan/new" as Href }, { label: "Review" }]} />
        <View style={styles.center}><ActivityIndicator color={COLORS.cyan} size="large" /></View>
      </View>
    );
  }

  const procCfg = PROCESSING_STATUS_CONFIG[scan.processingStatus] ?? { color: COLORS.textDim, label: scan.processingStatus, icon: "circle" as const };
  const revCfg = REVIEW_STATUS_CONFIG[scan.reviewStatus] ?? { color: COLORS.textDim, label: scan.reviewStatus };
  const candidates = (scan.matchedPlaceJson ?? []) as PlaceCandidate[];
  const isDone = scan.reviewStatus !== "PENDING_REVIEW";

  return (
    <View style={styles.container}>
      <AdminHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/admin/dashboard" as Href },
          { label: "Logo Scan", href: "/admin/logo-scan/new" as Href },
          { label: scan.parsedBusinessName ?? "Review" },
        ]}
      />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { borderColor: procCfg.color + "55" }]}>
            <Feather name={procCfg.icon} size={12} color={procCfg.color} />
            <Text style={[styles.statusBadgeText, { color: procCfg.color }]}>{procCfg.label}</Text>
          </View>
          <View style={[styles.statusBadge, { borderColor: revCfg.color + "55" }]}>
            <Text style={[styles.statusBadgeText, { color: revCfg.color }]}>{revCfg.label}</Text>
          </View>
          {scan.processingStatus === "PARSING" && (
            <ActivityIndicator size="small" color={COLORS.amber} />
          )}
        </View>

        {scan.processingStatus === "PARSING" && (
          <View style={styles.infoCard}>
            <Text style={styles.infoText}>OCR is running on your image… This usually takes 5–15 seconds.</Text>
          </View>
        )}

        {scan.rawOcrText && scan.rawOcrText !== "OCR_NOT_CONFIGURED" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>OCR Result</Text>
            {scan.parsedBusinessName ? (
              <View style={styles.parsedNameRow}>
                <Feather name="building" size={14} color={COLORS.cyan} />
                <Text style={styles.parsedName}>{scan.parsedBusinessName}</Text>
                {scan.confidenceScore != null && (
                  <Text style={styles.confidenceChip}>{Math.round(scan.confidenceScore * 100)}% conf</Text>
                )}
              </View>
            ) : null}
            <Text style={styles.rawOcr} numberOfLines={4}>{scan.rawOcrText}</Text>
          </View>
        )}

        {scan.rawOcrText === "OCR_NOT_CONFIGURED" && (
          <View style={[styles.card, { borderColor: COLORS.red + "44" }]}>
            <Text style={[styles.cardTitle, { color: COLORS.red }]}>OCR Not Configured</Text>
            <Text style={styles.rawOcr}>OpenAI API key is required for OCR. You can still manually search for a Google Places match below.</Text>
          </View>
        )}

        {scan.processingStatus !== "PARSING" && scan.reviewStatus === "PENDING_REVIEW" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Find Google Places Match</Text>
            <View style={styles.queryRow}>
              <TextInput
                style={styles.queryInput}
                value={matchQuery}
                onChangeText={setMatchQuery}
                placeholder="Search business name…"
                placeholderTextColor={COLORS.textDim}
              />
              <TouchableOpacity
                style={[styles.matchBtn, (!matchQuery.trim() || isMatching) && styles.btnDisabled]}
                onPress={handleRunMatch}
                disabled={!matchQuery.trim() || isMatching}
                activeOpacity={0.8}
              >
                {isMatching ? <ActivityIndicator size="small" color={COLORS.navyDark} /> : <Feather name="search" size={16} color={COLORS.navyDark} />}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {candidates.length > 0 && scan.reviewStatus === "PENDING_REVIEW" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Places Candidates</Text>
            {candidates.map((c, i) => {
              const isSelected = selectedCandidate?.placeId === c.placeId;
              return (
                <TouchableOpacity
                  key={c.placeId}
                  style={[styles.candidateRow, isSelected && styles.candidateRowSelected, i < candidates.length - 1 && styles.candidateBorder]}
                  onPress={() => setSelectedCandidate(isSelected ? null : c)}
                  activeOpacity={0.8}
                >
                  <View style={styles.candidateLeft}>
                    <Text style={styles.candidateName} numberOfLines={1}>{c.name}</Text>
                    {c.formattedAddress ? <Text style={styles.candidateAddr} numberOfLines={1}>{c.formattedAddress}</Text> : null}
                    {c.website ? <Text style={styles.candidateWebsite} numberOfLines={1}>{c.website}</Text> : null}
                  </View>
                  <View style={styles.candidateRight}>
                    <Text style={[styles.confidenceChip, { marginBottom: 4 }]}>{Math.round(c.confidence * 100)}%</Text>
                    {isSelected && <Feather name="check-circle" size={18} color={COLORS.cyan} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {scan.reviewStatus === "PENDING_REVIEW" && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Enrich Existing Master Org (Optional)</Text>
            <Text style={styles.cardSubtitle}>If this facility already exists in the master database, paste its ID here to enrich it instead of creating a new record.</Text>
            <TextInput
              style={styles.queryInput}
              value={targetMasterOrgId}
              onChangeText={setTargetMasterOrgId}
              placeholder="Master Organization ID…"
              placeholderTextColor={COLORS.textDim}
              autoCapitalize="none"
            />
          </View>
        )}

        {isDone && scan.createdMasterOrgId && (
          <View style={[styles.card, { borderColor: COLORS.emerald + "44" }]}>
            <Text style={[styles.cardTitle, { color: COLORS.emerald }]}>
              {scan.reviewStatus === "APPROVED" ? "Approved" : "Processed"}
            </Text>
            <View style={styles.parsedNameRow}>
              <Feather name="database" size={14} color={COLORS.emerald} />
              <Text style={styles.parsedName}>{scan.createdMasterOrgName ?? scan.createdMasterOrgId}</Text>
            </View>
            <TouchableOpacity
              style={styles.viewMasterOrgBtn}
              onPress={() => router.push(`/admin/master-organizations/${scan.createdMasterOrgId}` as Href)}
              activeOpacity={0.8}
            >
              <Text style={styles.viewMasterOrgBtnText}>View in Master Orgs</Text>
              <Feather name="arrow-right" size={14} color={COLORS.cyan} />
            </TouchableOpacity>
          </View>
        )}

        {isDone && scan.reviewStatus === "REJECTED" && (
          <View style={[styles.card, { borderColor: COLORS.red + "44" }]}>
            <Text style={[styles.cardTitle, { color: COLORS.red }]}>Rejected</Text>
            <Text style={styles.cardSubtitle}>This scan was rejected and no master organization record was created or modified.</Text>
          </View>
        )}

        {!isDone && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.approveBtn, (isApproving || (!selectedCandidate && !targetMasterOrgId.trim())) && styles.btnDisabled]}
              onPress={handleApprove}
              disabled={isApproving || (!selectedCandidate && !targetMasterOrgId.trim())}
              activeOpacity={0.8}
            >
              {isApproving
                ? <ActivityIndicator size="small" color={COLORS.navyDark} />
                : <Feather name="check" size={16} color={COLORS.navyDark} />
              }
              <Text style={styles.approveBtnText}>
                {targetMasterOrgId.trim() ? "Approve & Enrich" : "Approve & Create"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectBtn, isRejecting && styles.btnDisabled]}
              onPress={handleReject}
              disabled={isRejecting}
              activeOpacity={0.8}
            >
              {isRejecting
                ? <ActivityIndicator size="small" color={COLORS.red} />
                : <Feather name="x" size={16} color={COLORS.red} />
              }
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 40 },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium" },

  infoCard: {
    backgroundColor: COLORS.amber + "15",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.amber + "33",
  },
  infoText: { color: COLORS.amber, fontSize: 13, fontFamily: "Inter_400Regular" },

  card: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  cardSubtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginTop: -4,
  },

  parsedNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  parsedName: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_600SemiBold", flex: 1 },
  confidenceChip: {
    backgroundColor: COLORS.cyan + "22",
    color: COLORS.cyan,
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  rawOcr: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },

  queryRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  queryInput: {
    flex: 1,
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  matchBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: COLORS.cyan,
    alignItems: "center",
    justifyContent: "center",
  },

  candidateRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    gap: 10,
  },
  candidateRowSelected: {
    backgroundColor: COLORS.cyan + "12",
    marginHorizontal: -14,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  candidateBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder,
  },
  candidateLeft: { flex: 1, gap: 3 },
  candidateRight: { alignItems: "flex-end" },
  candidateName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_500Medium" },
  candidateAddr: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular" },
  candidateWebsite: { color: COLORS.cyan, fontSize: 11, fontFamily: "Inter_400Regular" },

  viewMasterOrgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  viewMasterOrgBtnText: { color: COLORS.cyan, fontSize: 13, fontFamily: "Inter_500Medium" },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  approveBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.cyan,
    borderRadius: 12,
    paddingVertical: 14,
  },
  approveBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.red + "18",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  rejectBtnText: { color: COLORS.red, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  btnDisabled: { opacity: 0.4 },
});
