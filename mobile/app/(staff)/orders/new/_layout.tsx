import { Stack } from "expo-router";
import { WizardProvider } from "@/lib/order-draft";

// One provider covers all 3 wizard screens (customer & delivery,
// items, review). Draft state survives every screen transition and
// is persisted to AsyncStorage so an app kill mid-order doesn't lose
// the salesperson's typing.
export default function NewOrderLayout() {
  return (
    <WizardProvider>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
    </WizardProvider>
  );
}
