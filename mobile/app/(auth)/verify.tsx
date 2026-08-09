import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { formatForDisplay, toE164 } from "@/auth/phone-utils";
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
    const { error: verifyError } = await supabase.auth.verifyOtp({
      phone: toE164(phone ?? ""),
      token: code,
      type: "sms",
    });
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
});
