import { StyleSheet, Text, View } from "react-native";
import { useConnectivity } from "@/lib/connectivity";
import { useQueue } from "@/lib/order-queue";
import { t } from "@/lib/i18n";

// Persistent banner. Renders under the status bar whenever we're offline
// OR when there are queued orders (even after we're back online, until
// the drainer clears them). Both states tell the user something they
// need to know: "your order isn't with the office yet."
export function OfflineBanner() {
  const { online } = useConnectivity();
  const queue = useQueue();
  const pending = queue.length;

  if (online && pending === 0) return null;

  return (
    <View
      accessibilityRole="alert"
      style={[styles.wrap, online ? styles.pending : styles.offline]}
    >
      <Text style={styles.text} numberOfLines={2}>
        {online ? t("offline.queued", { count: pending }) : t("offline.banner")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  offline: { backgroundColor: "#B42318" },
  pending: { backgroundColor: "#D97706" },
  text: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
});
