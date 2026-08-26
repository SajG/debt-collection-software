import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { theme } from "@/theme";

// Shimmer skeleton primitives. Prefer these over ActivityIndicator on
// list screens so the layout doesn't jump when data lands. Height on
// OrderCardSkeleton matches OrderCard's real footprint.

function useShimmer(): Animated.Value {
  const v = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return v;
}

export function SkeletonBlock({
  width,
  height,
  radius = 6,
}: {
  width?: number | `${number}%`;
  height: number;
  radius?: number;
}) {
  const opacity = useShimmer();
  return (
    <Animated.View
      style={[
        styles.block,
        { width: width ?? "100%", height, borderRadius: radius, opacity },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/** Matches OrderCard's real footprint (party title + product + qty row). */
export function OrderCardSkeleton() {
  return (
    <View style={styles.card} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.rowSpread}>
        <SkeletonBlock width="60%" height={22} />
        <SkeletonBlock width={60} height={22} radius={999} />
      </View>
      <SkeletonBlock width="80%" height={16} />
      <View style={styles.rowSpread}>
        <SkeletonBlock width={100} height={16} />
        <SkeletonBlock width={80} height={14} />
      </View>
    </View>
  );
}

/** N skeleton cards in a vertical list. */
export function OrderCardSkeletonList({ count = 4 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: theme.colors.border },
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 10,
  },
  rowSpread: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
