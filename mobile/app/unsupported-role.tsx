import { StyleSheet, Text, View } from "react-native";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { confirm } from "@/components/Confirm";
import { useAuth } from "@/auth/AuthContext";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

export default function UnsupportedRoleScreen() {
  const { role, signOut } = useAuth();
  return (
    <Screen>
      <View style={styles.card}>
        <Text style={styles.title}>{t("unsupported.title")}</Text>
        <Text style={styles.body}>
          {t("unsupported.body", { role: role ?? "unknown" })}
        </Text>
      </View>
      <Button
        variant="secondary"
        label={t("unsupported.signOut")}
        onPress={() =>
          confirm({
            title: t("confirm.signOut.title"),
            body: t("confirm.signOut.body"),
            confirmLabel: t("confirm.ok"),
            destructive: true,
            onConfirm: () => void signOut(),
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: theme.spacing.lg,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.md,
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  body: {
    fontSize: theme.type.body,
    lineHeight: 26,
    color: theme.colors.text,
  },
});
