import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { currentAppVersion } from "@/lib/app-updates";
import { theme } from "@/theme";

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
        <Text style={styles.title}>Update required</Text>
        <Text style={styles.body}>
          Your admin has released a required security update. You are on
          Syncit <Text style={styles.mono}>{currentAppVersion()}</Text>; the
          minimum accepted version is{" "}
          <Text style={styles.mono}>{minVersion ?? "unknown"}</Text>.
          {"\n\n"}
          Install the latest build from the source your admin gave you
          (Play Store / TestFlight / APK link). Then reopen Syncit.
        </Text>
        <Button
          label="Check for updates"
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
