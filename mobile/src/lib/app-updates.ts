import { useCallback, useEffect, useState } from "react";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { supabase } from "./supabase";
import { crumb, reportError } from "./observability";

// Two update paths:
//
//   1. OTA (`expo-updates`) — on cold start and every 30 min while
//      in the foreground, ask the update server if a newer JS
//      bundle exists. When one lands, flip `updateAvailable = true`
//      and let the app bar show a non-blocking "Restart to update"
//      banner. User taps → reloadAsync().
//
//   2. FORCED (BusinessSettings.mobileMinAppVersion) — checked on
//      the same cold-start pass. If the currently-running
//      Constants.expoConfig.version is lower than the floor, the
//      root gate is blocked; the user cannot reach the shell until
//      they update the native binary. Reserved for SECURITY
//      releases; routine bumps use path 1.
//
// The two checks are independent — a device on an old binary might
// also have a newer OTA bundle to fetch, in which case both
// notifications race and the forced gate wins.

const OTA_POLL_INTERVAL_MS = 30 * 60 * 1000;

export type UpdateState = {
  otaReady: boolean;
  /** True while the OTA fetch is in flight. Drives the pill spinner. */
  otaFetching: boolean;
  /** Latest floor value read from BusinessSettings. */
  minVersion: string | null;
  /** Current app version. */
  currentVersion: string;
  /** True when currentVersion < minVersion (numeric compare). */
  updateRequired: boolean;
  restart: () => Promise<void>;
};

export function currentAppVersion(): string {
  return (
    (Constants.expoConfig?.version as string | undefined) ??
    "0.0.0"
  );
}

/** Lexicographic dot-numeric compare — "1.2.10" > "1.2.9". */
export function versionLess(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const ai = pa[i] ?? 0;
    const bi = pb[i] ?? 0;
    if (ai !== bi) return ai < bi;
  }
  return false;
}

export function useAppUpdates(): UpdateState {
  const [otaReady, setOtaReady] = useState(false);
  const [otaFetching, setOtaFetching] = useState(false);
  const [minVersion, setMinVersion] = useState<string | null>(null);
  const version = currentAppVersion();

  const restart = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch (e) {
      reportError(e, { where: "Updates.reloadAsync" });
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    async function pollOta() {
      if (!Updates.isEnabled) return;
      try {
        setOtaFetching(true);
        crumb("updates", "checkForUpdateAsync");
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (mounted && fetched.isNew) {
          setOtaReady(true);
          crumb("updates", "otaReady");
        }
      } catch (e) {
        // Common in dev builds where the update server isn't wired.
        // Do NOT report — this would spam Sentry.
        if (__DEV__) console.warn("[ota]", e);
      } finally {
        if (mounted) setOtaFetching(false);
      }
    }

    async function pollFloor() {
      try {
        const { data } = await supabase
          .from("BusinessSettings")
          .select("mobileMinAppVersion")
          .limit(1)
          .maybeSingle();
        if (!mounted) return;
        const floor =
          (data as { mobileMinAppVersion?: string | null } | null)
            ?.mobileMinAppVersion ?? null;
        setMinVersion(floor);
      } catch {
        /* offline / RLS deny — leave floor null, non-fatal */
      }
    }

    void pollOta();
    void pollFloor();
    const id = setInterval(() => {
      void pollOta();
      void pollFloor();
    }, OTA_POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const updateRequired = Boolean(
    minVersion && versionLess(version, minVersion),
  );

  return {
    otaReady,
    otaFetching,
    minVersion,
    currentVersion: version,
    updateRequired,
    restart,
  };
}
