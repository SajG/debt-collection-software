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
    patch({ partyId: id, partyName: name });
    router.push("/(staff)/orders/new/brand");
  }

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
            <Text style={styles.empty}>
              {error ? t("home.error") : t("wizard.customer.empty")}
            </Text>
          }
        />
      )}

      {draft.partyId ? (
        <View style={styles.footer}>
          <Button
            label={t("wizard.next")}
            onPress={() => router.push("/(staff)/orders/new/brand")}
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
