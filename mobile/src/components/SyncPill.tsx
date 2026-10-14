import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
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
import { SyncitMark } from "./SyncitMark";
import { theme } from "@/theme";
import { t, tn } from "@/lib/i18n";
import { orderDocLabel, queuedMeta, statusLabel } from "@/lib/labels";
import { toast } from "@/components/Toast";
import { amberSolid } from "@/lib/tones";

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
              <Text style={styles.title}>{t("syncPill.sync")}</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.close")}
                onPress={() => setOpen(false)}
                hitSlop={16}
              >
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <Text style={styles.subtitle}>{sheetSubtitle(kind, online)}</Text>
            <ScrollView contentContainerStyle={styles.list}>
              {total === 0 ? (
                <Text style={styles.empty}>{t("syncPill.everythingIsUpToDate")}</Text>
              ) : (
                <>
                  {orderQ.length > 0 ? (
                    <Section title={t("syncPill.orders", { count: orderQ.length })}>
                      {orderQ.map((o) => (
                        <QueueRow
                          key={o.localId}
                          title={o.display.partyName || o.display.productName || t("common.order")}
                          meta={`${tn("common.items", o.display.itemCount)} · ${queuedMeta(o.queuedAt, o.attempts)}`}
                          error={o.lastError}
                        />
                      ))}
                    </Section>
                  ) : null}
                  {statusQ.length > 0 ? (
                    <Section title={t("syncPill.statusChanges", { count: statusQ.length })}>
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
                    <Section title={t("syncPill.documents", { count: docQ.length })}>
                      {docQ.map((d) => (
                        <QueueRow
                          key={d.localId}
                          title={orderDocLabel(d.type) + (d.pageIndex ? t("syncPill.page", { pageIndex: d.pageIndex }) : "")}
                          meta={queuedMeta(d.queuedAt, d.attempts)}
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
                        t("common.stillWaiting"),
                        online
                          ? t("common.nothingNewToSync")
                          : t("common.youreOfflineTheQueueWill"),
                      );
                    } else if (failedNow === 0) {
                      toast.success(tn("sync.itemsSynced", sent));
                    } else {
                      Alert.alert(
                        t("common.someFailed"),
                        t("syncPill.syncedStillWaitingSeeIndividual", { sent, failedNow }),
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

function pillLabel(kind: Kind, total: number, failed: number, online: boolean): string {
  if (kind === "syncing") return t("sync.pill.syncing");
  if (kind === "failed") return t("sync.pill.failed", { count: failed });
  if (kind === "queued")
    return online
      ? t("sync.pill.queued", { count: total })
      : t("sync.pill.offlineQueued", { count: total });
  return online ? t("sync.pill.synced") : t("sync.pill.offline");
}

function pillA11yLabel(kind: Kind, total: number, failed: number, online: boolean): string {
  if (kind === "syncing") return t("sync.a11y.syncing");
  if (kind === "failed") return tn("sync.a11y.failed", failed);
  if (kind === "queued") return tn("sync.a11y.queued", total);
  return online ? t("sync.a11y.synced") : t("sync.a11y.offline");
}

function sheetSubtitle(kind: Kind, online: boolean): string {
  if (kind === "failed") return t("sync.sheet.failed");
  if (kind === "queued") return online ? t("queue.online.hint") : t("queue.offline.hint");
  if (kind === "syncing") return t("sync.sheet.syncing");
  return online ? t("sync.sheet.nothing") : t("sync.sheet.offline");
}

function pillTone(kind: Kind) {
  switch (kind) {
    case "failed":
      return { backgroundColor: theme.colors.fault };
    case "queued":
      return { backgroundColor: amberSolid };
    case "syncing":
      return { backgroundColor: theme.colors.bond };
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
    fontSize: 13,
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
