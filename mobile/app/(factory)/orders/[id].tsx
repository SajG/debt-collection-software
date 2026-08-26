import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
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
import {
  setExpectedProductionDate,
  setLineProductionStatus,
  useOrderDetail,
  useOrderEventStream,
  type LineProductionStatus,
  type OrderDetailItem,
} from "@/lib/queries";
import {
  attachOrderDocument,
  groupDocsByPage,
  useOrderDocuments,
  ORDER_DOC_LABELS,
  type OrderDocRow,
  type OrderDocType,
} from "@/lib/order-doc-queries";
import { enqueueDocument, useDocQueue } from "@/lib/order-doc-queue";
import { submitStatusAdvance, useStatusQueue } from "@/lib/status-queue";
import { ORDER_DOC_BUCKET, getSignedUrl } from "@/lib/uploads";
import { newId } from "@/lib/ids";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { successHaptic, warningHaptic, errorHaptic } from "@/lib/haptics";
import { humaniseError } from "@/lib/errors";
import type { OrderStatus } from "@/lib/database.types";
import { theme } from "@/theme";

const FACTORY_UPLOADABLE_TYPES: OrderDocType[] = [
  "INVOICE",
  "LORRY_RECEIPT",
  "OTHER",
];

// Straight-line factory progression used only for the "not yet using
// per-line" fallback and the destructive "Cancel order" affordance.
// Ticking lines READY on a multi-SKU order rolls the header via
// trigger `_recompute_order_status_from_lines` — no client action
// needed for the ORDER_PLACED → IN_PRODUCTION → READY_TO_DISPATCH arc.
const NEXT_STEP: Partial<Record<OrderStatus, OrderStatus>> = {
  READY_TO_DISPATCH: "LR_GENERATED",
  LR_GENERATED: "DISPATCHED",
};

const STEP_LABEL: Record<OrderStatus, string> = {
  PENDING_APPROVAL: "Awaiting approval",
  ORDER_PLACED: "Order placed",
  IN_PRODUCTION: "Start production",
  ON_HOLD: "On hold",
  READY_TO_DISPATCH: "Mark packed / ready",
  LR_GENERATED: "LR generated",
  PARTIALLY_DISPATCHED: "Partially dispatched",
  DISPATCHED: "Mark dispatched",
  DELIVERED: "Delivered",
  REJECTED: "Rejected",
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

  const { online } = useConnectivity();
  const statusQueue = useStatusQueue();
  const pendingForThisOrder = useMemo(
    () => statusQueue.filter((q) => q.orderId === id).length,
    [statusQueue, id],
  );

  const advance = useCallback(
    async (target: OrderStatus, note: string) => {
      if (!id || !user || !data) return;
      setSubmitting(true);
      try {
        const res = await submitStatusAdvance({
          orderId: id,
          orderNumber: data.orderNumber,
          target,
          note: note || null,
          online,
        });
        if ("error" in res) {
          errorHaptic();
          const hum = humaniseError(res.error, { action: "advance-status" });
          Alert.alert("Update failed", hum.message);
          return;
        }
        if ("queued" in res) {
          warningHaptic();
          Alert.alert(
            "Saved on your phone",
            "Will apply automatically when you're back online.",
          );
          return;
        }
        successHaptic();
        await refetch();
      } finally {
        setSubmitting(false);
      }
    },
    [id, user, data, online, refetch],
  );

  const callSalesperson = useCallback(() => {
    const phone = data?.salesperson?.phone;
    if (!phone) return;
    // tel: with no formatting so RN dialer honours the digits verbatim.
    const uri = `tel:${phone.replace(/\s+/g, "")}`;
    void Linking.openURL(uri).catch(() =>
      Alert.alert("Could not open dialer", phone),
    );
  }, [data?.salesperson?.phone]);

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
            <SalespersonLine
              name={data.salesperson?.ownerName ?? null}
              phone={data.salesperson?.phone ?? null}
              onCall={callSalesperson}
            />
          </View>
          <StatusBadge status={data.currentStatus} size="lg" />
        </View>

        {data.currentStatus === "PENDING_APPROVAL" ? (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedTitle}>Awaiting admin approval</Text>
            <Text style={styles.blockedBody}>
              This order isn't on the shop floor yet. An admin needs to
              approve it before production can start.
            </Text>
          </View>
        ) : null}
        {data.currentStatus === "ON_HOLD" ? (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedTitle}>On hold</Text>
            {data.holdReasonCategory ? (
              <Text style={styles.blockedBody}>
                {data.holdReasonCategory.replace(/_/g, " ")}
                {data.holdReason ? ` — ${data.holdReason}` : ""}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.cards}>
          <InfoCard label={t("detail.dispatchTo")}>
            <Text style={styles.value}>{data.dispatchLocation ?? "—"}</Text>
          </InfoCard>
          <InfoCard label={t("detail.expectedDelivery")}>
            <Text style={styles.value}>
              {formatDate(data.expectedDeliveryDate)}
            </Text>
          </InfoCard>
          <ExpectedProductionCard
            orderId={id ?? ""}
            initial={data.expectedProductionDate}
            onChanged={refetch}
          />
          {data.tokenType ? (
            <InfoCard label={t("detail.tokenGift")}>
              <Text style={styles.value}>{data.tokenType}</Text>
            </InfoCard>
          ) : null}
          {data.notes ? (
            <InfoCard label="Notes">
              <Text style={styles.value}>{data.notes}</Text>
            </InfoCard>
          ) : null}
        </View>

        {pendingForThisOrder > 0 && (
          <View style={styles.pendingBanner}>
            <Text style={styles.pendingBannerText}>
              {pendingForThisOrder} status change
              {pendingForThisOrder === 1 ? "" : "s"} waiting to sync for
              this order. Will apply automatically when the phone is
              back online.
            </Text>
          </View>
        )}

        <LineItemsSection
          items={data.items}
          disabled={
            data.currentStatus === "PENDING_APPROVAL" ||
            data.currentStatus === "ON_HOLD" ||
            data.currentStatus === "REJECTED" ||
            data.currentStatus === "CANCELLED"
          }
          onChanged={refetch}
        />

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
                  onConfirm: () => void advance(next, `Factory → ${next}`),
                })
              }
            />
          ) : null}
          {data.currentStatus !== "DISPATCHED" &&
            data.currentStatus !== "CANCELLED" &&
            data.currentStatus !== "REJECTED" &&
            data.currentStatus !== "PENDING_APPROVAL" &&
            data.currentStatus !== "DELIVERED" && (
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

function SalespersonLine({
  name,
  phone,
  onCall,
}: {
  name: string | null;
  phone: string | null;
  onCall: () => void;
}) {
  return (
    <View style={styles.byRow}>
      <Text style={styles.by}>Placed by {name ?? "Unknown user"}</Text>
      {phone ? (
        <Pressable
          onPress={onCall}
          hitSlop={12}
          style={({ pressed }) => [
            styles.callPill,
            pressed && { opacity: 0.75 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Call ${name ?? "salesperson"}`}
        >
          <Text style={styles.callPillText}>☎ Call</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ── Line items with per-line production status ──────────────────────

function LineItemsSection({
  items,
  disabled,
  onChanged,
}: {
  items: OrderDetailItem[];
  disabled: boolean;
  onChanged: () => Promise<void> | void;
}) {
  return (
    <View>
      <Text style={styles.sectionHeading}>
        {t("detail.lineItems", { count: items.length })}
      </Text>
      <View style={{ gap: theme.spacing.sm }}>
        {items.map((it) => (
          <LineItemRow
            key={it.id}
            item={it}
            disabled={disabled}
            onChanged={onChanged}
          />
        ))}
      </View>
    </View>
  );
}

function LineItemRow({
  item,
  disabled,
  onChanged,
}: {
  item: OrderDetailItem;
  disabled: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);

  const nextStatus: LineProductionStatus | null =
    item.productionStatus === "PENDING"
      ? "IN_PRODUCTION"
      : item.productionStatus === "IN_PRODUCTION"
        ? "READY"
        : null;

  async function advanceLine() {
    if (!nextStatus || disabled) return;
    setBusy(true);
    try {
      const res = await setLineProductionStatus(item.id, nextStatus);
      if ("error" in res) {
        Alert.alert("Could not update", res.error);
        return;
      }
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  const label =
    nextStatus === "IN_PRODUCTION"
      ? "Start"
      : nextStatus === "READY"
        ? "Mark ready"
        : "Done";

  return (
    <View style={styles.lineRow}>
      <View style={styles.lineHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.lineNumber}>
            LINE {item.lineNumber}
            {item.needsRateApproval ? "  ·  RATE PENDING" : ""}
          </Text>
          <Text style={styles.lineName}>
            {item.product?.name ?? "—"}
          </Text>
          <Text style={styles.lineMeta}>
            {item.brand || item.product?.brand || "—"} ·{" "}
            {String(item.quantity)} {item.quantityUnit}
            {item.packingType ? ` · ${item.packingType}` : ""}
            {item.sizeKg ? ` · ${item.sizeKg} kg` : ""}
          </Text>
        </View>
        <LineStatusPill status={item.productionStatus} />
      </View>
      <Pressable
        onPress={advanceLine}
        disabled={disabled || busy || nextStatus === null}
        style={({ pressed }) => [
          styles.lineBtn,
          nextStatus === null && styles.lineBtnDisabled,
          pressed && { opacity: 0.85 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Line ${item.lineNumber}: ${label}`}
      >
        <Text
          style={[
            styles.lineBtnText,
            nextStatus === null && styles.lineBtnTextDisabled,
          ]}
        >
          {nextStatus === null ? "✓ Ready" : label}
        </Text>
      </Pressable>
    </View>
  );
}

function LineStatusPill({ status }: { status: LineProductionStatus }) {
  const style =
    status === "READY"
      ? styles.pillReady
      : status === "IN_PRODUCTION"
        ? styles.pillInProd
        : styles.pillPending;
  const label =
    status === "READY"
      ? "READY"
      : status === "IN_PRODUCTION"
        ? "IN PROD"
        : "PENDING";
  return (
    <View style={[styles.pill, style]}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

// ── Expected production date ───────────────────────────────────────

function ExpectedProductionCard({
  orderId,
  initial,
  onChanged,
}: {
  orderId: string;
  initial: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState<string | null>(initial);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  async function commit(iso: string | null) {
    setSaving(true);
    try {
      const res = await setExpectedProductionDate(orderId, iso);
      if ("error" in res) {
        Alert.alert("Could not save", res.error);
        return;
      }
      setValue(iso);
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  function onDateChange(_e: DateTimePickerEvent, d?: Date) {
    setShowPicker(false);
    if (!d) return;
    void commit(d.toISOString().slice(0, 10));
  }

  function open() {
    const initialDate = value ? new Date(value) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: "date",
        onChange: onDateChange,
      });
      return;
    }
    setShowPicker(true);
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{t("detail.expectedProduction")}</Text>
      <View style={styles.prodDateRow}>
        <Text style={styles.value}>{value ? formatDate(value) : "Not set"}</Text>
        <Pressable
          onPress={open}
          disabled={saving}
          hitSlop={8}
          style={({ pressed }) => [
            styles.prodDateBtn,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={styles.prodDateBtnText}>
            {saving ? "Saving…" : value ? "Change" : "Set"}
          </Text>
        </Pressable>
      </View>
      {showPicker && Platform.OS === "ios" ? (
        <DateTimePicker
          value={value ? new Date(value) : new Date()}
          mode="date"
          display="inline"
          onChange={onDateChange}
        />
      ) : null}
    </View>
  );
}

// ── Documents (type-first + multi-page) ────────────────────────────

function DocumentsSection({ orderId }: { orderId: string | null }) {
  const { data: docs, refetch } = useOrderDocuments(orderId);
  const { online } = useConnectivity();
  const queued = useDocQueue();

  // Type-first: choose the document type BEFORE the camera opens. All
  // pages captured under this session share one pageGroupId so a
  // multi-page LR lands as a single logical document.
  const [type, setType] = useState<OrderDocType | null>(null);
  const [pageGroupId, setPageGroupId] = useState<string | null>(null);
  const [pages, setPages] = useState<PickedPhoto[]>([]);
  const [pending, setPending] = useState<PickedPhoto | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
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

  function startCapture(t: OrderDocType) {
    setType(t);
    setPageGroupId(newId("pg"));
    setPages([]);
    setPending(null);
    setUploadNote(null);
  }

  function addPending() {
    if (!pending) return;
    setPages((p) => [...p, pending]);
    setPending(null);
  }

  function cancelSession() {
    setType(null);
    setPageGroupId(null);
    setPages([]);
    setPending(null);
    setUploadNote(null);
  }

  const submit = useCallback(async () => {
    if (!orderId || !type) return;
    const totalPages = pages.length + (pending ? 1 : 0);
    if (totalPages === 0) return;
    setUploadNote(null);
    setUploading(true);
    const gid = pageGroupId ?? newId("pg");
    const all: PickedPhoto[] = pending ? [...pages, pending] : pages;
    try {
      let uploaded = 0;
      let queuedCount = 0;
      for (let i = 0; i < all.length; i++) {
        const p = all[i];
        const pageIndex = i + 1;
        if (!online) {
          await enqueueDocument({
            orderId,
            type,
            sourceUri: p.uri,
            fileName: p.fileName,
            mimeType: p.mimeType,
            pageGroupId: gid,
            pageIndex,
          });
          queuedCount++;
          continue;
        }
        const res = await attachOrderDocument({
          orderId,
          type,
          localUri: p.uri,
          fileName: p.fileName,
          mimeType: p.mimeType,
          pageGroupId: gid,
          pageIndex,
        });
        if ("error" in res) {
          await enqueueDocument({
            orderId,
            type,
            sourceUri: p.uri,
            fileName: p.fileName,
            mimeType: p.mimeType,
            pageGroupId: gid,
            pageIndex,
          });
          queuedCount++;
        } else {
          uploaded++;
        }
      }
      setPages([]);
      setPending(null);
      setPageGroupId(null);
      setType(null);
      if (queuedCount === 0) successHaptic();
      else warningHaptic();
      setUploadNote(
        queuedCount === 0
          ? `${uploaded} page${uploaded === 1 ? "" : "s"} uploaded.`
          : `${uploaded} uploaded · ${queuedCount} saved on your phone — will sync when you're back online.`,
      );
      await refetch();
    } finally {
      setUploading(false);
    }
  }, [orderId, type, pages, pending, online, refetch, pageGroupId]);

  return (
    <View>
      <Text style={sectionStyles.heading}>Documents</Text>
      <Text style={sectionStyles.hint}>
        Choose a document type first, then photograph every page. Multi-page
        docs (a 3-page LR) upload as one document.
      </Text>

      <View style={sectionStyles.card}>
        {type === null ? (
          <>
            <Text style={sectionStyles.fieldLabel}>What are you uploading?</Text>
            <PickList<OrderDocType>
              options={FACTORY_UPLOADABLE_TYPES.map((v) => ({
                label: ORDER_DOC_LABELS[v],
                value: v,
              }))}
              value={null}
              onChange={startCapture}
            />
          </>
        ) : (
          <>
            <View style={sectionStyles.chipRow}>
              <View style={sectionStyles.typeChip}>
                <Text style={sectionStyles.typeChipText}>
                  {ORDER_DOC_LABELS[type]}
                </Text>
              </View>
              <Pressable
                onPress={cancelSession}
                hitSlop={8}
                style={sectionStyles.linkBtn}
              >
                <Text style={sectionStyles.linkBtnText}>Change type</Text>
              </Pressable>
            </View>

            {pages.length > 0 ? (
              <View style={sectionStyles.pagesRow}>
                {pages.map((p, i) => (
                  <View key={i} style={sectionStyles.pageThumbWrap}>
                    <Image
                      source={{ uri: p.uri }}
                      style={sectionStyles.pageThumb}
                    />
                    <Text style={sectionStyles.pageThumbLabel}>
                      Page {i + 1}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <PhotoPicker photo={pending} onChange={setPending} />

            <View style={{ flexDirection: "row", gap: 8, marginTop: theme.spacing.sm }}>
              <Button
                label={
                  pending
                    ? `Add page ${pages.length + 1}`
                    : `Add page ${pages.length + 1} (take photo above)`
                }
                variant="secondary"
                disabled={!pending}
                onPress={addPending}
              />
              <Button
                label={
                  uploading
                    ? "Uploading…"
                    : `Upload ${pages.length + (pending ? 1 : 0)} page${pages.length + (pending ? 1 : 0) === 1 ? "" : "s"}`
                }
                loading={uploading}
                disabled={
                  uploading || (pages.length === 0 && !pending) || !orderId
                }
                onPress={submit}
              />
            </View>
            {uploadNote ? (
              <Text style={sectionStyles.note}>{uploadNote}</Text>
            ) : null}
          </>
        )}
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
                {q.pageIndex ? ` — page ${q.pageIndex}` : ""}
              </Text>
              <Text style={sectionStyles.queuedMeta}>
                Queued {formatDate(new Date(q.queuedAt))}
                {q.attempts > 0
                  ? ` · ${q.attempts} attempt${q.attempts === 1 ? "" : "s"}`
                  : ""}
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
          {groupDocsByPage(docs ?? []).map((group) => (
            <DocumentGroupView key={group.key} group={group} />
          ))}
        </View>
      )}
    </View>
  );
}

function DocumentGroupView({
  group,
}: {
  group: { key: string; type: OrderDocType; pages: OrderDocRow[]; createdAt: string };
}) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        group.pages.map(async (p) => [
          p.id,
          await getSignedUrl(ORDER_DOC_BUCKET, p.storagePath),
        ]),
      );
      if (alive) {
        const next: Record<string, string | null> = {};
        for (const [id, url] of entries) next[id as string] = url as string | null;
        setUrls(next);
      }
    })();
    return () => {
      alive = false;
    };
  }, [group.pages]);

  const first = group.pages[0];
  const firstUrl = urls[first.id];
  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(first.storagePath);
  const pageCount = group.pages.length;

  async function open(pageId: string) {
    const url = urls[pageId];
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert("Could not open", "Try again later.");
    }
  }

  return (
    <View style={sectionStyles.docRow}>
      {isImage && firstUrl ? (
        <Image
          source={{ uri: firstUrl }}
          style={sectionStyles.docThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={sectionStyles.docThumbPlaceholder}>
          <Text style={sectionStyles.docThumbPlaceholderText}>
            {pageCount > 1 ? `${pageCount}p` : "PDF"}
          </Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={sectionStyles.docType}>
          {ORDER_DOC_LABELS[group.type]}
          {pageCount > 1 ? ` — ${pageCount} pages` : ""}
        </Text>
        <Text style={sectionStyles.docMeta}>
          {formatDate(new Date(group.createdAt))}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
          {group.pages.map((p, i) => (
            <Pressable
              key={p.id}
              onPress={() => open(p.id)}
              hitSlop={8}
              style={sectionStyles.pageLinkBtn}
            >
              <Text style={sectionStyles.pageLinkText}>
                {pageCount > 1 ? `Page ${p.pageIndex ?? i + 1} →` : "Open →"}
              </Text>
            </Pressable>
          ))}
        </View>
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
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: theme.spacing.md,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
  },
  typeChipText: { color: "#fff", fontWeight: "700" },
  linkBtn: { padding: 6 },
  linkBtnText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: theme.type.bodySmall,
  },
  pagesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: theme.spacing.sm,
  },
  pageThumbWrap: { alignItems: "center" },
  pageThumb: {
    width: 70,
    height: 70,
    borderRadius: 6,
    backgroundColor: theme.colors.surface,
  },
  pageThumbLabel: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 2,
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
  pageLinkBtn: { paddingVertical: 4, paddingHorizontal: 6 },
  pageLinkText: {
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
  emptyText: { color: theme.colors.textMuted, fontSize: theme.type.body },
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
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
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
  byRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
  },
  by: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  callPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    minHeight: theme.tap,
    justifyContent: "center",
  },
  callPillText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: theme.type.body,
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
  prodDateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  prodDateBtn: { padding: 6 },
  prodDateBtnText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: theme.type.bodySmall,
  },
  actions: { gap: theme.spacing.sm },
  pendingBanner: {
    marginBottom: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: "#F59E0B",
    backgroundColor: "#FFFBEB",
  },
  pendingBannerText: {
    fontSize: theme.type.bodySmall,
    color: "#78350F",
    fontWeight: "600",
  },
  blockedBanner: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    backgroundColor: theme.colors.dangerBg,
    gap: 4,
  },
  blockedTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.danger,
  },
  blockedBody: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
  },
  sectionHeading: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: theme.spacing.sm,
  },
  lineRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    gap: 10,
  },
  lineHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  lineNumber: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    color: theme.colors.textMuted,
  },
  lineName: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 2,
  },
  lineMeta: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillPending: { backgroundColor: theme.colors.border },
  pillInProd: { backgroundColor: "#FFF3B0" },
  pillReady: { backgroundColor: "#B7ECC7" },
  pillText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  lineBtn: {
    minHeight: theme.tap,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  lineBtnDisabled: { backgroundColor: theme.colors.surface },
  lineBtnText: {
    color: "#fff",
    fontSize: theme.type.button,
    fontWeight: "700",
  },
  lineBtnTextDisabled: { color: theme.colors.textMuted },
});
