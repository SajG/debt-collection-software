import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

/**
 * Big vertical single-select list — each row is a full-width tap target
 * with a check mark on the selected item. Used for long-ish pick lists
 * where segmented buttons would wrap awkwardly (packing, payment terms).
 */
export function PickList<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { label: string; value: T; sub?: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.row,
              active && styles.active,
              pressed && styles.pressed,
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, active && styles.activeLabel]}>
                {opt.label}
              </Text>
              {opt.sub ? (
                <Text style={styles.sub}>{opt.sub}</Text>
              ) : null}
            </View>
            {active ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: {
    minHeight: theme.tap,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  active: {
    borderColor: theme.colors.primary,
    backgroundColor: "#EAF2EF",
  },
  pressed: { opacity: 0.85 },
  label: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  activeLabel: { color: theme.colors.primary },
  sub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  check: {
    fontSize: 22,
    color: theme.colors.primary,
    fontWeight: "800",
  },
});
