import { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "./Text";
import { drainOnce, useQueue } from "@/lib/order-queue";
import { useDocQueue, drainDocsOnce } from "@/lib/order-doc-queue";
import { useStatusQueue, drainStatusOnce } from "@/lib/status-queue";
import { useConnectivity } from "@/lib/connectivity";
import { isRetryableRpcError } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { theme } from "@/theme";
import { t, tn } from "@/lib/i18n";
import { orderDocLabel, queuedMeta, statusLabel } from "@/lib/labels";
import { toast } from "@/components/Toast";
import { amberSolid } from "@/lib/tones";

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
          t("common.stillWaiting"),
          online ? t("common.nothingNewToSync") : t("common.youreOfflineTheQueueWill"),
        );
      } else if (failed === 0) {
        toast.success(tn("sync.itemsSynced", sent));
      } else {
        Alert.alert(
          t("common.someFailed"),
          t("queueSummary.syncedStillWaitingCheckIndividual", { sent, failed }),
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
            ? t("queueSummary.failedToSendTapFor", { stuckCount })
            : t("queueSummary.waitingToSyncTapFor", { total })
        }
      >
        <View style={styles.dot} />
        <Text style={styles.chipText}>
          {stuckCount > 0
            ? t("queueSummary.failedTapToSeeWhy", { stuckCount })
            : t("queueSummary.waitingToSync", { total })}
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
              <Text style={styles.title}>{t("queueSummary.waitingToSync2")}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                onPress={() => setOpen(false)}
                hitSlop={16}
              >
                <Text style={styles.closeGlyph}>×</Text>
              </Pressable>
            </View>

            <Text style={styles.subtitle}>
              {stuckCount > 0
                ? t("queueSummary.someItemsFailedToSend")
                : online
                  ? t("queueSummary.retryingAutomaticallyTapRetryNow")
                  : t("queueSummary.youreOfflineItemsWillSend")}
            </Text>

            <ScrollView contentContainerStyle={styles.list}>
              {orderQ.length > 0 ? (
                <Section title={t("queueSummary.orders", { count: orderQ.length })}>
                  {orderQ.map((o) => (
                    <QueueRow
                      key={o.localId}
                      title={o.display.partyName || o.display.productName}
                      meta={`${tn("common.items", o.display.itemCount)} · ${queuedMeta(o.queuedAt, o.attempts)}`}
                      error={o.lastError}
                    />
                  ))}
                </Section>
              ) : null}

              {statusQ.length > 0 ? (
                <Section title={t("queueSummary.statusChanges", { count: statusQ.length })}>
                  {statusQ.map((s) => (
                    <QueueRow
                      key={s.localId}
                      title={`${s.orderNumber} → ${statusLabel(s.target)}`}
                      meta={queuedMeta(s.queuedAt, s.attempts)}
                      error={s.lastError}
                    />
                  ))}
                </Section>
              ) : null}

              {docQ.length > 0 ? (
                <Section title={t("queueSummary.documents", { count: docQ.length })}>
                  {docQ.map((d) => (
                    <QueueRow
                      key={d.localId}
                      title={orderDocLabel(d.type) + (d.pageIndex ? t("queueSummary.page", { pageIndex: d.pageIndex }) : "")}
                      meta={queuedMeta(d.queuedAt, d.attempts)}
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
                accessibilityLabel={t("common.retrySyncingNow")}
              >
                <Text style={styles.retryText}>
                  {retrying ? t("common.syncing") : t("common.retryNow")}
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
    backgroundColor: amberSolid,
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
    fontSize: 13,
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
