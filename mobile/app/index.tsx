import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Single source of truth for post-boot routing. The Stack above renders
// this on cold start; every redirect below sends the user into the right
// slice of the app based on session + Profile.role.
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

  if (!session) return <Redirect href="/(auth)/phone" />;
  if (!profile) return <Redirect href="/no-profile" />;
  // ADMIN gets the full salesperson experience (own orders by default,
  // plus a scope toggle on Home). Everyone else (currently just FACTORY)
  // is directed to the web console.
  if (role !== "STAFF" && role !== "ADMIN")
    return <Redirect href="/unsupported-role" />;
  return <Redirect href="/(staff)" />;
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
