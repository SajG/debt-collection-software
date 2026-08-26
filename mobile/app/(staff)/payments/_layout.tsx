import { Stack } from "expo-router";

// headerShown:false everywhere — every payment screen uses the
// in-content BackBar via <Screen back>. The old native header was
// stacking on top and giving the user two back buttons.
export default function PaymentsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
