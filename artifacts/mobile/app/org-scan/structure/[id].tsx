import React, { useState, useEffect, useRef } from "react";
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
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

function deriveSourceType(scan: any): { label: string; color: string } | null {
  if (!scan) return null;
  const llmReasoning = scan.llmReasoningSummary as string | null;
  const hasLlm =
    llmReasoning &&
    llmReasoning.length > 0 &&
    !llmReasoning.startsWith("LLM not configured") &&
    !llmReasoning.startsWith("LLM error");
  const externalPayload = scan.externalSourcePayload as Record<string, unknown> | null;
  const hasExternal =
    externalPayload != null && Object.keys(externalPayload).length > 0;

  if (hasLlm) return { label: "AI Synthesis", color: COLORS.purple };
  if (scan.suggestedParentMasterOrganizationId)
    return { label: "Master Database", color: COLORS.blue };
  if (hasExternal) return { label: "External Source", color: COLORS.cyan };
  return null;
}

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

function ApproveSheet({
  visible,
  scan,
  onCancel,
  onConfirm,
  approving,
}: {
  visible: boolean;
  scan: any;
  onCancel: () => void;
  onConfirm: (addToMasterGraph: boolean) => void;
  approving: boolean;
}) {
  const [addToMasterGraph, setAddToMasterGraph] = useState(false);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={sheetStyles.overlay}>
        <TouchableOpacity style={sheetStyles.backdrop} onPress={onCancel} activeOpacity={1} />
        <View style={[sheetStyles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={sheetStyles.handle} />
          <Text style={sheetStyles.title}>Approve Structure Suggestion</Text>

          <View style={sheetStyles.summaryCard}>
            <Text style={sheetStyles.summaryLabel}>Changes to be applied</Text>
            <View style={sheetStyles.summaryRow}>
              <Feather name="briefcase" size={13} color={COLORS.textMuted} />
              <Text style={sheetStyles.summaryOrg} numberOfLines={1}>
                {scan?.organizationName ?? "Organization"}
              </Text>
            </View>
            <View style={sheetStyles.summaryArrow}>
              <Feather name="arrow-down" size={12} color={COLORS.textDim} />
            </View>
            <View style={sheetStyles.summaryRow}>
              <Feather name="arrow-up-circle" size={13} color={COLORS.blue} />
              <Text style={sheetStyles.summaryParent} numberOfLines={1}>
                {scan?.suggestedParentName ?? "Suggested Parent"}
              </Text>
            </View>
            {scan?.suggestedStructureType && (
              <View style={[sheetStyles.summaryRow, { marginTop: 8 }]}>
                <Feather name="layers" size={13} color={COLORS.textMuted} />
                <Text style={sheetStyles.summaryMeta}>
                  Type:{" "}
                  {STRUCTURE_TYPE_LABELS[scan.suggestedStructureType] ??
                    scan.suggestedStructureType}
                </Text>
              </View>
            )}
          </View>

          <View style={sheetStyles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={sheetStyles.toggleLabel}>Add to shared knowledge base</Text>
              <Text style={sheetStyles.toggleDesc}>
                Promote this org into the global master hierarchy for future scans.
              </Text>
            </View>
            <Switch
              value={addToMasterGraph}
              onValueChange={setAddToMasterGraph}
              trackColor={{ false: COLORS.navyBorder, true: COLORS.emerald + "88" }}
              thumbColor={addToMasterGraph ? COLORS.emerald : COLORS.textDim}
            />
          </View>

          <View style={sheetStyles.actions}>
            <TouchableOpacity
              style={sheetStyles.cancelBtn}
              onPress={onCancel}
              activeOpacity={0.8}
              disabled={approving}
            >
              <Text style={sheetStyles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[sheetStyles.confirmBtn, approving && { opacity: 0.7 }]}
              onPress={() => onConfirm(addToMasterGraph)}
              activeOpacity={0.8}
              disabled={approving}
            >
              {approving ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : (
                <>
                  <Feather name="check-circle" size={16} color={COLORS.white} />
                  <Text style={sheetStyles.confirmBtnText}>Confirm Approval</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function StructureScanReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: scan, isLoading } = useStructureScan(id);
  const runScan = useRunStructureScan(id);
  const approveScan = useApproveStructureScan(id);
  const rejectScan = useRejectStructureScan(id);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approveSheetOpen, setApproveSheetOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (
      scan &&
      scan.scanStatus === "PENDING" &&
      scan.reviewStatus === "PENDING_REVIEW" &&
      !autoStarted.current &&
      !running
    ) {
      autoStarted.current = true;
      handleRunScan();
    }
  }, [scan?.scanStatus, scan?.reviewStatus]);

  const handleRunScan = async () => {
    setRunning(true);
    setRunError(null);
    try {
      await runScan.mutateAsync();
    } catch (err: any) {
      setRunError(err.message || "Scan failed. Please try again.");
      autoStarted.current = false;
    } finally {
      setRunning(false);
    }
  };

  const handleConfirmApprove = async (addToMasterGraph: boolean) => {
    setActionError(null);
    try {
      await approveScan.mutateAsync({ addToMasterGraph });
      setApproveSheetOpen(false);
      showToast("Structure scan approved!");
      setTimeout(() => {
        if (scan?.organizationId) {
          router.replace(`/organization/${scan.organizationId}`);
        } else {
          router.back();
        }
      }, 800);
    } catch (err: any) {
      setApproveSheetOpen(false);
      setActionError(err.message || "Failed to approve scan.");
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

  const handleReviewLater = () => {
    router.back();
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
  const sourceType = deriveSourceType(scan);
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
  const showLowConfidenceWarning = isCompleted && confidence.level === "low";
  const siblings: Sibling[] = scan.siblings || [];
  const showBottomBar = isCompleted && !isFinalized;

  return (
    <>
      <Stack.Screen options={{ title: "Structure Scan" }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={{
          paddingBottom: showBottomBar ? 130 : 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View
            style={[
              styles.iconCircle,
              isFailed && { backgroundColor: COLORS.red + "22" },
              isApproved && { backgroundColor: COLORS.emerald + "22" },
            ]}
          >
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
                  : "Running…"
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

        {/* Pipeline Running */}
        {(isRunning || running) && (
          <View style={styles.section}>
            <Card>
              <View style={styles.runningBlock}>
                <ActivityIndicator size="large" color={COLORS.blue} />
                <Text style={styles.runningLabel}>
                  {SCAN_STATUS_LABELS[scanStatus] ?? "Running…"}
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
                  style={styles.retryBtn}
                  onPress={handleRunScan}
                  disabled={running}
                  activeOpacity={0.8}
                >
                  {running ? (
                    <ActivityIndicator size="small" color={COLORS.white} />
                  ) : (
                    <>
                      <Feather name="refresh-cw" size={16} color={COLORS.white} />
                      <Text style={styles.retryBtnText}>Retry Scan</Text>
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
            {showLowConfidenceWarning && !isFinalized && (
              <View style={styles.warningBanner}>
                <Feather name="alert-triangle" size={14} color={COLORS.amber} />
                <Text style={styles.warningText}>
                  Low confidence — review this suggestion carefully before approving.
                </Text>
              </View>
            )}

            {/* Suggestion Card */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Hierarchy Suggestion</Text>
              <Card>
                {scan.suggestedParentName ? (
                  <>
                    {sourceType && (
                      <View style={styles.sourceTypeRow}>
                        <Badge label={sourceType.label} color={sourceType.color} />
                      </View>
                    )}

                    <View style={styles.infoRow}>
                      <Feather
                        name="arrow-up-circle"
                        size={14}
                        color={COLORS.textMuted}
                        style={styles.infoIcon}
                      />
                      <View style={styles.infoContent}>
                        <Text style={styles.infoLabel}>Suggested Parent</Text>
                        <Text style={styles.infoValue}>{scan.suggestedParentName}</Text>
                      </View>
                    </View>

                    {scan.suggestedUltimateParentName &&
                      scan.suggestedUltimateParentName !== scan.suggestedParentName && (
                        <View style={[styles.infoRow, styles.infoRowDivider]}>
                          <Feather
                            name="home"
                            size={14}
                            color={COLORS.textMuted}
                            style={styles.infoIcon}
                          />
                          <View style={styles.infoContent}>
                            <Text style={styles.infoLabel}>Ultimate Parent</Text>
                            <Text style={styles.infoValue}>
                              {scan.suggestedUltimateParentName}
                            </Text>
                          </View>
                        </View>
                      )}

                    {scan.suggestedStructureType && (
                      <View style={[styles.infoRow, styles.infoRowDivider]}>
                        <Feather
                          name="layers"
                          size={14}
                          color={COLORS.textMuted}
                          style={styles.infoIcon}
                        />
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
                      <Feather
                        name="bar-chart-2"
                        size={14}
                        color={COLORS.textMuted}
                        style={styles.infoIcon}
                      />
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

            {/* Evidence & AI Reasoning */}
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
                      <View
                        style={[
                          styles.evidenceBlock,
                          scan.evidenceSummary && styles.evidenceDivider,
                        ]}
                      >
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
                <Text style={styles.sectionTitle}>Known Siblings ({siblings.length})</Text>
                <Card>
                  {siblings.map((sib, idx) => (
                    <View
                      key={sib.id}
                      style={[styles.siblingRow, idx > 0 && styles.siblingDivider]}
                    >
                      <Feather
                        name="git-branch"
                        size={13}
                        color={COLORS.textDim}
                        style={{ marginRight: 8 }}
                      />
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

            {/* Action error */}
            {!!actionError && (
              <View style={styles.inlineError}>
                <Feather name="alert-circle" size={13} color={COLORS.red} />
                <Text style={styles.inlineErrorText}>{actionError}</Text>
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
                        : "This scan was rejected. No changes were made."}
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

      {/* Bottom Action Bar */}
      {showBottomBar && (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={styles.rejectBarBtn}
            onPress={handleReject}
            disabled={rejectScan.isPending}
            activeOpacity={0.8}
          >
            {rejectScan.isPending ? (
              <ActivityIndicator size="small" color={COLORS.red} />
            ) : (
              <>
                <Feather name="x-circle" size={16} color={COLORS.red} />
                <Text style={styles.rejectBarBtnText}>Reject</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reviewLaterBarBtn}
            onPress={handleReviewLater}
            activeOpacity={0.8}
          >
            <Feather name="clock" size={15} color={COLORS.textMuted} />
            <Text style={styles.reviewLaterBtnText}>Later</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.approveBarBtn,
              !scan.suggestedParentName && { opacity: 0.45 },
            ]}
            onPress={() => setApproveSheetOpen(true)}
            disabled={approveScan.isPending || !scan.suggestedParentName}
            activeOpacity={0.8}
          >
            {approveScan.isPending ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <>
                <Feather name="check-circle" size={16} color={COLORS.white} />
                <Text style={styles.approveBarBtnText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Approve Confirmation Sheet */}
      <ApproveSheet
        visible={approveSheetOpen}
        scan={scan}
        onCancel={() => setApproveSheetOpen(false)}
        onConfirm={handleConfirmApprove}
        approving={approveScan.isPending}
      />

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

const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheet: {
    backgroundColor: COLORS.navyMid,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.navyBorder,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: COLORS.text,
    marginBottom: 16,
  },
  summaryCard: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    gap: 4,
  },
  summaryLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryOrg: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, flex: 1 },
  summaryArrow: { paddingLeft: 20, paddingVertical: 2 },
  summaryParent: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.blue, flex: 1 },
  summaryMeta: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.navyBorder + "66",
    marginBottom: 16,
  },
  toggleLabel: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text, marginBottom: 3 },
  toggleDesc: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  actions: { flexDirection: "row", gap: 10 },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.navySurface,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.textMuted },
  confirmBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.emerald,
    borderRadius: 12,
    paddingVertical: 14,
  },
  confirmBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.white },
});

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
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted },
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
  runningBlock: { alignItems: "center", gap: 14, paddingVertical: 20 },
  runningLabel: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: COLORS.text },
  runningDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    textAlign: "center",
  },
  progressRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
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
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.blue,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 13,
    marginTop: 8,
  },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.white },
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
  sourceTypeRow: { marginBottom: 12 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 11 },
  infoRowDivider: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder + "66" },
  infoIcon: { marginRight: 10, marginTop: 1 },
  infoContent: { flex: 1 },
  infoLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 3,
  },
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
  evidenceDivider: {
    borderTopWidth: 1,
    borderTopColor: COLORS.navyBorder + "66",
    marginTop: 12,
    paddingTop: 12,
  },
  evidenceLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  evidenceText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },
  siblingRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  siblingDivider: { borderTopWidth: 1, borderTopColor: COLORS.navyBorder + "66" },
  siblingName: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text },
  siblingDomain: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 1,
  },
  inlineError: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: COLORS.red + "18",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  inlineErrorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.red,
    flex: 1,
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
  bottomBar: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.navyMid,
    borderTopWidth: 1,
    borderTopColor: COLORS.navyBorder,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  rejectBarBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.red + "18",
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: COLORS.red + "44",
  },
  rejectBarBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.red },
  reviewLaterBarBtn: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: COLORS.navySurface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
  },
  reviewLaterBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: COLORS.textMuted,
  },
  approveBarBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.emerald,
    borderRadius: 12,
    paddingVertical: 13,
  },
  approveBarBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.white },
  toast: {
    position: "absolute",
    bottom: 100,
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
