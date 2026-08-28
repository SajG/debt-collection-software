import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { drainOnce, useQueue } from "@/lib/order-queue";
import { useDocQueue, drainDocsOnce } from "@/lib/order-doc-queue";
import { useStatusQueue, drainStatusOnce } from "@/lib/status-queue";
import { useConnectivity } from "@/lib/connectivity";
import { isRetryableRpcError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { SyncitMark } from "./SyncitMark";
import { theme } from "@/theme";

// The signature element.
//
// Persistent pill in every app bar. One of four states, drawn from
// three sources of truth (connectivity + queue depth + in-flight):
//
//   Synced      — online AND every queue empty
//   N queued    — offline OR queue has waiting items and nothing
//                 in flight right now
//   Syncing…    — a drain pass is running (retry button, cold start,
//                 or connectivity flip)
//   N failed    — one or more items have a non-retryable error;
//                 pill turns red so it can't be missed
//
// Tap opens a bottom sheet listing every queued item with a manual
// "Retry now". Existing queue drainers are the source of truth — this
// component only READS, never mutates, except via the drain helpers.

type Kind = "synced" | "queued" | "syncing" | "failed";

export function SyncPill() {
  const { online } = useConnectivity();
  const orderQ = useQueue();
  const docQ = useDocQueue();
  const statusQ = useStatusQueue();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const total = orderQ.length + docQ.length + statusQ.length;
  const failed =
    orderQ.filter((o) => o.lastError && !isRetryableRpcError(o.lastError))
      .length +
    docQ.filter((d) => d.lastError && !isRetryableRpcError(d.lastError))
      .length +
    statusQ.filter((s) => s.lastError && !isRetryableRpcError(s.lastError))
      .length;

  const kind: Kind = retrying
    ? "syncing"
    : failed > 0
      ? "failed"
      : total > 0
        ? "queued"
        : "synced";

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.pill,
          pillTone(kind),
          !online && kind !== "failed" ? styles.offlineTone : null,
          pressed && { opacity: 0.9 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={pillA11yLabel(kind, total, failed, online)}
      >
        <RotatingMark spinning={kind === "syncing"} />
        <Text style={styles.pillText}>{pillLabel(kind, total, failed, online)}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Sync</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>{sheetSubtitle(kind, online)}</Text>
            <ScrollView contentContainerStyle={styles.list}>
              {total === 0 ? (
                <Text style={styles.empty}>Everything is up to date.</Text>
              ) : (
                <>
                  {orderQ.length > 0 ? (
                    <Section title={`Orders · ${orderQ.length}`}>
                      {orderQ.map((o) => (
                        <QueueRow
                          key={o.localId}
                          title={o.display.partyName || o.display.productName || "Order"}
                          meta={`${o.display.itemCount} item${o.display.itemCount === 1 ? "" : "s"} · queued ${formatDate(new Date(o.queuedAt))}${o.attempts > 0 ? ` · ${o.attempts} retries` : ""}`}
                          error={o.lastError}
                        />
                      ))}
                    </Section>
                  ) : null}
                  {statusQ.length > 0 ? (
                    <Section title={`Status changes · ${statusQ.length}`}>
                      {statusQ.map((s) => (
                        <QueueRow
                          key={s.localId}
                          title={`${s.orderNumber} → ${s.target.replace(/_/g, " ")}`}
                          meta={`queued ${formatDate(new Date(s.queuedAt))}${s.attempts > 0 ? ` · ${s.attempts} retries` : ""}`}
                          error={s.lastError}
                        />
                      ))}
                    </Section>
                  ) : null}
                  {docQ.length > 0 ? (
                    <Section title={`Documents · ${docQ.length}`}>
                      {docQ.map((d) => (
                        <QueueRow
                          key={d.localId}
                          title={d.type + (d.pageIndex ? ` — page ${d.pageIndex}` : "")}
                          meta={`queued ${formatDate(new Date(d.queuedAt))}${d.attempts > 0 ? ` · ${d.attempts} retries` : ""}`}
                          error={d.lastError}
                        />
                      ))}
                    </Section>
                  ) : null}
                </>
              )}
            </ScrollView>
            <View style={styles.footer}>
              <Pressable
                onPress={async () => {
                  setRetrying(true);
                  try {
                    const [orders, docs, status] = await Promise.all([
                      drainOnce(),
                      drainDocsOnce(),
                      drainStatusOnce(),
                    ]);
                    const sent = orders.sent + docs.sent + status.sent;
                    const failedNow = orders.failed + docs.failed + status.failed;
                    if (sent === 0 && failedNow === 0) {
                      Alert.alert(
                        "Still waiting",
                        online
                          ? "Nothing new to sync."
                          : "You're offline. The queue will drain when you're back online.",
                      );
                    } else if (failedNow === 0) {
                      Alert.alert("Sent", `${sent} item${sent === 1 ? "" : "s"} synced.`);
                    } else {
                      Alert.alert(
                        "Some failed",
                        `${sent} synced · ${failedNow} still waiting. See individual items for the reason.`,
                      );
                    }
                  } finally {
                    setRetrying(false);
                  }
                }}
                disabled={retrying}
                style={({ pressed }) => [
                  styles.retryBtn,
                  (retrying || !online) && { opacity: 0.6 },
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Retry syncing now"
              >
                <Text style={styles.retryText}>
                  {retrying ? "Syncing…" : "Retry now"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function pillLabel(kind: Kind, total: number, failed: number, online: boolean): string {
  if (kind === "syncing") return "Syncing…";
  if (kind === "failed") return `${failed} failed`;
  if (kind === "queued") return online ? `${total} queued` : `Offline · ${total} queued`;
  return online ? "Synced" : "Offline";
}

function pillA11yLabel(kind: Kind, total: number, failed: number, online: boolean): string {
  if (kind === "syncing") return "Syncing now. Tap for details.";
  if (kind === "failed") return `${failed} item${failed === 1 ? "" : "s"} failed to sync. Tap to see why.`;
  if (kind === "queued") return `${total} item${total === 1 ? "" : "s"} waiting to sync. Tap for details.`;
  return online ? "Everything synced. Tap for details." : "You're offline. Tap for details.";
}

function sheetSubtitle(kind: Kind, online: boolean): string {
  if (kind === "failed") {
    return "Some items failed. The reason under each usually means the server is missing a migration, or the action isn't allowed. Retrying won't help until that's fixed.";
  }
  if (kind === "queued") {
    return online
      ? "Retrying automatically. Tap Retry now to push straight away."
      : "You're offline. Items will send automatically when you're back online.";
  }
  if (kind === "syncing") return "Draining the queue now.";
  return online ? "Nothing waiting." : "You're offline.";
}

function pillTone(kind: Kind) {
  switch (kind) {
    case "failed":
      return { backgroundColor: theme.colors.fault };
    case "queued":
      return { backgroundColor: "#D97706" };
    case "syncing":
      return { backgroundColor: theme.colors.kiln };
    default:
      return { backgroundColor: theme.colors.bond };
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

function QueueRow({
  title,
  meta,
  error,
}: {
  title: string;
  meta: string;
  error: string | null;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowMeta}>{meta}</Text>
      {error ? <Text style={styles.rowError}>{error}</Text> : null}
    </View>
  );
}

function RotatingMark({ spinning }: { spinning: boolean }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!spinning) {
      spin.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spinning, spin]);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <SyncitMark size={16} variant="brand" />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    minHeight: 32,
    alignSelf: "flex-start",
  },
  offlineTone: { backgroundColor: theme.colors.fault },
  pillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 12,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginTop: 8,
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: theme.spacing.lg,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  close: {
    fontSize: 32,
    lineHeight: 32,
    color: theme.colors.textMuted,
    paddingHorizontal: 8,
  },
  subtitle: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.md,
  },
  empty: {
    padding: theme.spacing.lg,
    textAlign: "center",
    color: theme.colors.textMuted,
    fontSize: theme.type.bodySmall,
  },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    marginTop: theme.spacing.sm,
  },
  row: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  rowMeta: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  rowError: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.danger,
    marginTop: 4,
  },
  footer: {
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  retryBtn: {
    minHeight: theme.tap,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  retryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: theme.type.button,
  },
});
