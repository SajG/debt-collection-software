import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/Text";
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
  TOKEN_TYPES,
} from "@/lib/constants";
import type { PaymentTerm, TransportType } from "@/lib/database.types";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";
import { paymentTerms, transportTypes } from "@/lib/labels";
import { useOrgCatalog } from "@/lib/catalog";

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

  // Token / gift chips are part of the catalogue-style form only
  // (companies with their own brand list, e.g. Synergy).
  const { configured: catalogMode } = useOrgCatalog();

  const canProceed = useMemo(
    () =>
      Boolean(
        (draft.partyId || draft.newCustomerName?.trim()) &&
          draft.dispatchLocation.trim() &&
          draft.paymentTerm &&
          draft.transportType &&
          draft.expectedDeliveryDate &&
          (!catalogMode || draft.tokenType),
      ),
    [draft, catalogMode],
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
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={1} title={t("common.customerDelivery")} />
      </View>

      <FlatList
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        data={[]}
        keyExtractor={(_p, i) => String(i)}
        renderItem={() => null}
        ListHeaderComponent={
          <View>
            <Section title={t("common.customer")}>
              {/* Single always-editable customer name field. Type freely;
                  matching ledger customers appear inline right below as
                  tap-to-pick rows (prefix match, capped list). Tapping
                  one binds partyId; any subsequent keystroke clears the
                  binding so the salesperson can correct a typo without
                  a "Change" round-trip.

                  RLS on Party (party_select_staff) means this dropdown
                  only ever shows THIS salesperson's assigned customers.
                  No cross-book leakage. */}
              <TextField
                label={t("common.customerName")}
                placeholder={t("common.typeCustomerName")}
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
                  ✓ {t("staffOrdersNew.ledgerCustomer")}{draft.partyName ? ` — ${draft.partyName}` : ""}
                </Text>
              ) : null}
              {!draft.partyId && search.trim().length >= 1 ? (
                <View style={styles.suggestBox}>
                  {parties.loading && (
                    <View style={styles.suggestLoading}>
                      <ActivityIndicator />
                    </View>
                  )}
                  {!parties.loading && (parties.data?.length ?? 0) === 0 ? (
                    <Text style={styles.suggestEmpty}>
                      {t("staffOrdersNewHome.noLedgerMatchTheName")}
                    </Text>
                  ) : null}
                  {(parties.data ?? []).slice(0, 8).map((p) => (
                    <Pressable
                      key={p.id}
                      onPress={() => pickParty(p.id, p.name)}
                      style={({ pressed }) => [
                        styles.suggestRow,
                        pressed && { opacity: 0.7 },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={t("staffOrdersNewHome.pick", { name: p.name })}
                    >
                      <Text style={styles.partyName}>{p.name}</Text>
                      {p.city ? (
                        <Text style={styles.partyCity}>{p.city}</Text>
                      ) : null}
                    </Pressable>
                  ))}
                  {(parties.data?.length ?? 0) > 8 ? (
                    <Text style={styles.suggestMore}>
                      {t("staffOrdersNew.moreMatches", { count: (parties.data?.length ?? 0) - 8 })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </Section>

            <Section title={t("common.delivery")}>
              <TextField
                label={t("common.dispatchLocation")}
                placeholder={t("common.addressGodownOrLedgerLocation")}
                value={draft.dispatchLocation}
                onChangeText={(v) => patch({ dispatchLocation: v })}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("common.expectedDelivery")}
                onPress={openDatePicker}
                style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={styles.dateLabel}>{t("common.expectedDelivery")}</Text>
                <Text style={styles.dateValue}>
                  {draft.expectedDeliveryDate
                    ? formatDate(draft.expectedDeliveryDate)
                    : t("common.pickADate")}
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

            <Section title={t("common.paymentTerms")}>
              <ChipRow<PaymentTerm>
                values={paymentTerms()}
                selected={draft.paymentTerm}
                onSelect={(v) => patch({ paymentTerm: v })}
              />
            </Section>

            <Section title={t("common.transport")}>
              <ChipRow<TransportType>
                values={transportTypes()}
                selected={draft.transportType}
                onSelect={(v) => patch({ transportType: v })}
              />
            </Section>

            {catalogMode ? (
              <Section title={t("common.tokenGift")}>
                <ChipRow
                  values={TOKEN_TYPES.map((v) => ({ value: v, label: v }))}
                  selected={draft.tokenType}
                  onSelect={(v) => patch({ tokenType: v })}
                />
              </Section>
            ) : null}

            <Section title={t("common.notesOptional")}>
              <TextField
                label={t("staffOrdersNewHome.anythingTheFactoryShouldKnow")}
                placeholder={t("staffOrdersNewHome.eGFragileCallBefore")}
                multiline
                value={draft.notes}
                onChangeText={(v) => patch({ notes: v })}
              />
            </Section>

            <Button
              label={t("staffOrdersNewHome.continueToItems")}
              disabled={!canProceed}
              onPress={() => router.push("/(staff)/orders/new/items")}
            />
            <View style={{ height: theme.spacing.xl }} />
          </View>
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
            accessibilityRole="button"
            accessibilityLabel={opt.label}
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
  body: { padding: theme.spacing.lg, gap: 0, paddingBottom: theme.spacing.xl },
  section: { gap: 10, marginTop: theme.spacing.lg },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.textMuted,
    marginBottom: 2,
  },
  partyRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    marginTop: 8,
  },
  suggestBox: {
    marginTop: 8,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  suggestRow: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  suggestEmpty: {
    padding: theme.spacing.md,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  suggestMore: {
    padding: theme.spacing.md,
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    fontStyle: "italic",
  },
  suggestLoading: {
    padding: theme.spacing.md,
    alignItems: "flex-start",
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
    fontSize: 13,
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
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 14,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    minHeight: 60,
    justifyContent: "center",
  },
  dateLabel: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    fontWeight: "800",
    letterSpacing: 1.0,
  },
  dateValue: {
    fontSize: theme.type.body,
    color: theme.colors.text,
    fontWeight: "700",
    marginTop: 6,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // Squared cards, not pills. Ovals read "casual"; the wizard's whole
  // job is to make a professional-feeling order in <60 s. Match the
  // ledger row + date-picker radius so every tappable in the section
  // shares one visual language.
  chip: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  chipActive: {
    // Filled dark card with a slightly heavier border — accessible on
    // low-contrast HDR outdoor screens where the primary-tint pill
    // washed out.
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  chipLabel: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.text,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
  chipLabelActive: { color: "#fff", fontWeight: "700" },
  emptyText: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: 8,
  },
});
