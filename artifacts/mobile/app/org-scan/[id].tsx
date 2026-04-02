import React, { useState, useEffect } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  ActivityIndicator, TextInput, Modal, FlatList, Platform, Alert,
} from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Feather } from "@expo/vector-icons";
import * as Location from "expo-location";
import { COLORS } from "@/constants/colors";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import {
  useOrganizationScan,
  useParseOrgScan,
  useMatchOrgScan,
  useApproveOrgScan,
  useRejectOrgScan,
  useOrganization,
  useOrganizations,
  getStorageUrl,
} from "@/hooks/useApi";

type PlaceCandidate = {
  placeId: string;
  name: string;
  formattedAddress: string | null;
  phoneNumber: string | null;
  website: string | null;
  placeCategory: string | null;
  mapLink: string;
  geometry: { lat: number; lng: number } | null;
  confidence: number;
};

type OrgData = {
  id: string;
  name: string;
  formattedAddress?: string | null;
  phone?: string | null;
  website?: string | null;
  placeCategory?: string | null;
  organizationId?: string;
  linkedOrganizationName?: string;
  [key: string]: unknown;
};

const ENRICHABLE_FIELDS: Array<{ key: string; label: string; orgKey: string; candidateKey: keyof PlaceCandidate }> = [
  { key: "formattedAddress", label: "Address", orgKey: "formattedAddress", candidateKey: "formattedAddress" },
  { key: "phone", label: "Phone", orgKey: "phone", candidateKey: "phoneNumber" },
  { key: "website", label: "Website", orgKey: "website", candidateKey: "website" },
  { key: "placeCategory", label: "Category", orgKey: "placeCategory", candidateKey: "placeCategory" },
];

const STATUS_COLORS: Record<string, string> = {
  UPLOADED: COLORS.textDim,
  PARSING: COLORS.amber,
  PARSED: COLORS.blue,
  MATCHED: COLORS.emerald,
  FAILED: COLORS.red,
};

const STATUS_LABELS: Record<string, string> = {
  UPLOADED: "Uploaded",
  PARSING: "Parsing…",
  PARSED: "Parsed",
  MATCHED: "Matched",
  FAILED: "Failed",
};

function confidenceLevel(score: number): { label: string; color: string } {
  if (score >= 0.6) return { label: "High", color: COLORS.emerald };
  if (score >= 0.3) return { label: "Medium", color: COLORS.amber };
  return { label: "Low", color: COLORS.textDim };
}

function resolveImageUri(path: string): string {
  if (path.startsWith("/objects/")) return getStorageUrl(path);
  return path;
}

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: PlaceCandidate;
  selected: boolean;
  onSelect: () => void;
}) {
  const conf = confidenceLevel(candidate.confidence);
  return (
    <TouchableOpacity
      style={[styles.candidateCard, selected && styles.candidateCardSelected]}
      onPress={onSelect}
      activeOpacity={0.8}
    >
      <View style={styles.candidateHeader}>
        <Text style={styles.candidateName} numberOfLines={1}>{candidate.name}</Text>
        <TouchableOpacity
          style={[styles.selectToggle, selected && styles.selectToggleActive]}
          onPress={onSelect}
          activeOpacity={0.8}
        >
          {selected
            ? <Feather name="check-circle" size={18} color={COLORS.emerald} />
            : <Feather name="circle" size={18} color={COLORS.textDim} />
          }
        </TouchableOpacity>
      </View>
      <View style={styles.candidateMeta}>
        <Badge label={conf.label} color={conf.color} />
        {candidate.placeCategory && (
          <Badge label={candidate.placeCategory.replace(/_/g, " ")} color={COLORS.blue} />
        )}
      </View>
      {candidate.formattedAddress && (
        <View style={styles.candidateRow}>
          <Feather name="map-pin" size={12} color={COLORS.textDim} />
          <Text style={styles.candidateDetail} numberOfLines={1}>{candidate.formattedAddress}</Text>
        </View>
      )}
      {candidate.phoneNumber && (
        <View style={styles.candidateRow}>
          <Feather name="phone" size={12} color={COLORS.textDim} />
          <Text style={styles.candidateDetail}>{candidate.phoneNumber}</Text>
        </View>
      )}
      {candidate.website && (
        <View style={styles.candidateRow}>
          <Feather name="globe" size={12} color={COLORS.textDim} />
          <Text style={styles.candidateDetail} numberOfLines={1}>{candidate.website}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function OrgSearchSheet({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (org: { id: string; name: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const { data } = useOrganizations(query ? { search: query, limit: "30" } : { limit: "30" });
  const orgs = data?.organizations || [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.sheetContainer}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Select Organization</Text>
          <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
            <Feather name="x" size={22} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <View style={styles.sheetSearch}>
          <Feather name="search" size={16} color={COLORS.textDim} />
          <TextInput
            style={styles.sheetSearchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search organizations…"
            placeholderTextColor={COLORS.textDim}
            autoFocus
          />
        </View>
        <FlatList
          data={orgs}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
          renderItem={({ item }: any) => (
            <TouchableOpacity
              style={styles.orgRow}
              onPress={() => { onSelect({ id: item.id, name: item.name }); onClose(); }}
              activeOpacity={0.75}
            >
              <View style={styles.orgRowIcon}>
                <Feather name="briefcase" size={16} color={COLORS.textMuted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.orgRowName}>{item.name}</Text>
                {item.city && (
                  <Text style={styles.orgRowSub}>{[item.city, item.state].filter(Boolean).join(", ")}</Text>
                )}
              </View>
              <Feather name="chevron-right" size={14} color={COLORS.textDim} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.sheetEmpty}>No organizations found</Text>
          }
        />
      </View>
    </Modal>
  );
}

function ComparePanel({
  candidate,
  orgId,
  onApply,
  onCancel,
}: {
  candidate: PlaceCandidate;
  orgId: string;
  onApply: (forceFields: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const { data: rawOrg, isLoading } = useOrganization(orgId);
  const org = rawOrg as OrgData | undefined;
  const [checkedFields, setCheckedFields] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const initialized = React.useRef(false);

  useEffect(() => {
    if (!org || initialized.current) return;
    initialized.current = true;
    const initial = new Set<string>();
    for (const { key, orgKey, candidateKey } of ENRICHABLE_FIELDS) {
      const incoming = candidate[candidateKey];
      const existing = org[orgKey] as string | null | undefined;
      if (incoming && !existing) initial.add(key);
    }
    setCheckedFields(initial);
  }, [org, candidate]);

  const handleToggle = (key: string) => {
    setCheckedFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleApply = async () => {
    setApplying(true);
    setApplyError(null);
    try {
      await onApply(Array.from(checkedFields));
    } catch (err: any) {
      setApplyError(err.message || "Failed to enrich organization.");
    } finally {
      setApplying(false);
    }
  };

  if (isLoading) return <LoadingSpinner label="Loading organization…" />;
  if (!org) return null;

  return (
    <View style={styles.comparePanel}>
      <View style={styles.comparePanelHeader}>
        <Text style={styles.comparePanelTitle}>Choose Fields to Apply</Text>
        <TouchableOpacity onPress={onCancel}>
          <Feather name="x" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>
      <Text style={styles.comparePanelSub}>Enriching: <Text style={{ color: COLORS.text }}>{org.name}</Text></Text>

      <View style={styles.compareTableHeader}>
        <Text style={[styles.compareCol, styles.compareColLabel]}>Field</Text>
        <Text style={[styles.compareCol, { color: COLORS.textDim }]}>Current</Text>
        <Text style={[styles.compareCol, { color: COLORS.emerald }]}>Incoming</Text>
        <View style={{ width: 32 }} />
      </View>

      {ENRICHABLE_FIELDS.map(({ key, label, orgKey, candidateKey }) => {
        const currentVal = (org[orgKey] as string | null | undefined) ?? null;
        const incomingVal = (candidate[candidateKey] as string | null);
        if (!incomingVal) return null;
        const isConflict = !!currentVal && currentVal !== incomingVal;
        const checked = checkedFields.has(key);
        return (
          <TouchableOpacity
            key={key}
            style={[styles.compareRow, isConflict && !checked && styles.compareRowConflict]}
            onPress={() => handleToggle(key)}
            activeOpacity={0.8}
          >
            <Text style={[styles.compareCol, styles.compareColLabel]}>{label}</Text>
            <Text
              style={[styles.compareCol, { color: currentVal ? COLORS.textMuted : COLORS.textDim, fontStyle: currentVal ? "normal" : "italic" }]}
              numberOfLines={2}
            >
              {currentVal || "—"}
            </Text>
            <Text style={[styles.compareCol, { color: COLORS.emerald }]} numberOfLines={2}>
              {incomingVal}
            </Text>
            <View style={{ width: 32, alignItems: "center" }}>
              {checked
                ? <Feather name="check-square" size={18} color={COLORS.emerald} />
                : <Feather name="square" size={18} color={COLORS.textDim} />
              }
            </View>
          </TouchableOpacity>
        );
      })}

      {!!applyError && (
        <View style={styles.inlineError}>
          <Feather name="alert-circle" size={13} color={COLORS.red} />
          <Text style={styles.inlineErrorText}>{applyError}</Text>
        </View>
      )}

      <View style={styles.compareActions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.8}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.applyBtn, applying && { opacity: 0.6 }]}
          onPress={handleApply}
          disabled={applying}
          activeOpacity={0.8}
        >
          {applying
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <Text style={styles.applyBtnText}>Apply Enrichment</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function OrgScanReviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const { data: scan, isLoading } = useOrganizationScan(id);
  const parseOrgScan = useParseOrgScan(id);
  const matchOrgScan = useMatchOrgScan(id);
  const approveOrgScan = useApproveOrgScan(id);
  const rejectOrgScan = useRejectOrgScan(id);

  const [selectedCandidateIdx, setSelectedCandidateIdx] = useState<number | null>(null);
  const [showRawText, setShowRawText] = useState(false);
  const [orgSearchOpen, setOrgSearchOpen] = useState(false);
  const [selectedTargetOrg, setSelectedTargetOrg] = useState<{ id: string; name: string } | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [createConfirmOpen, setCreateConfirmOpen] = useState(false);
  const [matchLoading, setMatchLoading] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [rerunLoading, setRerunLoading] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (scan?.organizationId && scan?.linkedOrganizationName && !selectedTargetOrg) {
      setSelectedTargetOrg({ id: scan.organizationId, name: scan.linkedOrganizationName });
    }
  }, [scan?.organizationId, scan?.linkedOrganizationName]);

  const candidates: PlaceCandidate[] = (scan?.matchedPlaceJson as PlaceCandidate[]) || [];
  const selectedCandidate = selectedCandidateIdx !== null ? candidates[selectedCandidateIdx] ?? null : null;

  const isParsing = scan?.processingStatus === "PARSING" || scan?.processingStatus === "UPLOADED";
  const isParsed = scan?.processingStatus === "PARSED" || scan?.processingStatus === "MATCHED";
  const isFailed = scan?.processingStatus === "FAILED";
  const isApproved = scan?.reviewStatus === "APPROVED";
  const isRejected = scan?.reviewStatus === "REJECTED";
  const isFinalized = isApproved || isRejected;

  const handleOrgSearchSelect = (org: { id: string; name: string }) => {
    setSelectedTargetOrg(org);
    setCompareOpen(true);
  };

  const handleFindMatches = async () => {
    setMatchLoading(true);
    setMatchError(null);
    try {
      let location: { latitude?: number; longitude?: number } = {};
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.granted) {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        }
      } catch {
      }
      await matchOrgScan.mutateAsync(location);
    } catch (err: any) {
      const msg = err.message || "Failed to find matches";
      if (msg.includes("PLACES_NOT_CONFIGURED")) {
        setMatchError("Google Places API is not configured.");
      } else if (msg.includes("No query text")) {
        setMatchError("Run OCR first to extract a business name.");
      } else {
        setMatchError(msg);
      }
    } finally {
      setMatchLoading(false);
    }
  };

  const handleRerunOcr = async () => {
    setRerunLoading(true);
    setRerunError(null);
    try {
      await parseOrgScan.mutateAsync();
    } catch (err: any) {
      setRerunError(err.message || "Failed to re-run OCR.");
    } finally {
      setRerunLoading(false);
    }
  };

  const handleCreateNewOrg = () => {
    if (!selectedCandidate) {
      setActionError("Select a candidate match before creating an organization.");
      return;
    }
    setActionError(null);
    setCreateConfirmOpen(true);
  };

  const handleConfirmCreate = async () => {
    if (!selectedCandidate) return;
    try {
      const result = await approveOrgScan.mutateAsync({ selectedMatch: selectedCandidate });
      const newOrgId = result?.organization?.id;
      setCreateConfirmOpen(false);
      showToast("Organization created successfully!");
      setTimeout(() => {
        if (newOrgId) {
          router.replace(`/organization/${newOrgId}`);
        } else {
          router.back();
        }
      }, 800);
    } catch (err: any) {
      setActionError(err.message || "Failed to create organization.");
      setCreateConfirmOpen(false);
    }
  };

  const handleEnrichExisting = () => {
    if (!selectedCandidate) {
      setActionError("Select a candidate match first.");
      return;
    }
    setActionError(null);
    if (selectedTargetOrg) {
      setCompareOpen(true);
    } else {
      setOrgSearchOpen(true);
    }
  };

  const handleApplyEnrich = async (forceFields: string[]) => {
    if (!selectedTargetOrg || !selectedCandidate) throw new Error("No org or candidate selected");
    const result = await approveOrgScan.mutateAsync({
      selectedMatch: selectedCandidate,
      targetOrganizationId: selectedTargetOrg.id,
      forceFields,
    });
    const orgId = result?.organization?.id || selectedTargetOrg.id;
    setCompareOpen(false);
    showToast(`${selectedTargetOrg.name} enriched successfully!`);
    setTimeout(() => {
      router.replace(`/organization/${orgId}`);
    }, 800);
  };

  const handleReject = () => {
    const doReject = async () => {
      try {
        await rejectOrgScan.mutateAsync();
        router.back();
      } catch (err: any) {
        setActionError(err.message || "Failed to reject scan.");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Reject this scan? It will be marked as rejected and no organization will be created.")) {
        doReject();
      }
    } else {
      Alert.alert(
        "Reject Scan",
        "Mark this scan as rejected? No organization will be created.",
        [
          { text: "Reject", style: "destructive", onPress: doReject },
          { text: "Cancel", style: "cancel" },
        ]
      );
    }
  };

  if (isLoading) return <LoadingSpinner label="Loading scan…" />;
  if (!scan) return null;

  const imageUri = scan.imageUrl ? resolveImageUri(scan.imageUrl) : null;
  const processingStatus = scan.processingStatus as string;
  const reviewStatus = scan.reviewStatus as string;

  return (
    <>
      <Stack.Screen options={{ title: "Scan Review" }} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Image Preview */}
        <View style={styles.imageSection}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.scanImage} resizeMode="cover" />
          ) : (
            <View style={[styles.scanImage, styles.imagePlaceholder]}>
              <Feather name="image" size={40} color={COLORS.textDim} />
            </View>
          )}
          <View style={styles.statusRow}>
            <Badge
              label={STATUS_LABELS[processingStatus] || processingStatus}
              color={STATUS_COLORS[processingStatus] || COLORS.textDim}
            />
            <Badge
              label={reviewStatus.replace("_", " ")}
              color={isApproved ? COLORS.emerald : isRejected ? COLORS.red : COLORS.amber}
            />
          </View>
        </View>

        {/* Parsing indicator */}
        {isParsing && (
          <View style={styles.parsingCard}>
            <ActivityIndicator size="small" color={COLORS.emerald} />
            <View style={{ flex: 1 }}>
              <Text style={styles.parsingTitle}>Extracting business name…</Text>
              <Text style={styles.parsingSub}>Reading text from the image. This usually takes a few seconds.</Text>
            </View>
          </View>
        )}

        {/* Failed state */}
        {isFailed && (
          <View style={styles.failedCard}>
            <Feather name="alert-circle" size={14} color={COLORS.red} />
            <Text style={styles.failedText}>
              {scan.rawOcrText === "OCR_NOT_CONFIGURED"
                ? "OCR is not configured. Image saved successfully."
                : (scan.rawOcrText || "Failed to extract text from image.")}
            </Text>
          </View>
        )}

        {/* OCR Result Card */}
        {(isParsed || isFailed) && (
          <Card style={styles.ocrCard} padding={16}>
            <Text style={styles.ocrSectionTitle}>OCR Result</Text>
            {scan.parsedBusinessName ? (
              <Text style={styles.parsedName}>{scan.parsedBusinessName}</Text>
            ) : (
              <Text style={styles.parsedNameEmpty}>No business name extracted</Text>
            )}
            {scan.rawOcrText && scan.rawOcrText !== "OCR_NOT_CONFIGURED" && (
              <>
                <TouchableOpacity
                  style={styles.rawToggle}
                  onPress={() => setShowRawText(v => !v)}
                  activeOpacity={0.7}
                >
                  <Feather name={showRawText ? "chevron-up" : "chevron-down"} size={14} color={COLORS.textDim} />
                  <Text style={styles.rawToggleText}>{showRawText ? "Hide raw text" : "View raw text"}</Text>
                </TouchableOpacity>
                {showRawText && (
                  <View style={styles.rawTextBox}>
                    <Text style={styles.rawText}>{scan.rawOcrText}</Text>
                  </View>
                )}
              </>
            )}
          </Card>
        )}

        {/* Re-run OCR */}
        {!isFinalized && (
          <TouchableOpacity
            style={[styles.rerunBtn, (isParsing || rerunLoading) && styles.rerunBtnDisabled]}
            onPress={handleRerunOcr}
            disabled={isParsing || rerunLoading}
            activeOpacity={0.75}
          >
            {rerunLoading
              ? <ActivityIndicator size="small" color={COLORS.emerald} />
              : <Feather name="cpu" size={14} color={isParsing ? COLORS.textDim : COLORS.emerald} />
            }
            <Text style={[styles.rerunBtnText, (isParsing || rerunLoading) && { color: COLORS.textDim }]}>
              {rerunLoading ? "Re-running OCR…" : isParsing ? "OCR running…" : "Re-run OCR"}
            </Text>
          </TouchableOpacity>
        )}
        {!!rerunError && (
          <View style={styles.inlineError}>
            <Feather name="alert-circle" size={13} color={COLORS.red} />
            <Text style={styles.inlineErrorText}>{rerunError}</Text>
          </View>
        )}

        {/* Candidates section — only shown once OCR has completed */}
        {!isFinalized && isParsed && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Match Candidates</Text>
              <TouchableOpacity
                style={[styles.findMatchBtn, matchLoading && { opacity: 0.6 }]}
                onPress={handleFindMatches}
                disabled={matchLoading}
                activeOpacity={0.8}
              >
                {matchLoading
                  ? <ActivityIndicator size="small" color={COLORS.white} />
                  : <Feather name="search" size={14} color={COLORS.white} />
                }
                <Text style={styles.findMatchBtnText}>{matchLoading ? "Searching…" : "Find Matches"}</Text>
              </TouchableOpacity>
            </View>

            {!!matchError && (
              <View style={styles.inlineError}>
                <Feather name="alert-circle" size={13} color={COLORS.red} />
                <Text style={styles.inlineErrorText}>{matchError}</Text>
              </View>
            )}

            {candidates.length === 0 ? (
              <View style={styles.emptyCandidates}>
                <Feather name="search" size={28} color={COLORS.textDim} />
                <Text style={styles.emptyCandidatesText}>
                  No candidates yet. Tap "Find Matches" to search Google Places using the extracted business name.
                </Text>
              </View>
            ) : (
              candidates.slice(0, 3).map((c, i) => (
                <CandidateCard
                  key={c.placeId || i}
                  candidate={c}
                  selected={selectedCandidateIdx === i}
                  onSelect={() => setSelectedCandidateIdx(prev => prev === i ? null : i)}
                />
              ))
            )}
          </View>
        )}

        {/* Approved / Rejected state */}
        {isFinalized && (
          <Card style={styles.statusCard} padding={16}>
            <View style={styles.statusCardRow}>
              <Feather
                name={isApproved ? "check-circle" : "x-circle"}
                size={20}
                color={isApproved ? COLORS.emerald : COLORS.red}
              />
              <Text style={styles.statusCardText}>
                {isApproved
                  ? scan.linkedOrganizationName
                    ? `Approved — linked to ${scan.linkedOrganizationName}`
                    : "Approved"
                  : "Rejected — no organization created"
                }
              </Text>
            </View>
            {scan.linkedOrganizationName && scan.organizationId && (
              <TouchableOpacity
                style={styles.linkedOrgBtn}
                onPress={() => router.push(`/organization/${scan.organizationId}`)}
                activeOpacity={0.75}
              >
                <Feather name="briefcase" size={14} color={COLORS.emerald} />
                <Text style={styles.linkedOrgText}>{scan.linkedOrganizationName}</Text>
                <Feather name="chevron-right" size={14} color={COLORS.textDim} />
              </TouchableOpacity>
            )}
          </Card>
        )}

        {/* Action error */}
        {!!actionError && (
          <View style={styles.inlineError}>
            <Feather name="alert-circle" size={13} color={COLORS.red} />
            <Text style={styles.inlineErrorText}>{actionError}</Text>
          </View>
        )}

        {/* Comparison panel (inline) */}
        {compareOpen && selectedTargetOrg && selectedCandidate && (
          <ComparePanel
            candidate={selectedCandidate}
            orgId={selectedTargetOrg.id}
            onApply={handleApplyEnrich}
            onCancel={() => { setCompareOpen(false); setSelectedTargetOrg(null); }}
          />
        )}
      </ScrollView>

      {/* Bottom action bar */}
      {!isFinalized && !compareOpen && (
        <View style={styles.bottomBar}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnCreate, !selectedCandidate && styles.actionBtnDisabled]}
            onPress={handleCreateNewOrg}
            disabled={!selectedCandidate || approveOrgScan.isPending}
            activeOpacity={0.8}
          >
            {approveOrgScan.isPending && !compareOpen
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Feather name="plus-circle" size={15} color={COLORS.white} />
            }
            <Text style={styles.actionBtnText}>Create New Org</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnEnrich, !selectedCandidate && styles.actionBtnDisabled]}
            onPress={handleEnrichExisting}
            disabled={!selectedCandidate}
            activeOpacity={0.8}
          >
            <Feather name="zap" size={15} color={COLORS.emerald} />
            <Text style={[styles.actionBtnText, { color: COLORS.emerald }]} numberOfLines={1}>
              {selectedTargetOrg ? `Enrich: ${selectedTargetOrg.name}` : "Enrich Existing"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.actionBtnReject]}
            onPress={handleReject}
            disabled={rejectOrgScan.isPending}
            activeOpacity={0.8}
          >
            {rejectOrgScan.isPending
              ? <ActivityIndicator size="small" color={COLORS.red} />
              : <Feather name="x" size={15} color={COLORS.red} />
            }
            <Text style={[styles.actionBtnText, { color: COLORS.red }]}>Reject</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Org search sheet */}
      <OrgSearchSheet
        visible={orgSearchOpen}
        onClose={() => setOrgSearchOpen(false)}
        onSelect={handleOrgSearchSelect}
      />

      {/* Create New Org Confirmation Modal */}
      <Modal
        visible={createConfirmOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setCreateConfirmOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.createConfirmSheet}>
            <Text style={styles.createConfirmTitle}>Create New Organization</Text>
            <Text style={styles.createConfirmSub}>The following details from the selected match will be used:</Text>
            {selectedCandidate && (
              <View style={styles.createConfirmDetails}>
                <Text style={styles.createConfirmOrgName}>{selectedCandidate.name}</Text>
                {!!selectedCandidate.formattedAddress && (
                  <View style={styles.createConfirmRow}>
                    <Feather name="map-pin" size={13} color={COLORS.textDim} />
                    <Text style={styles.createConfirmRowText}>{selectedCandidate.formattedAddress}</Text>
                  </View>
                )}
                {!!selectedCandidate.phoneNumber && (
                  <View style={styles.createConfirmRow}>
                    <Feather name="phone" size={13} color={COLORS.textDim} />
                    <Text style={styles.createConfirmRowText}>{selectedCandidate.phoneNumber}</Text>
                  </View>
                )}
                {!!selectedCandidate.website && (
                  <View style={styles.createConfirmRow}>
                    <Feather name="globe" size={13} color={COLORS.textDim} />
                    <Text style={styles.createConfirmRowText}>{selectedCandidate.website}</Text>
                  </View>
                )}
                {!!selectedCandidate.placeCategory && (
                  <View style={styles.createConfirmRow}>
                    <Feather name="tag" size={13} color={COLORS.textDim} />
                    <Text style={styles.createConfirmRowText}>{selectedCandidate.placeCategory}</Text>
                  </View>
                )}
              </View>
            )}
            <View style={styles.createConfirmActions}>
              <TouchableOpacity
                style={[styles.createConfirmBtn, { borderColor: COLORS.navyBorder }]}
                onPress={() => setCreateConfirmOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={[styles.createConfirmBtnText, { color: COLORS.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createConfirmBtn, { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald }]}
                onPress={handleConfirmCreate}
                disabled={approveOrgScan.isPending}
                activeOpacity={0.8}
              >
                {approveOrgScan.isPending
                  ? <ActivityIndicator size="small" color={COLORS.white} />
                  : <Text style={[styles.createConfirmBtnText, { color: COLORS.white }]}>Create Organization</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Success toast */}
      {!!toast && (
        <View style={styles.toast} pointerEvents="none">
          <Feather name="check-circle" size={16} color={COLORS.white} />
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy, paddingHorizontal: 16 },
  imageSection: { alignItems: "center", paddingTop: 16, paddingBottom: 12, gap: 10 },
  scanImage: { width: 200, height: 200, borderRadius: 16, backgroundColor: COLORS.navyCard },
  imagePlaceholder: { alignItems: "center", justifyContent: "center" },
  statusRow: { flexDirection: "row", gap: 8 },
  parsingCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  parsingTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: COLORS.text },
  parsingSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  failedCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: COLORS.red + "18", borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: COLORS.red + "44",
  },
  failedText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.red, flex: 1 },
  ocrCard: { marginBottom: 10 },
  ocrSectionTitle: { fontFamily: "Inter_400Regular", fontSize: 11, color: COLORS.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },
  parsedName: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text },
  parsedNameEmpty: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textDim, fontStyle: "italic" },
  rawToggle: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 10 },
  rawToggleText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textDim },
  rawTextBox: { backgroundColor: COLORS.navySurface, borderRadius: 8, padding: 10, marginTop: 8 },
  rawText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  rerunBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.navyCard, borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder, marginBottom: 14,
  },
  rerunBtnDisabled: { opacity: 0.5 },
  rerunBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: COLORS.emerald },
  section: { marginBottom: 16 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text },
  findMatchBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.emerald, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  findMatchBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.white },
  emptyCandidates: { alignItems: "center", gap: 8, paddingVertical: 24 },
  emptyCandidatesText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, textAlign: "center", maxWidth: 280 },
  candidateCard: {
    backgroundColor: COLORS.navyCard, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder, gap: 6,
  },
  candidateCardSelected: { borderColor: COLORS.emerald, backgroundColor: COLORS.emeraldMuted + "18" },
  candidateHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  candidateName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: COLORS.text, flex: 1 },
  selectToggle: { padding: 4 },
  selectToggleActive: {},
  candidateMeta: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  candidateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  candidateDetail: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, flex: 1 },
  statusCard: { marginBottom: 16 },
  statusCardRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusCardText: { fontFamily: "Inter_500Medium", fontSize: 14, color: COLORS.text, flex: 1 },
  linkedOrgBtn: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
  },
  linkedOrgText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.emerald, flex: 1 },
  inlineError: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.red + "18", borderRadius: 8, padding: 10, marginBottom: 10,
    borderWidth: 1, borderColor: COLORS.red + "33",
  },
  inlineErrorText: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.red, flex: 1 },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    flexDirection: "row", gap: 8, padding: 16, paddingBottom: 28,
    backgroundColor: COLORS.navyMid,
    borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 12, borderRadius: 10, borderWidth: 1,
  },
  actionBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: COLORS.white },
  actionBtnCreate: { backgroundColor: COLORS.emerald, borderColor: COLORS.emerald },
  actionBtnEnrich: { backgroundColor: COLORS.emeraldMuted, borderColor: COLORS.emerald + "55" },
  actionBtnReject: { backgroundColor: COLORS.red + "18", borderColor: COLORS.red + "44" },
  actionBtnDisabled: { opacity: 0.4 },
  sheetContainer: { flex: 1, backgroundColor: COLORS.navy },
  sheetHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder,
  },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: COLORS.text },
  sheetSearch: {
    flexDirection: "row", alignItems: "center", gap: 10,
    margin: 16, backgroundColor: COLORS.navySurface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  sheetSearchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.text },
  sheetEmpty: { fontFamily: "Inter_400Regular", fontSize: 14, color: COLORS.textDim, textAlign: "center", marginTop: 24 },
  orgRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.navyCard, borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  orgRowIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: COLORS.navySurface, alignItems: "center", justifyContent: "center" },
  orgRowName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.text },
  orgRowSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  comparePanel: {
    backgroundColor: COLORS.navyCard, borderRadius: 16, padding: 16, marginTop: 8,
    borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  comparePanelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  comparePanelTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text },
  comparePanelSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginBottom: 14 },
  compareTableHeader: { flexDirection: "row", alignItems: "center", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder, marginBottom: 4 },
  compareRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.navyBorder + "66",
  },
  compareRowConflict: { backgroundColor: COLORS.amber + "12", borderRadius: 6, paddingHorizontal: 4 },
  compareCol: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: COLORS.text, paddingRight: 6 },
  compareColLabel: { fontFamily: "Inter_600SemiBold", fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5 },
  compareActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  cancelBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12,
    borderRadius: 10, backgroundColor: COLORS.navySurface, borderWidth: 1, borderColor: COLORS.navyBorder,
  },
  cancelBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.textMuted },
  applyBtn: {
    flex: 2, alignItems: "center", justifyContent: "center", paddingVertical: 12,
    borderRadius: 10, backgroundColor: COLORS.emerald,
  },
  applyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.white },
  modalOverlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  createConfirmSheet: {
    backgroundColor: COLORS.navyCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: 36,
    borderTopWidth: 1, borderTopColor: COLORS.navyBorder,
  },
  createConfirmTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: COLORS.text, marginBottom: 6 },
  createConfirmSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, marginBottom: 16 },
  createConfirmDetails: {
    backgroundColor: COLORS.navySurface, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.navyBorder, gap: 8, marginBottom: 20,
  },
  createConfirmOrgName: { fontFamily: "Inter_700Bold", fontSize: 16, color: COLORS.text, marginBottom: 4 },
  createConfirmRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  createConfirmRowText: { fontFamily: "Inter_400Regular", fontSize: 13, color: COLORS.textMuted, flex: 1 },
  createConfirmActions: { flexDirection: "row", gap: 12 },
  createConfirmBtn: {
    flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 14,
    borderRadius: 12, borderWidth: 1,
  },
  createConfirmBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  toast: {
    position: "absolute", bottom: 100, left: 24, right: 24,
    backgroundColor: COLORS.emerald, borderRadius: 12, padding: 14,
    flexDirection: "row", alignItems: "center", gap: 10,
    shadowColor: "#000", shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  toastText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: COLORS.white, flex: 1 },
});
