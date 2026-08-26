import { useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/theme";

// Compact single-row dropdown. Replaces the ChipRow for lists that
// don't need to fit on one line (packing / size — 20+ options each).
// Tap opens a full-height modal picker; picking one closes it.
// The trigger row shows the current value or a "Choose…" placeholder.

export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  formatLabel,
}: {
  label: string;
  value: string | null;
  options: readonly string[];
  onChange: (v: string) => void;
  placeholder?: string;
  /** Optional value -> display string. Wire value stays raw. */
  formatLabel?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  const displayed = value
    ? (formatLabel ? formatLabel(value) : value)
    : placeholder;

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ?? placeholder}. Opens picker.`}
      >
        <Text style={styles.triggerLabel}>{label}</Text>
        <View style={styles.triggerRow}>
          <Text
            style={[
              styles.triggerValue,
              !value && styles.triggerPlaceholder,
            ]}
            numberOfLines={1}
          >
            {displayed}
          </Text>
          <Text style={styles.chevron}>▾</Text>
        </View>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View
          style={[
            styles.sheet,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <Pressable
              onPress={() => setOpen(false)}
              hitSlop={16}
              accessibilityRole="button"
              accessibilityLabel="Close picker"
            >
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <FlatList
            data={options}
            keyExtractor={(v) => v}
            renderItem={({ item }) => {
              const active = item === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.row,
                    active && styles.rowActive,
                    pressed && { opacity: 0.7 },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    style={[styles.rowLabel, active && styles.rowLabelActive]}
                  >
                    {formatLabel ? formatLabel(item) : item}
                  </Text>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            }}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
          />
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    minHeight: 60,
    justifyContent: "center",
  },
  triggerLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 4,
  },
  triggerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  triggerValue: {
    flex: 1,
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
  },
  triggerPlaceholder: {
    color: theme.colors.textMuted,
    fontWeight: "500",
  },
  chevron: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "75%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sheetTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  close: {
    fontSize: 20,
    color: theme.colors.textMuted,
    padding: 4,
  },
  row: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  rowActive: {
    backgroundColor: theme.colors.surface,
  },
  rowLabel: {
    flex: 1,
    fontSize: theme.type.body,
    color: theme.colors.text,
  },
  rowLabelActive: {
    color: theme.colors.primary,
    fontWeight: "700",
  },
  check: {
    fontSize: 18,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  sep: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing.md,
  },
});
