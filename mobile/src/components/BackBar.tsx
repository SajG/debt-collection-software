import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { theme } from "@/theme";

// Lightweight in-screen back bar. Root Stack has headerShown:false
// (custom per-screen headers), so detail pages had no back affordance.
// Drop this at the top of any deep screen and it renders a tappable
// "‹ Back" plus an optional title. Falls back to router.replace of the
// home if the stack has no parent (deep-link, cold start).
export function BackBar({
  title,
  fallback,
}: {
  title?: string;
  /** Where to go if there's no history to pop. Default: "/". */
  fallback?: string;
}) {
  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace((fallback ?? "/") as never);
  };

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={goBack}
        hitSlop={12}
        style={({ pressed }) => [styles.btn, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={styles.chevron}>‹</Text>
        <Text style={styles.label}>Back</Text>
      </Pressable>
      {title ? (
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
      ) : null}
      <View style={{ width: 60 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 44,
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    minHeight: theme.tap,
    minWidth: 60,
    paddingRight: 8,
  },
  chevron: {
    fontSize: 28,
    lineHeight: 30,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  label: {
    fontSize: theme.type.body,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  title: {
    flex: 1,
    textAlign: "center",
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
});
