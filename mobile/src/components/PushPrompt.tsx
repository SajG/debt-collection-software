import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { Button } from "./Button";
import { toast } from "./Toast";
import { useAuth } from "@/auth/AuthContext";
import {
  dismissPushPrompt,
  enablePush,
  getPushPromptState,
} from "@/lib/notifications";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Our own one-line reason, shown before the OS permission dialog. The
// OS dialog appears only after "Turn on". "Not now" hides the card for
// good; Settings → Notifications can still switch it on later.
export function PushPrompt() {
  const { profile } = useAuth();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void getPushPromptState().then((s) => {
      if (alive) setVisible(s === "ask");
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!visible || !profile) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.reason}>{t("push.reason")}</Text>
      <View style={styles.buttons}>
        <View style={styles.button}>
          <Button
            label={t("push.turnOn")}
            loading={busy}
            accessibilityLabel={t("push.turnOn")}
            onPress={async () => {
              setBusy(true);
              const ok = await enablePush(profile.id);
              setBusy(false);
              setVisible(false);
              if (ok) toast.success(t("push.enabled"));
            }}
          />
        </View>
        <View style={styles.button}>
          <Button
            label={t("common.notNow")}
            variant="secondary"
            accessibilityLabel={t("common.notNow")}
            onPress={() => {
              setVisible(false);
              void dismissPushPrompt();
            }}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
  },
  reason: {
    fontSize: theme.type.bodySmall,
    fontWeight: "600",
    color: theme.colors.text,
  },
  buttons: { flexDirection: "row", gap: 8 },
  button: { flex: 1 },
});
