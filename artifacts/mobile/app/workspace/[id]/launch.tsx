import React, { useEffect, useState } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Animated, Easing,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { COLORS } from "@/constants/colors";
import { adminFetch } from "@/hooks/useAdminAuth";
import type { Href } from "expo-router";

interface Day1Summary {
  pipelines: number;
  savedViews: number;
  tasks: number;
  opportunities: number;
  intelligenceInitialized: boolean;
}

interface Day1InitResponse {
  initialized: boolean;
  alreadyDone: boolean;
  summary: Day1Summary;
}

function SummaryTile({
  icon,
  label,
  value,
  color,
  delay,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: number | string;
  color: string;
  delay: number;
}) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 400, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[styles.summaryTile, { opacity, transform: [{ translateY }] }]}>
      <View style={[styles.summaryTileIcon, { backgroundColor: color + "22", borderColor: color + "44" }]}>
        <Feather name={icon} size={22} color={color} />
      </View>
      <Text style={[styles.summaryTileValue, { color }]}>{value}</Text>
      <Text style={styles.summaryTileLabel}>{label}</Text>
    </Animated.View>
  );
}

function CheckRow({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
        <Feather name={done ? "check" : "circle"} size={12} color={done ? COLORS.white : COLORS.navyBorder} />
      </View>
      <Text style={[styles.checkLabel, done && styles.checkLabelDone]} numberOfLines={2}>{label}</Text>
    </View>
  );
}

export default function WorkspaceLaunchScreen() {
  const { id: workspaceId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [initDone, setInitDone] = useState(false);

  const initMutation = useMutation<Day1InitResponse, Error>({
    mutationFn: () =>
      adminFetch(`/admin/workspaces/${workspaceId}/day1-init`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => setInitDone(true),
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<Day1InitResponse>({
    queryKey: ["day1-init", workspaceId],
    queryFn: () =>
      adminFetch(`/admin/workspaces/${workspaceId}/day1-init`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    enabled: !!workspaceId,
    staleTime: Infinity,
  });

  const s = summary?.summary;
  const isLoading = summaryLoading && !s;

  const SETUP_CHECKLIST = [
    "Pipeline templates published",
    "Target facility views created",
    "Day 1 high-priority tasks added",
    "Opportunity seed created",
    "Saved views configured",
    "Intelligence layer initialized",
  ];

  const headerAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(headerAnim, {
      toValue: 1,
      duration: 600,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [headerAnim]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Back breadcrumb */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="chevron-left" size={16} color={COLORS.textDim} />
          <Text style={styles.backText}>Back to Provisioning</Text>
        </TouchableOpacity>

        {/* Hero */}
        <Animated.View
          style={[
            styles.heroCard,
            { opacity: headerAnim, transform: [{ translateY: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] },
          ]}
        >
          <View style={styles.heroIconWrap}>
            <Feather name="zap" size={32} color={COLORS.emerald} />
          </View>
          <Text style={styles.heroTitle}>Workspace Activated</Text>
          <Text style={styles.heroSub}>
            Everything is pre-loaded and ready to generate revenue. Your workspace is no longer empty.
          </Text>
        </Animated.View>

        {/* Activation summary grid */}
        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.emerald} />
            <Text style={styles.loadingText}>Initializing Day 1 experience…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionLabel}>ACTIVATION SUMMARY</Text>
            <View style={styles.summaryGrid}>
              <SummaryTile icon="git-merge" label="Pipelines" value={s?.pipelines ?? 0} color={COLORS.blue} delay={200} />
              <SummaryTile icon="eye" label="Saved Views" value={s?.savedViews ?? 0} color={COLORS.cyan} delay={350} />
              <SummaryTile icon="check-square" label="Tasks Added" value={s?.tasks ?? 0} color={COLORS.emerald} delay={500} />
              <SummaryTile icon="trending-up" label="Opportunities" value={s?.opportunities ?? 0} color={COLORS.amber} delay={650} />
            </View>

            {/* Setup checklist */}
            <Text style={styles.sectionLabel}>WHAT WAS SET UP</Text>
            <View style={styles.checklistCard}>
              {SETUP_CHECKLIST.map((item, i) => (
                <CheckRow key={item} label={item} done={!isLoading} />
              ))}
            </View>

            {/* Intelligence initialized callout */}
            <View style={styles.intelCard}>
              <Feather name="cpu" size={18} color={COLORS.purple} />
              <View style={styles.intelCardBody}>
                <Text style={styles.intelCardTitle}>Intelligence Layer Active</Text>
                <Text style={styles.intelCardDesc}>
                  Competitor maps, pain point profiles, and positioning guides are pre-loaded from your onboarding review.
                </Text>
              </View>
            </View>

            {/* Rule callout */}
            <View style={styles.ruleCard}>
              <Feather name="shield" size={16} color={COLORS.amber} />
              <Text style={styles.ruleText}>
                Your workspace is configured to never show an empty state. Actions will be suggested automatically at every step.
              </Text>
            </View>

            {/* Primary CTA */}
            <TouchableOpacity
              style={styles.launchBtn}
              onPress={() =>
                router.push(`/dashboard/priority?workspaceId=${workspaceId}` as Href)
              }
              activeOpacity={0.85}
            >
              <Feather name="arrow-right-circle" size={20} color={COLORS.navyDark} />
              <Text style={styles.launchBtnText}>Open Priority Dashboard</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.viewWorkspaceBtn}
              onPress={() => router.push(`/admin/workspaces/${workspaceId}` as Href)}
            >
              <Feather name="external-link" size={14} color={COLORS.textDim} />
              <Text style={styles.viewWorkspaceBtnText}>View Workspace Admin</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  scroll: {
    padding: 20,
    paddingBottom: 48,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 24,
  },
  backText: {
    color: COLORS.textDim,
    fontSize: 13,
  },
  heroCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.emerald + "33",
    padding: 28,
    alignItems: "center",
    marginBottom: 28,
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: COLORS.emeraldMuted,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  heroTitle: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  heroSub: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  loadingWrap: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: COLORS.textDim,
    fontSize: 14,
  },
  sectionLabel: {
    color: COLORS.textDim,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginBottom: 28,
  },
  summaryTile: {
    flex: 1,
    minWidth: "44%",
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 16,
    alignItems: "center",
    gap: 6,
  },
  summaryTileIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  summaryTileValue: {
    fontSize: 26,
    fontWeight: "800",
  },
  summaryTileLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: "500",
  },
  checklistCard: {
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    padding: 16,
    gap: 10,
    marginBottom: 16,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: COLORS.navyBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircleDone: {
    backgroundColor: COLORS.emerald,
    borderColor: COLORS.emerald,
  },
  checkLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    flex: 1,
  },
  checkLabelDone: {
    color: COLORS.text,
  },
  intelCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#8B5CF611",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.purple + "33",
    padding: 16,
    marginBottom: 12,
  },
  intelCardBody: {
    flex: 1,
    gap: 4,
  },
  intelCardTitle: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: "600",
  },
  intelCardDesc: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  ruleCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: COLORS.amber + "11",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.amber + "33",
    padding: 14,
    marginBottom: 24,
  },
  ruleText: {
    color: COLORS.textMuted,
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  launchBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.emerald,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 12,
  },
  launchBtnText: {
    color: COLORS.navyDark,
    fontWeight: "700",
    fontSize: 16,
  },
  viewWorkspaceBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  viewWorkspaceBtnText: {
    color: COLORS.textDim,
    fontSize: 13,
  },
});
