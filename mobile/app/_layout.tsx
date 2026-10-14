import { useEffect, useState } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthContext";
import { ConnectivityProvider } from "@/lib/connectivity";
import { useQueueDrainer } from "@/lib/queue-drainer";
import { usePushRegistration } from "@/lib/notifications";
import { useBrandFonts } from "@/lib/fonts";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { initObservability, setUserRoleTag } from "@/lib/observability";
import { useAuth } from "@/auth/AuthContext";
import { ToastHost } from "@/components/Toast";
import { initLanguage, useLanguage } from "@/lib/i18n";
import { resetAnalytics, trackAppOpened } from "@/lib/analytics";
// Imported for its side effect: records the JS start time used by the
// cold-start measurement.
import "@/lib/startup";

// Init Sentry exactly once at module load. Safe to import at the
// module top level: initObservability is a no-op without a DSN.
initObservability();

function QueueDrainerMount() {
  useQueueDrainer();
  return null;
}

function PushMount() {
  usePushRegistration();
  return null;
}

export default function RootLayout() {
  // Hold render until brand fonts are ready — swap-in mid-render
  // causes a visible reflow on cheap Android GPUs. Fallback: system
  // font renders after 3 s (expo-font timeout) so a bad font file
  // never blocks sign-in.
  const [fontsLoaded] = useBrandFonts();
  // The saved language is read before the first screen so nothing
  // flashes in English first. One AsyncStorage read — a few ms.
  const [languageReady, setLanguageReady] = useState(false);
  useEffect(() => {
    void initLanguage().finally(() => setLanguageReady(true));
  }, []);
  // Keying the navigator on the language re-renders every mounted
  // screen when it changes in Settings; the current route is kept.
  const language = useLanguage();
  if (!fontsLoaded || !languageReady) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConnectivityProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <QueueDrainerMount />
            <PushMount />
            <RoleTagBinding />
            {/* i18n-ignore: Sentry tag, not shown */}
            <ErrorBoundary label="root">
              <Stack key={language} screenOptions={{ headerShown: false }} />
            </ErrorBoundary>
            <ToastHost />
          </AuthProvider>
        </ConnectivityProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Tag every subsequent Sentry event with the caller's role so the
// dashboard can filter "STAFF-only" or "ADMIN-only" bug reports.
function RoleTagBinding() {
  const { role, profile } = useAuth();
  useEffect(() => {
    setUserRoleTag(role);
  }, [role]);
  // SY38 — one "app_opened" per signed-in session (PostHog).
  useEffect(() => {
    if (profile?.id) trackAppOpened(profile.id, role);
    else resetAnalytics();
  }, [profile?.id, role]);
  return null;
}
