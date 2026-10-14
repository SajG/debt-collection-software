import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { PickList } from "@/components/PickList";
import { PhotoPicker, type PickedPhoto } from "@/components/PhotoPicker";
import {
  attachPaymentProof,
  usePaymentDetail,
  type PaymentDocType,
  type PaymentDocumentRow,
} from "@/lib/payment-queries";
import { PAYMENT_DOC_BUCKET, getSignedUrl } from "@/lib/uploads";
import { supabase } from "@/lib/supabase";
import { formatDate, formatINR } from "@/lib/format";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";
import { paymentDocLabel } from "@/lib/labels";
import { toast } from "@/components/Toast";

const TYPE_VALUES: PaymentDocType[] = [
  "BANK_SCREENSHOT",
  "UPI_SCREENSHOT",
  "CHEQUE_PHOTO",
  "RECEIPT",
  "OTHER",
];

export default function PaymentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const paymentId = id ?? null;
  const { data, loading, error, refetch } = usePaymentDetail(paymentId);

  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [type, setType] = useState<PaymentDocType>("BANK_SCREENSHOT");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Realtime — a new proof from the web app (e.g. accountant) appears here
  // without a manual refresh.
  useEffect(() => {
    if (!paymentId) return;
    // Unique per mount (see ActivityFeed comment).
    const name = `payment-detail:${paymentId}:${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase.channel(name);
    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "PaymentDocument",
        filter: `paymentId=eq.${paymentId}`,
      },
      () => void refetch(),
    );
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [paymentId, refetch]);

  const upload = useCallback(async () => {
    if (!paymentId || !photo) return;
    setUploadError(null);
    setUploading(true);
    const res = await attachPaymentProof({
      paymentId,
      type,
      localUri: photo.uri,
      fileName: photo.fileName,
      mimeType: photo.mimeType,
      notes: notes.trim() || null,
    });
    setUploading(false);
    if ("error" in res) {
      setUploadError(res.error);
      return;
    }
    setPhoto(null);
    setNotes("");
    toast.success(t("payments.proofSaved"));
    await refetch();
  }, [paymentId, photo, type, notes, refetch]);

  if (loading && !data) {
    return (
      <Screen back>
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} size="large" />
        </View>
      </Screen>
    );
  }

  if (error || !data) {
    return (
      <Screen back>
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? t("staffPaymentsDetail.paymentNotFound")}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen back scroll>
      <View style={styles.summary}>
        <Text style={styles.amount}>{formatINR(Number(data.amount))}</Text>
        <Text style={styles.party}>{data.partyName}</Text>
        <Text style={styles.meta}>
          {formatDate(new Date(data.paymentDate))} · {data.method}
          {data.reference ? ` · ${data.reference}` : ""}
        </Text>
        {data.invoiceNumber ? (
          <Text style={styles.meta}>{t("payments.invoiceNumber", { number: data.invoiceNumber })}</Text>
        ) : (
          <Text style={styles.metaMuted}>{t("staffPaymentsDetail.onAccountPayment")}</Text>
        )}
        {data.recordedByName ? (
          <Text style={styles.metaMuted}>{t("payments.recordedBy", { name: data.recordedByName })}</Text>
        ) : null}
      </View>

      <SectionHeader
        title={t("staffPaymentsDetail.addProof")}
        subtitle={t("staffPaymentsDetail.snapTheBankUpiScreen")}
      />

      <PhotoPicker photo={photo} onChange={setPhoto} />

      <View style={{ height: theme.spacing.md }} />
      <Text style={styles.fieldLabel}>{t("staffPaymentsDetail.proofType")}</Text>
      <PickList options={TYPE_VALUES.map((value) => ({ value, label: paymentDocLabel(value) }))} value={type} onChange={setType} />

      <View style={{ height: theme.spacing.md }} />
      <TextField
        label={t("staffPaymentsDetail.referenceNoteOptional")}
        placeholder={t("staffPaymentsDetail.utrChequeNoAnyReference")}
        value={notes}
        onChangeText={setNotes}
        autoCapitalize="characters"
      />

      {uploadError && <Text style={styles.error}>{uploadError}</Text>}

      <View style={{ height: theme.spacing.md }} />
      <Button
        label={uploading ? t("common.uploading") : t("staffPaymentsDetail.uploadProof")}
        onPress={upload}
        loading={uploading}
        disabled={!photo || uploading}
      />

      <View style={{ height: theme.spacing.xl }} />
      <SectionHeader
        title={t("staffPaymentsDetail.proofs", { count: data.documents.length })}
      />

      {data.documents.length === 0 ? (
        <View style={styles.emptyList}>
          <Text style={styles.emptyListText}>{t("staffPaymentsDetail.noProofsUploadedYet")}</Text>
        </View>
      ) : (
        <FlatList
          data={data.documents}
          keyExtractor={(d) => d.id}
          scrollEnabled={false}
          renderItem={({ item }) => <ProofRow doc={item} />}
          ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        />
      )}
    </Screen>
  );
}

function ProofRow({ doc }: { doc: PaymentDocumentRow }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    let alive = true;
    void getSignedUrl(PAYMENT_DOC_BUCKET, doc.storagePath).then((url) => {
      if (alive) setSignedUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [doc.storagePath]);

  const isImage = /\.(jpe?g|png|webp|heic)$/i.test(doc.storagePath);

  async function open() {
    if (!signedUrl) return;
    setOpening(true);
    try {
      await Linking.openURL(signedUrl);
    } catch {
      Alert.alert(t("common.couldNotOpen"), t("staffPaymentsDetail.unableToOpenTheFile"));
    } finally {
      setOpening(false);
    }
  }

  return (
    <View style={styles.proofRow}>
      {isImage && signedUrl ? (
        <Image
          source={{ uri: signedUrl }}
          style={styles.thumb}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Text style={styles.thumbPlaceholderText}>PDF</Text>
        </View>
      )}
      <View style={styles.proofBody}>
        <Text style={styles.proofType}>
          {paymentDocLabel(doc.type)}
        </Text>
        <Text style={styles.proofMeta}>
          {formatDate(new Date(doc.createdAt))}
          {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
        </Text>
        {doc.notes ? <Text style={styles.proofNotes}>{doc.notes}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={signedUrl ? t("staffPaymentsDetail.openFullSize") : t("common.loading")}
          onPress={open}
          disabled={!signedUrl || opening}
          hitSlop={8}
          style={styles.openLink}
        >
          <Text style={styles.openLinkText}>
            {signedUrl ? t("staffPaymentsDetail.openFullSize") : t("common.loading")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg },
  summary: {
    padding: theme.spacing.lg,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.lg,
  },
  amount: {
    fontSize: theme.type.title,
    fontWeight: "800",
    color: theme.colors.primary,
  },
  party: {
    marginTop: theme.spacing.xs,
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
  },
  meta: {
    marginTop: 4,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  metaMuted: {
    marginTop: 4,
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
    fontStyle: "italic",
  },
  sectionHeader: { marginBottom: theme.spacing.sm },
  sectionTitle: {
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
  },
  sectionSubtitle: {
    marginTop: 2,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
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
  emptyList: {
    padding: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    alignItems: "center",
  },
  emptyListText: { color: theme.colors.textMuted, fontSize: theme.type.body },
  proofRow: {
    flexDirection: "row",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.background,
  },
  thumb: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
  },
  thumbPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbPlaceholderText: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.textMuted,
  },
  proofBody: { flex: 1 },
  proofType: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
  },
  proofMeta: {
    marginTop: 2,
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
  proofNotes: {
    marginTop: theme.spacing.xs,
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
  },
  openLink: { marginTop: theme.spacing.sm },
  openLinkText: {
    color: theme.colors.primary,
    fontWeight: "600",
    fontSize: theme.type.bodySmall,
  },
});
