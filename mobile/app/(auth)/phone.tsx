import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
import { isDevTestPhone } from "@/auth/dev-test";
import { isTestLoginPhone } from "@/auth/test-login";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function PhoneScreen() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

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
      // Dev-only diagnostic. Appended to GENERIC when __DEV__ so a
      // developer can tell which of the three failure modes fired.
      // Release builds never take this branch — the wire behaviour is
      // identical: same string, no reason leaked.
      const withReason = (reason: string) =>
        __DEV__ ? `${GENERIC}\n[dev] ${reason}` : GENERIC;

      const { data: rl } = await supabase.rpc(
        "check_phone_otp_rate_limit",
        { p_phone: e164 },
      );
      const limited = Array.isArray(rl) && rl[0]?.limited;
      if (limited) {
        setError(withReason("rate_limited"));
        return;
      }

      let allowed = false;
      let rpcErrMsg: string | null = null;
      try {
        const { data, error } = await supabase.rpc("is_provisioned_phone", {
          p_phone: e164,
        });
        if (error) throw error;
        allowed = data === true;
      } catch (e) {
        rpcErrMsg = e instanceof Error ? e.message : String(e);
      }
      if (!allowed) {
        setError(
          withReason(rpcErrMsg ? `rpc_error: ${rpcErrMsg}` : "unprovisioned"),
        );
        return;
      }

      // Dev-only: skip the SMS provider and go straight to verify.
      // The verify screen accepts EXPO_PUBLIC_DEV_TEST_OTP for this
      // number. Production builds never take this branch.
      if (isDevTestPhone(digits)) {
        router.push({ pathname: "/(auth)/verify", params: { phone: digits } });
        return;
      }

      // Team-bootstrap test login: allowlisted team phones skip the
      // SMS provider entirely — no OTP text is sent, no rate-limit
      // budget is spent. They log in with TEST_LOGIN_CODE on the
      // verify screen. See mobile/src/auth/test-login.ts.
      if (isTestLoginPhone(e164)) {
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
});
