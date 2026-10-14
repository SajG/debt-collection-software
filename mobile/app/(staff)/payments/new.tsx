import { useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text, type TextInputRef } from "@/components/Text";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { EmptyState } from "@/components/EmptyState";
import { listEmpty } from "@/components/ListStates";
import { toast } from "@/components/Toast";
import { useParties, type PartyRow } from "@/lib/queries";
import { createPayment, type PaymentMethod } from "@/lib/payment-queries";
import { paymentMethodLabel } from "@/lib/labels";
import { formatINR } from "@/lib/format";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";
import { pingMilestones } from "@/lib/analytics";

const METHODS: PaymentMethod[] = ["UPI", "NEFT", "CASH", "CHEQUE"];

function todayIso() {
  const d = new Date();
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

// Record a payment. Opened two ways:
//   * from the Payments tab — pick the customer first;
//   * from a customer row (Today / Customers) with ?partyId&partyName —
//     the customer is already chosen and the amount field has focus, so
//     it is amount → Save.
export default function NewPaymentScreen() {
  const params = useLocalSearchParams<{ partyId?: string; partyName?: string }>();
  const preset: PartyRow | null =
    params.partyId && params.partyName
      ? { id: params.partyId, name: params.partyName, city: null }
      : null;

  const [search, setSearch] = useState("");
  const [party, setParty] = useState<PartyRow | null>(preset);
  const parties = useParties(search);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const amountRef = useRef<TextInputRef>(null);

  const amountNumber = useMemo(() => {
    const n = Number(amount.replace(/[,\s₹]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [amount]);

  const canSubmit = party !== null && amountNumber > 0 && !saving;

  async function submit() {
    if (!canSubmit || !party) return;
    setError(null);
    setSaving(true);
    const res = await createPayment({
      partyId: party.id,
      invoiceId: null,
      amount: amountNumber,
      paymentDate: todayIso(),
      method,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    });
    setSaving(false);
    if ("error" in res) {
      setError(res.error);
      return;
    }
    toast.success(
      t("payments.saved", { amount: formatINR(amountNumber), name: party.name }),
    );
    pingMilestones();
    router.replace(`/(staff)/payments/${res.id}`);
  }

  if (!party) {
    return (
      <Screen back backTitle={t("payments.record")} backFallback="/(staff)/payments" padded={false}>
        <View style={styles.searchWrap}>
          <TextField
            label={t("common.customer")}
            placeholder={t("staffPaymentsNew.searchYourLedger")}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="words"
            autoFocus
          />
        </View>
        <FlatList
          data={parties.data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => setParty(item)}
              style={({ pressed }) => [
                styles.partyRow,
                pressed && { backgroundColor: theme.colors.surface },
              ]}
              accessibilityRole="button"
              accessibilityLabel={item.name}
            >
              <Text style={styles.partyName}>{item.name}</Text>
              {item.city ? <Text style={styles.partyCity}>{item.city}</Text> : null}
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={styles.thinSep} />}
          ListEmptyComponent={listEmpty({
            loading: parties.loading && !parties.data,
            error: parties.data ? null : parties.error,
            onRetry: () => void parties.refetch(),
            empty: (
              <EmptyState
                glyph="☺"
                title={search ? t("customers.noMatch") : t("customers.empty")}
              />
            ),
          })}
        />
      </Screen>
    );
  }

  return (
    <Screen back backTitle={t("payments.record")} backFallback="/(staff)/payments" scroll>
      <View style={styles.selectedParty}>
        <Text style={styles.selectedLabel}>{t("common.customer")}</Text>
        <View style={styles.selectedRow}>
          <Text style={styles.selectedName}>{party.name}</Text>
          <Pressable
            onPress={() => setParty(null)}
            hitSlop={12}
            style={styles.changeBtn}
            accessibilityRole="button"
            accessibilityLabel={t("payments.changeCustomer")}
          >
            <Text style={styles.change}>{t("common.change")}</Text>
          </Pressable>
        </View>
      </View>

      <TextField
        ref={amountRef}
        label={t("payments.amount")}
        placeholder={t("payments.amountPlaceholder")}
        keyboardType="number-pad"
        value={amount}
        onChangeText={setAmount}
        autoFocus
        returnKeyType="done"
        style={styles.amountInput}
      />

      <View>
        <Text style={styles.fieldLabel}>{t("payments.method")}</Text>
        <Segmented
          options={METHODS.map((value) => ({ value, label: paymentMethodLabel(value) }))}
          value={method}
          onChange={setMethod}
        />
      </View>

      <TextField
        label={t("payments.reference")}
        placeholder={t("common.optional")}
        value={reference}
        onChangeText={setReference}
        autoCapitalize="characters"
      />

      <TextField
        label={t("common.notes")}
        placeholder={t("common.optional")}
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}

      <Button
        label={t("payments.save")}
        onPress={submit}
        disabled={!canSubmit}
        loading={saving}
        accessibilityLabel={t("payments.save")}
      />
      <Text style={styles.hint}>{t("payments.proofHint")}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchWrap: { padding: theme.spacing.md },
  list: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
    flexGrow: 1,
  },
  thinSep: { height: theme.spacing.sm },
  partyRow: {
    minHeight: theme.tap,
    justifyContent: "center",
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  partyName: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
  },
  partyCity: {
    marginTop: 4,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  selectedParty: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
  },
  selectedLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectedName: {
    flex: 1,
    fontSize: theme.type.heading,
    fontWeight: "700",
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  changeBtn: { minHeight: 48, justifyContent: "center" },
  change: {
    color: theme.colors.primary,
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  amountInput: { fontSize: 26, fontWeight: "700" },
  fieldLabel: {
    fontSize: theme.type.bodySmall,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  error: {
    color: theme.colors.danger,
    fontSize: theme.type.bodySmall,
    fontWeight: "600",
  },
  hint: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
});
