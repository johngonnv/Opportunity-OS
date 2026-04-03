import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { adminFetch } from "@/hooks/useAdminAuth";
import { useAdminAuthContext } from "@/contexts/AdminAuthContext";

interface StructureScan {
  id: string;
  scanStatus: string;
  reviewStatus: string;
  organizationId: string;
  workspaceId: string;
  organizationName: string | null;
  suggestedParentName: string | null;
  suggestedParentMasterOrganizationId: string | null;
  suggestedStructureType: string | null;
  confidenceScore: number | null;
  evidenceSummary: string | null;
  llmReasoningSummary: string | null;
  createdAt: string;
  updatedAt: string;
}

const SCAN_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  PENDING: { color: COLORS.textDim, label: "Pending" },
  MASTER_MATCHED: { color: COLORS.amber, label: "Master Matched" },
  EXTERNAL_SEARCHED: { color: COLORS.amber, label: "Externally Searched" },
  LLM_REVIEWED: { color: COLORS.amber, label: "AI Reviewed" },
  COMPLETED: { color: COLORS.emerald, label: "Completed" },
  FAILED: { color: COLORS.red, label: "Failed" },
};

const REVIEW_STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  PENDING_REVIEW: { color: COLORS.amber, label: "Pending Review" },
  APPROVED: { color: COLORS.emerald, label: "Approved" },
  REJECTED: { color: COLORS.red, label: "Rejected" },
};

const STRUCTURE_TYPE_LABELS: Record<string, string> = {
  SUBSIDIARY: "Subsidiary",
  REGIONAL: "Regional Branch",
  DBA: "DBA",
  AFFILIATED: "Affiliated",
  PARENT: "Parent Company",
  STANDALONE: "Standalone",
};

export default function AdminStructureScanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isAdminAuthenticated } = useAdminAuthContext();

  const { data, isLoading, isError } = useQuery<{ scan: StructureScan }>({
    queryKey: ["adminStructureScan", id],
    queryFn: () => adminFetch(`/admin/stats/structure-scans/${id}`),
    enabled: isAdminAuthenticated && !!id,
  });

  const scan = data?.scan;

  const scanCfg = scan ? (SCAN_STATUS_CONFIG[scan.scanStatus] ?? { color: COLORS.textDim, label: scan.scanStatus }) : null;
  const reviewCfg = scan ? (REVIEW_STATUS_CONFIG[scan.reviewStatus] ?? { color: COLORS.textDim, label: scan.reviewStatus }) : null;

  return (
    <View style={styles.container}>
      <AdminHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/admin/(tabs)/dashboard" },
          { label: "Structure Scan" },
        ]}
      />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.amber} />
        </View>
      ) : isError || !scan ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>Scan not found.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.orgRow}>
            <Feather name="briefcase" size={16} color={COLORS.textMuted} />
            <Text style={styles.orgName} numberOfLines={2}>{scan.organizationName ?? "Unknown Organization"}</Text>
          </View>

          <View style={styles.badgesRow}>
            {scanCfg && (
              <View style={[styles.badge, { borderColor: scanCfg.color + "55" }]}>
                <Text style={[styles.badgeText, { color: scanCfg.color }]}>{scanCfg.label}</Text>
              </View>
            )}
            {reviewCfg && (
              <View style={[styles.badge, { borderColor: reviewCfg.color + "55" }]}>
                <Text style={[styles.badgeText, { color: reviewCfg.color }]}>{reviewCfg.label}</Text>
              </View>
            )}
          </View>

          {scan.suggestedParentName && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Suggested Parent</Text>
              <View style={styles.card}>
                <View style={styles.row}>
                  <Feather name="arrow-up-circle" size={14} color={COLORS.blue} />
                  <Text style={styles.rowValue}>{scan.suggestedParentName}</Text>
                </View>
                {scan.suggestedStructureType && (
                  <View style={[styles.row, { marginTop: 6 }]}>
                    <Feather name="layers" size={14} color={COLORS.textMuted} />
                    <Text style={styles.rowMeta}>
                      {STRUCTURE_TYPE_LABELS[scan.suggestedStructureType] ?? scan.suggestedStructureType}
                    </Text>
                  </View>
                )}
                {scan.confidenceScore != null && (
                  <View style={[styles.row, { marginTop: 6 }]}>
                    <Feather name="bar-chart-2" size={14} color={COLORS.textMuted} />
                    <Text style={styles.rowMeta}>
                      Confidence: {Math.round(scan.confidenceScore * 100)}%
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          {scan.llmReasoningSummary && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>AI Reasoning</Text>
              <View style={styles.card}>
                <Text style={styles.reasoningText}>{scan.llmReasoningSummary}</Text>
              </View>
            </View>
          )}

          {scan.evidenceSummary && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Evidence</Text>
              <View style={styles.card}>
                <Text style={styles.reasoningText}>{scan.evidenceSummary}</Text>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Scan Info</Text>
            <View style={styles.card}>
              <View style={styles.metaRow}>
                <Text style={styles.metaKey}>Scan ID</Text>
                <Text style={styles.metaValue} numberOfLines={1}>{scan.id}</Text>
              </View>
              <View style={[styles.metaRow, { marginTop: 6 }]}>
                <Text style={styles.metaKey}>Created</Text>
                <Text style={styles.metaValue}>{new Date(scan.createdAt).toLocaleString()}</Text>
              </View>
              <View style={[styles.metaRow, { marginTop: 6 }]}>
                <Text style={styles.metaKey}>Updated</Text>
                <Text style={styles.metaValue}>{new Date(scan.updatedAt).toLocaleString()}</Text>
              </View>
            </View>
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navyDark },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: COLORS.textMuted, fontSize: 14, fontFamily: "Inter_400Regular" },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  orgRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  orgName: {
    color: COLORS.text,
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },

  badgesRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  section: { marginBottom: 16 },
  sectionTitle: {
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

  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowValue: { color: COLORS.text, fontSize: 15, fontFamily: "Inter_500Medium", flex: 1 },
  rowMeta: { color: COLORS.textMuted, fontSize: 13, fontFamily: "Inter_400Regular" },

  reasoningText: {
    color: COLORS.textDim,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },

  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  metaKey: { color: COLORS.textMuted, fontSize: 12, fontFamily: "Inter_400Regular", width: 70 },
  metaValue: { color: COLORS.text, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, textAlign: "right" },
});
