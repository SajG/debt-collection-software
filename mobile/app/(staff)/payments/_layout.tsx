import { Stack } from "expo-router";
import { theme } from "@/theme";

export default function PaymentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.primary },
        headerTintColor: theme.colors.primaryOn,
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Payments" }} />
      <Stack.Screen name="new" options={{ title: "Record payment" }} />
      <Stack.Screen name="[id]" options={{ title: "Payment" }} />
    </Stack>
  );
}
