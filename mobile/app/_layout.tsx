import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "@/auth/AuthContext";
import { ConnectivityProvider } from "@/lib/connectivity";
import { useQueueDrainer } from "@/lib/queue-drainer";

function QueueDrainerMount() {
  useQueueDrainer();
  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ConnectivityProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <QueueDrainerMount />
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        </ConnectivityProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
