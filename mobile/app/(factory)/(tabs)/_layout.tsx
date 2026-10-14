import { Tabs } from "expo-router";
import { tabBarScreenOptions, tabOptions } from "@/components/tabBar";
import { t } from "@/lib/i18n";

// Factory tabs: To make · To dispatch · Done today. Order detail lives
// one level up in the (factory) Stack so it covers the tab bar and
// Android back pops exactly one screen.
export default function FactoryTabs() {
  return (
    <Tabs screenOptions={tabBarScreenOptions} backBehavior="initialRoute">
      <Tabs.Screen name="index" options={tabOptions(t("tabs.toMake"), "make")} />
      <Tabs.Screen name="dispatch" options={tabOptions(t("tabs.toDispatch"), "dispatch")} />
      <Tabs.Screen name="done" options={tabOptions(t("tabs.doneToday"), "done")} />
    </Tabs>
  );
}
