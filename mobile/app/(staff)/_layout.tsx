import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/auth/AuthContext";

// STAFF nav group. Also entered by ADMIN (they get a scope toggle on
// the home screen). FACTORY is bounced to its own group so they never
// see the salesperson-only actions (New order, dues, payments).
export default function StaffLayout() {
  const { role, loading, session } = useAuth();
  if (loading) return null;
  // Session gate. Without this the group stays mounted after sign-out
  // if the deep-stack replace doesn't propagate fast enough, and the
  // user sees the same screen they were on.
  if (!session) return <Redirect href="/(auth)/email" />;
  if (role === "FACTORY") return <Redirect href="/(factory)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
