import { Stack } from "expo-router";
import { WizardProvider } from "@/lib/order-draft";

// One provider covers all 10 wizard steps — draft state survives every
// step transition and is persisted to AsyncStorage so an app kill
// mid-wizard doesn't lose the salesperson's typing.
export default function NewOrderLayout() {
  return (
    <WizardProvider>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }} />
    </WizardProvider>
  );
}
