import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Single source of truth for post-boot routing. Sends each role into
// its own nav group so the wrong screens aren't even reachable.
//
// Dev auth-bypass: while SMS OTP is not wired up we still want to be
// able to preview the app cold. When there's no session, default to the
// staff group (that's what the whole app used to do). Real auth flow
// takes over automatically as soon as loadProfile returns a role.
export default function IndexGate() {
  const { loading, session, profile, role } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.label}>{t("loading")}</Text>
      </View>
    );
  }

  if (!session) {
    // Dev fallback — remove this branch once auth is on for real.
    return <Redirect href="/(staff)" />;
  }
  if (!profile) return <Redirect href="/no-profile" />;

  switch (role) {
    case "FACTORY":
      return <Redirect href="/(factory)" />;
    case "ADMIN":
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
