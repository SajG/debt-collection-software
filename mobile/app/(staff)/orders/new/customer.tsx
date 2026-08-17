import { useState } from "react";
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
  const [search, setSearch] = useState("");
  const { data, loading, error } = useParties(search);

  function pickAndNext(id: string, name: string) {
    // Party change invalidates the whole downstream draft (product,
    // pricing, etc are customer-relative in practice).
    patch({ partyId: id, partyName: name, newCustomerName: null });
    router.push("/(staff)/orders/new/dispatch");
  }

  function addNewCustomerAndNext() {
    const name = search.trim();
    if (!name) return;
    patch({ partyId: null, partyName: name, newCustomerName: name });
    router.push("/(staff)/orders/new/dispatch");
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
          onChangeText={setSearch}
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
                  Not in Tally yet. Admin will match it to the ledger after the
                  next Tally sync.
                </Text>
              </Pressable>
            ) : null
          }
        />
      )}

      {draft.partyId || draft.newCustomerName ? (
        <View style={styles.footer}>
          <Button
            label={t("wizard.next")}
            onPress={() => router.push("/(staff)/orders/new/dispatch")}
          />
        </View>
      ) : null}

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
