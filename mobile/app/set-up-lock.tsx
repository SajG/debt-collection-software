import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/Button";
import {
  isBiometricAvailable,
  setLockKind,
  setupPin,
  tryBiometricUnlock,
} from "@/auth/device-lock";
import { theme } from "@/theme";

// One-time screen after successful enrollment. The user picks
// biometric (if the phone supports it) or a 6-digit PIN. From then
// on cold starts and long-background resumes route to /(unlock) via
// the AuthContext gate.

export default function SetUpLockScreen() {
  const [biometricOk, setBiometricOk] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setBiometricOk(await isBiometricAvailable());
    })();
  }, []);

  async function chooseBiometric() {
    setBusy(true);
    setError(null);
    try {
      const res = await tryBiometricUnlock("Confirm biometric to enable");
      if (!res.ok) {
        setError("Biometric setup was cancelled. Try again or set a PIN.");
        return;
      }
      await setLockKind("biometric");
      router.replace("/");
    } finally {
      setBusy(false);
    }
  }

  async function choosePin() {
    setError(null);
    if (!/^\d{6}$/.test(pin)) {
      setError("Enter a 6-digit PIN.");
      return;
    }
    if (pin !== confirmPin) {
      setError("PINs do not match.");
      return;
    }
    setBusy(true);
    try {
      await setupPin(pin);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save PIN.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Lock this phone</Text>
        <Text style={styles.subtitle}>
          Pick how you'll unlock PayTrack on this device. Every cold
          start and every time the app has been in the background for
          more than 5 minutes will ask for this.
        </Text>
      </View>

      {biometricOk ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Biometric</Text>
          <Text style={styles.cardBody}>
            Face ID, Touch ID, or your Android biometric. Nothing about
            your fingerprint or face leaves this phone.
          </Text>
          <Button
            label="Use biometric"
            loading={busy}
            onPress={chooseBiometric}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Biometric unavailable</Text>
          <Text style={styles.cardBody}>
            This phone doesn't have a fingerprint or face reader set up
            in Settings. Use a PIN below.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>6-digit PIN</Text>
        <TextField
          label="Choose a PIN"
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          value={pin}
          onChangeText={(v) => setPin(v.replace(/\D/g, ""))}
          style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
        />
        <TextField
          label="Confirm PIN"
          error={error}
          keyboardType="number-pad"
          maxLength={6}
          secureTextEntry
          value={confirmPin}
          onChangeText={(v) => setConfirmPin(v.replace(/\D/g, ""))}
          style={{ fontSize: 24, letterSpacing: 8, textAlign: "center" }}
        />
        <Button label="Use PIN" loading={busy} onPress={choosePin} />
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
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius,
    padding: theme.spacing.md,
    gap: 10,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  cardTitle: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  cardBody: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
});
