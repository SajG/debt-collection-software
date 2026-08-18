import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/auth/AuthContext";

// FACTORY-only nav group. STAFF gets redirected out; ADMIN is allowed
// in so they can shadow the factory view without switching accounts.
export default function FactoryLayout() {
  const { role, loading } = useAuth();
  if (loading) return null;
  // Dev auth-bypass path — no session, no role. Fall through so the
  // developer can preview the factory UI without an OTP setup.
  if (role && role !== "FACTORY" && role !== "ADMIN") {
    return <Redirect href="/(staff)" />;
  }
  return <Stack screenOptions={{ headerShown: false }} />;
}
