import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import { toast } from "@/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import {
  declineLock,
  isBiometricAvailable,
  setLockKind,
  setupPin,
  tryBiometricUnlock,
} from "@/auth/device-lock";
import { useLockRequired } from "@/lib/lock-policy";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Shown once after sign-in. The lock is an offer:
//   "Lock Syncit with your fingerprint?"  [Turn on]  [Not now]
// "Not now" is remembered. When the company requires a lock
// (BusinessSettings.requireAppLock) there is no "Not now". Phones
// without a fingerprint reader get the same offer with a 6-digit PIN.
export default function SetUpLockScreen() {
  const { session } = useAuth();
  const required = useLockRequired(!!session);
  const [biometricOk, setBiometricOk] = useState<boolean | null>(null);
  const [usePin, setUsePin] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isBiometricAvailable().then(setBiometricOk);
  }, []);

  async function turnOnBiometric() {
    setBusy(true);
    setError(null);
    try {
      const res = await tryBiometricUnlock(t("lock.confirmPrompt"));
      if (!res.ok) {
        setError(t("lock.biometricCancelled"));
        return;
      }
      await setLockKind("biometric");
      toast.success(t("lock.turnedOn"));
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  async function savePin() {
    setError(null);
    if (!/^\d{6}$/.test(pin)) {
      setError(t("lock.pinSixDigits"));
      return;
    }
    if (pin !== confirmPin) {
      setError(t("lock.pinMismatch"));
      return;
    }
    setBusy(true);
    try {
      await setupPin(pin);
      toast.success(t("lock.turnedOn"));
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("lock.pinSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function notNow() {
    await declineLock();
    router.replace("/");
  }

  if (biometricOk === null || required === null) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </Screen>
    );
  }

  const showPinForm = usePin || !biometricOk;

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          {showPinForm ? t("lock.offerPinTitle") : t("lock.offerTitle")}
        </Text>
        <Text style={styles.subtitle}>
          {required ? t("lock.requiredBody") : t("lock.offerBody")}
        </Text>
      </View>

      {showPinForm ? (
        <View style={styles.form}>
          <TextField
            label={t("lock.choosePin")}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            value={pin}
            onChangeText={(v) => setPin(v.replace(/\D/g, ""))}
            style={styles.pinInput}
          />
          <TextField
            label={t("lock.confirmPin")}
            error={error}
            keyboardType="number-pad"
            maxLength={6}
            secureTextEntry
            value={confirmPin}
            onChangeText={(v) => setConfirmPin(v.replace(/\D/g, ""))}
            style={styles.pinInput}
          />
          <Button
            label={t("lock.turnOn")}
            loading={busy}
            onPress={savePin}
            accessibilityLabel={t("lock.turnOn")}
          />
          {biometricOk ? (
            <Button
              label={t("lock.useFingerprintInstead")}
              variant="secondary"
              onPress={() => {
                setUsePin(false);
                setError(null);
              }}
              accessibilityLabel={t("lock.useFingerprintInstead")}
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.form}>
          {error ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
          <Button
            label={t("lock.turnOn")}
            loading={busy}
            onPress={turnOnBiometric}
            accessibilityLabel={t("lock.turnOn")}
          />
          <Button
            label={t("lock.usePinInstead")}
            variant="secondary"
            onPress={() => {
              setUsePin(true);
              setError(null);
            }}
            accessibilityLabel={t("lock.usePinInstead")}
          />
        </View>
      )}

      {required ? null : (
        <Button
          label={t("common.notNow")}
          variant="secondary"
          onPress={notNow}
          accessibilityLabel={t("common.notNow")}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { gap: 8 },
  title: {
    fontSize: theme.type.title,
    fontWeight: "800",
    color: theme.colors.text,
  },
  subtitle: { fontSize: theme.type.body, color: theme.colors.textMuted },
  form: { gap: theme.spacing.md },
  pinInput: { fontSize: 24, letterSpacing: 8, textAlign: "center" },
  error: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.danger,
    fontWeight: "600",
  },
});
