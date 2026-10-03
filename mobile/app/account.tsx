import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { TextField } from "@/components/TextField";
import { useAuth } from "@/auth/AuthContext";
import { deleteMyAccount } from "@/lib/account-deletion";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// SY35 — Account screen, every role. Store requirement: users can delete
// their account from inside the app. Confirmation is typing DELETE.

export default function AccountScreen() {
  const { profile, user, signOut } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownerOf, setOwnerOf] = useState<string[] | null>(null);

  const ready = confirmText.trim() === "DELETE";

  async function onDelete() {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setOwnerOf(null);
    const res = await deleteMyAccount();
    if ("ok" in res) {
      await signOut();
      router.replace("/(auth)/email");
      return;
    }
    setBusy(false);
    if ("owner" in res) {
      setOwnerOf(res.companies);
      return;
    }
    setError(res.error);
  }

  return (
    <Screen back backTitle={t("account.title")} backFallback="/" scroll>
      <View style={styles.card}>
        <Text style={styles.name}>{profile?.ownerName ?? ""}</Text>
        {user?.email ? <Text style={styles.muted}>{user.email}</Text> : null}
      </View>

      <View style={styles.danger}>
        <Text style={styles.heading}>{t("account.delete.title")}</Text>

        <Text style={styles.subheading}>{t("account.delete.removedTitle")}</Text>
        <Text style={styles.body}>{t("account.delete.removed")}</Text>

        <Text style={styles.subheading}>{t("account.delete.keptTitle")}</Text>
        <Text style={styles.body}>{t("account.delete.kept")}</Text>

        <Text style={styles.body}>{t("account.delete.owner")}</Text>

        <TextField
          label={t("account.delete.typeToConfirm")}
          value={confirmText}
          onChangeText={setConfirmText}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="DELETE"
        />

        {ownerOf ? (
          <Text style={styles.error}>
            {t("account.delete.ownerBlocked", { companies: ownerOf.join(", ") })}
          </Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={t("account.delete.button")}
          variant="danger"
          disabled={!ready}
          loading={busy}
          onPress={() => void onDelete()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: theme.spacing.lg,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    gap: 4,
  },
  name: { fontSize: 18, fontWeight: "700", color: theme.colors.text },
  muted: { fontSize: 14, color: theme.colors.textMuted },
  danger: {
    padding: theme.spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.danger,
    gap: theme.spacing.md,
  },
  heading: { fontSize: 18, fontWeight: "700", color: theme.colors.danger },
  subheading: { fontSize: 15, fontWeight: "700", color: theme.colors.text },
  body: { fontSize: 14, lineHeight: 20, color: theme.colors.text },
  error: { fontSize: 14, color: theme.colors.danger, fontWeight: "600" },
});
