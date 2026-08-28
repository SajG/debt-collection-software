import { useEffect } from "react";
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
  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConnectivityProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <QueueDrainerMount />
            <PushMount />
            <RoleTagBinding />
            <ErrorBoundary label="root">
              <Stack screenOptions={{ headerShown: false }} />
            </ErrorBoundary>
          </AuthProvider>
        </ConnectivityProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Tag every subsequent Sentry event with the caller's role so the
// dashboard can filter "STAFF-only" or "ADMIN-only" bug reports.
function RoleTagBinding() {
  const { role } = useAuth();
  useEffect(() => {
    setUserRoleTag(role);
  }, [role]);
  return null;
}
