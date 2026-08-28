import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { setDeviceId } from "@/auth/device-lock";
import { theme } from "@/theme";

// SY-email step 2 of 2.
//
// User types the 6-digit code from their email; we verify with
// supabase.auth.verifyOtp({ email, token, type: 'email' }). On
// success we call register_device() to insert the mobile Device
// row + revoke any prior device (one-active-device invariant).
// Then route to /set-up-lock exactly like the old enroll flow so
// biometric/PIN setup is unchanged.
//
// Resend has a 30-second cooldown to keep users from spamming the
// Supabase rate limiter into a freeze.

const GENERIC_ERROR =
  "That code didn't work. Ask for a fresh code from the email screen.";

const RESEND_COOLDOWN_S = 30;

function deviceLabel(): string {
  const model = Device.modelName ?? Device.deviceName ?? "device";
  return model.slice(0, 60);
}
function platformString(): string {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return Platform.OS;
}

export default function CodeScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resendingAt, setResendingAt] = useState<number | null>(Date.now());
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const cooldownLeft = resendingAt
    ? Math.max(
        0,
        RESEND_COOLDOWN_S - Math.floor((nowTick - resendingAt) / 1000),
      )
    : 0;

  const verify = useCallback(async () => {
    setError(null);
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    if (!email) {
      setError(GENERIC_ERROR);
      return;
    }
    setVerifying(true);
    try {
      const { error: verifyErr } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email",
      });
      if (verifyErr) {
        setError(
          __DEV__ ? `${GENERIC_ERROR}\n[dev] ${verifyErr.message}` : GENERIC_ERROR,
        );
        return;
      }
      // Session established. register_device is authenticated-only
      // so it runs as the user we just verified.
      const {
        data: reg,
        error: regErr,
      } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data: { device_id: string }[] | null;
          error: { message: string } | null;
        }>
      )("register_device", {
        p_device: {
          label: deviceLabel(),
          platform: platformString(),
          osVersion: Device.osVersion ?? null,
          appVersion:
            (Constants.expoConfig?.version as string | undefined) ?? null,
        },
      });
      if (regErr || !reg?.[0]) {
        setError(
          __DEV__ && regErr?.message
            ? `${GENERIC_ERROR}\n[dev] ${regErr.message}`
            : GENERIC_ERROR,
        );
        return;
      }
      await setDeviceId(reg[0].device_id);
      router.replace("/set-up-lock");
    } catch (e) {
      setError(
        __DEV__ && e instanceof Error
          ? `${GENERIC_ERROR}\n[dev] ${e.message}`
          : GENERIC_ERROR,
      );
    } finally {
      setVerifying(false);
    }
  }, [code, email]);

  async function resend() {
    if (cooldownLeft > 0 || !email) return;
    setError(null);
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (otpErr) {
      setError(
        __DEV__ ? `${GENERIC_ERROR}\n[dev] ${otpErr.message}` : GENERIC_ERROR,
      );
      return;
    }
    setResendingAt(Date.now());
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Enter your code</Text>
        <Text style={styles.subtitle}>
          A 6-digit code was sent to {email}. Enter it below.
        </Text>
      </View>

      <TextField
        label="6-digit code"
        error={error}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
        style={{ fontSize: 28, letterSpacing: 8, textAlign: "center" }}
      />

      <Button label="Verify" loading={verifying} onPress={verify} />

      <View style={styles.footer}>
        <Pressable
          onPress={resend}
          disabled={cooldownLeft > 0}
          style={{ minHeight: theme.tap, justifyContent: "center" }}
          accessibilityRole="button"
        >
          <Text
            style={[
              styles.link,
              cooldownLeft > 0 && { color: theme.colors.textMuted },
            ]}
          >
            {cooldownLeft > 0
              ? `Resend in ${cooldownLeft}s`
              : "Resend code"}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => router.back()}
          style={{ minHeight: theme.tap, justifyContent: "center" }}
          accessibilityRole="button"
        >
          <Text style={styles.link}>Change email</Text>
        </Pressable>
      </View>
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
  footer: { marginTop: theme.spacing.md, gap: theme.spacing.sm },
  link: {
    fontSize: theme.type.body,
    color: theme.colors.primary,
    fontWeight: "600",
  },
});
