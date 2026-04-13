import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { useHealthcareProfile, type HealthcareProfile } from "@/hooks/useApi";
import { Card } from "@/components/ui/Card";

const VERIFICATION_LABEL: Record<string, string> = {
  VERIFIED: "Verified",
  PENDING_REVIEW: "Pending Review",
  UNVERIFIED: "Unverified",
  SUGGESTED: "Suggested",
};

const VERIFICATION_COLOR: Record<string, string> = {
  VERIFIED: COLORS.emerald,
  PENDING_REVIEW: COLORS.amber,
  UNVERIFIED: COLORS.textDim,
  SUGGESTED: COLORS.blue,
};

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

function starLabel(rating: number | null): string {
  if (rating === null) return "—";
  return `${rating} / 5 ★`;
}

interface MetricCellProps {
  label: string;
  value: string;
  isWarning?: boolean;
  icon?: keyof typeof Feather.glyphMap;
}

function MetricCell({ label, value, isWarning, icon }: MetricCellProps) {
  const borderColor = isWarning ? COLORS.amber : COLORS.navyBorder;
  const valueColor = isWarning ? COLORS.amber : COLORS.text;
  return (
    <View style={[styles.metricCell, { borderColor }]}>
      <View style={styles.metricLabelRow}>
        {icon && <Feather name={icon} size={10} color={isWarning ? COLORS.amber : COLORS.textDim} style={{ marginRight: 3 }} />}
        <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color: valueColor }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function isBoardingTimeWarning(val: number | null): boolean {
  return val !== null && val > 60;
}

function isLwbsWarning(val: number | null): boolean {
  return val !== null && val > 3;
}

function isAdmitTimeWarning(val: number | null): boolean {
  return val !== null && val > 300;
}

function isStarRatingWarning(val: number | null): boolean {
  return val !== null && val <= 2;
}

interface Props {
  orgId: string;
}

export function CMSEvidenceCard({ orgId }: Props) {
  const { data, isLoading } = useHealthcareProfile(orgId);
  const profile: HealthcareProfile | null = data?.profile ?? null;

  const staleAge = daysSince(profile?.cmsLastUpdatedAt ?? null);
  const isStale = staleAge !== null && staleAge > 90;

  const verStatus = profile?.cmsVerificationStatus ?? "UNVERIFIED";
  const statusColor = VERIFICATION_COLOR[verStatus] ?? COLORS.textDim;
  const statusLabel = VERIFICATION_LABEL[verStatus] ?? verStatus;

  return (
    <View style={styles.wrapper}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Feather name="activity" size={14} color={COLORS.cyan} />
          <Text style={styles.cardTitle}>CMS Evidence</Text>
        </View>
        {profile && (
          <View style={[styles.statusBadge, { backgroundColor: statusColor + "20", borderColor: statusColor + "44" }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        )}
      </View>

      {isLoading ? (
        <Card>
          <ActivityIndicator color={COLORS.cyan} />
        </Card>
      ) : !profile ? (
        <Card>
          <View style={styles.emptyState}>
            <Feather name="database" size={20} color={COLORS.textDim} />
            <Text style={styles.emptyTitle}>No CMS Data</Text>
            <Text style={styles.emptyBody}>
              No healthcare profile linked to this account. Enrich the record or add CMS data manually.
            </Text>
          </View>
        </Card>
      ) : (
        <Card>
          {isStale && (
            <View style={styles.staleWarning}>
              <Feather name="alert-triangle" size={12} color={COLORS.amber} />
              <Text style={styles.staleText}>
                CMS data is {staleAge} days old — consider refreshing
              </Text>
            </View>
          )}

          <View style={styles.metricsGrid}>
            {profile.cmsBedCount !== null && (
              <MetricCell
                label="Beds"
                value={String(profile.cmsBedCount)}
                icon="home"
              />
            )}
            {profile.cmsOverallStarRating !== null && (
              <MetricCell
                label="Overall Rating"
                value={starLabel(profile.cmsOverallStarRating)}
                isWarning={isStarRatingWarning(profile.cmsOverallStarRating)}
                icon="star"
              />
            )}
            {profile.cmsPatientExperienceRating !== null && (
              <MetricCell
                label="Patient Exp."
                value={starLabel(profile.cmsPatientExperienceRating)}
                isWarning={isStarRatingWarning(profile.cmsPatientExperienceRating)}
                icon="heart"
              />
            )}
            {profile.cmsCareTransitionRating !== null && (
              <MetricCell
                label="Care Transition"
                value={starLabel(profile.cmsCareTransitionRating)}
                isWarning={isStarRatingWarning(profile.cmsCareTransitionRating)}
                icon="shuffle"
              />
            )}
            {profile.cmsEdBoardingTimeMinutes !== null && (
              <MetricCell
                label="ED Boarding"
                value={`${profile.cmsEdBoardingTimeMinutes} min`}
                isWarning={isBoardingTimeWarning(profile.cmsEdBoardingTimeMinutes)}
                icon="clock"
              />
            )}
            {profile.cmsEdLwbsPercent !== null && (
              <MetricCell
                label="LWBS Rate"
                value={`${profile.cmsEdLwbsPercent}%`}
                isWarning={isLwbsWarning(profile.cmsEdLwbsPercent)}
                icon="log-out"
              />
            )}
            {profile.cmsEdTimeToAdmitMinutes !== null && (
              <MetricCell
                label="Time to Admit"
                value={`${profile.cmsEdTimeToAdmitMinutes} min`}
                isWarning={isAdmitTimeWarning(profile.cmsEdTimeToAdmitMinutes)}
                icon="arrow-right-circle"
              />
            )}
            {profile.cmsEdTotalTimeMinutes !== null && (
              <MetricCell
                label="ED Total Time"
                value={`${profile.cmsEdTotalTimeMinutes} min`}
                icon="watch"
              />
            )}
          </View>

          {profile.cmsLastUpdatedAt && (
            <Text style={styles.lastUpdated}>
              Last updated {formatDate(profile.cmsLastUpdatedAt)}
              {isStale ? " · " : ""}
              {isStale && <Text style={{ color: COLORS.amber }}>Stale</Text>}
            </Text>
          )}

          {profile.cmsCcn && (
            <Text style={styles.ccnText}>CCN: {profile.cmsCcn}</Text>
          )}
        </Card>
      )}
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
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.3,
  },
  staleWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.amber + "15",
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
  },
  staleText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.amber,
    flex: 1,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  metricCell: {
    width: "47%",
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  metricLabelRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  metricLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    flex: 1,
  },
  metricValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: COLORS.text,
  },
  lastUpdated: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 4,
  },
  ccnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginTop: 2,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 8,
  },
  emptyTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.textMuted,
  },
  emptyBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textDim,
    textAlign: "center",
    lineHeight: 18,
  },
});
