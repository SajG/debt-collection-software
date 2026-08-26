import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { newId } from "@/lib/ids";
import { formatDate } from "@/lib/format";
import {
  PAYMENT_TERMS,
  TRANSPORT_TYPES,
  TOKEN_TYPES,
} from "@/lib/constants";
import type { PaymentTerm, TransportType } from "@/lib/database.types";
import { theme } from "@/theme";

// Any STAFF / ADMIN can edit customer + delivery details on any
// pre-dispatch order. The server-side RLS + trigger
// (enforce_staff_sales_order_update, migration
// 20260826140000_staff_can_edit_orders) refuse other fields and
// terminal statuses — we mirror those gates in the UI so nobody
// hits a policy error mid-typing.
//
// Fields editable here: customer (partyId or newCustomerName),
// dispatch location, payment term, transport type, expected delivery
// date, token type, notes. Everything else (qty, rate, items,
// status) is handled by other flows.

export default function EditOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [partyId, setPartyId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [dispatchLocation, setDispatchLocation] = useState("");
  const [paymentTerm, setPaymentTerm] = useState<PaymentTerm | null>(null);
  const [transportType, setTransportType] = useState<TransportType | null>(
    null,
  );
  const [expectedDeliveryDate, setExpectedDeliveryDate] =
    useState<string | null>(null);
  const [tokenType, setTokenType] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("SalesOrder")
        .select(
          `id, orderNumber, currentStatus, partyId, newCustomerName,
           dispatchLocation, paymentTerm, transportType,
           expectedDeliveryDate, tokenType, notes,
           party:Party!SalesOrder_partyId_fkey(name)`,
        )
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        Alert.alert("Could not load", error?.message ?? "Order not found.");
        router.back();
        return;
      }
      type Row = {
        orderNumber: string;
        currentStatus: string;
        partyId: string | null;
        newCustomerName: string | null;
        dispatchLocation: string | null;
        paymentTerm: PaymentTerm | null;
        transportType: TransportType | null;
        expectedDeliveryDate: string | null;
        tokenType: string | null;
        notes: string | null;
        party: { name: string } | null;
      };
      const row = data as unknown as Row;
      setOrderNumber(row.orderNumber);
      setStatus(row.currentStatus);
      setPartyId(row.partyId);
      setCustomerName(row.party?.name ?? row.newCustomerName ?? "");
      setDispatchLocation(row.dispatchLocation ?? "");
      setPaymentTerm(row.paymentTerm);
      setTransportType(row.transportType);
      setExpectedDeliveryDate(row.expectedDeliveryDate);
      setTokenType(row.tokenType);
      setNotes(row.notes ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Mirror of the server-side status gate — RLS refuses these too, but
  // failing early beats a mid-save policy error.
  const editableStatuses = [
    "PENDING_APPROVAL",
    "ORDER_PLACED",
    "IN_PRODUCTION",
    "ON_HOLD",
    "READY_TO_DISPATCH",
    "LR_GENERATED",
  ];
  const canEdit = status ? editableStatuses.includes(status) : false;

  async function save() {
    if (!id || !profile) return;
    const trimmedName = customerName.trim();
    if (trimmedName.length < 2) {
      Alert.alert("Name required", "Enter the customer name.");
      return;
    }
    setSaving(true);
    // If the current binding is a ledger customer AND the typed name
    // still matches, keep partyId. If the user typed anything different,
    // treat as a fresh newCustomerName (partyId cleared).
    const payload = {
      partyId: partyId,
      newCustomerName: partyId ? null : trimmedName,
      dispatchLocation: dispatchLocation.trim() || null,
      paymentTerm,
      transportType,
      expectedDeliveryDate,
      tokenType,
      notes: notes.trim() || null,
    };
    const { error } = await supabase
      .from("SalesOrder")
      .update(payload)
      .eq("id", id);
    if (error) {
      setSaving(false);
      Alert.alert("Could not save", error.message);
      return;
    }
    // Audit line so the timeline shows "Details edited by <name>".
    // Non-blocking: never fail the save because the audit insert fails.
    await supabase
      .from("OrderStatusEvent")
      .insert({
        id: newId("evt"),
        salesOrderId: id,
        status: status ?? "ORDER_PLACED",
        notes: `Details edited by ${profile.ownerName}`,
        updatedById: profile.id,
      })
      .then(() => undefined, () => undefined);
    setSaving(false);
    Alert.alert("Saved", "Order details updated.", [
      { text: "OK", onPress: () => router.back() },
    ]);
  }

  function onDateChange(_e: DateTimePickerEvent, d?: Date) {
    setShowPicker(false);
    if (!d) return;
    setExpectedDeliveryDate(d.toISOString().slice(0, 10));
  }

  function openDatePicker() {
    const initial = expectedDeliveryDate
      ? new Date(expectedDeliveryDate)
      : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        onChange: onDateChange,
      });
      return;
    }
    setShowPicker(true);
  }

  if (loading) {
    return (
      <Screen back backTitle="Edit order">
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!canEdit) {
    return (
      <Screen back backTitle={orderNumber ?? "Edit order"}>
        <View style={styles.center}>
          <Text style={styles.title}>Cannot edit</Text>
          <Text style={styles.subtitle}>
            This order is {status}. Edits are only allowed before dispatch.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen back backTitle={orderNumber ?? "Edit order"} padded={false}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Section title="Customer">
          <TextField
            label="Customer name"
            placeholder="Type customer name"
            value={customerName}
            onChangeText={(v) => {
              setCustomerName(v);
              // Any edit clears the ledger binding — the salesperson can
              // re-select from the ledger via the wizard if they want to
              // rebind, but the safe default here is "typed name wins".
              if (partyId) setPartyId(null);
            }}
            autoCorrect={false}
            autoCapitalize="words"
          />
          {partyId ? (
            <Text style={styles.hint}>✓ Ledger customer</Text>
          ) : (
            <Text style={styles.hint}>Saved as new customer</Text>
          )}
        </Section>

        <Section title="Delivery">
          <TextField
            label="Dispatch location"
            placeholder="Address, godown, or ledger location"
            value={dispatchLocation}
            onChangeText={setDispatchLocation}
          />
          <Pressable
            onPress={openDatePicker}
            style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
          >
            <Text style={styles.dateLabel}>Expected delivery</Text>
            <Text style={styles.dateValue}>
              {expectedDeliveryDate
                ? formatDate(expectedDeliveryDate)
                : "Pick a date"}
            </Text>
          </Pressable>
          {showPicker && Platform.OS === "ios" ? (
            <DateTimePicker
              value={
                expectedDeliveryDate
                  ? new Date(expectedDeliveryDate)
                  : new Date()
              }
              mode="date"
              display="inline"
              onChange={onDateChange}
            />
          ) : null}
        </Section>

        <Section title="Payment terms">
          <ChipRow<PaymentTerm>
            values={PAYMENT_TERMS}
            selected={paymentTerm}
            onSelect={setPaymentTerm}
          />
        </Section>

        <Section title="Transport">
          <ChipRow<TransportType>
            values={TRANSPORT_TYPES}
            selected={transportType}
            onSelect={setTransportType}
          />
        </Section>

        <Section title="Token / gift">
          <ChipRow<string>
            values={TOKEN_TYPES.map((v) => ({ value: v, label: v }))}
            selected={tokenType}
            onSelect={setTokenType}
          />
        </Section>

        <Section title="Notes">
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />
        </Section>

        <View style={styles.footer}>
          <Button
            label={saving ? "Saving…" : "Save changes"}
            loading={saving}
            disabled={saving || customerName.trim().length < 2}
            onPress={save}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={{ gap: theme.spacing.sm }}>{children}</View>
    </View>
  );
}

function ChipRow<T extends string>({
  values,
  selected,
  onSelect,
}: {
  values: readonly { value: T; label: string }[];
  selected: T | null;
  onSelect: (v: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {values.map((v) => {
        const active = v.value === selected;
        return (
          <Pressable
            key={v.value}
            onPress={() => onSelect(v.value)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {v.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.spacing.lg, gap: theme.spacing.md, paddingBottom: 96 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  section: { gap: theme.spacing.sm },
  sectionTitle: {
    fontSize: theme.type.bodySmall,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hint: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
  dateBtn: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  dateLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  dateValue: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "600",
    marginTop: 2,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipText: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
    fontWeight: "600",
  },
  chipTextActive: {
    color: "#fff",
  },
  footer: { marginTop: theme.spacing.md },
});
