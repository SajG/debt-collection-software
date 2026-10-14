import { Pressable, StyleSheet, View } from "react-native";
import { router } from "expo-router";
import { Text } from "./Text";
import { useAuth } from "@/auth/AuthContext";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// Header for a tab's root screen: big title on the left, the user's
// initial in a circle on the right. The circle opens Settings (language,
// app lock, notifications, sign out) so those never need a tab.
export function TabHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { profile } = useAuth();
  const initial = (profile?.ownerName ?? "").trim().charAt(0).toUpperCase() || "•";
  return (
    <View style={styles.wrap}>
      <View style={styles.text}>
        <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={() => router.push("/settings")}
        hitSlop={8}
        style={({ pressed }) => [styles.avatar, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel={t("settings.open")}
      >
        <Text style={styles.avatarText}>{initial}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  text: { flex: 1, gap: 2 },
  title: {
    fontSize: theme.type.title,
    fontWeight: "800",
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: theme.type.bodySmall,
    color: theme.colors.textMuted,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  avatarText: {
    color: theme.colors.primaryOn,
    fontSize: 20,
    fontWeight: "800",
  },
});
