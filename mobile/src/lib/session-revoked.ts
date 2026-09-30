import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { clearDeviceId, clearLock } from "@/auth/device-lock";

// Device-revocation error handling (SY15.1 audit follow-up).
//
// Once an ADMIN revokes a Device row, the phone's JWT keeps working
// until it refreshes (up to an hour). Between then and the next
// touch_device_seen heartbeat, individual RLS-gated queries return
// PostgREST 401 / SQLSTATE 42501. This helper turns those into a
// definite sign-out plus a one-shot notice the /(auth)/email screen
// renders as a red banner.

const REVOKED_NOTICE_KEY = "syncit:revokedNotice";

export const REVOKED_MESSAGE =
  "This phone was signed out by your admin.";

type MaybePostgrestError = {
  code?: string | null;
  message?: string | null;
  status?: number | null;
  // supabase-js sometimes surfaces the HTTP status on a nested field.
  hint?: string | null;
};

/**
 * True when the error object from a Supabase query looks like the
 * caller lost RLS access — the canonical shapes are:
 *   - PostgREST `code === "42501"` (RLS insufficient_privilege)
 *   - HTTP 401 (rare — usually the SDK refreshes and retries first)
 *   - The Supabase-JS wrapped "JWT" invalid strings after a global
 *     signOut on the auth-admin side.
 */
export function isRevocationError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as MaybePostgrestError;
  if (e.code === "42501") return true;
  if (e.status === 401) return true;
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("jwt expired") && msg.includes("device")) return true;
  if (msg.includes("insufficient_privilege")) return true;
  return false;
}

/**
 * Persist the notice, tear the local session down, and clear the
 * device lock so the next launch starts fresh. Safe to call twice —
 * multiRemove + signOut are idempotent.
 *
 * Returns true when the error looked like a revocation and was
 * handled; false when the caller should surface the error normally.
 */
export async function handleRevocationError(err: unknown): Promise<boolean> {
  if (!isRevocationError(err)) return false;
  await markSessionRevoked();
  return true;
}

/** Force the revoked-notice path without an error object — used by
 *  the touch_device_seen heartbeat in AuthContext. */
export async function markSessionRevoked(): Promise<void> {
  await AsyncStorage.setItem(REVOKED_NOTICE_KEY, REVOKED_MESSAGE);
  try {
    await clearDeviceId();
    await clearLock();
    await supabase.auth.signOut();
  } catch {
    /* offline — local state is already correct */
  }
}

export async function readRevokedNotice(): Promise<string | null> {
  return AsyncStorage.getItem(REVOKED_NOTICE_KEY);
}

export async function clearRevokedNotice(): Promise<void> {
  await AsyncStorage.removeItem(REVOKED_NOTICE_KEY);
}
