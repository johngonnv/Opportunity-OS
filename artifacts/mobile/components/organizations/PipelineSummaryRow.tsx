import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { formatCurrency } from "@/constants/orgLabels";
import type { EnrichedOpportunity } from "@/hooks/useApi";

function daysColor(days: number): string {
  if (days < 7) return COLORS.emerald;
  if (days < 14) return COLORS.amber;
  return COLORS.red;
}

interface OppCardProps {
  opp: EnrichedOpportunity;
  onPress: () => void;
}

function OppCard({ opp, onPress }: OppCardProps) {
  const dayCol = daysColor(opp.daysInStage);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.oppTitle} numberOfLines={2}>{opp.title}</Text>
      <Text style={styles.stageName}>{opp.stageName}</Text>
      {opp.valueEstimate != null && (
        <Text style={styles.value}>{formatCurrency(opp.valueEstimate)}</Text>
      )}
      <View style={styles.footer}>
        <View style={[styles.probBadge]}>
          <Text style={styles.probText}>{opp.probability}%</Text>
        </View>
        <View style={[styles.daysPill, { backgroundColor: dayCol + "22", borderColor: dayCol + "55" }]}>
          <Text style={[styles.daysText, { color: dayCol }]}>{opp.daysInStage}d</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface Props {
  opportunities: EnrichedOpportunity[];
  onPressOpp: (id: string) => void;
}

export function PipelineSummaryRow({ opportunities, onPressOpp }: Props) {
  if (opportunities.length === 0) {
    return (
      <View style={styles.empty}>
        <Feather name="briefcase" size={20} color={COLORS.textDim} />
        <Text style={styles.emptyText}>No open opportunities</Text>
        <Text style={styles.emptyHint}>Add one to start tracking pipeline</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={opportunities}
      keyExtractor={o => o.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: 16 }}
      renderItem={({ item }) => (
        <OppCard opp={item} onPress={() => onPressOpp(item.id)} />
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    width: 165,
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 14,
    marginRight: 10,
  },
  oppTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
    marginBottom: 4,
    lineHeight: 18,
  },
  stageName: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    marginBottom: 6,
  },
  value: {
    fontFamily: "Inter_700Bold",
    fontSize: 15,
    color: COLORS.emerald,
    marginBottom: 8,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  probBadge: {
    backgroundColor: COLORS.blue + "22",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  probText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: COLORS.blue,
  },
  daysPill: {
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  daysText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 20,
    gap: 6,
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    marginBottom: 4,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: COLORS.textDim,
  },
  emptyHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textDim,
    opacity: 0.7,
  },
});
