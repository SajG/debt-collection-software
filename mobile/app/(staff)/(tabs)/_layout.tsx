import { Tabs } from "expo-router";
import { tabBarScreenOptions, tabOptions } from "@/components/tabBar";
import { t } from "@/lib/i18n";

// Sales tabs: Today · Customers · Orders · Payments. Settings is behind
// the avatar in each tab's header. Sub-screens (order detail, new
// order, record payment, …) live one level up in the (staff) Stack, so
// they cover the tab bar and Android back pops exactly one screen.
// On a tab other than Today, back returns to Today before leaving.
export default function StaffTabs() {
  return (
    <Tabs screenOptions={tabBarScreenOptions} backBehavior="initialRoute">
      <Tabs.Screen name="index" options={tabOptions(t("tabs.today"), "today")} />
      <Tabs.Screen name="customers" options={tabOptions(t("tabs.customers"), "customers")} />
      <Tabs.Screen name="orders" options={tabOptions(t("tabs.orders"), "orders")} />
      <Tabs.Screen name="payments" options={tabOptions(t("tabs.payments"), "payments")} />
    </Tabs>
  );
}
