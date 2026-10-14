import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import type { ReactNode } from "react";
import { OfflineBanner } from "./OfflineBanner";
import { BillingBanner } from "./BillingBanner";
import { TallySyncBanner } from "./TallySyncBanner";
import { BackBar } from "./BackBar";
import { useHardwareBack } from "@/lib/back";
import { theme } from "@/theme";

function useHardwareBackWhen(enabled: boolean, fallback?: string) {
  // The hook is always called (rules of hooks); when disabled the
  // interceptor reports "not handled" and the default applies.
  useHardwareBack(fallback ?? "/", enabled ? undefined : passThrough);
}
const passThrough = () => false;

export function Screen({
  children,
  scroll = false,
  padded = true,
  back = false,
  backTitle,
  backFallback,
  edges = ["top", "bottom", "left", "right"],
}: {
  children: ReactNode;
  /** Use scroll on any screen with inputs; keeps the field visible when
   *  the on-screen keyboard opens on low-end Androids. */
  scroll?: boolean;
  /** Set false for full-bleed screens (home FlatList, timeline). */
  padded?: boolean;
  /** Show the in-screen "‹ Back" bar at the top. On for every detail
   *  page (root Stack hides the native header, so we render our own). */
  back?: boolean;
  /** Optional title next to the back button. */
  backTitle?: string;
  /** Where to route if there's no history to pop (deep-link, cold start). */
  backFallback?: string;
  /** Tab root screens pass ["top","left","right"] — the tab bar already
   *  covers the bottom inset. */
  edges?: readonly Edge[];
}) {
  // Android hardware back on a sub-screen with no history (opened from
  // a notification) goes to the fallback instead of closing the app.
  useHardwareBackWhen(back, backFallback);
  const inner = (
    <View style={[styles.inner, padded && styles.padded]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={edges}>
      <OfflineBanner />
      <BillingBanner />
      {/* Top-level screens only; detail pages keep the space. */}
      {back ? null : <TallySyncBanner />}
      {back ? <BackBar title={backTitle} fallback={backFallback} /> : null}
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
