import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Pressable,
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
import {
  attachPaymentProof,
  usePaymentDetail,
  PAYMENT_DOC_LABELS,
  type PaymentDocType,
  type PaymentDocumentRow,
} from "@/lib/payment-queries";
import { PAYMENT_DOC_BUCKET, getSignedUrl } from "@/lib/uploads";
import { supabase } from "@/lib/supabase";
import { formatDate, formatINR } from "@/lib/format";
import { theme } from "@/theme";

const TYPE_OPTIONS: { label: string; value: PaymentDocType }[] = [
  { label: PAYMENT_DOC_LABELS.BANK_SCREENSHOT, value: "BANK_SCREENSHOT" },
  { label: PAYMENT_DOC_LABELS.UPI_SCREENSHOT, value: "UPI_SCREENSHOT" },
  { label: PAYMENT_DOC_LABELS.CHEQUE_PHOTO, value: "CHEQUE_PHOTO" },
  { label: PAYMENT_DOC_LABELS.RECEIPT, value: "RECEIPT" },
  { label: PAYMENT_DOC_LABELS.OTHER, value: "OTHER" },
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
    const channel = supabase
      .channel(`payment-detail-${paymentId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "PaymentDocument",
          filter: `paymentId=eq.${paymentId}`,
        },
        () => void refetch()
      )
      .subscribe();
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
    await refetch();
  }, [paymentId, photo, type, notes, refetch]);

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
        <View style={styles.center}>
          <Text style={styles.error}>{error ?? "Payment not found."}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.summary}>
        <Text style={styles.amount}>{formatINR(Number(data.amount))}</Text>
        <Text style={styles.party}>{data.partyName}</Text>
        <Text style={styles.meta}>
          {formatDate(new Date(data.paymentDate))} · {data.method}
          {data.reference ? ` · ${data.reference}` : ""}
        </Text>
        {data.invoiceNumber ? (
          <Text style={styles.meta}>Invoice {data.invoiceNumber}</Text>
        ) : (
          <Text style={styles.metaMuted}>On-account payment</Text>
        )}
        {data.recordedByName ? (
          <Text style={styles.metaMuted}>Recorded by {data.recordedByName}</Text>
        ) : null}
      </View>

      <SectionHeader
        title="Add proof"
        subtitle="Snap the bank / UPI screen or the cheque now — makes recon easy."
      />

      <PhotoPicker photo={photo} onChange={setPhoto} />

      <View style={{ height: theme.spacing.md }} />
      <Text style={styles.fieldLabel}>Proof type</Text>
      <PickList options={TYPE_OPTIONS} value={type} onChange={setType} />

      <View style={{ height: theme.spacing.md }} />
      <TextField
        label="Reference note (optional)"
        placeholder="UTR / cheque no. / any reference"
        value={notes}
        onChangeText={setNotes}
        autoCapitalize="characters"
      />

      {uploadError && <Text style={styles.error}>{uploadError}</Text>}

      <View style={{ height: theme.spacing.md }} />
      <Button
        label={uploading ? "Uploading…" : "Upload proof"}
        onPress={upload}
        loading={uploading}
        disabled={!photo || uploading}
      />

      <View style={{ height: theme.spacing.xl }} />
      <SectionHeader
        title={`Proofs (${data.documents.length})`}
      />

      {data.documents.length === 0 ? (
        <View style={styles.emptyList}>
          <Text style={styles.emptyListText}>No proofs uploaded yet.</Text>
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
      Alert.alert("Could not open", "Unable to open the file — try again later.");
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
          {PAYMENT_DOC_LABELS[doc.type]}
        </Text>
        <Text style={styles.proofMeta}>
          {formatDate(new Date(doc.createdAt))}
          {doc.uploadedByName ? ` · ${doc.uploadedByName}` : ""}
        </Text>
        {doc.notes ? <Text style={styles.proofNotes}>{doc.notes}</Text> : null}
        <Pressable
          onPress={open}
          disabled={!signedUrl || opening}
          hitSlop={8}
          style={styles.openLink}
        >
          <Text style={styles.openLinkText}>
            {signedUrl ? "Open full-size →" : "Loading…"}
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
