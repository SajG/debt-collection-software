import { StyleSheet, Text, View } from "react-native";
import type { OrderStatus } from "@/lib/database.types";
import { statusStyle } from "@/lib/status-style";
import { t } from "@/lib/i18n";

export function StatusBadge({
  status,
  size = "md",
}: {
  status: OrderStatus;
  size?: "sm" | "md" | "lg";
}) {
  const c = statusStyle(status);
  const s = SIZE_STYLES[size];
  return (
    <View style={[styles.pill, s.wrap, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, s.text, { color: c.fg }]} numberOfLines={1}>
        {t(`status.${status}` as `status.${OrderStatus}`)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  text: { fontWeight: "700" },
});

const SIZE_STYLES = {
  sm: {
    wrap: { paddingHorizontal: 10, paddingVertical: 4 },
    text: { fontSize: 13 },
  },
  md: {
    wrap: { paddingHorizontal: 14, paddingVertical: 8 },
    text: { fontSize: 15 },
  },
  lg: {
    wrap: { paddingHorizontal: 18, paddingVertical: 12 },
    text: { fontSize: 18 },
  },
} as const;
