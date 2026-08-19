import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PickList } from "@/components/PickList";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { ActivityFeed } from "@/components/ActivityFeed";
import { confirm } from "@/components/Confirm";
import { useAuth } from "@/auth/AuthContext";
import { useConnectivity } from "@/lib/connectivity";
import { useOrderDetail, useOrderEventStream } from "@/lib/queries";
import {
  attachOrderDocument,
  useOrderDocuments,
  ORDER_DOC_LABELS,
  type OrderDocRow,
  type OrderDocType,
} from "@/lib/order-doc-queries";
import { enqueueDocument, useDocQueue } from "@/lib/order-doc-queue";
import { ORDER_DOC_BUCKET, getSignedUrl } from "@/lib/uploads";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import type { OrderStatus } from "@/lib/database.types";
import { theme } from "@/theme";

// Factory upload set — mirrors STAFF_UPLOADABLE_TYPES but the factory
// side. ORDER_PROOF is intentionally not offered here: it's a
// salesperson artefact (customer PO, WhatsApp confirmation). RLS on
// OrderDocument allows FACTORY to insert any type; this list is the
// UX contract, not a security boundary.
const FACTORY_UPLOADABLE_TYPES: OrderDocType[] = [
  "INVOICE",
  "LORRY_RECEIPT",
  "OTHER",
];

// Straight-line factory progression. Cancel is a separate destructive
// path so it doesn't get tapped by mistake.
const NEXT_STEP: Partial<Record<OrderStatus, OrderStatus>> = {
  ORDER_PLACED: "IN_PRODUCTION",
  IN_PRODUCTION: "READY_TO_DISPATCH",
  READY_TO_DISPATCH: "LR_GENERATED",
  LR_GENERATED: "DISPATCHED",
};

const STEP_LABEL: Record<OrderStatus, string> = {
  ORDER_PLACED: "Order placed",
  IN_PRODUCTION: "Start production",
  ON_HOLD: "On hold",
  READY_TO_DISPATCH: "Mark packed / ready",
  LR_GENERATED: "LR generated",
  PARTIALLY_DISPATCHED: "Partially dispatched",
  DISPATCHED: "Mark dispatched",
  CANCELLED: "Cancelled",
};

export default function FactoryOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data, loading, error, refetch } = useOrderDetail(id ?? null);
  useOrderEventStream(refetch, user?.id ?? null);
  const [submitting, setSubmitting] = useState(false);

  const next = useMemo<OrderStatus | null>(
    () => (data ? (NEXT_STEP[data.currentStatus] ?? null) : null),
    [data],
  );

  const advance = useCallback(
    async (target: OrderStatus, note: string) => {
      if (!id || !user) return;
      setSubmitting(true);
      try {
        const { error: upErr } = await supabase
          .from("SalesOrder")
          .update({ currentStatus: target })
          .eq("id", id);
        if (upErr) throw upErr;
        const { error: evErr } = await supabase
          .from("OrderStatusEvent")
          .insert({
            salesOrderId: id,
            status: target,
            notes: note,
            updatedById: user.id,
          });
        if (evErr) throw evErr;
        await refetch();
      } catch (e: any) {
        Alert.alert("Update failed", e?.message ?? "Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [id, user, refetch],
  );

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
        <Text style={styles.error}>Order not found.</Text>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{data.orderNumber}</Text>
            <Text style={styles.subtitle}>{data.party?.name ?? "—"}</Text>
            {data.salesperson?.ownerName ? (
              <Text style={styles.by}>
                Placed by {data.salesperson.ownerName}
              </Text>
            ) : null}
          </View>
          <StatusBadge status={data.currentStatus} size="lg" />
        </View>

        <View style={styles.cards}>
          <InfoCard label="Product">
            <Text style={styles.value}>{data.product?.name ?? "—"}</Text>
            {data.brand ? <Text style={styles.sub}>{data.brand}</Text> : null}
          </InfoCard>
          <InfoCard label="Quantity">
            <Text style={styles.value}>
              {data.quantity} {data.quantityUnit}
            </Text>
            <Text style={styles.sub}>
              {data.packingType ?? "—"}
              {data.sizeKg ? ` · ${data.sizeKg} kg` : ""}
            </Text>
          </InfoCard>
          <InfoCard label="Dispatch to">
            <Text style={styles.value}>{data.dispatchLocation ?? "—"}</Text>
          </InfoCard>
          <InfoCard label="Expected delivery">
            <Text style={styles.value}>
              {formatDate(data.expectedDeliveryDate)}
            </Text>
          </InfoCard>
          {data.tokenType ? (
            <InfoCard label="Token / Gift">
              <Text style={styles.value}>{data.tokenType}</Text>
            </InfoCard>
          ) : null}
          {data.notes ? (
            <InfoCard label="Notes">
              <Text style={styles.value}>{data.notes}</Text>
            </InfoCard>
          ) : null}
        </View>

        <View style={styles.actions}>
          {next && data.currentStatus !== "CANCELLED" ? (
            <Button
              label={STEP_LABEL[next]}
              loading={submitting}
              disabled={submitting}
              onPress={() =>
                confirm({
                  title: STEP_LABEL[next],
                  body: `Move ${data.orderNumber} to ${next.replace(/_/g, " ")}?`,
                  confirmLabel: "Confirm",
                  onConfirm: () =>
                    void advance(next, `Factory → ${next}`),
                })
              }
            />
          ) : (
            <Text style={styles.doneLabel}>
              {data.currentStatus === "DISPATCHED"
                ? "Dispatched. Nothing more for factory to do."
                : "No further factory action available."}
            </Text>
          )}
          {data.currentStatus !== "DISPATCHED" &&
            data.currentStatus !== "CANCELLED" && (
              <Button
                variant="secondary"
                label="Cancel order"
                disabled={submitting}
                onPress={() =>
                  confirm({
                    title: "Cancel order?",
                    body: `Mark ${data.orderNumber} as cancelled. This can't be undone from mobile.`,
                    confirmLabel: "Cancel order",
                    destructive: true,
                    onConfirm: () =>
                      void advance("CANCELLED", "Cancelled from factory"),
                  })
                }
              />
            )}
        </View>

        <Timeline events={data.events} currentStatus={data.currentStatus} />

        {id ? <ActivityFeed orderId={id} events={data.events} /> : null}

        <View style={{ height: theme.spacing.md }} />
        <DocumentsSection orderId={id ?? null} />
      </ScrollView>
    </Screen>
  );
}

function DocumentsSection({ orderId }: { orderId: string | null }) {
  const { data: docs, refetch } = useOrderDocuments(orderId);
  const { online } = useConnectivity();
  const queued = useDocQueue();
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  // LORRY_RECEIPT is the doc factory most often photographs — default
  // to it so the "one-tap on a paper LR" flow is fewest taps.
  const [type, setType] = useState<OrderDocType>("LORRY_RECEIPT");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  // Live-update this section when either the salesperson OR another
  // factory device pushes a document to the same order.
  useEffect(() => {
    if (!orderId) return;
    // Unique per mount (see ActivityFeed comment).
    const name = `factory-order-docs:${orderId}:${Math.random().toString(36).slice(2, 10)}`;
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

  const queuedForThisOrder = useMemo(
    () => queued.filter((q) => q.orderId === orderId),
    [queued, orderId],
  );

  const submit = useCallback(async () => {
    if (!orderId || !photo) return;
    setUploadError(null);
    setUploadNote(null);
    setUploading(true);
    try {
      if (!online) {
        await enqueueDocument({
          orderId,
          type,
          sourceUri: photo.uri,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
        });
        setPhoto(null);
        setUploadNote(
          "No signal — saved locally. Will upload automatically when back online.",
        );
        return;
      }
      const res = await attachOrderDocument({
        orderId,
        type,
        localUri: photo.uri,
        fileName: photo.fileName,
        mimeType: photo.mimeType,
      });
      if ("error" in res) {
        // Network / RLS error path: fall back to the offline queue so
        // the photo isn't lost even if the immediate insert fails.
        await enqueueDocument({
          orderId,
          type,
          sourceUri: photo.uri,
          fileName: photo.fileName,
          mimeType: photo.mimeType,
        });
        setPhoto(null);
        setUploadNote(`Saved for retry — ${res.error}`);
        return;
      }
      setPhoto(null);
      setUploadNote("Uploaded.");
      await refetch();
    } finally {
      setUploading(false);
    }
  }, [orderId, photo, type, online, refetch]);

  return (
    <View>
      <Text style={sectionStyles.heading}>Documents</Text>
      <Text style={sectionStyles.hint}>
        Photograph the LR or invoice and attach it here. Camera is the
        default; gallery is for previously-saved scans.
      </Text>

      <View style={sectionStyles.card}>
        <PhotoPicker photo={photo} onChange={setPhoto} />
        <View style={{ height: theme.spacing.md }} />
        <Text style={sectionStyles.fieldLabel}>Type</Text>
        <PickList<OrderDocType>
          options={FACTORY_UPLOADABLE_TYPES.map((v) => ({
            label: ORDER_DOC_LABELS[v],
            value: v,
          }))}
          value={type}
          onChange={setType}
        />
        {uploadError ? (
          <Text style={sectionStyles.error}>{uploadError}</Text>
        ) : null}
        {uploadNote ? (
          <Text style={sectionStyles.note}>{uploadNote}</Text>
        ) : null}
        <View style={{ height: theme.spacing.md }} />
        <Button
          label={
            uploading
              ? "Uploading…"
              : online
                ? "Upload document"
                : "Save for upload (offline)"
          }
          onPress={submit}
          loading={uploading}
          disabled={!photo || uploading || !orderId}
        />
      </View>

      {queuedForThisOrder.length > 0 && (
        <View style={sectionStyles.queuedWrap}>
          <Text style={sectionStyles.queuedTitle}>
            {queuedForThisOrder.length} waiting to upload
          </Text>
          {queuedForThisOrder.map((q) => (
            <View key={q.localId} style={sectionStyles.queuedRow}>
              <Text style={sectionStyles.queuedType}>
                {ORDER_DOC_LABELS[q.type]}
              </Text>
              <Text style={sectionStyles.queuedMeta}>
                Queued {formatDate(new Date(q.queuedAt))}
                {q.attempts > 0 ? ` · ${q.attempts} attempt${q.attempts === 1 ? "" : "s"}` : ""}
              </Text>
              {q.lastError ? (
                <Text style={sectionStyles.queuedError}>{q.lastError}</Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <View style={{ height: theme.spacing.md }} />
      {(docs ?? []).length === 0 ? (
        <View style={sectionStyles.empty}>
          <Text style={sectionStyles.emptyText}>No documents yet.</Text>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          {(docs ?? []).map((doc) => (
            <OrderDocRowView key={doc.id} doc={doc} />
          ))}
        </View>
      )}
    </View>
  );
}

function OrderDocRowView({ doc }: { doc: OrderDocRow }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void getSignedUrl(ORDER_DOC_BUCKET, doc.storagePath).then((url) => {
      if (alive) setSignedUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [doc.storagePath]);

  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(doc.storagePath);

  async function open() {
    if (!signedUrl) return;
    try {
      await Linking.openURL(signedUrl);
    } catch {
      Alert.alert("Could not open", "Try again later.");
    }
  }

  return (
    <View style={sectionStyles.docRow}>
      {isImage && signedUrl ? (
        <Image
          source={{ uri: signedUrl }}
          style={sectionStyles.docThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={sectionStyles.docThumbPlaceholder}>
          <Text style={sectionStyles.docThumbPlaceholderText}>PDF</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={sectionStyles.docType}>
          {ORDER_DOC_LABELS[doc.type]}
        </Text>
        <Text style={sectionStyles.docMeta}>
          {formatDate(new Date(doc.createdAt))}
          {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
        </Text>
        <Pressable onPress={open} hitSlop={8}>
          <Text style={sectionStyles.docOpen}>
            {signedUrl ? "Open →" : "Loading…"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  heading: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  hint: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginBottom: theme.spacing.sm,
  },
  card: {
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.background,
  },
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
  note: {
    marginTop: theme.spacing.sm,
    color: theme.colors.textMuted,
    fontSize: theme.type.bodySmall,
  },
  queuedWrap: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 6,
  },
  queuedTitle: {
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
    color: theme.colors.text,
    marginBottom: 4,
  },
  queuedRow: { gap: 2 },
  queuedType: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
  },
  queuedMeta: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
  queuedError: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.danger,
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
  empty: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.textMuted,
    fontSize: theme.type.body,
  },
});

function InfoCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: {
    textAlign: "center",
    fontSize: theme.type.body,
    color: theme.colors.danger,
    marginTop: theme.spacing.xl,
  },
  scroll: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    paddingBottom: theme.spacing.xl * 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
    marginTop: 2,
  },
  by: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  cards: { gap: theme.spacing.md },
  card: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 4,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  value: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sub: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  actions: { gap: theme.spacing.sm },
  doneLabel: {
    textAlign: "center",
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    paddingVertical: theme.spacing.md,
  },
});
