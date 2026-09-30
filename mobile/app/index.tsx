import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { useAppUpdates } from "@/lib/app-updates";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Single source of truth for post-boot routing.
//
// No session         → /(auth)/email   (device enrollment, SY1)
// Session, locked    → /unlock          (biometric or PIN)
// Session, no profile→ AuthContext signs the user out defensively
// FACTORY            → /(factory)
// STAFF              → /(staff)
// ADMIN              → /(admin)
export default function IndexGate() {
  const { loading, session, profile, role, locked } = useAuth();
  // Forced-update floor (SY6 + SY15.4). If the server's
  // mobileMinAppVersion is higher than our built version, hold the
  // user at the blocking /update-required screen so they cannot
  // reach the shell until they update.
  const { updateRequired } = useAppUpdates();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.label}>{t("loading")}</Text>
      </View>
    );
  }

  // Forced update takes precedence over everything — a device on
  // an outdated version might have known security holes we don't
  // want holding a live session.
  if (updateRequired) return <Redirect href="/update-required" />;
  if (!session) return <Redirect href="/(auth)/email" />;
  if (locked) return <Redirect href="/unlock" />;
  if (!profile) return <Redirect href="/no-profile" />;

  switch (role) {
    case "FACTORY":
      return <Redirect href="/(factory)" />;
    case "ADMIN":
      return <Redirect href="/(admin)" />;
    case "STAFF":
      return <Redirect href="/(staff)" />;
    default:
      return <Redirect href="/unsupported-role" />;
  }
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
    gap: 12,
  },
  label: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
  },
});
