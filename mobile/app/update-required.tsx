import { StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { currentAppVersion } from "@/lib/app-updates";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";

// Terminal screen shown when BusinessSettings.mobileMinAppVersion is
// higher than the running app version. Blocks every route in the
// shell; the only action is "restart, then install from Play Store /
// TestFlight / your admin". Reserved for security releases — routine
// bumps use the non-blocking banner.

export default function UpdateRequiredScreen({
  minVersion,
}: {
  minVersion?: string;
}) {
  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Text style={styles.title}>{t("updateRequired.updateRequired")}</Text>
        <Text style={styles.body}>
          {t("updateRequired.body", {
            current: currentAppVersion(),
            minimum: minVersion ?? t("updateRequired.unknown"),
          })}
        </Text>
        <Button
          label={t("updateRequired.checkForUpdates")}
          onPress={() => {
            // Ping expo-updates in case an OTA covers the gap; the
            // hook fires on next mount.
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  body: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    lineHeight: 26,
  },
  mono: {
    fontFamily: "Menlo",
    color: theme.colors.text,
    fontWeight: "700",
  },
});
