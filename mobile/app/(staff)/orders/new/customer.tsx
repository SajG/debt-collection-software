import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { WizardHeader } from "@/components/WizardHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { confirm } from "@/components/Confirm";
import { useParties } from "@/lib/queries";
import { useWizard } from "@/lib/order-draft";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function StepCustomer() {
  const { draft, patch, discard } = useWizard();
  // Seed from whichever field the draft already has (resume flow).
  const [search, setSearch] = useState<string>(
    draft.partyName ?? draft.newCustomerName ?? "",
  );
  const { data, loading, error } = useParties(search);

  function onSearchChange(v: string) {
    setSearch(v);
    // Keep the draft in sync as the user types so the Next button
    // (and Review screen) always see the latest typed name — even if
    // the user never taps a party row or the "+ Add as new" tile.
    // Any previously picked party is invalidated the moment the text
    // no longer matches its name.
    const trimmed = v.trim();
    if (!trimmed) {
      patch({ partyId: null, partyName: null, newCustomerName: null });
      return;
    }
    if (draft.partyId && draft.partyName === v) return; // still valid
    patch({ partyId: null, partyName: trimmed, newCustomerName: trimmed });
  }

  function pickAndNext(id: string, name: string) {
    // Party change invalidates the whole downstream draft (product,
    // pricing, etc are customer-relative in practice).
    patch({ partyId: id, partyName: name, newCustomerName: null });
    setSearch(name);
    router.push("/(staff)/orders/new/dispatch");
  }

  function addNewCustomerAndNext() {
    const name = search.trim();
    if (!name) return;
    patch({ partyId: null, partyName: name, newCustomerName: name });
    router.push("/(staff)/orders/new/dispatch");
  }

  function goNext() {
    const trimmed = search.trim();
    if (draft.partyId && draft.partyName) {
      router.push("/(staff)/orders/new/dispatch");
      return;
    }
    if (trimmed) {
      // Fall through to "add as new customer" — this is what most users
      // expect when they type a name and hit Next without tapping a row.
      patch({ partyId: null, partyName: trimmed, newCustomerName: trimmed });
      router.push("/(staff)/orders/new/dispatch");
      return;
    }
    // Nothing to go on — surface a gentle nudge instead of silently moving.
    Alert.alert(
      "Customer required",
      "Type a customer name or pick one from the list.",
    );
  }

  const trimmed = search.trim();
  const hasExactMatch = (data ?? []).some(
    (p) => p.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const canAddNew = trimmed.length > 0 && !hasExactMatch;

  function startOver() {
    confirm({
      title: t("confirm.discard.title"),
      body: t("confirm.discard.body"),
      confirmLabel: t("confirm.discard.ok"),
      destructive: true,
      onConfirm: () => {
        void discard();
        router.replace("/(staff)");
      },
    });
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <WizardHeader step={1} title={t("wizard.customer.title")} onBack={() => router.replace("/(staff)")} />
      </View>

      <View style={styles.searchWrap}>
        <TextField
          label={t("wizard.customer.search")}
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {draft.partyId ? (
          <Text style={styles.selected}>
            {t("wizard.customer.selected", { name: draft.partyName ?? "" })}
          </Text>
        ) : draft.newCustomerName ? (
          <Text style={styles.selected}>
            New customer: {draft.newCustomerName}
          </Text>
        ) : null}
      </View>

      {loading && !data ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => pickAndNext(item.id, item.name)}
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.85 },
                draft.partyId === item.id && styles.active,
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.rowName}>{item.name}</Text>
              {item.city ? <Text style={styles.rowSub}>{item.city}</Text> : null}
            </Pressable>
          )}
          ListEmptyComponent={
            canAddNew ? null : (
              <Text style={styles.empty}>
                {error ? t("home.error") : t("wizard.customer.empty")}
              </Text>
            )
          }
          ListFooterComponent={
            canAddNew ? (
              <Pressable
                onPress={addNewCustomerAndNext}
                style={({ pressed }) => [
                  styles.row,
                  styles.newRow,
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.newRowLabel}>+ Add as new customer</Text>
                <Text style={styles.newRowName}>{trimmed}</Text>
                <Text style={styles.newRowHint}>
                  New customer — admin can enrich the ledger details later.
                </Text>
              </Pressable>
            ) : null
          }
        />
      )}

      <View style={styles.footer}>
        <Button label={t("wizard.next")} onPress={goNext} />
      </View>

      <View style={styles.startOverWrap}>
        <Pressable onPress={startOver} hitSlop={12}>
          <Text style={styles.startOver}>{t("wizard.startOver")}</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { padding: theme.spacing.lg, paddingBottom: 0 },
  searchWrap: { paddingHorizontal: theme.spacing.lg, gap: 6 },
  selected: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: "700",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm },
  row: {
    minHeight: theme.tap,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 2,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  active: { borderColor: theme.colors.primary, backgroundColor: "#EAF2EF" },
  newRow: {
    marginTop: theme.spacing.md,
    borderStyle: "dashed",
    borderColor: theme.colors.primary,
    backgroundColor: "#F4F9F7",
  },
  newRowLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.primary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  newRowName: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
    marginTop: 4,
  },
  newRowHint: {
    fontSize: 13,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  rowName: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  rowSub: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  empty: {
    textAlign: "center",
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    marginTop: theme.spacing.lg,
  },
  footer: {
    padding: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  startOverWrap: {
    alignItems: "center",
    paddingBottom: theme.spacing.md,
  },
  startOver: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textDecorationLine: "underline",
  },
});
