export const COLORS = {
  navy: "#0B1220",
  navyDark: "#070D18",
  navyMid: "#111827",
  navySurface: "#1A2535",
  navyBorder: "#253048",
  navyCard: "#162030",

  emerald: "#10B981",
  emeraldDark: "#059669",
  emeraldLight: "#34D399",
  emeraldMuted: "#10B98133",

  text: "#F1F5F9",
  textMuted: "#94A3B8",
  textDim: "#64748B",

  red: "#EF4444",
  amber: "#F59E0B",
  blue: "#3B82F6",
  purple: "#8B5CF6",
  cyan: "#06B6D4",

  white: "#FFFFFF",
  transparent: "transparent",
};

export default {
  light: {
    text: COLORS.text,
    background: COLORS.navy,
    tint: COLORS.emerald,
    tabIconDefault: COLORS.textDim,
    tabIconSelected: COLORS.emerald,
  },
};
