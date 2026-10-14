import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { useAuth } from "@/auth/AuthContext";
import {
  getLockKind,
  tryBiometricUnlock,
  tryPinUnlock,
  MAX_PIN_ATTEMPTS,
} from "@/auth/device-lock";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";

// The unlock screen. Rendered by the root gate when session is valid
// but the local device lock is engaged. Successful unlock calls
// AuthContext.markUnlocked(), which flips `locked` and re-routes.

export default function UnlockScreen() {
  const { markUnlocked, signOut } = useAuth();
  const [kind, setKind] = useState<"biometric" | "pin" | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  const runBiometric = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await tryBiometricUnlock();
    setBusy(false);
    if (res.ok) {
      markUnlocked();
      router.replace("/");
      return;
    }
    if (res.reason === "unavailable") {
      setError(t("unlock.biometricUnavailableSignOutAnd"));
    } else {
      setError(t("unlock.unlockCancelled"));
    }
  }, [markUnlocked]);

  useEffect(() => {
    void (async () => {
      const k = await getLockKind();
      setKind(k);
      if (k === "biometric" && !autoTried) {
        setAutoTried(true);
        await runBiometric();
      }
    })();
  }, [autoTried, runBiometric]);

  async function runPin() {
    setError(null);
    if (!/^\d{6}$/.test(pin)) {
      setError(t("unlock.enterYour6DigitPin"));
      return;
    }
    setBusy(true);
    const res = await tryPinUnlock(pin);
    setBusy(false);
    setPin("");
    if (res.ok) {
      markUnlocked();
      router.replace("/");
      return;
    }
    if (res.reason === "wiped") {
      setError(
        t("unlock.tooManyWrongAttemptsSigned"),
      );
      await signOut();
      return;
    }
    setError(t("unlock.wrongPinWrongAttemptsSign", { MAX_PIN_ATTEMPTS }));
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>{t("unlock.unlock")}</Text>
        <Text style={styles.subtitle}>
          {kind === "biometric"
            ? t("unlock.useYourFingerprintOrFace")
            : kind === "pin"
              ? t("unlock.enterYour6DigitPin")
              : t("unlock.thisDeviceIsntSetUp")}
        </Text>
      </View>

      {kind === "biometric" ? (
        <Button
          label={t("unlock.unlockWithBiometric")}
          loading={busy}
          onPress={runBiometric}
        />
      ) : kind === "pin" ? (
        <>
          <TextField
            label="PIN"
            error={error}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            value={pin}
            onChangeText={(v) => setPin(v.replace(/\D/g, ""))}
            style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
          />
          <Button label={t("unlock.unlock")} loading={busy} onPress={runPin} />
        </>
      ) : null}

      {error && kind === "biometric" ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      <View style={{ marginTop: theme.spacing.lg }}>
        <Button
          label={t("unlock.signOut")}
          variant="danger"
          onPress={() => void signOut()}
        />
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
  error: {
    marginTop: theme.spacing.sm,
    fontSize: theme.type.bodySmall,
    color: theme.colors.danger,
    fontWeight: "600",
  },
});
