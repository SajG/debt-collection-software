import { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { supabase } from "@/lib/supabase";
import { t } from "@/lib/i18n";
import { theme } from "@/theme";

// SY34 — billing state of the active company, under the status bar.
//   LOCKED   → read-only: "Your trial has ended — choose a plan to keep
//              adding orders. Your data is safe." (same sentence as web)
//   PAST_DUE → payment failed; pay before the 7-day grace ends.
// Writes are refused server-side (RLS) while LOCKED; this only explains
// why. Reading — and every list/export — keeps working.

type OrgBilling = {
  id: string;
  status: "ACTIVE" | "PAST_DUE" | "LOCKED";
  lockReason: string | null;
  pastDueSince: string | null;
};

const GRACE_DAYS = 7;
const TTL_MS = 5 * 60 * 1000;

// One fetch shared by every mounted Screen; refreshed at most every
// 5 minutes and when the app comes back to the foreground.
let cache: { at: number; value: OrgBilling | null } | null = null;
let inflight: Promise<OrgBilling | null> | null = null;
const listeners = new Set<(v: OrgBilling | null) => void>();

async function fetchBilling(): Promise<OrgBilling | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (!session) return null;
  const activeOrgId = (session.user.app_metadata as { active_org_id?: string } | undefined)
    ?.active_org_id;

  // RLS (org_select_member) returns only companies the user belongs to.
  // Cast: the SY28/SY34 billing columns aren't in the generated types.
  const client = supabase as unknown as {
    from: (table: string) => {
      select: (cols: string) => Promise<{ data: OrgBilling[] | null; error: unknown }>;
    };
  };
  const { data, error } = await client
    .from("Organization")
    .select("id, status, lockReason, pastDueSince");
  if (error || !data?.length) return null;
  if (activeOrgId) return data.find((o) => o.id === activeOrgId) ?? null;
  return data.length === 1 ? data[0]! : null;
}

function load(force = false): Promise<OrgBilling | null> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.value);
  if (!inflight) {
    inflight = fetchBilling()
      .catch(() => (cache ? cache.value : null))
      .then((value) => {
        cache = { at: Date.now(), value };
        listeners.forEach((l) => l(value));
        return value;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

function useOrgBilling(): OrgBilling | null {
  const [value, setValue] = useState<OrgBilling | null>(cache?.value ?? null);
  useEffect(() => {
    listeners.add(setValue);
    void load();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void load(true);
    });
    return () => {
      listeners.delete(setValue);
      sub.remove();
    };
  }, []);
  return value;
}

function lockedText(reason: string | null): string {
  if (reason === "TRIAL_ENDED") return t("billing.locked.trial");
  if (reason === "PAYMENT_FAILED") return t("billing.locked.payment");
  return t("billing.locked.other");
}

export function BillingBanner() {
  const billing = useOrgBilling();
  if (!billing || billing.status === "ACTIVE") return null;

  if (billing.status === "LOCKED") {
    return (
      <View accessibilityRole="alert" style={[styles.wrap, styles.locked]}>
        <Text style={[styles.text, styles.lockedText]}>{lockedText(billing.lockReason)}</Text>
        <Text style={[styles.hint, styles.lockedText]}>{t("billing.ownerHint")}</Text>
      </View>
    );
  }

  const lockOn = billing.pastDueSince
    ? new Date(new Date(billing.pastDueSince).getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000)
    : null;
  const date = lockOn
    ? lockOn.toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : `${GRACE_DAYS}d`;
  return (
    <View accessibilityRole="alert" style={[styles.wrap, styles.pastDue]}>
      <Text style={[styles.text, styles.pastDueText]}>{t("billing.pastDue", { date })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 10, gap: 2 },
  locked: { backgroundColor: theme.colors.faultBg },
  pastDue: { backgroundColor: theme.colors.curBg },
  text: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  hint: { fontSize: 12, textAlign: "center" },
  lockedText: { color: theme.colors.fault },
  pastDueText: { color: theme.colors.cure },
});
