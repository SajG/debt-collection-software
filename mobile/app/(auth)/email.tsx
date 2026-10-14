import { useEffect, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { isDevTestPhone } from "@/auth/dev-test";
import { theme } from "@/theme";
import { requestEmailCode } from "@/lib/request-code";
import {
  clearRevokedNotice,
  readRevokedNotice,
} from "@/lib/session-revoked";
import { t } from "@/lib/i18n";

// SY-email step 1 of 2.
//
// One "Work email" field, one "Send code" button. The allowlist is
// enforced by `shouldCreateUser: false`: Supabase refuses to send
// the OTP if there is no auth user with that email. People get an
// account by being invited by their manager, or by creating their
// company on the website — the line under the button says so and
// links to getsyncit.app. Do NOT flip shouldCreateUser to true — that
// would let anyone with a valid email spin up an account.
//
// Enumeration policy (SY15.8): regardless of what happens — email
// missing, allowlist rejection, rate limit, network fault — the UI
// ALWAYS advances to the code screen and the messaging on the code
// screen is "If that address is registered, a code is on its way".
// The only cases that keep the user on this screen are input
// validation (bad email format) and the pre-signin per-email rate
// limiter (SY15.7), because sending in those cases would either be
// impossible or actively harmful.
//
// Revocation banner (SY15.1 follow-up): if the last session was
// terminated because an admin revoked this device, a red banner says
// so. The flag is written by touch_device_seen (AuthContext) or by the
// query error handler (mobile/src/lib/session-revoked.ts).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNUP_URL = "https://getsyncit.app";

export default function EmailScreen() {
  // SY42 — `syncit://email?email=…` from the invite page prefills the
  // address so a new staff member only has to type their password.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(
    typeof params.email === "string" && EMAIL_RE.test(params.email.trim())
      ? params.email.trim().toLowerCase()
      : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [revoked, setRevoked] = useState(false);

  useEffect(() => {
    void (async () => {
      const note = await readRevokedNotice();
      if (note) setRevoked(true);
    })();
  }, []);

  async function dismissRevoked() {
    await clearRevokedNotice();
    setRevoked(false);
  }

  async function send() {
    setError(null);
    const raw = email.trim();

    // Dev-only bypass: __DEV__ + matches EXPO_PUBLIC_DEV_TEST_PHONE.
    // Skips Supabase entirely; code screen accepts DEV_TEST_OTP. Not
    // reachable in a release build and not mentioned in the UI.
    const digits = raw.replace(/\D/g, "");
    if (isDevTestPhone(digits)) {
      router.push({ pathname: "/(auth)/code", params: { phone: digits } });
      return;
    }

    const clean = raw.toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError(t("auth.email.invalid"));
      return;
    }
    setSending(true);
    try {
      // POST /api/auth/request-code (audit item 9). Runs the same
      // per-email rate limit the web sign-in uses; Supabase / SMTP
      // errors are Sentry-logged server-side and hidden from the
      // caller. Only a 429 keeps the user on this screen.
      const res = await requestEmailCode(clean);
      if ("rateLimited" in res) {
        setError(res.message);
        return;
      }
      // A network fault must still advance — the UI cannot leak
      // whether the send actually happened. In __DEV__ we log it.
      if ("networkError" in res && __DEV__) {
        console.warn("[dev] request-code network:", res.message);
      }

      // Always advance. The code screen shows the neutral "if that
      // address is registered…" line, so send-blocked / unknown /
      // success all look identical to the user.
      router.push({ pathname: "/(auth)/code", params: { email: clean } });
    } finally {
      setSending(false);
    }
  }

  // SY42 — password sign-in: same code screen in "password" mode, so
  // the password is typed there and never travels in route params.
  function usePassword() {
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError(t("auth.email.invalid"));
      return;
    }
    router.push({ pathname: "/(auth)/code", params: { email: clean, mode: "password" } });
  }

  return (
    <Screen scroll>
      {revoked ? (
        <View style={styles.revokedBanner} accessibilityRole="alert">
          <Text style={styles.revokedText}>{t("auth.revoked")}</Text>
          <Pressable
            onPress={dismissRevoked}
            hitSlop={12}
            style={styles.revokedDismissBtn}
            accessibilityRole="button"
            accessibilityLabel={t("authEmail.dismiss")}
          >
            <Text style={styles.revokedDismiss}>{t("authEmail.dismiss")}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {t("authEmail.signInToSyncit")}
        </Text>
        <Text style={styles.subtitle}>{t("auth.email.subtitle")}</Text>
      </View>

      <TextField
        label={t("auth.email.label")}
        error={error}
        keyboardType="email-address"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={send}
        value={email}
        onChangeText={setEmail}
      />

      <Button
        label={t("authEmail.sendCode")}
        loading={sending}
        onPress={send}
        accessibilityLabel={t("authEmail.sendCode")}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("authEmail.usePassword")}
        onPress={usePassword}
        style={{ minHeight: theme.tap, alignItems: "center", justifyContent: "center" }}
      >
        <Text style={styles.link}>{t("authEmail.usePassword")}</Text>
      </Pressable>

      {Platform.OS === "ios" ? (
        // App Store Review 3.1.1/3.1.3: an app whose accounts are
        // created on the web must not point there from inside the app.
        <Text style={styles.newHere}>{t("auth.email.newHereInviteOnly")}</Text>
      ) : (
        <Text style={styles.newHere}>
          {t("auth.email.newHere")}{" "}
          <Text
            style={styles.link}
            onPress={() => void Linking.openURL(SIGNUP_URL)}
            accessibilityRole="link"
            accessibilityLabel={t("auth.email.openWebsite")}
          >
            getsyncit.app
          </Text>
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8 },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
  },
  newHere: {
    fontSize: theme.type.bodySmall,
    lineHeight: 24,
    color: theme.colors.textMuted,
    textAlign: "center",
  },
  link: {
    color: theme.colors.primary,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
  revokedBanner: {
    backgroundColor: theme.colors.dangerBg,
    borderColor: theme.colors.danger,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  revokedText: {
    fontSize: theme.type.body,
    color: theme.colors.danger,
    fontWeight: "700",
  },
  revokedDismissBtn: { minHeight: 48, justifyContent: "center", alignSelf: "flex-start" },
  revokedDismiss: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.danger,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
