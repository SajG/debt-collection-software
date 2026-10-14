import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { SkeletonBlock } from "./Skeleton";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// The three non-data states every list shows: loading (skeleton rows
// shaped like the real ones, so nothing jumps), failed (what went wrong
// + Retry), and empty (see EmptyState). Use listEmpty() to pick one.

export function RowSkeletonList({ count = 6 }: { count?: number }) {
  return (
    <View
      style={styles.skeletonList}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          <View style={styles.skeletonTop}>
            <SkeletonBlock width="55%" height={20} />
            <SkeletonBlock width={72} height={20} />
          </View>
          <SkeletonBlock width="35%" height={14} />
        </View>
      ))}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string | null;
  onRetry: () => void;
}) {
  return (
    <View style={styles.error} accessibilityRole="alert">
      <Text style={styles.errorGlyph}>!</Text>
      <Text style={styles.errorTitle}>{t("list.errorTitle")}</Text>
      <Text style={styles.errorBody}>{message || t("error.network")}</Text>
      <Button
        label={t("retry")}
        variant="secondary"
        fullWidth={false}
        onPress={onRetry}
        accessibilityLabel={t("retry")}
      />
    </View>
  );
}

/** ListEmptyComponent for a FlatList: skeleton while the first load is
 *  in flight, error + Retry when it failed, otherwise the empty state. */
export function listEmpty(opts: {
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  empty: React.ReactElement;
  skeletonCount?: number;
}): React.ReactElement {
  if (opts.error) return <ErrorState message={opts.error} onRetry={opts.onRetry} />;
  if (opts.loading) return <RowSkeletonList count={opts.skeletonCount} />;
  return opts.empty;
}

const styles = StyleSheet.create({
  skeletonList: { gap: 10 },
  skeletonRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 10,
  },
  skeletonTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  error: {
    alignItems: "center",
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xl,
    paddingHorizontal: theme.spacing.lg,
  },
  errorGlyph: {
    width: 56,
    height: 56,
    borderRadius: 28,
    textAlign: "center",
    textAlignVertical: "center",
    lineHeight: 56,
    fontSize: 28,
    fontWeight: "800",
    color: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
    overflow: "hidden",
  },
  errorTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    textAlign: "center",
  },
  errorBody: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
});
