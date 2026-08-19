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
import {
  DEV_TEST_EMAIL,
  DEV_TEST_OTP,
  DEV_TEST_PASSWORD,
  DEV_TEST_PHONE,
  isDevPasswordLoginEnabled,
  isDevTestOtpEnabled,
  isDevTestPhone,
} from "@/auth/dev-test";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

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
      const e164 = toE164(digits);

      // OTP allowlist. is_provisioned_phone is a phone-number oracle
      // by design, so we deliberately show the SAME generic message
      // for three distinct failure states — unprovisioned, rate-
      // limited, and RPC failure. This is a cost control (no wasted
      // SMS on unknown numbers); the real security boundary is
      // Supabase Auth's own allowlist / phone-provider config.
      const GENERIC =
        "This number is not registered. Contact your administrator.";

      const { data: rl } = await supabase.rpc(
        "check_phone_otp_rate_limit",
        { p_phone: e164 },
      );
      const limited = Array.isArray(rl) && rl[0]?.limited;
      if (limited) {
        setError(GENERIC);
        return;
      }

      let allowed = false;
      try {
        const { data, error } = await supabase.rpc("is_provisioned_phone", {
          p_phone: e164,
        });
        if (error) throw error;
        allowed = data === true;
      } catch {
        // Fall through to the generic error rather than leaking
        // "the network is down" — attacker learns nothing either way.
      }
      if (!allowed) {
        setError(GENERIC);
        return;
      }

      // Dev-only: skip the SMS provider and go straight to verify.
      // The verify screen accepts EXPO_PUBLIC_DEV_TEST_OTP for this
      // number. Production builds never take this branch.
      if (isDevTestPhone(digits)) {
        router.push({ pathname: "/(auth)/verify", params: { phone: digits } });
        return;
      }

      const { error: sendError } = await supabase.auth.signInWithOtp({
        phone: e164,
      });
      if (sendError) {
        setError(
          __DEV__ ? sendError.message : t("auth.phone.error"),
        );
        return;
      }
      router.push({ pathname: "/(auth)/verify", params: { phone: digits } });
    } finally {
      setSending(false);
    }
  }

  async function devSignIn() {
    if (!DEV_TEST_EMAIL || !DEV_TEST_PASSWORD) return;
    setError(null);
    setDevSigningIn(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEV_TEST_EMAIL,
        password: DEV_TEST_PASSWORD,
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

      {isDevPasswordLoginEnabled() && (
        <View style={styles.devSection}>
          <Text style={styles.devLabel}>Dev build</Text>
          {isDevTestOtpEnabled() && (
            <Text style={styles.devHint}>
              Test phone {DEV_TEST_PHONE} · code {DEV_TEST_OTP}
            </Text>
          )}
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
              {devSigningIn ? "Signing in…" : `Sign in as ${DEV_TEST_EMAIL}`}
            </Text>
          </Pressable>
          <Text style={styles.devHint}>
            Visible only in __DEV__ with EXPO_PUBLIC_DEV_TEST_* set. Never
            appears in release builds.
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
