import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, TextInput, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import type { Href } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";
import { getStorageUrl } from "@/hooks/useApi";

type PlaceCandidate = {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  phoneNumber: string | null;
  website: string | null;
  placeCategory: string | null;
  confidence: number;
};

type OrgScan = {
  id: string;
  processingStatus: string;
  reviewStatus: string;
  imageUrl: string;
  parsedBusinessName: string | null;
  rawOcrText: string | null;
  matchedPlaceJson: PlaceCandidate[] | null;
  selectedMatchJson: PlaceCandidate | null;
  confidenceScore: number | null;
  organizationId: string | null;
  linkedOrganizationName: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  UPLOADED: COLORS.textDim,
  PARSING: COLORS.amber,
  PARSED: COLORS.blue,
  MATCHED: COLORS.emerald,
  FAILED: COLORS.red,
};

function confidenceColor(score: number) {
  if (score >= 0.6) return COLORS.emerald;
  if (score >= 0.3) return COLORS.amber;
  return COLORS.textDim;
}

export default function AdminLogoScanReviewScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { workspaceId, scanId } = useLocalSearchParams<{ workspaceId: string; scanId: string }>();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const [selectedCandidate, setSelectedCandidate] = useState<PlaceCandidate | null>(null);
  const [matchQuery, setMatchQuery] = useState("");
  const [isMatching, setIsMatching] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const basePath = `/admin/workspaces/${workspaceId}/organization-scans`;

  const { data: scan, isLoading, refetch } = useQuery<OrgScan>({
    queryKey: ["adminOrgScan", workspaceId, scanId],
    queryFn: () => adminFetch(`${basePath}/${scanId}`),
    enabled: isAdminAuthenticated && !!workspaceId && !!scanId,
    refetchInterval: (query) => {
      const d = query.state.data as OrgScan | undefined;
      return d?.processingStatus === "PARSING" ? 2000 : false;
    },
  });

  useEffect(() => {
    if (scan?.matchedPlaceJson?.length && !selectedCandidate) {
      setSelectedCandidate(scan.matchedPlaceJson[0]);
    }
    if (scan?.parsedBusinessName && !matchQuery) {
      setMatchQuery(scan.parsedBusinessName);
    }
  }, [scan?.id]);

  const handleFindMatches = async () => {
    setIsMatching(true);
    setActionError(null);
    try {
      await adminFetch(`${basePath}/${scanId}/match`, {
        method: "POST",
        body: JSON.stringify({ query: matchQuery || scan?.parsedBusinessName }),
      });
      refetch();
    } catch (err: any) {
      setActionError(err.message || "Match failed");
    } finally {
      setIsMatching(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedCandidate) {
      Alert.alert("No Match Selected", "Please select a Place match before approving.");
      return;
    }
    setIsApproving(true);
    setActionError(null);
    try {
      await adminFetch(`${basePath}/${scanId}/approve`, {
        method: "POST",
        body: JSON.stringify({ selectedMatch: selectedCandidate }),
      });
      qc.invalidateQueries({ queryKey: ["adminOrgScan", workspaceId, scanId] });
      Alert.alert("Approved", `Organization "${selectedCandidate.name}" has been created in this workspace.`, [
        { text: "Done", onPress: () => router.replace(`/admin/workspaces/${workspaceId}` as Href) },
      ]);
    } catch (err: any) {
      setActionError(err.message || "Approve failed");
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    Alert.alert("Reject Scan", "Mark this scan as rejected? No organization will be created.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reject", style: "destructive", onPress: async () => {
          setIsRejecting(true);
          try {
            await adminFetch(`${basePath}/${scanId}/reject`, { method: "POST", body: JSON.stringify({}) });
            router.replace(`/admin/workspaces/${workspaceId}` as Href);
          } catch (err: any) {
            setActionError(err.message || "Reject failed");
          } finally {
            setIsRejecting(false);
          }
        },
      },
    ]);
  };

  const isDone = scan?.reviewStatus === "APPROVED" || scan?.reviewStatus === "REJECTED";

  if (isLoading) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[
          { label: "Workspaces", href: "/admin/workspaces" as Href },
          { label: "Support Panel", href: `/admin/workspaces/${workspaceId}` as Href },
          { label: "Logo Scan" },
        ]} />
        <View style={styles.center}><ActivityIndicator color={COLORS.amber} /></View>
      </View>
    );
  }

  if (!scan) {
    return (
      <View style={styles.container}>
        <AdminHeader breadcrumbs={[
          { label: "Workspaces", href: "/admin/workspaces" as Href },
          { label: "Support Panel", href: `/admin/workspaces/${workspaceId}` as Href },
          { label: "Logo Scan" },
        ]} />
        <View style={styles.center}><Text style={styles.errorText}>Scan not found.</Text></View>
      </View>
    );
  }

  const candidates = (scan.matchedPlaceJson ?? []) as PlaceCandidate[];

  return (
    <View style={styles.container}>
      <AdminHeader breadcrumbs={[
        { label: "Workspaces", href: "/admin/workspaces" as Href },
        { label: "Support Panel", href: `/admin/workspaces/${workspaceId}` as Href },
        { label: "Logo Scan" },
      ]} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {scan.imageUrl && (
          <Image
            source={{ uri: getStorageUrl(scan.imageUrl) }}
            style={styles.image}
            resizeMode="contain"
          />
        )}

        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: STATUS_COLORS[scan.processingStatus] ?? COLORS.textDim }]} />
          <Text style={[styles.statusText, { color: STATUS_COLORS[scan.processingStatus] ?? COLORS.textDim }]}>
            {scan.processingStatus}
          </Text>
          {scan.reviewStatus !== "PENDING_REVIEW" && (
            <View style={[styles.reviewBadge, { borderColor: scan.reviewStatus === "APPROVED" ? COLORS.emerald + "55" : COLORS.red + "55" }]}>
              <Text style={[styles.reviewBadgeText, { color: scan.reviewStatus === "APPROVED" ? COLORS.emerald : COLORS.red }]}>
                {scan.reviewStatus}
              </Text>
            </View>
          )}
        </View>

        {scan.processingStatus === "PARSING" && (
          <View style={styles.infoCard}>
            <ActivityIndicator size="small" color={COLORS.amber} />
            <Text style={styles.infoText}>AI is reading the image…</Text>
          </View>
        )}

        {scan.parsedBusinessName && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>OCR Result</Text>
            <View style={styles.card}>
              <Text style={styles.businessName}>{scan.parsedBusinessName}</Text>
              {scan.confidenceScore != null && (
                <Text style={[styles.confidenceLabel, { color: confidenceColor(scan.confidenceScore) }]}>
                  {Math.round(scan.confidenceScore * 100)}% confidence
                </Text>
              )}
            </View>
          </View>
        )}

        {!isDone && scan.processingStatus !== "PARSING" && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Find Google Places Match</Text>
            <View style={styles.matchRow}>
              <TextInput
                style={styles.queryInput}
                value={matchQuery}
                onChangeText={setMatchQuery}
                placeholder="Business name…"
                placeholderTextColor={COLORS.textDim}
              />
              <TouchableOpacity
                style={[styles.matchBtn, isMatching && styles.matchBtnDisabled]}
                onPress={handleFindMatches}
                disabled={isMatching}
              >
                {isMatching ? (
                  <ActivityIndicator size="small" color={COLORS.navyDark} />
                ) : (
                  <Feather name="search" size={16} color={COLORS.navyDark} />
                )}
                <Text style={styles.matchBtnText}>{isMatching ? "Searching…" : "Search"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {candidates.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Candidates ({candidates.length})</Text>
            {candidates.map((c) => {
              const isSelected = selectedCandidate?.placeId === c.placeId;
              return (
                <TouchableOpacity
                  key={c.placeId}
                  style={[styles.candidateCard, isSelected && styles.candidateCardSelected]}
                  onPress={() => !isDone && setSelectedCandidate(c)}
                  activeOpacity={0.8}
                >
                  <View style={styles.candidateHeader}>
                    <Text style={styles.candidateName} numberOfLines={1}>{c.name}</Text>
                    <Text style={[styles.candidateConf, { color: confidenceColor(c.confidence) }]}>
                      {Math.round(c.confidence * 100)}%
                    </Text>
                  </View>
                  {c.formattedAddress && (
                    <Text style={styles.candidateMeta} numberOfLines={1}>{c.formattedAddress}</Text>
                  )}
                  {c.phoneNumber && (
                    <Text style={styles.candidateMeta}>{c.phoneNumber}</Text>
                  )}
                  {c.website && (
                    <Text style={styles.candidateMeta} numberOfLines={1}>{c.website}</Text>
                  )}
                  {isSelected && (
                    <View style={styles.selectedBadge}>
                      <Feather name="check" size={10} color={COLORS.amber} />
                      <Text style={styles.selectedBadgeText}>Selected</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {!!actionError && (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.errorCardText}>{actionError}</Text>
          </View>
        )}

        {!isDone && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.rejectBtn, isRejecting && styles.btnDisabled]}
              onPress={handleReject}
              disabled={isRejecting || isApproving}
            >
              <Feather name="x" size={16} color={COLORS.red} />
              <Text style={styles.rejectBtnText}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.approveBtn,
                (!selectedCandidate || isApproving) && styles.btnDisabled,
              ]}
              onPress={handleApprove}
              disabled={!selectedCandidate || isApproving || isRejecting}
            >
              {isApproving ? (
                <ActivityIndicator size="small" color={COLORS.navyDark} />
              ) : (
                <Feather name="check" size={16} color={COLORS.navyDark} />
              )}
              <Text style={styles.approveBtnText}>
                {isApproving ? "Creating…" : "Create Organization"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {isDone && (
          <View style={styles.doneCard}>
            <Feather
              name={scan.reviewStatus === "APPROVED" ? "check-circle" : "x-circle"}
              size={20}
              color={scan.reviewStatus === "APPROVED" ? COLORS.emerald : COLORS.red}
            />
            <Text style={[styles.doneText, { color: scan.reviewStatus === "APPROVED" ? COLORS.emerald : COLORS.red }]}>
              {scan.reviewStatus === "APPROVED"
                ? `Organization "${scan.linkedOrganizationName ?? "unknown"}" was created.`
                : "Scan was rejected."}
            </Text>
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
  errorText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },

  image: {
    width: "100%",
    height: 200,
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: COLORS.navyCard,
  },

  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  reviewBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: 4,
  },
  reviewBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },

  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.amber + "44",
  },
  infoText: { color: COLORS.amber, fontSize: 13, fontFamily: "Inter_400Regular" },

  section: { marginBottom: 16 },
  sectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
  },
  businessName: { color: COLORS.text, fontSize: 18, fontFamily: "Inter_600SemiBold", marginBottom: 4 },
  confidenceLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },

  matchRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  queryInput: {
    flex: 1,
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  matchBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.amber,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  matchBtnDisabled: { opacity: 0.5 },
  matchBtnText: { color: COLORS.navyDark, fontSize: 14, fontFamily: "Inter_600SemiBold" },

  candidateCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 12,
    marginBottom: 8,
  },
  candidateCardSelected: { borderColor: COLORS.amber, backgroundColor: "#1A1200" },
  candidateHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  candidateName: { color: COLORS.text, fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  candidateConf: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginLeft: 8 },
  candidateMeta: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#3D2A00",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  selectedBadgeText: { color: COLORS.amber, fontSize: 11, fontFamily: "Inter_600SemiBold" },

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.red + "18",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  errorCardText: { color: COLORS.red, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },

  actionRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.red + "55",
    borderRadius: 12,
    paddingVertical: 14,
  },
  rejectBtnText: { color: COLORS.red, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  approveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.amber,
    borderRadius: 12,
    paddingVertical: 14,
  },
  approveBtnText: { color: COLORS.navyDark, fontSize: 15, fontFamily: "Inter_700Bold" },
  btnDisabled: { opacity: 0.4 },

  doneCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginTop: 8,
  },
  doneText: { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
});
