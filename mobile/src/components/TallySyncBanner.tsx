import { useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet } from "react-native";
import { Text } from "./Text";
import { supabase } from "@/lib/supabase";
import { dateLocale, t } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";
import { theme } from "@/theme";
import { amberText } from "@/lib/tones";

// SY41 — "Last synced with Tally: 14 Oct, 3:45 PM" under the status bar,
// like Biz Analyst. Data comes from get_tally_sync_status() (SyncLog +
// TallyConnector; the table itself is not client-readable).
//
//   fresh   → quiet green line
//   stale   → amber: no sync for STALE_MS — usually the Tally PC is off
//   failing → red: the connector is reaching us but the sync errors
//   never   → a connector is paired but nothing has arrived yet
// Companies that never connected Tally see nothing.

type Status = {
  lastSyncAt: string | null;
  hasConnector: boolean;
  lastError: string | null;
};

// The connector syncs every 15 minutes; a few missed runs is "stale".
const STALE_MS = 2 * 60 * 60 * 1000;
const TTL_MS = 2 * 60 * 1000;

// One fetch shared by every mounted Screen, like BillingBanner.
let cache: { at: number; value: Status | null } | null = null;
let inflight: Promise<Status | null> | null = null;
const listeners = new Set<(v: Status | null) => void>();

async function fetchStatus(): Promise<Status | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) return null;
  // Cast: SY41 function isn't in the generated types yet.
  const rpc = supabase.rpc as unknown as (
    fn: string,
  ) => Promise<{ data: Status | null; error: unknown }>;
  const { data, error } = await rpc("get_tally_sync_status");
  if (error) throw error;
  return data ?? null;
}

function load(force = false): Promise<Status | null> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.value);
  if (!inflight) {
    inflight = fetchStatus()
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

function useTallySyncStatus(): Status | null {
  const [value, setValue] = useState<Status | null>(cache?.value ?? null);
  const [, setTick] = useState(0);
  useEffect(() => {
    listeners.add(setValue);
    void load();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void load(true);
    });
    // Re-render each minute so "12 min ago" stays true; reload on TTL.
    const id = setInterval(() => {
      setTick((n) => n + 1);
      void load();
    }, 60 * 1000);
    return () => {
      listeners.delete(setValue);
      sub.remove();
      clearInterval(id);
    };
  }, []);
  return value;
}

/** "14 Oct, 3:45 PM" — the year only when it isn't this year. */
function shortDateTime(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return (
    d.toLocaleDateString(dateLocale(), {
      day: "numeric",
      month: "short",
      ...(sameYear ? {} : { year: "numeric" }),
    }) +
    ", " +
    d.toLocaleTimeString(dateLocale(), { hour: "numeric", minute: "2-digit" })
  );
}

export function TallySyncBanner() {
  const status = useTallySyncStatus();
  const [refreshing, setRefreshing] = useState(false);
  if (!status) return null;

  const at = status.lastSyncAt;
  const stale = !at || Date.now() - new Date(at).getTime() > STALE_MS;
  const tone = status.lastError ? "failing" : !at ? "never" : stale ? "stale" : "fresh";

  const main = at
    ? t("tallySync.lastSynced", { time: shortDateTime(at), ago: timeAgo(at) })
    : t("tallySync.never");
  const hint =
    tone === "failing"
      ? t("tallySync.failing")
      : tone === "stale"
        ? t("tallySync.stale")
        : null;

  return (
    <Pressable
      onPress={async () => {
        setRefreshing(true);
        await load(true);
        setRefreshing(false);
      }}
      disabled={refreshing}
      style={({ pressed }) => [styles.wrap, toneStyles[tone].wrap, (pressed || refreshing) && { opacity: 0.7 }]}
      accessibilityRole="button"
      accessibilityLabel={hint ? `${main}. ${hint}` : main}
      accessibilityHint={t("tallySync.refreshHint")}
    >
      <Text style={[styles.text, toneStyles[tone].text]} numberOfLines={1}>
        {main}
      </Text>
      {hint ? <Text style={[styles.hint, toneStyles[tone].text]}>{hint}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingVertical: 6, gap: 2 },
  text: { fontSize: 13, fontWeight: "700", textAlign: "center" },
  hint: { fontSize: 13, textAlign: "center" },
});

const toneStyles = {
  fresh: StyleSheet.create({
    wrap: { backgroundColor: theme.colors.bench },
    text: { color: theme.colors.bond },
  }),
  never: StyleSheet.create({
    wrap: { backgroundColor: theme.colors.bench },
    text: { color: theme.colors.inkMuted },
  }),
  stale: StyleSheet.create({
    wrap: { backgroundColor: theme.colors.curBg },
    text: { color: amberText },
  }),
  failing: StyleSheet.create({
    wrap: { backgroundColor: theme.colors.faultBg },
    text: { color: theme.colors.fault },
  }),
};
