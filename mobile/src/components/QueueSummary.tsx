import { useCallback, useState } from "react";
import {
  Alert,
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
import { theme } from "@/theme";

// Persistent "N items waiting to sync" chip. Sits inside home screens
// (staff + factory). Tap to expand a bottom-sheet breakdown by kind,
// with a manual "Retry now" that re-runs every drainer. A salesperson
// in a basement godown can watch the number tick down themselves
// rather than trusting the invisible drainer.

export function QueueSummary() {
  const { online } = useConnectivity();
  const orderQ = useQueue();
  const docQ = useDocQueue();
  const statusQ = useStatusQueue();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const total = orderQ.length + docQ.length + statusQ.length;
  if (total === 0) return null;

  // An entry is "stuck" when its last error is app-shape (missing
  // function, permission denied, validation) — retrying can't fix it.
  // The chip switches to red + different copy so the user knows this
  // isn't a wait-for-signal situation.
  const stuckCount =
    orderQ.filter((o) => o.lastError && !isRetryableRpcError(o.lastError))
      .length +
    docQ.filter((d) => d.lastError && !isRetryableRpcError(d.lastError))
      .length +
    statusQ.filter((s) => s.lastError && !isRetryableRpcError(s.lastError))
      .length;

  const retry = useCallback(async () => {
    setRetrying(true);
    try {
      const [orders, docs, status] = await Promise.all([
        drainOnce(),
        drainDocsOnce(),
        drainStatusOnce(),
      ]);
      const sent = orders.sent + docs.sent + status.sent;
      const failed = orders.failed + docs.failed + status.failed;
      if (sent === 0 && failed === 0) {
        Alert.alert(
          "Still waiting",
          online ? "Nothing new to sync." : "You're offline. The queue will drain when you're back online.",
        );
      } else if (failed === 0) {
        Alert.alert("Sent", `${sent} item${sent === 1 ? "" : "s"} synced.`);
      } else {
        Alert.alert(
          "Some failed",
          `${sent} synced · ${failed} still waiting. Check individual items for the reason.`,
        );
      }
    } finally {
      setRetrying(false);
    }
  }, [online]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.chip,
          (!online || stuckCount > 0) && styles.chipOffline,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          stuckCount > 0
            ? `${stuckCount} failed to send. Tap for details.`
            : `${total} waiting to sync. Tap for details.`
        }
      >
        <View style={styles.dot} />
        <Text style={styles.chipText}>
          {stuckCount > 0
            ? `${stuckCount} failed — tap to see why`
            : `${total} waiting to sync`}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <Text style={styles.title}>Waiting to sync</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={12}>
                <Text style={styles.closeGlyph}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.subtitle}>
              {stuckCount > 0
                ? "Some items failed to send. Check the reason under each — this usually means the server is missing a database migration or the action isn't allowed. Retrying won't help until that's fixed."
                : online
                  ? "Retrying automatically. Tap Retry now to push straight away."
                  : "You're offline. Items will send automatically when you're back online."}
            </Text>

            <ScrollView contentContainerStyle={styles.list}>
              {orderQ.length > 0 ? (
                <Section title={`Orders · ${orderQ.length}`}>
                  {orderQ.map((o) => (
                    <QueueRow
                      key={o.localId}
                      title={o.display.partyName || o.display.productName}
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
            </ScrollView>

            <View style={styles.footer}>
              <Pressable
                onPress={retry}
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

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#D97706",
    minHeight: 40,
    justifyContent: "center",
    alignSelf: "flex-start",
  },
  chipOffline: { backgroundColor: theme.colors.danger },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  chipText: { color: "#fff", fontWeight: "700", fontSize: 13 },
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
  closeGlyph: {
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
