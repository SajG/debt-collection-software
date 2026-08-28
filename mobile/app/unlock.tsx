import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
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
      setError("Biometric unavailable. Sign out and re-enrol with a PIN.");
    } else {
      setError("Unlock cancelled.");
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
      setError("Enter your 6-digit PIN.");
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
        `Too many wrong attempts. Signed out. Ask your admin for a new enrollment code.`,
      );
      await signOut();
      return;
    }
    setError(`Wrong PIN. ${MAX_PIN_ATTEMPTS} wrong attempts sign you out.`);
  }

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Text style={styles.title}>Unlock</Text>
        <Text style={styles.subtitle}>
          {kind === "biometric"
            ? "Use your fingerprint or face."
            : kind === "pin"
              ? "Enter your 6-digit PIN."
              : "This device isn't set up. Sign out and re-enrol."}
        </Text>
      </View>

      {kind === "biometric" ? (
        <Button
          label="Unlock with biometric"
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
          <Button label="Unlock" loading={busy} onPress={runPin} />
        </>
      ) : null}

      {error && kind === "biometric" ? (
        <Text style={styles.error}>{error}</Text>
      ) : null}

      <View style={{ marginTop: theme.spacing.lg }}>
        <Button
          label="Sign out"
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
