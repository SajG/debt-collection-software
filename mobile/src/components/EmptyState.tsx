import { Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "@/theme";

// Reusable empty-state block. Every list screen renders one when its
// data set is empty. Consistent glyph + one-line explanation + optional
// primary action so a first-time user always knows what to do next.

export function EmptyState({
  glyph = "⌂",
  title,
  body,
  actionLabel,
  onAction,
  footnote,
}: {
  /** Single unicode glyph — cheap "illustration" without an icon dep. */
  glyph?: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Small line under the body — e.g. "last order arrived 2 h ago". */
  footnote?: string;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <View style={styles.iconWrap}>
        <Text style={styles.glyph}>{glyph}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && { opacity: 0.85 }]}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing.xl * 2,
    paddingHorizontal: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: theme.spacing.sm,
  },
  glyph: {
    fontSize: 36,
    color: theme.colors.textMuted,
  },
  title: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  body: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    textAlign: "center",
    maxWidth: 320,
  },
  footnote: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
    fontStyle: "italic",
    marginTop: 2,
  },
  action: {
    marginTop: theme.spacing.md,
    minHeight: theme.tap,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  actionText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: theme.type.button,
  },
});
