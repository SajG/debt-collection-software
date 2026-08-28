import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/auth/AuthContext";

// FACTORY-only nav group. STAFF gets redirected out; ADMIN is allowed
// in so they can shadow the factory view without switching accounts.
export default function FactoryLayout() {
  const { role, loading, session } = useAuth();
  if (loading) return null;
  // Session gate — see (staff)/_layout for the "sign-out sticks even
  // when we're deep-navigated" rationale.
  if (!session) return <Redirect href="/(auth)/enroll" />;
  if (role && role !== "FACTORY" && role !== "ADMIN") {
    return <Redirect href="/(staff)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
