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
import { PickList } from "@/components/PickList";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import { ActivityFeed } from "@/components/ActivityFeed";
import { useAuth } from "@/auth/AuthContext";
import { useOrderDetail, useOrderEventStream } from "@/lib/queries";
import {
  attachOrderDocument,
  useOrderDocuments,
  ORDER_DOC_LABELS,
  STAFF_UPLOADABLE_TYPES,
  type OrderDocRow,
  type OrderDocType,
} from "@/lib/order-doc-queries";
import { ORDER_DOC_BUCKET, getSignedUrl } from "@/lib/uploads";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/format";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function OrderDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { data, loading, error, refetch } = useOrderDetail(id ?? null);
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
            <Text style={styles.subtitle}>{data.party?.name ?? "—"}</Text>
          </View>
          <StatusBadge status={data.currentStatus} size="lg" />
        </View>

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
            <Text style={styles.value}>{data.paymentTerm.replace(/_/g, " ")}</Text>
          </InfoCard>

          <InfoCard label={t("detail.transport")}>
            <Text style={styles.value}>{data.transportType.replace(/_/g, " ")}</Text>
          </InfoCard>
        </View>

        {data.notes ? (
          <View style={[styles.notesCard]}>
            <Text style={styles.label}>{t("detail.notes")}</Text>
            <Text style={styles.notes}>{data.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.timelineHeader}>{t("detail.timeline")}</Text>
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
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [type, setType] = useState<OrderDocType>("ORDER_PROOF");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Realtime refresh so a factory upload of INVOICE / LR appears here live
  // while the salesperson has the screen open.
  useEffect(() => {
    if (!orderId) return;
    const channel = supabase
      .channel(`order-docs-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "OrderDocument",
          filter: `salesOrderId=eq.${orderId}`,
        },
        () => void refetch()
      )
      .subscribe();
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
    <View style={styles.docRow}>
      {isImage && signedUrl ? (
        <Image
          source={{ uri: signedUrl }}
          style={styles.docThumb}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.docThumbPlaceholder}>
          <Text style={styles.docThumbPlaceholderText}>PDF</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.docType}>{ORDER_DOC_LABELS[doc.type]}</Text>
        <Text style={styles.docMeta}>
          {formatDate(new Date(doc.createdAt))}
          {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
        </Text>
        <Pressable onPress={open} hitSlop={8}>
          <Text style={styles.docOpen}>
            {signedUrl ? "Open →" : "Loading…"}
          </Text>
        </Pressable>
      </View>
    </View>
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
