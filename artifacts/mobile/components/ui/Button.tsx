import React from "react";
import { TouchableOpacity, Text, StyleSheet, ViewStyle, ActivityIndicator, View } from "react-native";
import { COLORS } from "@/constants/colors";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  style?: ViewStyle;
}

export function Button({ title, onPress, variant = "primary", size = "md", loading, disabled, icon, style }: ButtonProps) {
  const bg = variant === "primary" ? COLORS.emerald
    : variant === "secondary" ? COLORS.navySurface
    : variant === "danger" ? COLORS.red
    : "transparent";

  const textColor = variant === "ghost" ? COLORS.emerald : COLORS.white;
  const borderColor = variant === "ghost" ? COLORS.navyBorder : "transparent";

  const pad = size === "sm" ? { px: 12, py: 8 } : size === "lg" ? { px: 24, py: 16 } : { px: 16, py: 12 };
  const fontSize = size === "sm" ? 13 : size === "lg" ? 17 : 15;

  return (
    <TouchableOpacity
      style={[
        styles.button,
        { backgroundColor: bg, borderColor, paddingHorizontal: pad.px, paddingVertical: pad.py, opacity: disabled ? 0.5 : 1 },
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.75}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <View style={styles.inner}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text style={[styles.text, { color: textColor, fontSize }]}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  icon: {
    marginRight: 2,
  },
  text: {
    fontFamily: "Inter_600SemiBold",
  },
});
