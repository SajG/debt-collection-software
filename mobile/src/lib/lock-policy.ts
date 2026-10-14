import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// Company setting "Require app lock on phones"
// (BusinessSettings.requireAppLock, switched on the web under
// Settings). When true the lock offer has no "Not now" and Settings
// cannot turn the lock off. The last known value is cached so the rule
// still holds when the phone starts offline.

const CACHE_KEY = "syncit:requireAppLock";

export async function fetchLockRequired(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("BusinessSettings")
      .select("requireAppLock")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const required =
      (data as { requireAppLock?: boolean | null } | null)?.requireAppLock === true;
    await AsyncStorage.setItem(CACHE_KEY, required ? "1" : "0");
    return required;
  } catch {
    // Offline, or the column is not there yet (migration pending):
    // fall back to what this phone last saw.
    return (await AsyncStorage.getItem(CACHE_KEY).catch(() => null)) === "1";
  }
}

/** null while loading. `enabled` = there is a signed-in session. */
export function useLockRequired(enabled: boolean): boolean | null {
  const [required, setRequired] = useState<boolean | null>(null);
  useEffect(() => {
    if (!enabled) {
      setRequired(null);
      return;
    }
    let alive = true;
    void fetchLockRequired().then((v) => {
      if (alive) setRequired(v);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);
  return required;
}
