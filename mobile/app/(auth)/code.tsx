import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { router, useLocalSearchParams } from "expo-router";
import Constants from "expo-constants";
import * as Device from "expo-device";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { supabase } from "@/lib/supabase";
import { isNetworkError } from "@/lib/errors";
import { setDeviceId } from "@/auth/device-lock";
import { requestEmailCode } from "@/lib/request-code";
import {
  DEV_TEST_EMAIL,
  DEV_TEST_PASSWORD,
  isDevTestOtp,
} from "@/auth/dev-test";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";
import { tryReviewLogin } from "@/lib/review-login";

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

const genericError = () => t("authCode.genericError");

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
  const { email, phone } = useLocalSearchParams<{
    email?: string;
    phone?: string;
  }>();
  const identifier = email ?? phone ?? "";
  const isDevPhone = !!phone;
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
      setError(t("authCode.enterThe6DigitCode"));
      return;
    }
    if (!identifier) {
      setError(genericError());
      return;
    }
    setVerifying(true);
    try {
      if (isDevPhone) {
        // Dev phone bypass: match static OTP, then sign in as the
        // provisioned dev auth user via password. Real Supabase phone
        // OTP is not wired.
        if (!isDevTestOtp(phone!, code) || !DEV_TEST_EMAIL || !DEV_TEST_PASSWORD) {
          setError(genericError());
          return;
        }
        const { error: pwErr } = await supabase.auth.signInWithPassword({
          email: DEV_TEST_EMAIL,
          password: DEV_TEST_PASSWORD,
        });
        if (pwErr) {
          setError(
            __DEV__ ? t("authCode.dev", { error: genericError(), message: pwErr.message }) : genericError(),
          );
          return;
        }
      } else {
        const verifyErr = await verifyEmailCode(identifier, code);
        if (verifyErr && isNetworkError(verifyErr)) {
          // The code was never checked — don't tell the user it's wrong
          // (they'd ask for a new one and hit the send limit).
          setError(
            __DEV__ ? t("authCode.dev", { error: t("authCode.networkError"), message: verifyErr.message }) : t("authCode.networkError"),
          );
          return;
        }
        if (verifyErr) {
          // Store reviewers (Google Play / App Store) sign in to the
          // demo company with a fixed code that only the server knows
          // and checks. The app holds no list of those addresses and no
          // code: it simply asks the server, which refuses everyone
          // else with the same answer as a wrong code.
          const review = await tryReviewLogin(identifier, code);
          const { error: sessionErr } = review
            ? await supabase.auth.setSession(review)
            : { error: verifyErr };
          if (sessionErr) {
            setError(
              __DEV__ ? t("authCode.dev", { error: genericError(), message: verifyErr.message }) : genericError(),
            );
            return;
          }
        }
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
        // SY15.9. register_device raises 'Account disabled' when
        // Profile.isActive is false. The user just successfully
        // verified an OTP so they hold a live session — leave it
        // in place and they can hit any RLS-gated read as an
        // active-role zombie. Force sign-out before showing the
        // error.
        if (regErr?.message?.includes("Account disabled")) {
          await supabase.auth.signOut();
        }
        setError(
          __DEV__ && regErr?.message
            ? t("authCode.dev", { error: genericError(), message: regErr.message })
            : genericError(),
        );
        return;
      }
      await setDeviceId(reg[0].device_id);
      router.replace("/set-up-lock");
    } catch (e) {
      const base = isNetworkError(e) ? t("authCode.networkError") : genericError();
      setError(
        __DEV__ && e instanceof Error
          ? t("authCode.dev", { error: base, message: e.message })
          : base,
      );
    } finally {
      setVerifying(false);
    }
  }, [code, email]);

  async function resend() {
    if (cooldownLeft > 0 || !identifier) return;
    if (isDevPhone) {
      // No real send for dev phone; just reset cooldown.
      setResendingAt(Date.now());
      return;
    }
    setError(null);
    // Same enumeration/limiter policy as the email screen — the
    // server route runs the per-email limit + Sentry-logs SMTP
    // faults; we always reset the cooldown so the user cannot
    // distinguish "sent" from "silently dropped".
    const res = await requestEmailCode(email!);
    if ("rateLimited" in res) setError(res.message);
    setResendingAt(Date.now());
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>{t("authCode.enterYourCode")}</Text>
        <Text style={styles.subtitle}>
          {isDevPhone
            ? t("authCode.devPhoneEnterDevOtp", { identifier })
            : t("authCode.ifIsRegisteredA6", { identifier })}
        </Text>
      </View>

      <TextField
        label={t("authCode.6DigitCode")}
        error={error}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={6}
        value={code}
        onChangeText={(v) => setCode(v.replace(/\D/g, ""))}
        style={{ fontSize: 28, letterSpacing: 8, textAlign: "center" }}
      />

      <Button label={t("authCode.verify")} loading={verifying} onPress={verify} />

      <View style={styles.footer}>
        <Pressable
          accessibilityLabel={cooldownLeft > 0
              ? t("authCode.resendInS", { cooldownLeft })
              : t("authCode.resendCode")}
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
              ? t("authCode.resendInS", { cooldownLeft })
              : t("authCode.resendCode")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={isDevPhone ? t("authCode.changePhone") : t("authCode.changeEmail")}
          onPress={() => router.back()}
          style={{ minHeight: theme.tap, justifyContent: "center" }}
          accessibilityRole="button"
        >
          <Text style={styles.link}>
            {isDevPhone ? t("authCode.changePhone") : t("authCode.changeEmail")}
          </Text>
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

// iOS drops idle connections while the user is in Mail copying the code,
// and the first request after coming back fails before reaching the
// server. Try again (twice, briefly spaced) before giving up; a real
// "wrong / expired code" answer is returned straight away.
async function verifyEmailCode(email: string, token: string) {
  let last: Awaited<ReturnType<typeof supabase.auth.verifyOtp>>["error"] = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700 * attempt));
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
    if (!error || !isNetworkError(error)) return error;
    last = error;
  }
  return last;
}
