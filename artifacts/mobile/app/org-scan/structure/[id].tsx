import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Alert,
  Switch,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  useStructureScan,
  useRunStructureScan,
  useApproveStructureScan,
  useRejectStructureScan,
} from "@/hooks/useApi";

type ScanStatus =
  | "PENDING"
  | "MASTER_MATCHED"
  | "EXTERNAL_SEARCHED"
  | "LLM_REVIEWED"
  | "COMPLETED"
  | "FAILED";

type ReviewStatus = "PENDING_REVIEW" | "APPROVED" | "REJECTED";

type Sibling = { id: string; canonicalName: string; websiteDomain: string | null };

const SCAN_STATUS_LABELS: Record<ScanStatus, string> = {
  PENDING: "Initializing…",
  MASTER_MATCHED: "Checking knowledge base…",
  EXTERNAL_SEARCHED: "Searching externally…",
  LLM_REVIEWED: "Analyzing with AI…",
  COMPLETED: "Review ready",
  FAILED: "Scan failed",
};

const STRUCTURE_TYPE_LABELS: Record<string, string> = {
  HEADQUARTERS: "Headquarters",
  SUBSIDIARY: "Subsidiary",
  DIVISION: "Division",
  BRANCH: "Branch",
  FRANCHISE: "Franchise",
  AFFILIATE: "Affiliate",
  PARENT: "Parent Company",
  STANDALONE: "Standalone",
};

function confidenceLevel(score: number | null | undefined): {
  label: string;
  color: string;
  level: "high" | "medium" | "low";
} {
  if (!score && score !== 0) return { label: "Unknown", color: COLORS.textDim, level: "low" };
  if (score >= 0.8) return { label: "High", color: COLORS.emerald, level: "high" };
  if (score >= 0.5) return { label: "Medium", color: COLORS.amber, level: "medium" };
  return { label: "Low", color: COLORS.red, level: "low" };
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function PipelineProgress({ status }: { status: ScanStatus }) {
  const steps: ScanStatus[] = [
    "MASTER_MATCHED",
    "EXTERNAL_SEARCHED",
    "LLM_REVIEWED",
    "COMPLETED",
  ];
  const activeIdx = steps.indexOf(status);

  return (
    <View style={styles.progressRow}>
      {steps.map((step, idx) => {
        const done = activeIdx > idx || status === "COMPLETED";
        const active = idx === activeIdx && status !== "COMPLETED";
        return (
          <React.Fragment key={step}>
            <View
              style={[
                styles.progressDot,
                done && styles.progressDotDone,
                active && styles.progressDotActive,
              ]}
            >
              {done && <Feather name="check" size={10} color={COLORS.navy} />}
              {active && <ActivityIndicator size="small" color={COLORS.navy} />}
            </View>
            {idx < steps.length - 1 && (
              <View style={[styles.progressLine, done && styles.progressLineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

export default function StructureScanReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: scan, isLoading } = useStructureScan(id);
  const runScan = useRunStructureScan(id);
  const approveScan = useApproveStructureScan(id);
  const rejectScan = useRejectStructureScan(id);

  const [addToMasterGraph, setAddToMasterGraph] = useState(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  if (isLoading) return <LoadingSpinner label="Loading scan…" />;
  if (!scan) {
    return (
      <View style={styles.notFoundContainer}>
        <Stack.Screen options={{ title: "Structure Scan" }} />
        <Feather name="alert-circle" size={40} color={COLORS.textDim} />
        <Text style={styles.notFoundText}>Scan not found</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const scanStatus: ScanStatus = scan.scanStatus;
  const reviewStatus: ReviewStatus = scan.reviewStatus;
  const confidence = confidenceLevel(scan.confidenceScore);
  const isRunning =
    scanStatus === "PENDING" ||
    scanStatus === "MASTER_MATCHED" ||
    scanStatus === "EXTERNAL_SEARCHED" ||
    scanStatus === "LLM_REVIEWED";
  const isCompleted = scanStatus === "COMPLETED";
  const isFailed = scanStatus === "FAILED";
  const isApproved = reviewStatus === "APPROVED";
  const isRejected = reviewStatus === "REJECTED";
  const isFinalized = isApproved || isRejected;
  const isPendingStart = scanStatus === "PENDING" && !running;
  const showLowConfidenceWarning = isCompleted && confidence.level === "low";
  const siblings: Sibling[] = scan.siblings || [];

  const handleRunScan = async () => {
    setRunning(true);
    setRunError(null);
    try {
      await runScan.mutateAsync();
    } catch (err: any) {
      setRunError(err.message || "Scan failed. Please try again.");
    } finally {
      setRunning(false);
    }
  };

  const handleApprove = async () => {
    setActionError(null);
    const doApprove = async () => {
      try {
        await approveScan.mutateAsync({ addToMasterGraph });
        showToast("Structure scan approved!");
        setTimeout(() => {
          if (scan.organizationId) {
            router.replace(`/organization/${scan.organizationId}`);
          } else {
            router.back();
          }
        }, 800);
      } catch (err: any) {
        setActionError(err.message || "Failed to approve scan.");
      }
    };
    if (Platform.OS === "web") {
      doApprove();
    } else {
      Alert.alert(
        "Approve Structure",
        `Apply the suggested hierarchy to ${scan.organizationName ?? "this organization"}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Approve", style: "default", onPress: doApprove },
        ]
      );
    }
  };

  const handleReject = () => {
    setActionError(null);
    const doReject = async () => {
      try {
        await rejectScan.mutateAsync();
        router.back();
      } catch (err: any) {
        setActionError(err.message || "Failed to reject scan.");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Reject this structure suggestion?")) doReject();
    } else {
      Alert.alert("Reject Structure", "Mark this scan as rejected?", [
        { text: "Reject", style: "destructive", onPress: doReject },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: "Structure Scan" }} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={[styles.iconCircle, isFailed && { backgroundColor: COLORS.red + "22" }]}>
            <Feather
              name="git-branch"
              size={32}
              color={isFailed ? COLORS.red : isApproved ? COLORS.emerald : COLORS.blue}
            />
          </View>
          <Text style={styles.orgName} numberOfLines={2}>
            {scan.organizationName ?? "Organization"}
          </Text>
          <Text style={styles.headerSub}>Hierarchy Structure Scan</Text>
          <View style={styles.statusRow}>
            <Badge
              label={
                isApproved
                  ? "Approved"
                  : isRejected
                  ? "Rejected"
                  : isFailed
                  ? "Failed"
                  : isCompleted
                  ? "Review Ready"
                  : isRunning
                  ? "Running…"
                  : "Pending"
              }
              color={
                isApproved
                  ? COLORS.emerald
                  : isRejected
                  ? COLORS.red
                  : isFailed
                  ? COLORS.red
                  : isCompleted
                  ? COLORS.blue
                  : COLORS.amber
              }
            />
          </View>
          <Text style={styles.dateText}>Started {formatDate(scan.createdAt)}</Text>
        </View>

        {/* PENDING — Start Scan */}
        {isPendingStart && !running && (
          <View style={styles.section}>
            <Card>
              <View style={styles.startHero}>
                <Feather name="zap" size={28} color={COLORS.blue} />
                <Text style={styles.startTitle}>Ready to Scan</Text>
                <Text style={styles.startDesc}>
                  The AI pipeline will search the knowledge base, external sources, and use LLM reasoning to suggest the best hierarchy placement for this organization.
                </Text>
                {!!runError && (
                  <View style={styles.inlineError}>
                    <Feather name="alert-circle" size={13} color={COLORS.red} />
                    <Text style={styles.inlineErrorText}>{runError}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.runBtn}
                  onPress={handleRunScan}
                  activeOpacity={0.8}
                >
                  <Feather name="play" size={16} color={COLORS.white} />
                  <Text style={styles.runBtnText}>Start Scan</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        )}

        {/* Pipeline Running */}
        {(isRunning || running) && (
          <View style={styles.section}>
            <Card>
              <View style={styles.runningBlock}>
                <ActivityIndicator size="large" color={COLORS.blue} />
                <Text style={styles.runningLabel}>
                  {running
                    ? SCAN_STATUS_LABELS[scanStatus] ?? "Running…"
                    : SCAN_STATUS_LABELS[scanStatus]}
                </Text>
                <Text style={styles.runningDesc}>
                  This may take up to a minute. The screen updates automatically.
                </Text>
                <PipelineProgress status={scanStatus} />
              </View>
            </Card>
          </View>
        )}

        {/* Failed State */}
        {isFailed && (
          <View style={styles.section}>
            <Card>
              <View style={styles.failedBlock}>
                <Feather name="alert-triangle" size={28} color={COLORS.red} />
                <Text style={styles.failedTitle}>Scan Failed</Text>
                <Text style={styles.failedDesc}>
                  The pipeline encountered an error. You can try running it again.
                </Text>
                {!!runError && (
                  <View style={styles.inlineError}>
                    <Feather name="alert-circle" size={13} color={COLORS.red} />
                    <Text style={styles.inlineErrorText}>{runError}</Text>
                  </View>
                )}
                <TouchableOpacity
                  style={styles.runBtn}
                  onPress={handleRunScan}
                  disabled={running}
                  activeOpacity={0.8}
                >
                  {running ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={16} color={COLORS.white} />
                      <Text style={styles.runBtnText}>Retry Scan</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        )}

        {/* Results — COMPLETED */}
        {isCompleted && (
          <>
            {/* Low confidence warning */}
            {showLowConfidenceWarning && !isFinalized && (
              <View style={styles.warningBanner}>
                <Feather name="alert-triangle" size={14} color={COLORS.amber} />
                <Text style={styles.warningText}>
                  Low confidence score — review this suggestion carefully before approving.
                </Text>
              </View>
            )}

            {/* Suggestion Card */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hierarchy Suggestion</Text>
              <Card>
                {scan.suggestedParentName ? (
                  <>
                    <View style={styles.infoRow}>
                      <Feather name="arrow-up-circle" size={14} color={COLORS.textMuted} style={styles.infoIcon} />
                      <View style={styles.infoContent}>
                        <Text style={styles.infoLabel}>Suggested Parent</Text>
                        <Text style={styles.infoValue}>{scan.suggestedParentName}</Text>
                      </View>
                    </View>

                    {scan.suggestedUltimateParentName &&
                      scan.suggestedUltimateParentName !== scan.suggestedParentName && (
                        <View style={[styles.infoRow, styles.infoRowDivider]}>
                          <Feather name="home" size={14} color={COLORS.textMuted} style={styles.infoIcon} />
                          <View style={styles.infoContent}>
                            <Text style={styles.infoLabel}>Ultimate Parent</Text>
                            <Text style={styles.infoValue}>{scan.suggestedUltimateParentName}</Text>
                          </View>
                        </View>
                      )}

                    {scan.suggestedStructureType && (
                      <View style={[styles.infoRow, styles.infoRowDivider]}>
                        <Feather name="layers" size={14} color={COLORS.textMuted} style={styles.infoIcon} />
                        <View style={styles.infoContent}>
                          <Text style={styles.infoLabel}>Structure Type</Text>
                          <Text style={styles.infoValue}>
                            {STRUCTURE_TYPE_LABELS[scan.suggestedStructureType] ??
                              scan.suggestedStructureType}
                          </Text>
                        </View>
                      </View>
                    )}

                    <View style={[styles.infoRow, styles.infoRowDivider]}>
                      <Feather name="bar-chart-2" size={14} color={COLORS.textMuted} style={styles.infoIcon} />
                      <View style={styles.infoContent}>
                        <Text style={styles.infoLabel}>Confidence</Text>
                        <View style={styles.confidenceRow}>
                          <Text style={[styles.infoValue, { color: confidence.color }]}>
                            {confidence.label}
                          </Text>
                          {scan.confidenceScore != null && (
                            <Text style={styles.confidencePct}>
                              {" "}({Math.round(scan.confidenceScore * 100)}%)
                            </Text>
                          )}
                        </View>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.noSuggestionBlock}>
                    <Feather name="help-circle" size={24} color={COLORS.textDim} />
                    <Text style={styles.noSuggestionText}>
                      No hierarchy suggestion found. The organization may be standalone or the pipeline could not determine a parent.
                    </Text>
                  </View>
                )}
              </Card>
            </View>

            {/* Evidence */}
            {(scan.evidenceSummary || scan.llmReasoningSummary) && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>AI Reasoning</Text>
                <Card>
                  {scan.evidenceSummary && (
                    <View style={styles.evidenceBlock}>
                      <Text style={styles.evidenceLabel}>Evidence</Text>
                      <Text style={styles.evidenceText}>{scan.evidenceSummary}</Text>
                    </View>
                  )}
                  {scan.llmReasoningSummary &&
                    !scan.llmReasoningSummary.startsWith("LLM not configured") &&
                    !scan.llmReasoningSummary.startsWith("LLM error") && (
                      <View style={[styles.evidenceBlock, scan.evidenceSummary && styles.evidenceDivider]}>
                        <Text style={styles.evidenceLabel}>LLM Analysis</Text>
                        <Text style={styles.evidenceText}>{scan.llmReasoningSummary}</Text>
                      </View>
                    )}
                </Card>
              </View>
            )}

            {/* Siblings */}
            {siblings.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Known Siblings ({siblings.length})
                </Text>
                <Card>
                  {siblings.map((sib, idx) => (
                    <View
                      key={sib.id}
                      style={[styles.siblingRow, idx > 0 && styles.siblingDivider]}
                    >
                      <Feather name="git-branch" size={13} color={COLORS.textDim} style={{ marginRight: 8 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.siblingName} numberOfLines={1}>
                          {sib.canonicalName}
                        </Text>
                        {sib.websiteDomain && (
                          <Text style={styles.siblingDomain} numberOfLines={1}>
                            {sib.websiteDomain}
                          </Text>
                        )}
                      </View>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            {/* Approve/Reject Actions (only if not finalized) */}
            {!isFinalized && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Decision</Text>
                <Card>
                  <View style={styles.masterGraphRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.masterGraphLabel}>Add to Master Graph</Text>
                      <Text style={styles.masterGraphDesc}>
                        Promote this organization into the global master hierarchy database.
                      </Text>
                    </View>
                    <Switch
                      value={addToMasterGraph}
                      onValueChange={setAddToMasterGraph}
                      trackColor={{ false: COLORS.navyBorder, true: COLORS.emerald + "88" }}
                      thumbColor={addToMasterGraph ? COLORS.emerald : COLORS.textDim}
                    />
                  </View>

                  {!!actionError && (
                    <View style={styles.inlineError}>
                      <Feather name="alert-circle" size={13} color={COLORS.red} />
                      <Text style={styles.inlineErrorText}>{actionError}</Text>
                    </View>
                  )}

                  <View style={styles.decisionActions}>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      onPress={handleReject}
                      disabled={rejectScan.isPending}
                      activeOpacity={0.8}
                    >
                      {rejectScan.isPending ? (
                        <ActivityIndicator size="small" color={COLORS.red} />
                      ) : (
                        <>
                          <Feather name="x-circle" size={16} color={COLORS.red} />
                          <Text style={styles.rejectBtnText}>Reject</Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.approveBtn,
                        !scan.suggestedParentName && { opacity: 0.5 },
                      ]}
                      onPress={handleApprove}
                      disabled={approveScan.isPending || !scan.suggestedParentName}
                      activeOpacity={0.8}
                    >
                      {approveScan.isPending ? (
                        <ActivityIndicator size="small" color={COLORS.white} />
                      ) : (
                        <>
                          <Feather name="check-circle" size={16} color={COLORS.white} />
                          <Text style={styles.approveBtnText}>Approve</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {!scan.suggestedParentName && (
                    <Text style={styles.noSuggestionHint}>
                      No hierarchy suggestion — you can only reject this scan.
                    </Text>
                  )}
                </Card>
              </View>
            )}

            {/* Finalized State */}
            {isFinalized && (
              <View style={styles.section}>
                <Card>
                  <View style={styles.finalizedBlock}>
                    <Feather
                      name={isApproved ? "check-circle" : "x-circle"}
                      size={32}
                      color={isApproved ? COLORS.emerald : COLORS.red}
                    />
                    <Text style={styles.finalizedTitle}>
                      {isApproved ? "Scan Approved" : "Scan Rejected"}
                    </Text>
                    <Text style={styles.finalizedDesc}>
                      {isApproved
                        ? "The hierarchy suggestion has been applied to the organization."
                        : "This scan was rejected. No changes were made to the organization."}
                    </Text>
                    {scan.organizationId && (
                      <TouchableOpacity
                        style={styles.viewOrgBtn}
                        onPress={() => router.push(`/organization/${scan.organizationId}`)}
                        activeOpacity={0.8}
                      >
                        <Feather name="briefcase" size={14} color={COLORS.emerald} />
                        <Text style={styles.viewOrgBtnText}>View Organization</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </Card>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Toast */}
      {!!toast && (
        <View style={styles.toast}>
          <Feather name="check-circle" size={14} color={COLORS.emerald} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  notFoundContainer: {
    flex: 1,
    backgroundColor: COLORS.navy,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  notFoundText: { fontFamily: "Inter_500Medium", fontSize: 16, color: COLORS.textMuted },
  backBtn: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  backBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  headerCard: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 8,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: COLORS.blue + "22",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  orgName: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: COLORS.text,
    textAlign: "center",
  },
  headerSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
  },
  statusRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  dateText: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 4 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  startHero: { alignItems: "center", gap: 12, paddingVertical: 8 },
  startTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  startDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
    minWidth: 160,
  },
  runBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.white },
  runningBlock: { alignItems: "center", gap: 14, paddingVertical: 20 },
  runningLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.text },
  runningDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  progressDotDone: { backgroundColor: COLORS.emerald },
  progressDotActive: { backgroundColor: COLORS.blue },
  progressLine: { flex: 1, height: 2, backgroundColor: COLORS.navyBorder, marginHorizontal: 2 },
  progressLineDone: { backgroundColor: COLORS.emerald },
  failedBlock: { alignItems: "center", gap: 12, paddingVertical: 16 },
  failedTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.red },
  failedDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: COLORS.amber + "18",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.amber + "55",
    padding: 12,
    marginBottom: 16,
  },
  warningText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.amber,
    flex: 1,
    lineHeight: 19,
  },
  infoRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 11 },
  infoRowDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.navyBorder + "66",
  },
  infoIcon: { marginRight: 10, marginTop: 1 },
  infoContent: { flex: 1 },
  infoLabel: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 3 },
  infoValue: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  confidenceRow: { flexDirection: "row", alignItems: "center" },
  confidencePct: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted },
  noSuggestionBlock: { alignItems: "center", gap: 10, paddingVertical: 16 },
  noSuggestionText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },
  evidenceBlock: { paddingVertical: 4 },
  evidenceDivider: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder + "66", marginTop: 12, paddingTop: 12 },
  evidenceLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  evidenceText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },
  siblingRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  siblingDivider: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder + "66" },
  siblingName: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  siblingDomain: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginTop: 1 },
  masterGraphRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder + "66",
    marginBottom: 16,
  },
  masterGraphLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, marginBottom: 3 },
  masterGraphDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  decisionActions: { flexDirection: "row", gap: 12 },
  rejectBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.red + "18",
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  rejectBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.red },
  approveBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.emerald,
    borderRadius: 12,
    paddingVertical: 14,
  },
  approveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.white },
  noSuggestionHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: "center",
    marginTop: 10,
    fontStyle: "italic",
  },
  finalizedBlock: { alignItems: "center", gap: 12, paddingVertical: 20 },
  finalizedTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  finalizedDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 280,
  },
  viewOrgBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.emeraldMuted,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: COLORS.emerald + "55",
    marginTop: 8,
  },
  viewOrgBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.emerald },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.red + "18",
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  inlineErrorText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, flex: 1 },
  toast: {
    position: "absolute",
    bottom: 36,
    left: 24,
    right: 24,
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.emerald + "55",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  toastText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
});
