import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/auth/AuthContext";
import { supabase } from "@/lib/supabase";
import { theme } from "@/theme";

type Prefs = {
  notifyStatusChanges: boolean;
  notifyDocuments: boolean;
  notifyComments: boolean;
  notifyStaleOrders: boolean;
  notifyCreditIssues: boolean;
};

// Settings screen — only surfaces notification prefs today. Room to
// grow into a full "account" screen (language, quiet hours, sign-out
// duplicated here) later.
export default function SettingsScreen() {
  const { profile, reloadProfile, role } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setPrefs({
      notifyStatusChanges: profile.notifyStatusChanges ?? true,
      notifyDocuments: profile.notifyDocuments ?? true,
      notifyComments: profile.notifyComments ?? true,
      notifyStaleOrders: profile.notifyStaleOrders ?? true,
      notifyCreditIssues: profile.notifyCreditIssues ?? true,
    });
  }, [profile?.id]);

  const update = useCallback(
    async (patch: Partial<Prefs>) => {
      if (!profile || !prefs) return;
      const next = { ...prefs, ...patch };
      setPrefs(next);
      setSaving(true);
      const { error } = await supabase
        .from("Profile")
        .update(patch)
        .eq("id", profile.id);
      setSaving(false);
      if (error) {
        Alert.alert("Could not save", error.message);
        // Roll back local state so the UI matches the DB.
        setPrefs(prefs);
        return;
      }
      await reloadProfile();
    },
    [profile, prefs, reloadProfile],
  );

  return (
    <Screen padded={false}>
      <PageHeader
        title="Settings"
        subtitle="Turn off any notification you don't want. Status changes on your own orders stay on by default."
      />

      <ScrollView contentContainerStyle={styles.body}>
        {!prefs ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <>
            <SectionTitle>Notifications</SectionTitle>
            <Row
              label="Order status updates"
              hint="When an order you placed moves forward — In production, Ready to dispatch, LR generated, Dispatched."
              value={prefs.notifyStatusChanges}
              onChange={(v) => update({ notifyStatusChanges: v })}
              disabled={saving}
            />
            <Row
              label="Invoice / LR uploaded"
              hint="When the factory uploads an invoice or lorry receipt against your order."
              value={prefs.notifyDocuments}
              onChange={(v) => update({ notifyDocuments: v })}
              disabled={saving}
            />
            <Row
              label="Comments"
              hint="When anyone posts a comment on an order you're on."
              value={prefs.notifyComments}
              onChange={(v) => update({ notifyComments: v })}
              disabled={saving}
            />
            {role === "ADMIN" && (
              <>
                <SectionTitle>Admin alerts</SectionTitle>
                <Row
                  label="Stale orders"
                  hint="Any order still in Order Placed for longer than the configured stale-hour threshold."
                  value={prefs.notifyStaleOrders}
                  onChange={(v) => update({ notifyStaleOrders: v })}
                  disabled={saving}
                />
                <Row
                  label="Credit-check failures"
                  hint="An order was placed but did not clear the credit check."
                  value={prefs.notifyCreditIssues}
                  onChange={(v) => update({ notifyCreditIssues: v })}
                  disabled={saving}
                />
              </>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.section}>{children}</Text>;
}

function Row({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowHint}>{hint}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  center: { alignItems: "center", padding: theme.spacing.xl },
  section: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: theme.spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    minHeight: theme.tap,
  },
  rowLabel: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  rowHint: {
    fontSize: theme.type.bodySmall - 2,
    color: theme.colors.textMuted,
  },
});
