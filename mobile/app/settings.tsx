import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { router } from "expo-router";
import { Screen } from "@/components/Screen";
import { Text } from "@/components/Text";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { confirm } from "@/components/Confirm";
import { toast } from "@/components/Toast";
import { useAuth } from "@/auth/AuthContext";
import { getLockKind, turnOffLock, type LockKind } from "@/auth/device-lock";
import { useLockRequired } from "@/lib/lock-policy";
import { enablePush, getPushPromptState } from "@/lib/notifications";
import { supabase } from "@/lib/supabase";
import { roleLabel } from "@/lib/labels";
import {
  LANGUAGES,
  setLanguage,
  t,
  useLanguage,
  type Language,
} from "@/lib/i18n";
import { theme } from "@/theme";

// Help articles live on the website; same URL the web sidebar opens.
const HELP_URL = `${(process.env.EXPO_PUBLIC_APP_URL || "https://getsyncit.app").replace(/\/+$/, "")}/help`;

type Prefs = {
  notifyStatusChanges: boolean;
  notifyDocuments: boolean;
  notifyComments: boolean;
  notifyStaleOrders: boolean;
  notifyCreditIssues: boolean;
  notifyDailyPlan: boolean;
};

// Settings, reached from the avatar in every tab header: language,
// app lock, notifications, account, sign out.
export default function SettingsScreen() {
  const { profile, reloadProfile, role, session, signOut } = useAuth();
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);
  const [lockKind, setLockKindState] = useState<LockKind | null>(null);
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const lockRequired = useLockRequired(!!session);

  useEffect(() => {
    if (!profile) return;
    setPrefs({
      notifyStatusChanges: profile.notifyStatusChanges ?? true,
      notifyDocuments: profile.notifyDocuments ?? true,
      notifyComments: profile.notifyComments ?? true,
      notifyStaleOrders: profile.notifyStaleOrders ?? true,
      notifyCreditIssues: profile.notifyCreditIssues ?? true,
      notifyDailyPlan: profile.notifyDailyPlan ?? true,
    });
  }, [profile?.id]);

  useEffect(() => {
    void getLockKind().then(setLockKindState);
    void getPushPromptState().then((s) => setPushOn(s === "granted"));
  }, []);

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
        toast.error(t("settings.couldNotSave"));
        // Roll back local state so the UI matches the DB.
        setPrefs(prefs);
        return;
      }
      toast.success(t("common.saved"));
      await reloadProfile();
    },
    [profile, prefs, reloadProfile],
  );

  function toggleLock(on: boolean) {
    if (on) {
      router.push("/set-up-lock");
      return;
    }
    confirm({
      title: t("settings.lock.offTitle"),
      body: t("settings.lock.offBody"),
      confirmLabel: t("settings.lock.offConfirm"),
      destructive: true,
      onConfirm: async () => {
        await turnOffLock();
        setLockKindState(null);
        toast.success(t("settings.lock.turnedOff"));
      },
    });
  }

  return (
    <Screen padded={false}>
      <PageHeader
        title={t("common.settings")}
        subtitle={profile?.ownerName ?? undefined}
        fallback="/"
      />

      <ScrollView contentContainerStyle={styles.body}>
        {!prefs ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <>
            <Text style={styles.role}>
              {t("settings.role", { role: roleLabel(role) })}
            </Text>

            <SectionTitle>{t("settings.language")}</SectionTitle>
            <LanguagePicker />

            <SectionTitle>{t("settings.lock.section")}</SectionTitle>
            <Row
              label={t("settings.lock.label")}
              hint={
                lockRequired
                  ? t("settings.lock.requiredHint")
                  : lockKind === "pin"
                    ? t("settings.lock.pinHint")
                    : t("settings.lock.hint")
              }
              value={lockKind !== null}
              onChange={toggleLock}
              disabled={lockRequired === true && lockKind !== null}
            />

            <SectionTitle>{t("settings.notifications")}</SectionTitle>
            {pushOn === false ? (
              <View style={styles.pushOff}>
                <Text style={styles.rowHint}>{t("push.reason")}</Text>
                <Button
                  label={t("push.turnOn")}
                  variant="secondary"
                  accessibilityLabel={t("push.turnOn")}
                  onPress={async () => {
                    if (!profile) return;
                    const ok = await enablePush(profile.id);
                    setPushOn(ok);
                    if (ok) toast.success(t("push.enabled"));
                    else toast.error(t("push.blocked"));
                  }}
                />
              </View>
            ) : null}
            {role !== "FACTORY" ? (
              <Row
                label={t("settings.dailyPlan.label")}
                hint={t("settings.dailyPlan.hint")}
                value={prefs.notifyDailyPlan}
                onChange={(v) => update({ notifyDailyPlan: v })}
                disabled={saving}
              />
            ) : null}
            <Row
              label={t("staffSettings.orderStatusUpdates")}
              hint={t("staffSettings.whenAnOrderYouPlaced")}
              value={prefs.notifyStatusChanges}
              onChange={(v) => update({ notifyStatusChanges: v })}
              disabled={saving}
            />
            <Row
              label={t("staffSettings.invoiceLrUploaded")}
              hint={t("staffSettings.whenTheFactoryUploadsAn")}
              value={prefs.notifyDocuments}
              onChange={(v) => update({ notifyDocuments: v })}
              disabled={saving}
            />
            <Row
              label={t("staffSettings.comments")}
              hint={t("staffSettings.whenAnyonePostsAComment")}
              value={prefs.notifyComments}
              onChange={(v) => update({ notifyComments: v })}
              disabled={saving}
            />
            {role === "ADMIN" && (
              <>
                <SectionTitle>{t("staffSettings.adminAlerts")}</SectionTitle>
                <Row
                  label={t("staffSettings.staleOrders")}
                  hint={t("staffSettings.anyOrderStillInOrder")}
                  value={prefs.notifyStaleOrders}
                  onChange={(v) => update({ notifyStaleOrders: v })}
                  disabled={saving}
                />
                <Row
                  label={t("staffSettings.creditCheckFailures")}
                  hint={t("staffSettings.anOrderWasPlacedBut")}
                  value={prefs.notifyCreditIssues}
                  onChange={(v) => update({ notifyCreditIssues: v })}
                  disabled={saving}
                />
              </>
            )}

            <SectionTitle>{t("account.title")}</SectionTitle>
            <Pressable
              onPress={() => router.push("/account")}
              accessibilityRole="button"
              accessibilityLabel={t("account.open")}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.rowLabel, { flex: 1 }]}>{t("account.open")}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <Pressable
              onPress={() => void Linking.openURL(HELP_URL)}
              accessibilityRole="link"
              accessibilityLabel={t("settings.help")}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.rowLabel, { flex: 1 }]}>{t("settings.help")}</Text>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
            <Button
              label={t("home.signOut")}
              variant="danger"
              accessibilityLabel={t("home.signOut")}
              onPress={() =>
                confirm({
                  title: t("confirm.signOut.title"),
                  body: t("confirm.signOut.body"),
                  confirmLabel: t("confirm.ok"),
                  destructive: true,
                  onConfirm: () => void signOut(),
                })
              }
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={styles.section} accessibilityRole="header">
      {children}
    </Text>
  );
}

// Each language is written in its own script, so someone who reads
// only Marathi can still find "मराठी". Picking one applies at once:
// the root navigator is keyed on the language and every screen
// re-renders in place.
function LanguagePicker() {
  const current = useLanguage();
  return (
    <View style={{ gap: theme.spacing.sm }} accessibilityRole="radiogroup">
      {LANGUAGES.map((o) => {
        const active = current === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              if (active) return;
              setLanguage(o.value as Language);
              toast.success(o.nativeName);
            }}
            style={({ pressed }) => [
              styles.row,
              active && styles.rowActive,
              pressed && { opacity: 0.85 },
            ]}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={o.nativeName}
          >
            <Text style={[styles.rowLabel, { flex: 1 }]}>{o.nativeName}</Text>
            {active ? <Text style={styles.check}>✓</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
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
      onPress={() => !disabled && onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityHint={hint}
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
        importantForAccessibility="no"
        accessibilityElementsHidden
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
  role: { fontSize: theme.type.bodySmall, color: theme.colors.textMuted },
  section: {
    fontSize: 14,
    fontWeight: "700",
    color: theme.colors.textMuted,
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
  rowActive: { borderColor: theme.colors.primary, borderWidth: 2 },
  rowLabel: {
    fontSize: theme.type.body,
    fontWeight: "700",
    color: theme.colors.text,
  },
  rowHint: {
    fontSize: 14,
    color: theme.colors.textMuted,
  },
  check: { fontSize: 20, color: theme.colors.primary, fontWeight: "800" },
  chevron: { fontSize: 22, color: theme.colors.textMuted },
  pushOff: {
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius,
    backgroundColor: theme.colors.surface,
  },
});
