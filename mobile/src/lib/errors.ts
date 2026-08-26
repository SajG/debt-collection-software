// Human-readable error messages. Every place that used to show a raw
// Supabase / Postgres error to the user should route through
// humaniseError(). Categories:
//
//   network   → "Saved on your phone — will sync when you're back online."
//   auth      → "You've been signed out. Sign in again to continue."
//   permission→ "You don't have permission for that. Ask an admin."
//   validation→ passed-through if the message looks user-friendly, else generic
//   rate      → "Too many attempts. Wait a minute and try again."
//   unknown   → "Something went wrong. Try again."
//
// The optional `queued` flag lets a caller distinguish "the offline
// queue caught this" from "this write is lost" — same underlying
// network failure, very different user messaging.

// PostgREST returns a numeric code and a message. Errors that are
// safe to retry (transient network / rate-limit / 5xx) should keep
// the offline-queue promise alive. Errors that mean "server rejected
// this, retrying won't help" MUST NOT be silently queued — that's the
// bug that produced a "waiting to sync" chip while the DB was just
// missing a function definition.
const APP_ERROR_HINTS = [
  // PostgREST — function or table not in schema cache (e.g. missing
  // migration on staging).
  "pgrst202",
  "pgrst200",
  "could not find the function",
  "in the schema cache",
  // Explicit "you did the wrong thing" server messages our RPCs raise.
  "credit limit would be exceeded",
  "override note required",
  "customer not found",
  "customer is assigned to another salesperson",
  "product is unavailable",
  "at least one line item",
  "provide either",
  "provide only one",
  "invalid quantity",
  // Auth / permission — retrying while offline can't fix these.
  "not authenticated",
  "account disabled",
  "only staff or admin",
  "only admin",
  "only factory",
  "insufficient_privilege",
  "42501",
  "row-level security",
];

/** True when the error looks like a transient failure that the
 *  offline queue can meaningfully retry. False for app-shape errors
 *  (missing function, permission denied, validation failure). */
export function isRetryableRpcError(err: unknown): boolean {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  const low = raw.toLowerCase();
  if (APP_ERROR_HINTS.some((h) => low.includes(h))) return false;
  // Everything else — network exceptions, opaque fetch failures,
  // unknown-string errors — is treated as retryable. The queue is
  // idempotent and the RPC re-validates, so a spurious retry is safe.
  return true;
}

const NETWORK_HINTS = [
  "network request failed",
  "failed to fetch",
  "load failed",
  "typeerror: network",
  "aborterror",
  "socket",
];

const AUTH_HINTS = [
  "jwt expired",
  "not authenticated",
  "invalid api key",
  "invalid token",
];

const PERMISSION_HINTS = [
  "42501", // Postgres insufficient_privilege
  "new row violates row-level security",
  "permission denied",
  "only admin",
  "only staff",
  "only factory",
];

const RATE_HINTS = [
  "too many",
  "rate limit",
  "rate-limit",
  "otp rate",
];

export type Humanised = {
  message: string;
  category: "network" | "auth" | "permission" | "validation" | "rate" | "unknown";
  /** True if the offline queue absorbed this — safe to reassure the user. */
  queued: boolean;
  /** Original message for logs / dev builds. */
  raw: string;
};

export function humaniseError(
  err: unknown,
  ctx: {
    /** Was this a write we auto-queued? Drives the "saved on your phone" copy. */
    queued?: boolean;
    /** Optional: what was the user doing? Used for a nudge back into flow. */
    action?: "place-order" | "advance-status" | "upload-doc" | "generic";
  } = {},
): Humanised {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : String(err);
  const low = raw.toLowerCase();

  const cat: Humanised["category"] = NETWORK_HINTS.some((h) => low.includes(h))
    ? "network"
    : AUTH_HINTS.some((h) => low.includes(h))
      ? "auth"
      : PERMISSION_HINTS.some((h) => low.includes(h))
        ? "permission"
        : RATE_HINTS.some((h) => low.includes(h))
          ? "rate"
          : "unknown";

  if (cat === "network") {
    if (ctx.queued) {
      return {
        message: "Saved on your phone — will sync when you're back online.",
        category: "network",
        queued: true,
        raw,
      };
    }
    return {
      message: "No signal. Try again in a moment.",
      category: "network",
      queued: false,
      raw,
    };
  }
  if (cat === "auth") {
    return {
      message: "You've been signed out. Sign in again to continue.",
      category: "auth",
      queued: false,
      raw,
    };
  }
  if (cat === "permission") {
    return {
      message: "You don't have permission for that. Ask an admin.",
      category: "permission",
      queued: false,
      raw,
    };
  }
  if (cat === "rate") {
    return {
      message: "Too many attempts. Wait a minute and try again.",
      category: "rate",
      queued: false,
      raw,
    };
  }

  // Pass through if the message reads like plain English (starts with a
  // capital and ends with a full-stop) — server RPCs already write
  // user-friendly errors ("Credit limit would be exceeded — ask an admin
  // to review, or collect outstanding first."). Otherwise stock message.
  if (/^[A-Z].+[.?!]$/.test(raw) && raw.length < 240) {
    return { message: raw, category: "validation", queued: false, raw };
  }
  return {
    message: "Something went wrong. Try again.",
    category: "unknown",
    queued: false,
    raw,
  };
}
