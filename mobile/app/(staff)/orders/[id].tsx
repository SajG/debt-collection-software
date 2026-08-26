import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { PickList } from "@/components/PickList";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useAuth } from "@/auth/AuthContext";
import { useOrderDetail, useOrderEventStream } from "@/lib/queries";
import {
  attachOrderDocument,
  groupDocsByPage,
  useOrderDocuments,
  ORDER_DOC_LABELS,
  STAFF_UPLOADABLE_TYPES,
  type OrderDocRow,
  type OrderDocType,
} from "@/lib/order-doc-queries";
import { ORDER_DOC_BUCKET, getSignedUrl } from "@/lib/uploads";
import { DocumentViewer, type ViewerPage } from "@/components/DocumentViewer";
import { submitStatusAdvance } from "@/lib/status-queue";
import { useConnectivity } from "@/lib/connectivity";
import { newId } from "@/lib/ids";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";
import { confirm } from "@/components/Confirm";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, role } = useAuth();
  const { data, loading, error, refetch } = useOrderDetail(id ?? null);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  // Timeline auto-updates as new events land on this or any of the
  // user's orders.
  useOrderEventStream(refetch, user?.id ?? null);

  if (loading && !data) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen>
        <Text style={styles.error}>{t("detail.notFound")}</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{data.orderNumber}</Text>
            <Text style={styles.subtitle}>
              {data.party?.name ?? data.newCustomerName ?? "—"}
            </Text>
          </View>
          <StatusBadge status={data.currentStatus} size="lg" />
        </View>

        {data.currentStatus === "REJECTED" && data.rejectionReason ? (
          <View style={styles.rejectionBanner}>
            <Text style={styles.rejectionBannerTitle}>
              {t("detail.rejected")}
            </Text>
            <Text style={styles.rejectionBannerBody}>
              {data.rejectionReason}
            </Text>
          </View>
        ) : null}

        {data.currentStatus === "PENDING_APPROVAL" && role !== "ADMIN" ? (
          <View style={styles.approvalPanel}>
            <Text style={styles.approvalPanelTitle}>
              {t("detail.waitingApproval")}
            </Text>
            <Text style={styles.approvalHint}>
              {t("detail.waitingApprovalHint")}
            </Text>
          </View>
        ) : null}

        {data.currentStatus === "PENDING_APPROVAL" && role === "ADMIN" ? (
          <View style={styles.approvalPanel}>
            <Text style={styles.approvalPanelTitle}>
              Awaiting your decision
            </Text>
            <Text style={styles.approvalHint}>
              Approve to release the order to the factory. Reject with
              a reason — the salesperson gets a push.
            </Text>
            <Button
              label={approvalBusy ? "…" : "Approve"}
              loading={approvalBusy}
              disabled={approvalBusy}
              onPress={async () => {
                setApprovalBusy(true);
                const { error: err } = await supabase.rpc("approve_order", {
                  p_order_id: data.id,
                  p_note: undefined,
                });
                setApprovalBusy(false);
                if (err) {
                  Alert.alert("Approve failed", err.message);
                  return;
                }
                await refetch();
              }}
            />
            <TextField
              label="Rejection reason"
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="e.g. price too low / customer credit hold"
              multiline
              numberOfLines={2}
            />
            <Button
              variant="secondary"
              label={approvalBusy ? "…" : "Reject with reason"}
              loading={approvalBusy}
              disabled={approvalBusy || rejectReason.trim().length === 0}
              onPress={() => {
                const reason = rejectReason.trim();
                if (!reason) return;
                confirm({
                  title: "Reject this order?",
                  body: `The salesperson gets a push. Reason: "${reason}"`,
                  confirmLabel: "Reject",
                  destructive: true,
                  onConfirm: async () => {
                    setApprovalBusy(true);
                    const { error: err } = await supabase.rpc("reject_order", {
                      p_order_id: data.id,
                      p_reason: reason,
                    });
                    setApprovalBusy(false);
                    if (err) {
                      Alert.alert("Reject failed", err.message);
                      return;
                    }
                    setRejectReason("");
                    await refetch();
                  },
                });
              }}
            />
          </View>
        ) : null}

        <View style={styles.cards}>
          <InfoCard label={t("detail.product")}>
            <Text style={styles.value}>{data.product?.name ?? "—"}</Text>
            {data.brand ? (
              <Text style={styles.sub}>{data.brand}</Text>
            ) : null}
          </InfoCard>

          <InfoCard label={t("detail.quantity")}>
            <Text style={styles.valueBig}>
              {data.quantity.toString()}{" "}
              <Text style={styles.valueUnit}>{data.quantityUnit}</Text>
            </Text>
            <Text style={styles.sub}>
              {data.packingType} · {data.sizeKg} kg
            </Text>
          </InfoCard>

          <InfoCard label={t("detail.rate")}>
            <Text style={styles.value}>{data.productRate}</Text>
          </InfoCard>

          <InfoCard label={t("detail.expected")}>
            <Text style={styles.value}>{formatDate(data.expectedDeliveryDate)}</Text>
          </InfoCard>

          <InfoCard label={t("detail.payment")}>
            <Text style={styles.value}>{(data.paymentTerm ?? "—").replace(/_/g, " ")}</Text>
          </InfoCard>

          <InfoCard label={t("detail.transport")}>
            <Text style={styles.value}>{(data.transportType ?? "—").replace(/_/g, " ")}</Text>
          </InfoCard>
        </View>

        {data.notes ? (
          <View style={[styles.notesCard]}>
            <Text style={styles.label}>{t("detail.notes")}</Text>
            <Text style={styles.notes}>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.timelineHeader}>{t("detail.timeline")}</Text>
        <Timeline
          events={data.events}
          currentStatus={data.currentStatus}
          expectedDeliveryDate={data.expectedDeliveryDate}
        />

        {data.currentStatus === "DISPATCHED" && id ? (
          <ConfirmDeliveredCard orderId={id} orderNumber={data.orderNumber} onDone={refetch} />
        ) : null}

        {id ? <ActivityFeed orderId={id} events={data.events} /> : null}

        <View style={{ height: theme.spacing.md }} />
        <DocumentsSection orderId={id ?? null} />
      </ScrollView>
    </Screen>
  );
}

function ConfirmDeliveredCard({
  orderId,
  orderNumber,
  onDone,
}: {
  orderId: string;
  orderNumber: string;
  onDone: () => Promise<void> | void;
}) {
  const { online } = useConnectivity();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      // Attach the optional proof photo first so it's on file even if
      // the status transition ends up queued (rare). Failures on the
      // photo are non-blocking — the transition is the important bit.
      if (photo) {
        await attachOrderDocument({
          orderId,
          type: "OTHER",
          localUri: photo.uri,
          fileName: photo.fileName ?? "delivery-proof.jpg",
          mimeType: photo.mimeType,
          pageGroupId: newId("dv"),
          pageIndex: 1,
        }).catch(() => undefined);
      }
      const res = await submitStatusAdvance({
        orderId,
        orderNumber,
        target: "DELIVERED",
        note: photo ? "Delivered — proof attached" : "Delivered",
        online,
      });
      if ("error" in res) {
        Alert.alert("Could not confirm", res.error);
        return;
      }
      if ("queued" in res) {
        Alert.alert(
          "Saved for retry",
          "No network right now — delivery will be confirmed automatically when the phone is back online.",
        );
        return;
      }
      setPhoto(null);
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.deliveredCard}>
      <Text style={styles.deliveredTitle}>Confirm delivered</Text>
      <Text style={styles.deliveredBody}>
        Closes the order and stamps the delivery time. Optional: attach a
        photo of the signed LR / customer confirmation.
      </Text>
      <View style={{ height: theme.spacing.sm }} />
      <PhotoPicker photo={photo} onChange={setPhoto} />
      <View style={{ height: theme.spacing.md }} />
      <Button
        label={busy ? "Confirming…" : "Confirm delivered"}
        loading={busy}
        disabled={busy}
        onPress={() =>
          confirm({
            title: "Confirm delivered?",
            body: photo
              ? "Stamps the delivery time and attaches the photo."
              : "Stamps the delivery time. You can attach a photo above first, or confirm without.",
            confirmLabel: "Confirm",
            onConfirm: submit,
          })
        }
      />
    </View>
  );
}

function DocumentsSection({ orderId }: { orderId: string | null }) {
  const { data: docs, refetch } = useOrderDocuments(orderId);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [type, setType] = useState<OrderDocType>("ORDER_PROOF");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [viewerAt, setViewerAt] = useState<number | null>(null);

  // Flat page list feeding the viewer — swipe crosses group boundaries
  // so a salesperson can flip through everything on an order without
  // dismissing between docs. Ordering matches the on-screen group list.
  const viewerPages: ViewerPage[] = (docs ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((d) => ({
      id: d.id,
      storagePath: d.storagePath,
      label:
        ORDER_DOC_LABELS[d.type] +
        (d.pageIndex ? ` — page ${d.pageIndex}` : ""),
    }));

  const groups = groupDocsByPage(docs ?? []);
  function openAt(pageId: string) {
    const i = viewerPages.findIndex((p) => p.id === pageId);
    if (i >= 0) setViewerAt(i);
  }

  // Realtime refresh so a factory upload of INVOICE / LR appears here live
  // while the salesperson has the screen open.
  useEffect(() => {
    if (!orderId) return;
    // Unique per mount (see ActivityFeed comment).
    const name = `order-docs:${orderId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(name);
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "OrderDocument",
        filter: `salesOrderId=eq.${orderId}`,
      },
      () => void refetch(),
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, refetch]);

  const upload = useCallback(async () => {
    if (!orderId || !photo) return;
    setUploadError(null);
    setUploading(true);
    const res = await attachOrderDocument({
      orderId,
      type,
      localUri: photo.uri,
      fileName: photo.fileName,
      mimeType: photo.mimeType,
    });
    setUploading(false);
    if ("error" in res) {
      setUploadError(res.error);
      return;
    }
    setPhoto(null);
    await refetch();
  }, [orderId, photo, type, refetch]);

  return (
    <View>
      <Text style={styles.timelineHeader}>Documents</Text>
      <Text style={styles.docHint}>
        Attach an order proof (customer PO, WhatsApp confirmation). Invoice
        and LR come from the factory.
      </Text>

      <View style={styles.docUploadCard}>
        <PhotoPicker photo={photo} onChange={setPhoto} />
        <View style={{ height: theme.spacing.md }} />
        <Text style={docSectionStyles.fieldLabel}>Type</Text>
        <PickList
          options={STAFF_UPLOADABLE_TYPES.map((v) => ({
            label: ORDER_DOC_LABELS[v],
            value: v,
          }))}
          value={type}
          onChange={setType}
        />
        {uploadError && (
          <Text style={docSectionStyles.error}>{uploadError}</Text>
        )}
        <View style={{ height: theme.spacing.md }} />
        <Button
          label={uploading ? "Uploading…" : "Upload document"}
          onPress={upload}
          loading={uploading}
          disabled={!photo || uploading}
        />
      </View>

      <View style={{ height: theme.spacing.md }} />
      {(docs ?? []).length === 0 ? (
        <View style={styles.docEmpty}>
          <Text style={styles.docEmptyText}>No documents yet.</Text>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {groups.map((g) => (
            <DocGroupRow
              key={g.key}
              group={g}
              onOpen={(pageId) => openAt(pageId)}
            />
          ))}
        </View>
      )}

      <DocumentViewer
        visible={viewerAt !== null}
        pages={viewerPages}
        startIndex={viewerAt ?? 0}
        onClose={() => setViewerAt(null)}
      />
    </View>
  );
}

function DocGroupRow({
  group,
  onOpen,
}: {
  group: {
    key: string;
    type: OrderDocType;
    pages: OrderDocRow[];
    createdAt: string;
  };
  onOpen: (pageId: string) => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const first = group.pages[0];
  useEffect(() => {
    let alive = true;
    void getSignedUrl(ORDER_DOC_BUCKET, first.storagePath).then((url) => {
      if (alive) setThumbUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [first.storagePath]);
  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(first.storagePath);
  const pageCount = group.pages.length;

  return (
    <Pressable
      onPress={() => onOpen(first.id)}
      style={({ pressed }) => [styles.docRow, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${ORDER_DOC_LABELS[group.type]}${pageCount > 1 ? `, ${pageCount} pages` : ""}`}
    >
      {isImage && thumbUrl ? (
        <Image
          source={{ uri: thumbUrl }}
          style={styles.docThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.docThumbPlaceholder}>
          <Text style={styles.docThumbPlaceholderText}>
            {pageCount > 1 ? `${pageCount}p` : "PDF"}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.docType}>
          {ORDER_DOC_LABELS[group.type]}
          {pageCount > 1 ? ` — ${pageCount} pages` : ""}
        </Text>
        <Text style={styles.docMeta}>
          {formatDate(new Date(group.createdAt))}
        </Text>
        <Text style={styles.docOpen}>Open · pinch to zoom · Share</Text>
      </View>
    </Pressable>
  );
}

const docSectionStyles = StyleSheet.create({
  fieldLabel: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  error: {
    marginTop: theme.spacing.sm,
    color: theme.colors.danger,
    fontSize: theme.type.body,
  },
});

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  deliveredCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    gap: 4,
    marginTop: theme.spacing.md,
  },
  deliveredTitle: {
    fontSize: theme.type.body,
    fontWeight: "800",
    color: theme.colors.text,
  },
  deliveredBody: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  rejectionBanner: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
    gap: 4,
    marginTop: theme.spacing.sm,
  },
  rejectionBannerTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.danger,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  rejectionBannerBody: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "600",
  },
  approvalPanel: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
    gap: theme.spacing.md,
    marginTop: theme.spacing.sm,
  },
  approvalPanelTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: "#78350F",
  },
  approvalHint: {
    fontSize: theme.type.bodySmall,
    color: "#78350F",
  },
  scroll: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    gap: theme.spacing.md,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    fontSize: theme.type.body,
    color: theme.colors.danger,
    textAlign: "center",
    marginTop: theme.spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
    fontVariant: ["tabular-nums"],
  },
  subtitle: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    marginTop: 4,
  },
  cards: {
    gap: theme.spacing.sm,
  },
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "600",
  },
  valueBig: {
    fontSize: 26,
    color: theme.colors.text,
    fontWeight: "700",
  },
  valueUnit: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  sub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  notesCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    gap: 6,
  },
  notes: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    lineHeight: 24,
  },
  timelineHeader: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  docHint: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  docUploadCard: {
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.background,
  },
  docRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.background,
  },
  docThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  docThumbPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  docThumbPlaceholderText: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.textMuted,
  },
  docType: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
  },
  docMeta: {
    marginTop: 2,
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
  docOpen: {
    marginTop: theme.spacing.sm,
    color: theme.colors.primary,
    fontSize: theme.type.bodySmall,
    fontWeight: "600",
  },
  docEmpty: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    alignItems: "center",
  },
  docEmptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.type.body,
  },
});
