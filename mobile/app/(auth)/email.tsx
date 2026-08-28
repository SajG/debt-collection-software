import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { theme } from "@/theme";

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
// Same generic failure for unknown-email, wrong-code, expired-code,
// and rate-limited paths. __DEV__ builds append the actual reason
// as `[dev] …` for debugging — release builds never do.

const GENERIC_ERROR =
  "We couldn't send a code. Ask your admin to check your email is on file.";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailScreen() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function send() {
    setError(null);
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError("Enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email: clean,
        options: { shouldCreateUser: false },
      });
      if (otpErr) {
        // In prod builds a send failure is terminal — most likely
        // an unknown email (allowlist rejection) or rate limit, and
        // moving forward with no code is a dead end. Show generic
        // error and stay put.
        if (!__DEV__) {
          setError(GENERIC_ERROR);
          return;
        }
        // In DEV, let the tester continue anyway — dev builds
        // use `npm run dev:otp` to generate a code out-of-band,
        // so a rate-limited send here is fine to ignore.
        console.warn("[dev] signInWithOtp failed, continuing:", otpErr.message);
      }
      router.push({ pathname: "/(auth)/code", params: { email: clean } });
    } catch (e) {
      setError(
        __DEV__ && e instanceof Error
          ? `${GENERIC_ERROR}\n[dev] ${e.message}`
          : GENERIC_ERROR,
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Sign in to Syncit</Text>
        <Text style={styles.subtitle}>
          Enter the email address your admin added. We'll send you a
          6-digit code.
        </Text>
      </View>

      <TextField
        label="Email"
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
});
