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

interface CaptureOption {
  icon: string;
  label: string;
  sub: string;
  color: string;
  route: Href;
}

const OPTIONS: CaptureOption[] = [
  {
    icon: "credit-card",
    label: "Scan Business Card",
    sub: "Camera OCR — pre-fills name, phone & email",
    color: COLORS.emerald,
    route: "/capture/scan-card" as Href,
  },
  {
    icon: "edit-3",
    label: "Manual Entry",
    sub: "Type name, phone, email and assign an org",
    color: "#60a5fa",
    route: "/capture/new" as Href,
  },
  {
    icon: "users",
    label: "Import iOS Contact",
    sub: "Pick one contact from your device",
    color: "#a78bfa",
    route: "/capture/pick-contact" as Href,
  },
  {
    icon: "image",
    label: "Scan Business Location",
    sub: "Photo of storefront or sign — OCR to org",
    color: "#f59e0b",
    route: "/org-scan/new" as Href,
  },
  {
    icon: "upload",
    label: "Bulk Import CSV",
    sub: "Spreadsheet of contacts — coming soon",
    color: "#34d399",
    route: "/capture/bulk" as Href,
  },
];

const SHEET_HEIGHT = 480;
const DRAG_THRESHOLD = 80;

interface Props {
  visible: boolean;
  onClose: () => void;
}

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
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > DRAG_THRESHOLD || g.vy > 0.6) {
          onClose();
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
        }
      },
    }),
  ).current;

  const handleOption = (route: Href) => {
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
          style={[
            styles.sheet,
            { paddingBottom: insets.bottom + 16 },
            { transform: [{ translateY }] },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={styles.handle} />

          <Text style={styles.title}>How do you want to capture?</Text>
          <Text style={styles.sub}>All paths normalize, dedup, and assign an org before saving.</Text>

          <View style={styles.list}>
            {OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={styles.row}
                onPress={() => handleOption(opt.route)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: opt.color + "22" }]}>
                  <Feather name={opt.icon as "edit-3"} size={20} color={opt.color} />
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>{opt.label}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{opt.sub}</Text>
                </View>
                <Feather name="chevron-right" size={15} color={COLORS.textDim} />
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
    backgroundColor: "rgba(0,0,0,0.55)",
  },

  sheet: {
    backgroundColor: COLORS.navySurface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 24,
  },

  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.navyBorder,
    alignSelf: "center",
    marginBottom: 16,
  },

  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: COLORS.text,
    marginBottom: 4,
  },
  sub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
    marginBottom: 18,
  },

  list: { gap: 2 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 4,
    borderRadius: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  rowText: { flex: 1 },
  rowLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 2,
  },
  rowSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: COLORS.textMuted,
  },
});
