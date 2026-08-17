import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { Segmented } from "@/components/Segmented";
import { useParties, type PartyRow } from "@/lib/queries";
import { createPayment, type PaymentMethod } from "@/lib/payment-queries";
import { theme } from "@/theme";

const METHODS: { label: string; value: PaymentMethod }[] = [
  { label: "UPI", value: "UPI" },
  { label: "NEFT", value: "NEFT" },
  { label: "Cash", value: "CASH" },
  { label: "Cheque", value: "CHEQUE" },
];

function todayIso() {
  const d = new Date();
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${da}`;
}

export default function NewPaymentScreen() {
  const [search, setSearch] = useState("");
  const { data: parties, loading: partiesLoading } = useParties(search);
  const [party, setParty] = useState<PartyRow | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const amountNumber = useMemo(() => {
    const n = Number(amount.replace(/,/g, ""));
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
    router.replace(`/(staff)/payments/${res.id}`);
  }

  if (!party) {
    return (
      <Screen padded={false}>
        <View style={styles.searchWrap}>
          <TextField
            label="Customer"
            placeholder="Search your ledger…"
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="words"
          />
        </View>
        {partiesLoading && !parties ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={parties ?? []}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => setParty(item)}
                style={({ pressed }) => [
                  styles.partyRow,
                  pressed && { backgroundColor: theme.colors.surface },
                ]}
              >
                <Text style={styles.partyName}>{item.name}</Text>
                {item.city ? (
                  <Text style={styles.partyOutstanding}>{item.city}</Text>
                ) : null}
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.thinSep} />}
            ListEmptyComponent={
              <View style={styles.center}>
                <Text style={styles.empty}>
                  {search ? "No matches" : "No customers in your ledger yet."}
                </Text>
              </View>
            }
          />
        )}
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.selectedParty}>
        <Text style={styles.selectedLabel}>Customer</Text>
        <View style={styles.selectedRow}>
          <Text style={styles.selectedName}>{party.name}</Text>
          <Pressable onPress={() => setParty(null)} hitSlop={8}>
            <Text style={styles.change}>Change</Text>
          </Pressable>
        </View>
      </View>

      <TextField
        label="Amount (₹)"
        placeholder="e.g. 12500"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Payment method</Text>
        <Segmented options={METHODS} value={method} onChange={setMethod} />
      </View>

      <TextField
        label="Reference (UTR / cheque no.)"
        placeholder="Optional"
        value={reference}
        onChangeText={setReference}
        autoCapitalize="characters"
      />

      <TextField
        label="Notes"
        placeholder="Optional"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={{ height: theme.spacing.md }} />
      <Button
        label={saving ? "Saving…" : "Save & attach proof"}
        onPress={submit}
        disabled={!canSubmit}
        loading={saving}
      />
      <Text style={styles.hint}>
        Next step: snap the bank / UPI screenshot so the accountant can
        reconcile without asking.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg },
  searchWrap: { padding: theme.spacing.md },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl },
  thinSep: { height: theme.spacing.xs },
  partyRow: {
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
  partyOutstanding: {
    marginTop: 4,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  empty: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
  },
  selectedParty: {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
  },
  selectedLabel: {
    fontSize: theme.type.bodySmall - 2,
    textTransform: "uppercase",
    letterSpacing: 1,
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
  change: {
    color: theme.colors.primary,
    fontSize: theme.type.body,
    fontWeight: "600",
  },
  field: { marginBottom: theme.spacing.md },
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
  hint: {
    marginTop: theme.spacing.sm,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
});
