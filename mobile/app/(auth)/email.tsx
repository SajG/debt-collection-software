import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { isDevTestPhone } from "@/auth/dev-test";
import { theme } from "@/theme";
import { requestEmailCode } from "@/lib/request-code";
import {
  clearRevokedNotice,
  readRevokedNotice,
} from "@/lib/session-revoked";

// SY-email step 1 of 2.
//
// One email field, one "Send code" button. The allowlist is
// enforced by `shouldCreateUser: false`: Supabase refuses to send
// the OTP if there is no auth user with that email. Since admins
// are the only ones who create auth users (via /admin/users →
// invite), this is the "only admins decide who uses the app"
// gate. Do NOT flip shouldCreateUser to true — that would let
// anyone with a valid email spin up an account.
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
// terminated because an admin revoked this device, /(auth)/email
// displays a red banner "This phone was signed out by your admin."
// The AsyncStorage key `syncit:revokedNotice` is written by
// touch_device_seen (AuthContext) or by the query error handler
// (mobile/src/lib/session-revoked.ts).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [revokedNotice, setRevokedNotice] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const note = await readRevokedNotice();
      if (note) setRevokedNotice(note);
    })();
  }, []);

  async function dismissRevoked() {
    await clearRevokedNotice();
    setRevokedNotice(null);
  }

  async function send() {
    setError(null);
    const raw = email.trim();
    const digits = raw.replace(/\D/g, "");

    // Dev-only phone bypass: __DEV__ + matches EXPO_PUBLIC_DEV_TEST_PHONE.
    // Skips Supabase entirely; code screen accepts DEV_TEST_OTP.
    if (isDevTestPhone(digits)) {
      router.push({ pathname: "/(auth)/code", params: { phone: digits } });
      return;
    }

    const clean = raw.toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError("Enter a valid email or phone.");
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

  return (
    <Screen scroll>
      {revokedNotice ? (
        <View style={styles.revokedBanner}>
          <Text style={styles.revokedText}>{revokedNotice}</Text>
          <Text
            style={styles.revokedDismiss}
            onPress={dismissRevoked}
            accessibilityRole="button"
          >
            Dismiss
          </Text>
        </View>
      ) : null}

      <View style={styles.header}>
        <Text style={styles.title}>Sign in to Syncit</Text>
        <Text style={styles.subtitle}>
          Enter the email your admin added. We'll send you a 6-digit code.
        </Text>
      </View>

      <TextField
        label="Email or phone"
        error={error}
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        style={{ fontSize: 18 }}
      />

      <Button label="Send code" loading={sending} onPress={send} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: 8, marginBottom: theme.spacing.md },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
  },
  revokedBanner: {
    backgroundColor: theme.colors.dangerBg,
    borderColor: theme.colors.danger,
    borderWidth: 1,
    borderRadius: theme.radius,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  revokedText: {
    fontSize: theme.type.body,
    color: theme.colors.danger,
    fontWeight: "700",
  },
  revokedDismiss: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.danger,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
