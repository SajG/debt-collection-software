import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

// Custom pad instead of the OS number keyboard: guarantees big keys
// on every device, no ambiguity with tiny "next" buttons, and works
// identically to a calculator these users already know.

const KEYS: (string | "back")[] = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  ".", "0", "back",
];

export function NumberPad({
  value,
  onChange,
  max = 12,
}: {
  value: string;
  onChange: (next: string) => void;
  max?: number;
}) {
  function press(k: string | "back") {
    if (k === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (k === "." && value.includes(".")) return;
    if (value.length >= max) return;
    if (k === "." && value === "") {
      onChange("0.");
      return;
    }
    // Strip a leading zero when a real digit follows: "0" + "5" → "5".
    if (value === "0" && k !== ".") {
      onChange(k);
      return;
    }
    onChange(value + k);
  }

  return (
    <View style={styles.wrap}>
      {KEYS.map((k) => (
        <Pressable
          key={String(k)}
          onPress={() => press(k)}
          style={({ pressed }) => [styles.key, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel={k === "back" ? "backspace" : k}
        >
          <Text style={styles.keyLabel}>{k === "back" ? "⌫" : k}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  key: {
    width: "31%",
    aspectRatio: 1.6,
    minHeight: theme.tap + 12,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.7 },
  keyLabel: {
    fontSize: 30,
    fontWeight: "700",
    color: theme.colors.text,
  },
});
