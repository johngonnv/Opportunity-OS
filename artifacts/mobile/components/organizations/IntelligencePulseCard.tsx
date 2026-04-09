import React, { useState } from "react";
import { View, Text, TouchableOpacity, Modal, StyleSheet, Pressable } from "react-native";
import { COLORS } from "@/constants/colors";

interface Props {
  health: number;
  risk: number;
  gapsCount: number;
  focus: string | null;
}

const TOOLTIPS: Record<string, { title: string; body: string }> = {
  health: {
    title: "Health Score",
    body: "Computed from open opportunities (+25), activity recency (+up to 30), Decision Maker presence (+15), Champion presence (+10), and engaged contacts (+5-10). Higher is better.",
  },
  risk: {
    title: "Risk Score",
    body: "Computed from stale stage >30d (+30), overdue tasks (+25), inactivity >30d (+25), and missing key stakeholders (+15). Lower is better.",
  },
  gaps: {
    title: "Coverage Gaps",
    body: "Missing required stakeholder roles (Decision Maker, Champion), unlinked contacts on open opportunities, or all-cold relationship strengths.",
  },
  focus: {
    title: "Primary Focus",
    body: "The top vertical or domain for this account based on org profile settings.",
  },
};

function ProgressBar({ value, color }: { value: number; color: string }) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <View style={styles.barTrack}>
      <View style={{ flex: clamped, height: 4, backgroundColor: color, borderRadius: 2 }} />
      {clamped < 100 && <View style={{ flex: 100 - clamped }} />}
    </View>
  );
}

function PulseCell({ label, value, metric, onPress }: {
  label: string;
  value: React.ReactNode;
  metric: string;
  onPress: (key: string) => void;
}) {
  return (
    <TouchableOpacity style={styles.cell} onPress={() => onPress(metric)} activeOpacity={0.75}>
      <Text style={styles.cellLabel}>{label}</Text>
      {value}
    </TouchableOpacity>
  );
}

export function IntelligencePulseCard({ health, risk, gapsCount, focus }: Props) {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const tooltip = activeTooltip ? TOOLTIPS[activeTooltip] : null;

  const healthColor = health >= 60 ? COLORS.emerald : health >= 30 ? COLORS.amber : COLORS.red;
  const riskColor = risk >= 60 ? COLORS.red : risk >= 30 ? COLORS.amber : COLORS.emerald;
  const gapsColor = gapsCount === 0 ? COLORS.emerald : gapsCount === 1 ? COLORS.amber : COLORS.red;

  return (
    <>
      <View style={styles.grid}>
        <PulseCell
          label="Health"
          metric="health"
          onPress={setActiveTooltip}
          value={
            <View>
              <Text style={[styles.scoreText, { color: healthColor }]}>{health}</Text>
              <ProgressBar value={health} color={healthColor} />
            </View>
          }
        />
        <PulseCell
          label="Risk"
          metric="risk"
          onPress={setActiveTooltip}
          value={
            <View>
              <Text style={[styles.scoreText, { color: riskColor }]}>{risk}</Text>
              <ProgressBar value={risk} color={riskColor} />
            </View>
          }
        />
        <PulseCell
          label="Gaps"
          metric="gaps"
          onPress={setActiveTooltip}
          value={
            <Text style={[styles.scoreText, { color: gapsColor }]}>{gapsCount}</Text>
          }
        />
        <PulseCell
          label="Focus"
          metric="focus"
          onPress={setActiveTooltip}
          value={
            <Text style={styles.focusText} numberOfLines={2}>{focus || "—"}</Text>
          }
        />
      </View>

      <Modal visible={!!activeTooltip} transparent animationType="fade" onRequestClose={() => setActiveTooltip(null)}>
        <Pressable style={styles.overlay} onPress={() => setActiveTooltip(null)}>
          <View style={styles.tooltipBox}>
            <Text style={styles.tooltipTitle}>{tooltip?.title}</Text>
            <Text style={styles.tooltipBody}>{tooltip?.body}</Text>
            <TouchableOpacity onPress={() => setActiveTooltip(null)} style={styles.tooltipClose}>
              <Text style={styles.tooltipCloseText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 4,
  },
  cell: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    gap: 6,
  },
  cellLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  scoreText: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    marginBottom: 4,
  },
  focusText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.text,
  },
  barTrack: {
    height: 4,
    backgroundColor: COLORS.navyBorder,
    borderRadius: 2,
    flexDirection: "row",
    overflow: "hidden",
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  tooltipBox: {
    backgroundColor: COLORS.navySurface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 20,
    maxWidth: 320,
    width: "100%",
  },
  tooltipTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: COLORS.text,
    marginBottom: 10,
  },
  tooltipBody: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 20,
    marginBottom: 16,
  },
  tooltipClose: {
    backgroundColor: COLORS.emerald,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  tooltipCloseText: {
    fontFamily: "Inter_700Bold",
    fontSize: 14,
    color: COLORS.navy,
  },
});
