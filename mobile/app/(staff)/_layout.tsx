import { Redirect, Stack } from "expo-router";
import { useAuth } from "@/auth/AuthContext";

// STAFF nav group. Also entered by ADMIN (they get a scope toggle on
// the home screen). FACTORY is bounced to its own group so they never
// see the salesperson-only actions (New order, dues, payments).
export default function StaffLayout() {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (role === "FACTORY") return <Redirect href="/(factory)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
