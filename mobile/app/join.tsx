import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { isNetworkError } from "@/lib/errors";
import { registerThisDevice } from "@/auth/register-device";
import { acceptInvite, fetchInvite, type InvitePreview } from "@/lib/invite-api";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// SY42 — opened by syncit://join?token=… (the invite page's "Open the
// Syncit app", or Android's intent hand-off). The token is the only
// credential. Flow: show company + role → name + password → server
// creates the confirmed account → sign in → register this phone → app
// lock set-up → the index gate routes by role (Sales / Factory /
// Management), exactly like any other sign-in.

const APP_URL = (process.env.EXPO_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
const PHONE_RE = /^[6-9]\d{9}$/;

type Load =
  | { s: "loading" }
  | { s: "invalid" }
  | { s: "network" }
  | { s: "ready"; invite: InvitePreview };

function roleLabel(role: InvitePreview["role"]): string {
  if (role === "ADMIN") return t("join.role.admin");
  if (role === "FACTORY") return t("join.role.factory");
  return t("join.role.staff");
}

export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setLoad({ s: "invalid" });
      return;
    }
    void fetchInvite(token).then((r) => {
      if (!alive) return;
      if (r.ok) {
        setName(r.invite.ownerName ?? "");
        setLoad({ s: "ready", invite: r.invite });
      } else {
        setLoad({ s: r.reason });
      }
    });
    return () => {
      alive = false;
    };
  }, [token]);

  async function submit() {
    if (load.s !== "ready" || !token) return;
    setError(null);
    if (name.trim().length < 2) return setError(t("join.err.name"));
    const digits = phone.replace(/\D/g, "").slice(-10);
    if (digits && !PHONE_RE.test(digits)) return setError(t("join.err.phone"));
    if (password.length < 10) return setError(t("join.err.password"));

    setBusy(true);
    try {
      const res = await acceptInvite({
        token,
        ownerName: name.trim(),
        phone: digits || undefined,
        password,
      });
      if (!res.ok) {
        if (res.reason === "invalid") return setLoad({ s: "invalid" });
        if (res.reason === "exists") return setLoad({ s: "ready", invite: { ...load.invite, accountExists: true } });
        return setError(res.reason === "network" ? t("join.err.network") : res.message ?? t("join.err.generic"));
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: res.email,
        password,
      });
      if (signInErr) {
        // Account exists now; sign-in is the only step left.
        router.replace({ pathname: "/(auth)/code", params: { email: res.email, mode: "password" } });
        return;
      }
      const reg = await registerThisDevice();
      if (!reg.ok) return setError(t("join.err.generic"));
      router.replace("/set-up-lock");
    } catch (e) {
      setError(isNetworkError(e) ? t("join.err.network") : t("join.err.generic"));
    } finally {
      setBusy(false);
    }
  }

  if (load.s === "loading") {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.muted}>{t("loading")}</Text>
        </View>
      </Screen>
    );
  }

  if (load.s === "invalid" || load.s === "network") {
    return (
      <Screen>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            {load.s === "invalid" ? t("join.invalid.title") : t("join.network.title")}
          </Text>
          <Text style={styles.muted}>
            {load.s === "invalid" ? t("join.invalid.body") : t("join.network.body")}
          </Text>
        </View>
        <Button
          variant="secondary"
          label={t("join.goToSignIn")}
          onPress={() => router.replace("/(auth)/email")}
        />
      </Screen>
    );
  }

  const { invite } = load;
  const header = (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        {t("join.title", { company: invite.companyName })}
      </Text>
      <Text style={styles.muted}>
        {t("join.subtitle", {
          inviter: invite.inviterName ?? t("join.yourManager"),
          role: roleLabel(invite.role),
        })}
      </Text>
    </View>
  );

  // They already have a Syncit account: accepting adds this company to
  // it, which needs them signed in — the web page does that.
  if (invite.accountExists) {
    return (
      <Screen>
        {header}
        <Text style={styles.muted}>{t("join.exists.body", { email: invite.email })}</Text>
        <Button
          label={t("join.exists.openWeb")}
          onPress={() => void Linking.openURL(`${APP_URL}/join/${token}?web=1`)}
        />
        <Button
          variant="secondary"
          label={t("join.goToSignIn")}
          onPress={() =>
            router.replace({ pathname: "/(auth)/email", params: { email: invite.email } })
          }
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {header}
      <TextField label={t("auth.email.label")} value={invite.email} editable={false} />
      <TextField
        label={t("join.field.name")}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
      />
      <TextField
        label={t("join.field.phone")}
        value={phone}
        onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(-10))}
        keyboardType="number-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
      />
      <TextField
        label={t("join.field.password")}
        error={error}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button label={t("join.submit")} loading={busy} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  header: { gap: 8, marginBottom: theme.spacing.md },
  title: { fontSize: theme.type.title, fontWeight: "700", color: theme.colors.text },
  muted: { fontSize: theme.type.body, color: theme.colors.textMuted },
});
