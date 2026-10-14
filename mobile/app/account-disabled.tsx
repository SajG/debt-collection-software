import { StyleSheet, View } from "react-native";
import { Text } from "@/components/Text";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Button } from "@/components/Button";
import { theme } from "@/theme";
import { t } from "@/lib/i18n";

// Terminal screen when the admin has flipped isActive → false. The
// signed-out session cookie is already cleared by AuthContext; the
// user's only option is to go back to the phone login (or, in
// practice, ring the admin).
export default function AccountDisabled() {
  return (
    <Screen scroll>
      <View style={styles.wrap}>
        <Text style={styles.title}>{t("accountDisabled.yourAccessHasBeenRemoved")}</Text>
        <Text style={styles.body}>
          {t("accountDisabled.anAdministratorHasDisabledYour")}
        </Text>
        <Button
          label={t("accountDisabled.backToSignIn")}
          onPress={() => router.replace("/(auth)/email")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
    alignItems: "stretch",
  },
  title: {
    fontSize: theme.type.title,
    fontWeight: "700",
    color: theme.colors.text,
  },
  body: {
    fontSize: theme.type.body,
    color: theme.colors.textMuted,
    lineHeight: 24,
  },
});
