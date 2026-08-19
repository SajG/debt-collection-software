import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { formatForDisplay, toE164 } from "@/auth/phone-utils";
import {
  DEV_TEST_EMAIL,
  DEV_TEST_OTP,
  DEV_TEST_PASSWORD,
  isDevTestOtp,
  isDevTestPhone,
} from "@/auth/dev-test";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

const RESEND_COOLDOWN_S = 30;

export default function VerifyScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendingAt, setResendingAt] = useState<number | null>(Date.now());
  const [nowTick, setNowTick] = useState(Date.now());

  // 1Hz tick keeps the resend-cooldown countdown ticking without a
  // full-tree re-render from the parent.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cooldownLeft = resendingAt
    ? Math.max(0, RESEND_COOLDOWN_S - Math.floor((nowTick - resendingAt) / 1000))
    : 0;

  async function verify() {
    setError(null);
    if (code.length !== 6) {
      setError(t("auth.verify.invalid"));
      return;
    }
    setVerifying(true);
    const e164 = toE164(phone ?? "");

    // Dev-only test OTP: skip SMS verify and use the password grant
    // against the seeded test user. Production never takes this branch.
    if (isDevTestOtp(phone ?? "", code)) {
      if (!DEV_TEST_EMAIL || !DEV_TEST_PASSWORD) {
        setVerifying(false);
        setError(t("auth.verify.invalid"));
        return;
      }
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: DEV_TEST_EMAIL,
        password: DEV_TEST_PASSWORD,
      });
      setVerifying(false);
      if (signInError) {
        setError(__DEV__ ? signInError.message : t("auth.verify.invalid"));
        return;
      }
      router.replace("/");
      return;
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: e164,
      token: code,
      type: "sms",
    });
    // Log both outcomes to LoginAttempt so the rate-limit RPC has
    // ground truth to work from. Best-effort: never block the user
    // on a logging failure.
    try {
      await supabase.rpc("record_phone_otp_attempt", {
        p_phone: e164,
        p_successful: !verifyError,
      });
    } catch {
      /* non-fatal */
    }
    setVerifying(false);
    if (verifyError) {
      setError(t("auth.verify.invalid"));
      return;
    }
    // Root gate at "/" picks the right destination from role.
    router.replace("/");
  }

  async function resend() {
    setError(null);
    const { error: sendError } = await supabase.auth.signInWithOtp({
      phone: toE164(phone ?? ""),
    });
    if (sendError) {
      setError(t("auth.phone.error"));
      return;
    }
    setResendingAt(Date.now());
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>{t("auth.verify.title")}</Text>
        <Text style={styles.subtitle}>
          {t("auth.verify.subtitle", {
            phone: `+91 ${formatForDisplay(phone ?? "")}`,
          })}
        </Text>
      </View>

      {isDevTestPhone(phone ?? "") && (
        <Text style={styles.devHint}>Dev OTP {DEV_TEST_OTP}</Text>
      )}

      <TextField
        label={t("auth.verify.label")}
        error={error}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ""))}
        style={{ fontSize: 28, letterSpacing: 8, textAlign: "center" }}
      />

      <Button
        label={t("auth.verify.submit")}
        loading={verifying}
        onPress={verify}
      />

      <View style={styles.footer}>
        <Pressable
          onPress={resend}
          disabled={cooldownLeft > 0}
          style={{ minHeight: theme.tap, justifyContent: "center" }}
          accessibilityRole="button"
          accessibilityState={{ disabled: cooldownLeft > 0 }}
        >
          <Text
            style={[
              styles.link,
              cooldownLeft > 0 && { color: theme.colors.textMuted },
            ]}
          >
            {cooldownLeft > 0
              ? t("auth.verify.resendIn", { seconds: cooldownLeft })
              : t("auth.verify.resend")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={{ minHeight: theme.tap, justifyContent: "center" }}
          accessibilityRole="button"
        >
          <Text style={styles.link}>{t("auth.verify.change")}</Text>
        </Pressable>
      </View>
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
  footer: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  link: {
    fontSize: theme.type.body,
    color: theme.colors.primary,
    fontWeight: "600",
  },
  devHint: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
    fontWeight: "600",
  },
});
