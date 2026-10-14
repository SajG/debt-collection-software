import type { ComponentProps } from "react";
import { StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { Text } from "./Text";
import { TabIcon, type TabIconName } from "./TabIcon";
import { theme } from "@/theme";

// One look for the bottom tab bar in all three roles: icon + label,
// tall enough for a thumb (64dp + the gesture inset), label never
// below 13.

type TabsScreenOptions = NonNullable<ComponentProps<typeof Tabs>["screenOptions"]>;

export const tabBarScreenOptions: TabsScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: theme.colors.primary,
  tabBarInactiveTintColor: theme.colors.textMuted,
  tabBarHideOnKeyboard: true,
  tabBarStyle: {
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    minHeight: 64,
    paddingTop: 6,
  },
  tabBarItemStyle: { minHeight: 56, paddingVertical: 2 },
};

/** Options for one tab. `title` must already be translated. */
export function tabOptions(title: string, icon: TabIconName) {
  return {
    title,
    tabBarAccessibilityLabel: title,
    tabBarIcon: ({ color }: { color: string }) => <TabIcon name={icon} color={color} />,
    tabBarLabel: ({ color, focused }: { color: string; focused: boolean }) => (
      <Text
        numberOfLines={1}
        style={[styles.label, { color }, focused && styles.labelFocused]}
      >
        {title}
      </Text>
    ),
  };
}

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: "600", textAlign: "center" },
  labelFocused: { fontWeight: "800" },
});
