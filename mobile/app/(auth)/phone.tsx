import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import {
  isValidIndianMobile,
  normalisePhoneInput,
  toE164,
} from "@/auth/phone-utils";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Optional dev shortcut: when EXPO_PUBLIC_DEV_TEST_EMAIL /
// EXPO_PUBLIC_DEV_TEST_PASSWORD are set AND we're running a dev build,
// a "Sign in with test account" button appears. Uses Supabase's
// password grant against a seeded user — no code path bypasses the
// OTP flow itself; production builds (env vars absent) never see it.
const DEV_EMAIL = process.env.EXPO_PUBLIC_DEV_TEST_EMAIL;
const DEV_PASSWORD = process.env.EXPO_PUBLIC_DEV_TEST_PASSWORD;
const DEV_SHORTCUT_AVAILABLE = __DEV__ && !!DEV_EMAIL && !!DEV_PASSWORD;

export default function PhoneScreen() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [devSigningIn, setDevSigningIn] = useState(false);

  async function sendCode() {
    setError(null);
    const digits = normalisePhoneInput(phone);
    if (!isValidIndianMobile(digits)) {
      setError(t("auth.phone.invalid"));
      return;
    }
    setSending(true);
    try {
      // Defense in depth: even though Supabase throttles OTP sends
      // itself, we check our own LoginAttempt-backed limit so an
      // attacker who bypasses the client also can't grind verifies.
      const { data: rl } = await supabase.rpc(
        "check_phone_otp_rate_limit",
        { p_phone: toE164(digits) },
      );
      const limited = Array.isArray(rl) && rl[0]?.limited;
      if (limited) {
        setError(
          `Too many attempts. Try again in ${rl?.[0]?.retry_after_minutes ?? 15} minutes.`,
        );
        return;
      }

      const { error: sendError } = await supabase.auth.signInWithOtp({
        phone: toE164(digits),
      });
      if (sendError) {
        setError(t("auth.phone.error"));
        return;
      }
      router.push({ pathname: "/(auth)/verify", params: { phone: digits } });
    } finally {
      setSending(false);
    }
  }

  async function devSignIn() {
    if (!DEV_EMAIL || !DEV_PASSWORD) return;
    setError(null);
    setDevSigningIn(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      });
      if (signInError) {
        setError(signInError.message);
        return;
      }
      router.replace("/");
    } finally {
      setDevSigningIn(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>{t("auth.phone.title")}</Text>
        <Text style={styles.subtitle}>{t("auth.phone.subtitle")}</Text>
      </View>

      <TextField
        label={t("auth.phone.label")}
        hint={t("auth.phone.hint")}
        error={error}
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={10}
        value={phone}
        onChangeText={(v) => setPhone(normalisePhoneInput(v))}
        style={{ fontSize: 24, letterSpacing: 2 }}
      />

      <Button
        label={t("auth.phone.send")}
        loading={sending}
        onPress={sendCode}
      />

      {DEV_SHORTCUT_AVAILABLE && (
        <View style={styles.devSection}>
          <Text style={styles.devLabel}>Dev build</Text>
          <Pressable
            onPress={devSignIn}
            disabled={devSigningIn}
            style={({ pressed }) => [
              styles.devBtn,
              pressed && { opacity: 0.85 },
              devSigningIn && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.devBtnText}>
              {devSigningIn ? "Signing in…" : `Sign in as ${DEV_EMAIL}`}
            </Text>
          </Pressable>
          <Text style={styles.devHint}>
            Visible only in __DEV__ with EXPO_PUBLIC_DEV_TEST_EMAIL +
            EXPO_PUBLIC_DEV_TEST_PASSWORD set. Never appears in release
            builds.
          </Text>
        </View>
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
  devSection: {
    marginTop: theme.spacing.xl,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: 8,
  },
  devLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  devBtn: {
    minHeight: theme.tap,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
  },
  devBtnText: {
    color: theme.colors.primary,
    fontSize: theme.type.button,
    fontWeight: "700",
  },
  devHint: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
});
