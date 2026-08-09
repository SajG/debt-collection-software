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
    const { error: sendError } = await supabase.auth.signInWithOtp({
      phone: toE164(digits),
    });
    setSending(false);
    if (sendError) {
      setError(t("auth.phone.error"));
      return;
    }
    router.push({ pathname: "/(auth)/verify", params: { phone: digits } });
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
        // A 12-year-old feature phone user can still type digits — but
        // making the input font extra-large keeps mistakes low.
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
