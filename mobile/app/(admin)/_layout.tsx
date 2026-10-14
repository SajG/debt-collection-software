import { Redirect, Tabs } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { tabBarScreenOptions, tabOptions } from "@/components/tabBar";
import { t } from "@/lib/i18n";

// Management tabs: Home · Approvals · Team · Factory.
// A non-admin who reaches this group (should not happen — the root
// gate routes only ADMIN here) is bounced to /.
export default function AdminLayout() {
  const { role, loading, session } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/email" />;
  if (role !== "ADMIN") return <Redirect href="/" />;

  return (
    <Tabs screenOptions={tabBarScreenOptions} backBehavior="initialRoute">
      <Tabs.Screen name="index" options={tabOptions(t("tabs.home"), "home")} />
      <Tabs.Screen name="approvals" options={tabOptions(t("common.approvals"), "approvals")} />
      <Tabs.Screen name="team" options={tabOptions(t("common.team"), "team")} />
      <Tabs.Screen name="factory" options={tabOptions(t("common.factory"), "factory")} />
    </Tabs>
  );
}
