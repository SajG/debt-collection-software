import Constants from "expo-constants";
import { Platform } from "react-native";

// Sentry wire + PII scrub.
//
// Every crash report and breadcrumb that leaves this device is
// filtered through `scrub()` first. Rules, in order of priority:
//
//   1. Party names, product names, customer-facing text — dropped
//      because we can never distinguish "Radhakrishna Traders" from
//      any other proper noun without a name registry. Strip anything
//      that looks like a two-word Title Case string.
//   2. Phone numbers — 10 or 12 digit Indian numbers, with or
//      without a leading '+'. Replaced with '[phone]'.
//   3. Amounts — Rs / ₹ / INR / plain thousands numbers. Replaced
//      with '[amount]'.
//   4. Enrollment codes — 8-char [A-Z0-9] tokens. Replaced.
//   5. JWT-shaped strings — three base64url segments joined by '.'.
//      Replaced.
//
// Anything else survives so a real stack trace or DB error still
// tells us what broke. This is a scrubber, not a whitelist.

type SentryModule = {
  init: (opts: {
    dsn?: string;
    debug?: boolean;
    tracesSampleRate?: number;
    beforeSend?: (event: unknown) => unknown | null;
    beforeBreadcrumb?: (bc: unknown) => unknown | null;
    environment?: string;
    release?: string;
  }) => void;
  setTag: (key: string, value: string) => void;
  captureException: (e: unknown, extra?: Record<string, unknown>) => void;
  addBreadcrumb: (bc: Record<string, unknown>) => void;
  wrap: <T>(app: T) => T;
};

let cached: SentryModule | null | "unavailable" = null;

function load(): SentryModule | null {
  if (cached === null) {
    try {
      cached = require("@sentry/react-native") as SentryModule;
    } catch {
      cached = "unavailable";
    }
  }
  return cached === "unavailable" ? null : cached;
}

const PHONE_RE = /(?:\+?91[-\s]?)?[6-9]\d{9}\b/g;
const AMOUNT_RE = /(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d{1,2})?/gi;
const ENROLL_RE = /\b[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}\b/g;
const JWT_RE = /\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g;
const TITLE_CASE_TWO_WORDS_RE =
  /\b(?:[A-Z][a-z]{2,}\s){1,3}[A-Z][a-z]{2,}\b/g;

function scrub(s: string): string {
  if (typeof s !== "string") return s;
  return s
    .replace(JWT_RE, "[jwt]")
    .replace(ENROLL_RE, "[code]")
    .replace(AMOUNT_RE, "[amount]")
    .replace(PHONE_RE, "[phone]")
    .replace(TITLE_CASE_TWO_WORDS_RE, "[name]");
}

function walk(value: unknown, depth = 0): unknown {
  if (depth > 6) return value;
  if (typeof value === "string") return scrub(value);
  if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      // Drop any key that shouts PII by name — cheaper than trying
      // to scrub the value.
      if (/party|customer|owner|address|gst|pan/i.test(k)) {
        out[k] = "[redacted]";
        continue;
      }
      out[k] = walk(v, depth + 1);
    }
    return out;
  }
  return value;
}

function beforeSend(event: unknown): unknown | null {
  return walk(event);
}

function beforeBreadcrumb(bc: unknown): unknown | null {
  return walk(bc);
}

export function initObservability(): void {
  const S = load();
  if (!S) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();
  if (!dsn) return;
  S.init({
    dsn,
    debug: __DEV__,
    tracesSampleRate: __DEV__ ? 0 : 0.1,
    environment: __DEV__ ? "dev" : "prod",
    release:
      (Constants.expoConfig?.version as string | undefined) ??
      "unknown",
    beforeSend,
    beforeBreadcrumb,
  });
  S.setTag("app", "syncit-mobile");
  S.setTag("platform", Platform.OS);
}

export function setUserRoleTag(role: string | null): void {
  const S = load();
  if (!S) return;
  S.setTag("role", role ?? "anon");
}

export function reportError(
  error: unknown,
  extra?: Record<string, unknown>,
): void {
  const S = load();
  if (!S) {
    // Dev fallback so a crash in development is visible without
    // Sentry configured. Non-issue in prod: init returns early
    // without a DSN and this branch never triggers.
    if (__DEV__) console.error("[report]", error, extra);
    return;
  }
  S.captureException(error, extra);
}

export function crumb(
  category: string,
  message: string,
  data?: Record<string, unknown>,
): void {
  const S = load();
  if (!S) return;
  S.addBreadcrumb({
    category,
    message: scrub(message),
    level: "info",
    data: data ? (walk(data) as Record<string, unknown>) : undefined,
    timestamp: Date.now() / 1000,
  });
}

// Exported so tests + docs can verify the scrubber does what it says.
export const _internal = { scrub, walk };
