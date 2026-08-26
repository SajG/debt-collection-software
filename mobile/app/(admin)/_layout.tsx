import { Redirect, Tabs } from "expo-router";
import { Text } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { theme } from "@/theme";

// ADMIN nav group. Four tabs mirror the four screens in the brief.
// A non-admin who reaches this group (should not happen — the root
// gate routes only ADMIN here) is bounced to /.
export default function AdminLayout() {
  const { role, loading, session } = useAuth();
  if (loading) return null;
  if (!session) return <Redirect href="/(auth)/phone" />;
  if (role !== "ADMIN") return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { borderTopColor: theme.colors.border },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Command",
          tabBarIcon: ({ color }) => <TabGlyph glyph="⌂" color={color} />,
        }}
      />
      <Tabs.Screen
        name="approvals"
        options={{
          title: "Approvals",
          tabBarIcon: ({ color }) => <TabGlyph glyph="✓" color={color} />,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          title: "Team",
          tabBarIcon: ({ color }) => <TabGlyph glyph="◉" color={color} />,
        }}
      />
      <Tabs.Screen
        name="factory"
        options={{
          title: "Factory",
          tabBarIcon: ({ color }) => <TabGlyph glyph="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabGlyph({ glyph, color }: { glyph: string; color: string }) {
  return (
    <Text style={{ fontSize: 20, color }}>{glyph}</Text>
  );
}
