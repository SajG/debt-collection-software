import { useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import {
  isValidIndianMobile,
  normalisePhoneInput,
  toE164,
} from "@/auth/phone-utils";
import { setDeviceId } from "@/auth/device-lock";
import { theme } from "@/theme";

// SY1 enrollment screen — SQL-only path.
//
// Mobile calls redeem_and_mint_session directly via the anon-key
// Supabase client. That RPC validates the code, inserts a Device
// row, sets a synthetic email on the auth user, generates a fresh
// 32-byte password, bcrypts it into auth.users, and returns
// { email, temp_password }. Mobile immediately calls
// signInWithPassword to get a real session.
//
// Zero extra endpoints. No apiBaseUrl. No Edge Function to deploy.
// The only URL mobile needs is EXPO_PUBLIC_SUPABASE_URL, which it
// already uses for storage and auth.

const GENERIC_ERROR = "Enrollment failed. Ask your admin for a new code.";

function deviceLabel(): string {
  const model = Device.modelName ?? Device.deviceName ?? "device";
  return model.slice(0, 60);
}

function platformString(): string {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return Platform.OS;
}

export default function EnrollScreen() {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    const digits = normalisePhoneInput(phone);
    if (!isValidIndianMobile(digits)) {
      setError("Enter a 10-digit Indian mobile number.");
      return;
    }
    const codeClean = code.trim().toUpperCase();
    if (codeClean.length !== 8) {
      setError("Enrollment codes are 8 characters.");
      return;
    }
    setSubmitting(true);
    const e164 = toE164(digits);

    try {
      // 1. Redeem + mint. Anon-callable, guarded inside the RPC.
      //    Cast because generated Supabase types haven't been
      //    regenerated for the new RPC yet.
      const { data, error: rpcErr } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{
          data:
            | { email: string; temp_password: string; device_id: string; profile_id: string }[]
            | null;
          error: { message: string } | null;
        }>
      )("redeem_and_mint_session", {
        p_phone: e164,
        p_code: codeClean,
        p_device: {
          label: deviceLabel(),
          platform: platformString(),
          osVersion: Device.osVersion ?? null,
          appVersion:
            (Constants.expoConfig?.version as string | undefined) ?? null,
        },
      });

      if (rpcErr || !data || data.length === 0) {
        setError(
          __DEV__ && rpcErr?.message
            ? `${GENERIC_ERROR}\n[dev] ${rpcErr.message}`
            : GENERIC_ERROR,
        );
        return;
      }
      const row = data[0]!;

      // 2. Sign in with the one-time password the RPC just set.
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: row.email,
        password: row.temp_password,
      });
      if (signInErr) {
        setError(
          __DEV__ ? `${GENERIC_ERROR}\n[dev] ${signInErr.message}` : GENERIC_ERROR,
        );
        return;
      }

      await setDeviceId(row.device_id);
      router.replace("/set-up-lock");
    } catch (e) {
      setError(
        __DEV__ && e instanceof Error
          ? `${GENERIC_ERROR}\n[dev] ${e.message}`
          : GENERIC_ERROR,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Register this phone</Text>
        <Text style={styles.subtitle}>
          Ask an admin for an 8-character enrollment code. The code
          expires in 30 minutes and can be used once.
        </Text>
      </View>

      <TextField
        label="Your phone number"
        hint="10-digit mobile only. +91 is added automatically."
        keyboardType="phone-pad"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={10}
        value={phone}
        onChangeText={(v) => setPhone(normalisePhoneInput(v))}
        style={{ fontSize: 22, letterSpacing: 2 }}
      />

      <TextField
        label="Enrollment code"
        error={error}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        value={code}
        onChangeText={(v) => setCode(v.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
        style={{
          fontSize: 26,
          letterSpacing: 6,
          textAlign: "center",
          fontFamily: "Menlo",
        }}
      />

      <Button
        label="Register device"
        loading={submitting}
        onPress={submit}
      />
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
