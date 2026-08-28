import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// TOTP MFA + recovery-code helpers.
//
// Session-assurance vocabulary (Supabase):
//   aal1 = password only. What every fresh sign-in starts at.
//   aal2 = password + at least one verified second factor challenge.
// A user with a TOTP factor enrolled at aal1 can raise to aal2 by
// completing supabase.auth.mfa.challenge(...) + .verify(...). That
// upgrade is what gates ADMIN pages (see requireAdmin).

export type MfaFactorState =
  | { kind: "none" }
  | { kind: "unverified"; factorId: string }
  | { kind: "verified"; factorId: string };

/**
 * Read the current session's MFA factors and normalise into one of
 * three states. Uses whichever SupabaseClient the caller has already
 * built (SSR-cookie client for pages, admin client for server tools).
 * Never widens the request beyond what the caller passed in.
 */
export async function getMfaFactorState(
  supabase: SupabaseClient,
): Promise<MfaFactorState> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error || !data) return { kind: "none" };
  const totps = data.all.filter((f) => f.factor_type === "totp");
  if (totps.length === 0) return { kind: "none" };
  const verified = totps.find((f) => f.status === "verified");
  if (verified) return { kind: "verified", factorId: verified.id };
  // At least one unverified factor — the user started enrol but
  // never completed. The security page lets them delete and retry.
  return { kind: "unverified", factorId: totps[0].id };
}

/**
 * Assurance level of the current session as reported by Supabase.
 * `null` when there is no session or the SDK doesn't return one.
 */
export async function currentAssuranceLevel(
  supabase: SupabaseClient,
): Promise<"aal1" | "aal2" | null> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || !data) return null;
  const level = data.currentLevel;
  if (level === "aal1") return "aal1";
  if (level === "aal2") return "aal2";
  return null;
}

// ── Recovery codes ─────────────────────────────────────────────────

// 8 codes, 10 characters each from a friendly alphabet (no 0/O/I/1).
// Split into 5+5 groups for reading over the phone. Total entropy
// ~50 bits per code — plenty for a single-use out-of-band factor.
const CODE_COUNT = 8;
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomCode(): string {
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    if (i === 4) out += "-";
  }
  return out;
}

/** Server-side hash for recovery codes. Constant salt is fine — this
 *  is a lookup by exact hash, not a password verification, and the
 *  brute-force story is bounded by the 50-bit code space anyway. */
export function hashRecoveryCode(code: string): string {
  const normalised = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return createHash("sha256").update(`recovery-v1:${normalised}`).digest("hex");
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/**
 * Generate 8 fresh codes, replace the caller's existing set, and
 * return the plaintext ONCE for one-time display. The rotate RPC
 * runs as SECURITY DEFINER — Row Level Security cannot see this
 * table so a compromised aal1 admin cannot read another admin's
 * hashes.
 */
export async function generateAndPersistRecoveryCodes(
  supabase: SupabaseClient,
): Promise<string[]> {
  const codes = Array.from({ length: CODE_COUNT }, randomCode);
  const hashes = codes.map(hashRecoveryCode);
  const { error } = await supabase.rpc("rotate_recovery_codes", {
    p_hashes: hashes,
  });
  if (error) throw new Error(`Could not save recovery codes: ${error.message}`);
  return codes;
}

/**
 * Attempt to consume a recovery code for a given profile. Uses the
 * SERVICE ROLE client because the caller is anon at this point in
 * the login flow (they have an aal1 session but the challenge page
 * needs to accept the code before we can trust it). The RPC is
 * granted to service_role only.
 */
export async function tryConsumeRecoveryCode(
  profileId: string,
  code: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const hash = hashRecoveryCode(code);
  const { data, error } = await admin.rpc("consume_recovery_code", {
    p_profile_id: profileId,
    p_hash: hash,
  });
  if (error) return false;
  return data === true;
}

/** Cached count for the security page. */
export async function countActiveRecoveryCodes(
  supabase: SupabaseClient,
): Promise<number> {
  const { data, error } = await supabase.rpc("count_active_recovery_codes");
  if (error || typeof data !== "number") return 0;
  return data;
}

// ── Convenience for pages ──────────────────────────────────────────

/** Bundle the two things every gated page needs to decide routing. */
export async function readMfaStatus(): Promise<{
  factor: MfaFactorState;
  aal: "aal1" | "aal2" | null;
}> {
  const supabase = createClient();
  const [factor, aal] = await Promise.all([
    getMfaFactorState(supabase),
    currentAssuranceLevel(supabase),
  ]);
  return { factor, aal };
}
