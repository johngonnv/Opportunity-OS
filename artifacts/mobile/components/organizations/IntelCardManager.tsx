import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { COLORS } from "@/constants/colors";
import { CMSEvidenceCard } from "./CMSEvidenceCard";
import { PainPointsCard } from "./PainPointsCard";
import { CompetitorLandscapeCard } from "./CompetitorLandscapeCard";
import { EntryStrategyCard } from "./EntryStrategyCard";

type CardId = "cms" | "painpoints" | "competitors" | "entry";

interface CardDef {
  id: CardId;
  title: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
}

const CARD_DEFS: Record<CardId, CardDef> = {
  cms: { id: "cms", title: "CMS Evidence", icon: "activity", color: COLORS.cyan },
  painpoints: { id: "painpoints", title: "Pain Points", icon: "alert-circle", color: COLORS.amber },
  competitors: { id: "competitors", title: "Competitor Landscape", icon: "shield-off", color: COLORS.purple },
  entry: { id: "entry", title: "Entry Strategy", icon: "cpu", color: COLORS.cyan },
};

const DEFAULT_ORDER: CardId[] = ["cms", "painpoints", "competitors", "entry"];
const DEFAULT_COLLAPSED: Record<CardId, boolean> = {
  cms: false,
  painpoints: false,
  competitors: false,
  entry: false,
};

interface StoredState {
  order: CardId[];
  collapsed: Record<CardId, boolean>;
}

function storageKey(orgId: string) {
  return `intel_cards:${orgId}`;
}

async function loadState(orgId: string): Promise<StoredState> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(orgId));
    if (!raw) return { order: DEFAULT_ORDER, collapsed: { ...DEFAULT_COLLAPSED } };
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    const order: CardId[] = Array.isArray(parsed.order) && parsed.order.length === 4
      ? parsed.order
      : DEFAULT_ORDER;
    const collapsed: Record<CardId, boolean> = {
      ...DEFAULT_COLLAPSED,
      ...(parsed.collapsed || {}),
    };
    return { order, collapsed };
  } catch {
    return { order: DEFAULT_ORDER, collapsed: { ...DEFAULT_COLLAPSED } };
  }
}

async function saveState(orgId: string, state: StoredState) {
  try {
    await AsyncStorage.setItem(storageKey(orgId), JSON.stringify(state));
  } catch {
  }
}

function CollapseBar({
  cardId,
  collapsed,
  canMoveUp,
  canMoveDown,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  cardId: CardId;
  collapsed: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const def = CARD_DEFS[cardId];
  const chevronAnim = useRef(new Animated.Value(collapsed ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: collapsed ? 1 : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [collapsed]);

  const chevronRotation = chevronAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-180deg"],
  });

  return (
    <View style={bs.bar}>
      <View style={bs.left}>
        <View style={[bs.reorderWrap]}>
          <TouchableOpacity
            style={[bs.reorderBtn, !canMoveUp && bs.reorderBtnDisabled]}
            onPress={canMoveUp ? onMoveUp : undefined}
            activeOpacity={canMoveUp ? 0.7 : 1}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="chevron-up" size={13} color={canMoveUp ? COLORS.textMuted : COLORS.navyBorder} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[bs.reorderBtn, !canMoveDown && bs.reorderBtnDisabled]}
            onPress={canMoveDown ? onMoveDown : undefined}
            activeOpacity={canMoveDown ? 0.7 : 1}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Feather name="chevron-down" size={13} color={canMoveDown ? COLORS.textMuted : COLORS.navyBorder} />
          </TouchableOpacity>
        </View>
        <View style={[bs.iconWrap, { backgroundColor: def.color + "18" }]}>
          <Feather name={def.icon} size={12} color={def.color} />
        </View>
        <Text style={bs.title}>{def.title}</Text>
      </View>

      <TouchableOpacity
        style={bs.collapseBtn}
        onPress={onToggle}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }}
      >
        <Text style={[bs.collapseLabel, collapsed && bs.collapseLabelCollapsed]}>
          {collapsed ? "Show" : "Hide"}
        </Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotation }] }}>
          <Feather name="chevron-up" size={13} color={COLORS.textDim} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

interface Props {
  orgId: string;
  isAdmin: boolean;
}

export function IntelCardManager({ orgId, isAdmin }: Props) {
  const [order, setOrder] = useState<CardId[]>(DEFAULT_ORDER);
  const [collapsed, setCollapsed] = useState<Record<CardId, boolean>>({ ...DEFAULT_COLLAPSED });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadState(orgId).then((state) => {
      setOrder(state.order);
      setCollapsed(state.collapsed);
      setLoaded(true);
    });
  }, [orgId]);

  const persist = (nextOrder: CardId[], nextCollapsed: Record<CardId, boolean>) => {
    saveState(orgId, { order: nextOrder, collapsed: nextCollapsed });
  };

  const handleToggle = (cardId: CardId) => {
    const next = { ...collapsed, [cardId]: !collapsed[cardId] };
    setCollapsed(next);
    persist(order, next);
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const next = [...order];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    setOrder(next);
    persist(next, collapsed);
  };

  const handleMoveDown = (index: number) => {
    if (index === order.length - 1) return;
    const next = [...order];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    setOrder(next);
    persist(next, collapsed);
  };

  if (!loaded) return null;

  return (
    <View>
      {order.map((cardId, index) => (
        <View key={cardId} style={cs.cardSlot}>
          <CollapseBar
            cardId={cardId}
            collapsed={collapsed[cardId]}
            canMoveUp={index > 0}
            canMoveDown={index < order.length - 1}
            onToggle={() => handleToggle(cardId)}
            onMoveUp={() => handleMoveUp(index)}
            onMoveDown={() => handleMoveDown(index)}
          />
          {!collapsed[cardId] && (
            <View style={cs.cardBody}>
              {cardId === "cms" && <CMSEvidenceCard orgId={orgId} />}
              {cardId === "painpoints" && <PainPointsCard orgId={orgId} isAdmin={isAdmin} />}
              {cardId === "competitors" && <CompetitorLandscapeCard orgId={orgId} isAdmin={isAdmin} />}
              {cardId === "entry" && <EntryStrategyCard orgId={orgId} isAdmin={isAdmin} />}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

const bs = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.navySurface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.navyBorder,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 0,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  reorderWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  reorderBtn: {
    padding: 2,
  },
  reorderBtnDisabled: {
    opacity: 0.35,
  },
  iconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: COLORS.text,
    flex: 1,
  },
  collapseBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 8,
  },
  collapseLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: COLORS.textDim,
  },
  collapseLabelCollapsed: {
    color: COLORS.blue,
  },
});

const cs = StyleSheet.create({
  cardSlot: {
    marginBottom: 16,
  },
  cardBody: {
    marginTop: 8,
  },
});
