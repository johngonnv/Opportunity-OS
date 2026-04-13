import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import {
  useOrganizationPainPoints,
  useRunCmsSuggestions,
  useApprovePainPoint,
  useRejectPainPoint,
  type PainPoint,
} from "@/hooks/useApi";
import { Card } from "@/components/ui/Card";

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: COLORS.red,
  HIGH: "#F97316",
  MEDIUM: COLORS.amber,
  LOW: COLORS.textDim,
};

const SEVERITY_LABEL: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const CATEGORY_LABEL: Record<string, string> = {
  ED_BOARDING: "ED Boarding",
  DISCHARGE_BOTTLENECK: "Discharge Bottleneck",
  CARE_TRANSITION_RISK: "Care Transition Risk",
  STAFFING_PRESSURE: "Staffing Pressure",
  CAPACITY_CONSTRAINT: "Capacity Constraint",
  REVENUE_CYCLE: "Revenue Cycle",
  DOCUMENTATION_BURDEN: "Documentation Burden",
  PATIENT_EXPERIENCE: "Patient Experience",
  OTHER: "Other",
};

function formatSignalKey(key: string | null): string | null {
  if (!key) return null;
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface PainPointRowProps {
  pp: PainPoint;
  orgId: string;
  canReview: boolean;
  isSuggested: boolean;
}

function PainPointRow({ pp, orgId, canReview, isSuggested }: PainPointRowProps) {
  const [reviewing, setReviewing] = useState(false);
  const approve = useApprovePainPoint(orgId);
  const reject = useRejectPainPoint(orgId);
  const severityColor = SEVERITY_COLOR[pp.severity] ?? COLORS.textDim;

  const handleApprove = () => {
    if (reviewing) return;
    const doApprove = async () => {
      setReviewing(true);
      try {
        await approve.mutateAsync({ painPointId: pp.id });
      } finally {
        setReviewing(false);
      }
    };
    if (Platform.OS === "web") {
      doApprove();
    } else {
      Alert.alert("Approve Pain Point", "Mark as Verified?", [
        { text: "Cancel", style: "cancel" },
        { text: "Approve", onPress: doApprove },
      ]);
    }
  };

  const handleReject = () => {
    if (reviewing) return;
    const doReject = async () => {
      setReviewing(true);
      try {
        await reject.mutateAsync({ painPointId: pp.id });
      } finally {
        setReviewing(false);
      }
    };
    if (Platform.OS === "web") {
      doReject();
    } else {
      Alert.alert("Reject Pain Point", "Mark as Rejected?", [
        { text: "Cancel", style: "cancel" },
        { text: "Reject", style: "destructive", onPress: doReject },
      ]);
    }
  };

  return (
    <View style={styles.ppRow}>
      <View style={styles.ppRowTop}>
        <View style={[styles.severityDot, { backgroundColor: severityColor }]} />
        <View style={styles.ppContent}>
          <Text style={styles.ppCategory}>
            {CATEGORY_LABEL[pp.painPointCategory] ?? pp.painPointCategory}
          </Text>
          {pp.painPointStatement ? (
            <Text style={styles.ppStatement} numberOfLines={3}>{pp.painPointStatement}</Text>
          ) : null}
          {isSuggested && pp.linkedCmsSignalKey && (
            <View style={styles.triggerRow}>
              <Feather name="zap" size={10} color={COLORS.blue} />
              <Text style={styles.triggerText}>
                Suggested from {formatSignalKey(pp.linkedCmsSignalKey)}
              </Text>
            </View>
          )}
        </View>
        <View style={[styles.severityBadge, { backgroundColor: severityColor + "20", borderColor: severityColor + "44" }]}>
          <Text style={[styles.severityText, { color: severityColor }]}>
            {SEVERITY_LABEL[pp.severity] ?? pp.severity}
          </Text>
        </View>
      </View>

      {canReview && (pp.verificationStatus === "SUGGESTED" || pp.verificationStatus === "PENDING_REVIEW") && (
        <View style={styles.reviewActions}>
          {reviewing ? (
            <ActivityIndicator size="small" color={COLORS.emerald} />
          ) : (
            <>
              <TouchableOpacity style={styles.approveBtn} onPress={handleApprove} activeOpacity={0.8}>
                <Feather name="check" size={13} color={COLORS.emerald} />
                <Text style={[styles.reviewBtnText, { color: COLORS.emerald }]}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectBtn} onPress={handleReject} activeOpacity={0.8}>
                <Feather name="x" size={13} color={COLORS.red} />
                <Text style={[styles.reviewBtnText, { color: COLORS.red }]}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}
    </View>
  );
}

interface Props {
  orgId: string;
  isAdmin: boolean;
}

export function PainPointsCard({ orgId, isAdmin }: Props) {
  const { data, isLoading } = useOrganizationPainPoints(orgId);
  const runSuggestions = useRunCmsSuggestions(orgId);
  const [activeTab, setActiveTab] = useState<"verified" | "suggested">("verified");

  const allPoints = data?.painPoints ?? [];
  const verified = allPoints.filter(pp => pp.verificationStatus === "VERIFIED");
  const suggested = allPoints.filter(
    pp => pp.verificationStatus === "SUGGESTED" || pp.verificationStatus === "PENDING_REVIEW",
  );
  const needsReview = suggested.length > 0;

  const displayPoints = activeTab === "verified" ? verified : suggested;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Feather name="alert-circle" size={14} color={COLORS.amber} />
          <Text style={styles.cardTitle}>Pain Points</Text>
          {needsReview && isAdmin && (
            <View style={styles.needsReviewDot} />
          )}
        </View>
        <View style={styles.countBadges}>
          {verified.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: COLORS.emerald + "20", borderColor: COLORS.emerald + "33" }]}>
              <Text style={[styles.countBadgeText, { color: COLORS.emerald }]}>{verified.length} verified</Text>
            </View>
          )}
          {suggested.length > 0 && (
            <View style={[styles.countBadge, { backgroundColor: COLORS.amber + "20", borderColor: COLORS.amber + "33" }]}>
              <Text style={[styles.countBadgeText, { color: COLORS.amber }]}>{suggested.length} suggested</Text>
            </View>
          )}
        </View>
      </View>

      <Card>
        {isLoading ? (
          <ActivityIndicator color={COLORS.amber} />
        ) : (
          <>
            <View style={styles.tabs}>
              <TouchableOpacity
                style={[styles.tab, activeTab === "verified" && styles.tabActive]}
                onPress={() => setActiveTab("verified")}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === "verified" && styles.tabTextActive]}>
                  Verified {verified.length > 0 ? `(${verified.length})` : ""}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === "suggested" && styles.tabActive]}
                onPress={() => setActiveTab("suggested")}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabText, activeTab === "suggested" && styles.tabTextActive]}>
                  Suggested {suggested.length > 0 ? `(${suggested.length})` : ""}
                </Text>
                {needsReview && isAdmin && <View style={styles.tabDot} />}
              </TouchableOpacity>
            </View>

            {displayPoints.length === 0 ? (
              <View style={styles.emptyState}>
                {activeTab === "verified" ? (
                  <>
                    <Text style={styles.emptyText}>No verified pain points yet.</Text>
                    {suggested.length > 0 && (
                      <TouchableOpacity onPress={() => setActiveTab("suggested")} activeOpacity={0.8}>
                        <Text style={styles.emptyLink}>Review {suggested.length} suggestion{suggested.length !== 1 ? "s" : ""} →</Text>
                      </TouchableOpacity>
                    )}
                    {isAdmin && suggested.length === 0 && (
                      <TouchableOpacity
                        style={styles.runBtn}
                        onPress={() => runSuggestions.mutate()}
                        disabled={runSuggestions.isPending}
                        activeOpacity={0.8}
                      >
                        {runSuggestions.isPending ? (
                          <ActivityIndicator size="small" color={COLORS.emerald} />
                        ) : (
                          <>
                            <Feather name="zap" size={12} color={COLORS.emerald} />
                            <Text style={styles.runBtnText}>Run CMS Suggestions</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyText}>No suggestions awaiting review.</Text>
                    {isAdmin && (
                      <TouchableOpacity
                        style={styles.runBtn}
                        onPress={() => runSuggestions.mutate()}
                        disabled={runSuggestions.isPending}
                        activeOpacity={0.8}
                      >
                        {runSuggestions.isPending ? (
                          <ActivityIndicator size="small" color={COLORS.emerald} />
                        ) : (
                          <>
                            <Feather name="refresh-cw" size={12} color={COLORS.emerald} />
                            <Text style={styles.runBtnText}>Refresh Suggestions</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            ) : (
              <>
                {displayPoints.map((pp, i) => (
                  <View key={pp.id}>
                    {i > 0 && <View style={styles.divider} />}
                    <PainPointRow
                      pp={pp}
                      orgId={orgId}
                      canReview={isAdmin}
                      isSuggested={activeTab === "suggested"}
                    />
                  </View>
                ))}
                {activeTab === "suggested" && isAdmin && suggested.length > 0 && (
                  <TouchableOpacity
                    style={[styles.runBtn, { marginTop: 12 }]}
                    onPress={() => runSuggestions.mutate()}
                    disabled={runSuggestions.isPending}
                    activeOpacity={0.8}
                  >
                    {runSuggestions.isPending ? (
                      <ActivityIndicator size="small" color={COLORS.emerald} />
                    ) : (
                      <>
                        <Feather name="refresh-cw" size={12} color={COLORS.emerald} />
                        <Text style={styles.runBtnText}>Refresh Suggestions</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </>
            )}
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cardTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
  },
  needsReviewDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: COLORS.red,
    marginLeft: 2,
  },
  countBadges: {
    flexDirection: "row",
    gap: 6,
  },
  countBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  countBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  tabs: {
    flexDirection: "row",
    marginBottom: 14,
    backgroundColor: COLORS.navySurface,
    borderRadius: 8,
    padding: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    alignItems: "center",
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
  },
  tabActive: {
    backgroundColor: COLORS.navyCard,
  },
  tabText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.textDim,
  },
  tabTextActive: {
    color: COLORS.text,
    fontFamily: "Inter_600SemiBold",
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.red,
  },
  ppRow: {
    paddingVertical: 10,
  },
  ppRowTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
    flexShrink: 0,
  },
  ppContent: {
    flex: 1,
    gap: 4,
  },
  ppCategory: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
  },
  ppStatement: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  triggerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  triggerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.blue,
  },
  severityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
  severityText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    letterSpacing: 0.2,
  },
  reviewActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
    marginLeft: 18,
  },
  approveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.emerald + "18",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.emerald + "44",
  },
  rejectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: COLORS.red + "18",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  reviewBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.navyBorder,
    marginHorizontal: 0,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textDim,
    textAlign: "center",
  },
  emptyLink: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.blue,
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.emerald + "15",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignSelf: "center",
  },
  runBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.emerald,
  },
});
