import React, { useRef, useEffect } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type { Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { COLORS } from "@/constants/colors";

const SHEET_HEIGHT = 400;
const DRAG_THRESHOLD = 80;

interface Props {
  visible: boolean;
  onClose: () => void;
}

const MODES = [
  {
    icon: "credit-card" as const,
    label: "Business\nCard",
    sub: "OCR → contact\nform pre-fill",
    accentColor: COLORS.emerald,
    route: "/capture/scan-card" as Href,
  },
  {
    icon: "home" as const,
    label: "Facility /\nLogo",
    sub: "Logo → NPI\nmatch",
    accentColor: "#6366f1",
    route: "/org-scan/new" as Href,
  },
  {
    icon: "grid" as const,
    label: "Badge /\nQR",
    sub: "Conference\nbadge import",
    accentColor: COLORS.amber,
    route: "/capture/scan-card" as Href,
  },
];

const ACTIONS = [
  { icon: "folder" as const, label: "Library", route: "/capture/scan-card" as Href },
  { icon: "edit-3" as const, label: "Manual", route: "/capture/new" as Href },
  { icon: "clock" as const, label: "History", route: "/capture/bulk" as Href },
];

export default function CaptureBottomSheet({ visible, onClose }: Props) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }),
        Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateY, { toValue: SHEET_HEIGHT, duration: 250, useNativeDriver: true }),
        Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 5,
      onPanResponderMove: (_, g) => { if (g.dy > 0) translateY.setValue(g.dy); },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DRAG_THRESHOLD || g.vy > 0.6) {
          onClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    }),
  ).current;

  const handleNav = (route: Href) => {
    onClose();
    setTimeout(() => router.push(route), 50);
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { paddingBottom: insets.bottom + 16 }, { transform: [{ translateY }] }]}
          {...panResponder.panHandlers}
        >
          <View style={styles.handle} />

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.headerTitleRow}>
                <Feather name="eye" size={16} color="#6366f1" />
                <Text style={styles.title}>Opportunity Eye</Text>
              </View>
              <Text style={styles.sub}>Unified capture · scan anything</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
              <Feather name="x" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Mode cards */}
          <View style={styles.modeRow}>
            {MODES.map((m) => (
              <TouchableOpacity
                key={m.label}
                style={[styles.modeCard, { borderColor: m.accentColor + "55" }]}
                onPress={() => handleNav(m.route)}
                activeOpacity={0.75}
              >
                <View style={[styles.modeIconWrap, { backgroundColor: m.accentColor + "1a" }]}>
                  <Feather name={m.icon} size={22} color={m.accentColor} />
                </View>
                <Text style={[styles.modeLabel, { color: m.accentColor }]}>{m.label}</Text>
                <Text style={styles.modeSub}>{m.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Action row */}
          <View style={styles.actionRow}>
            {ACTIONS.map(({ icon, label, route }) => (
              <TouchableOpacity
                key={label}
                style={styles.actionBtn}
                onPress={() => handleNav(route)}
                activeOpacity={0.75}
              >
                <Feather name={icon} size={14} color={COLORS.textMuted} />
                <Text style={styles.actionLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.6)",
  },

  sheet: {
    backgroundColor: "#0d2040",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#1e3a5f",
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 24,
  },

  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#1e3a5f",
    alignSelf: "center",
    marginBottom: 18,
  },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  headerLeft: { flex: 1 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: COLORS.text,
    letterSpacing: -0.3,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#1e3a5f",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },

  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  modeCard: {
    flex: 1,
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0a1628",
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  modeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  modeLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    textAlign: "center",
    lineHeight: 15,
  },
  modeSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: COLORS.textDim,
    textAlign: "center",
    lineHeight: 13,
  },

  divider: {
    height: 1,
    backgroundColor: "#1e3a5f",
    marginBottom: 14,
  },

  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#0a1628",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1e3a5f",
    paddingVertical: 11,
  },
  actionLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
