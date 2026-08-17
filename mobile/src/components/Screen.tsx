import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { OfflineBanner } from "./OfflineBanner";
import { theme } from "@/theme";

export function Screen({
  children,
  scroll = false,
  padded = true,
}: {
  children: ReactNode;
  /** Use scroll on any screen with inputs; keeps the field visible when
   *  the on-screen keyboard opens on low-end Androids. */
  scroll?: boolean;
  /** Set false for full-bleed screens (home FlatList, timeline). */
  padded?: boolean;
}) {
  const inner = (
    <View style={[styles.inner, padded && styles.padded]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <OfflineBanner />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            {inner}
          </ScrollView>
        ) : (
          inner
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  scroll: { flexGrow: 1 },
  inner: {
    flex: 1,
    gap: theme.spacing.lg,
  },
  padded: {
    padding: theme.spacing.lg,
  },
});
