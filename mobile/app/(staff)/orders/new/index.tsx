import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useWizard } from "@/lib/order-draft";
import { useParties } from "@/lib/queries";
import { getLastUsedFor } from "@/lib/last-used";
import { formatDate } from "@/lib/format";
import {
  PAYMENT_TERMS,
  TRANSPORT_TYPES,
  TOKEN_TYPES,
} from "@/lib/constants";
import type { PaymentTerm, TransportType } from "@/lib/database.types";
import { theme } from "@/theme";

// Screen 1 of the 3-screen wizard: customer + delivery details on ONE
// scrollable screen. Payment term / transport / token are chip rows —
// no navigation push. Once a customer is chosen we look up
// per-customer last-used values and pre-fill the header so the
// second-order-onwards ask is roughly "same as last time".

function tomorrowIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function ScreenCustomerAndDelivery() {
  const { draft, patch, hydrated } = useWizard();
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const parties = useParties(search);

  // On customer change, pull last-used and merge into empty header
  // fields only — don't clobber a value the salesperson has already
  // typed for this draft.
  useEffect(() => {
    if (!hydrated || !draft.partyId) return;
    let cancelled = false;
    (async () => {
      const last = await getLastUsedFor(draft.partyId);
      if (cancelled || !last) return;
      patch({
        dispatchLocation:
          draft.dispatchLocation.trim() || last.dispatchLocation || "",
        paymentTerm: draft.paymentTerm ?? last.paymentTerm ?? null,
        transportType: draft.transportType ?? last.transportType ?? null,
        tokenType: draft.tokenType ?? last.tokenType ?? null,
      });
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally scope the effect to partyId — pulling on every
    // header edit would re-clobber the user's typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.partyId, hydrated]);

  const canProceed = useMemo(
    () =>
      Boolean(
        (draft.partyId || draft.newCustomerName?.trim()) &&
          draft.dispatchLocation.trim() &&
          draft.paymentTerm &&
          draft.transportType &&
          draft.expectedDeliveryDate &&
          draft.tokenType,
      ),
    [draft],
  );

  function pickParty(id: string, name: string) {
    patch({ partyId: id, partyName: name, newCustomerName: null });
    setSearch("");
  }

  function onDateChange(_e: DateTimePickerEvent, d?: Date) {
    setShowPicker(false);
    if (!d) return;
    patch({ expectedDeliveryDate: d.toISOString().slice(0, 10) });
  }

  function openDatePicker() {
    const initial = draft.expectedDeliveryDate
      ? new Date(draft.expectedDeliveryDate)
      : new Date(tomorrowIso());
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: initial,
        mode: "date",
        minimumDate: new Date(),
        onChange: onDateChange,
      });
      return;
    }
    setShowPicker(true);
  }

  return (
    <Screen back padded={false}>
      <View style={styles.header}>
        <WizardHeader step={1} title="Customer & delivery" />
      </View>

      <FlatList
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        data={draft.partyId ? [] : parties.data ?? []}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => pickParty(item.id, item.name)}
            style={({ pressed }) => [styles.partyRow, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.partyName}>{item.name}</Text>
            {item.city ? <Text style={styles.partyCity}>{item.city}</Text> : null}
          </Pressable>
        )}
        ListHeaderComponent={
          <View>
            <Section title="Customer">
              {/* Single always-editable customer name field. Type freely;
                  matching ledger customers appear below as tap-to-pick
                  rows. Tapping one binds partyId; any subsequent keystroke
                  clears the binding so the salesperson can correct a
                  typo without a "Change" round-trip.

                  The old dual-field UI (search + separate "new customer")
                  had a bug: typing in the "new customer" input flipped
                  selectedName truthy on the first keystroke and the
                  input disappeared. This single-field design cannot
                  reproduce that. */}
              <TextField
                label="Customer name"
                placeholder="Type customer name"
                value={draft.partyName ?? draft.newCustomerName ?? ""}
                onChangeText={(v) => {
                  patch({
                    partyId: null,
                    partyName: null,
                    newCustomerName: v,
                  });
                  setSearch(v);
                }}
                autoCorrect={false}
                autoCapitalize="words"
              />
              {draft.partyId ? (
                <Text style={styles.ledgerBadge}>
                  ✓ Ledger customer{draft.partyName ? ` — ${draft.partyName}` : ""}
                </Text>
              ) : null}
              {parties.loading && <ActivityIndicator />}
            </Section>

            <Section title="Delivery">
              <TextField
                label="Dispatch location"
                placeholder="Address, godown, or ledger location"
                value={draft.dispatchLocation}
                onChangeText={(v) => patch({ dispatchLocation: v })}
              />
              <Pressable
                onPress={openDatePicker}
                style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.dateLabel}>Expected delivery</Text>
                <Text style={styles.dateValue}>
                  {draft.expectedDeliveryDate
                    ? formatDate(draft.expectedDeliveryDate)
                    : "Pick a date"}
                </Text>
              </Pressable>
              {showPicker && Platform.OS === "ios" ? (
                <DateTimePicker
                  value={
                    draft.expectedDeliveryDate
                      ? new Date(draft.expectedDeliveryDate)
                      : new Date(tomorrowIso())
                  }
                  minimumDate={new Date()}
                  mode="date"
                  display="inline"
                  onChange={onDateChange}
                />
              ) : null}
            </Section>

            <Section title="Payment terms">
              <ChipRow<PaymentTerm>
                values={PAYMENT_TERMS}
                selected={draft.paymentTerm}
                onSelect={(v) => patch({ paymentTerm: v })}
              />
            </Section>

            <Section title="Transport">
              <ChipRow<TransportType>
                values={TRANSPORT_TYPES}
                selected={draft.transportType}
                onSelect={(v) => patch({ transportType: v })}
              />
            </Section>

            <Section title="Token / gift">
              <ChipRow
                values={TOKEN_TYPES.map((v) => ({ value: v, label: v }))}
                selected={draft.tokenType}
                onSelect={(v) => patch({ tokenType: v })}
              />
            </Section>

            <Section title="Notes (optional)">
              <TextField
                label="Anything the factory should know"
                placeholder="e.g. Fragile · call before dispatch"
                multiline
                value={draft.notes}
                onChangeText={(v) => patch({ notes: v })}
              />
            </Section>

            <Button
              label="Continue to items"
              disabled={!canProceed}
              onPress={() => router.push("/(staff)/orders/new/items")}
            />
            <View style={{ height: theme.spacing.xl }} />
          </View>
        }
        ListEmptyComponent={
          draft.partyId ? null : search.trim() && !parties.loading ? (
            <Text style={styles.emptyText}>
              No ledger match — the name you typed will be saved as a new
              customer.
            </Text>
          ) : null
        }
      />
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
      <View style={{ gap: 10 }}>{children}</View>
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
      {values.map((opt) => {
        const active = opt.value === selected;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={({ pressed }) => [
              styles.chip,
              active && styles.chipActive,
              pressed && { opacity: 0.8 },
            ]}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  body: { padding: theme.spacing.lg, gap: theme.spacing.md },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    marginTop: theme.spacing.md,
  },
  partyRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginTop: 8,
  },
  partyName: {
    fontSize: theme.type.body,
    fontWeight: "600",
    color: theme.colors.text,
  },
  partyCity: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  selectedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  selectedLabel: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  selectedName: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 2,
  },
  changeBtn: { padding: 6 },
  changeText: {
    color: theme.colors.primary,
    fontWeight: "700",
    fontSize: theme.type.bodySmall,
  },
  ledgerBadge: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.primary,
    fontWeight: "700",
    marginTop: 4,
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
    textTransform: "uppercase",
    fontWeight: "700",
  },
  dateValue: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "700",
    marginTop: 4,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    minHeight: theme.tap,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
    fontWeight: "600",
  },
  chipLabelActive: { color: "#fff" },
  emptyText: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
});
