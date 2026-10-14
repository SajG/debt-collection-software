import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { errorHaptic, successHaptic } from "@/lib/haptics";
import { theme } from "@/theme";

// One toast at a time, shown above the tab bar. Every successful save
// calls toast.success() — the buzz plus the green bar is the "it
// worked" signal for someone who is not reading the screen closely.

type Kind = "success" | "error";
type Message = { id: number; kind: Kind; text: string };

let listener: ((m: Message) => void) | null = null;
let nextId = 1;

function show(kind: Kind, text: string) {
  if (kind === "success") successHaptic();
  else errorHaptic();
  AccessibilityInfo.announceForAccessibility(text);
  listener?.({ id: nextId++, kind, text });
}

export const toast = {
  success: (text: string) => show("success", text),
  error: (text: string) => show("error", text),
};

const VISIBLE_MS = 2600;

/** Mount once, in the root layout. */
export function ToastHost() {
  const [message, setMessage] = useState<Message | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  useEffect(() => {
    listener = setMessage;
    return () => {
      listener = null;
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setMessage((m) => (m?.id === message.id ? null : m));
        },
      );
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [message, opacity]);

  if (!message) return null;
  const isError = message.kind === "error";
  return (
    <View pointerEvents="none" style={[styles.host, { bottom: insets.bottom + 84 }]}>
      <Animated.View
        style={[styles.toast, isError && styles.toastError, { opacity }]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Text style={styles.glyph}>{isError ? "!" : "✓"}</Text>
        <Text style={styles.text}>{message.text}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: theme.spacing.md,
    right: theme.spacing.md,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 480,
    minHeight: 48,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.bond,
    elevation: 6,
    shadowColor: theme.colors.ink,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  toastError: { backgroundColor: theme.colors.fault },
  glyph: { color: theme.colors.white, fontSize: 18, fontWeight: "800" },
  text: {
    flexShrink: 1,
    color: theme.colors.white,
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
  },
});
