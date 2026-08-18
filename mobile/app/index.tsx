import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Single source of truth for post-boot routing. Every user hits this
// gate on cold start and after sign-in.
//
// No session         → /(auth)/phone       (real Supabase phone OTP)
// Session, no profile→ AuthContext signs the user out defensively
// FACTORY            → /(factory)          (queue + status advance + docs)
// STAFF / ADMIN      → /(staff)            (own orders + everything else)
// Other role         → /unsupported-role
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
