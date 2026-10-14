import { db } from "@/lib/db";

// SY40 — what /api/health and the public /status page report.
//
// Three dependencies a customer would notice within a minute:
//   database  Postgres answers a trivial query through Prisma
//   auth      Supabase Auth's own health endpoint (sign-in codes)
//   email     Resend accepts our API key (codes, reminders, receipts)
//
// The result is cached for 30 seconds per server instance so an uptime
// monitor (or someone refreshing /status) cannot turn this into a load
// generator against Supabase or Resend. Nothing but ok / latency ever
// leaves this module: no error text, hostnames or keys.

export type CheckName = "database" | "auth" | "email";
export type CheckResult = { ok: boolean; ms: number; skipped?: boolean };
export type Health = {
  status: "ok" | "degraded" | "down";
  checks: Record<CheckName, CheckResult>;
  checkedAt: string;
};

const TIMEOUT_MS = 4000;
const CACHE_MS = 30_000;

async function timed(fn: () => Promise<boolean>): Promise<CheckResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ok = await Promise.race([
      fn(),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), TIMEOUT_MS);
      }),
    ]);
    return { ok, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkDatabase(): Promise<boolean> {
  await db.$queryRaw`SELECT 1`;
  return true;
}

async function checkAuth(): Promise<boolean> {
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!base || !anon) return false;
  const res = await fetch(`${base}/auth/v1/health`, {
    headers: { apikey: anon },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.ok;
}

/** Resend has no health endpoint; listing domains proves the key is
 *  accepted. A send-only key answers 401 "restricted_api_key", which
 *  equally proves Resend is up and knows the key. */
export function resendAnswerIsHealthy(status: number, body: unknown): boolean {
  if (status >= 200 && status < 300) return true;
  const name = body && typeof body === "object" ? (body as { name?: unknown }).name : undefined;
  return status === 401 && name === "restricted_api_key";
}

async function checkEmail(): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const res = await fetch("https://api.resend.com/domains", {
    headers: { authorization: `Bearer ${key}` },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = await res.json().catch(() => null);
  return resendAnswerIsHealthy(res.status, body);
}

/** database or auth failing = "down" (nobody can work); only email
 *  failing = "degraded" (signed-in people keep working). */
export function overallStatus(checks: Record<CheckName, CheckResult>): Health["status"] {
  if (!checks.database.ok || !checks.auth.ok) return "down";
  if (!checks.email.ok) return "degraded";
  return "ok";
}

let cached: { at: number; value: Health } | null = null;

export async function getHealth(options: { fresh?: boolean } = {}): Promise<Health> {
  const now = Date.now();
  if (!options.fresh && cached && now - cached.at < CACHE_MS) return cached.value;

  // A staging project without Resend is not unhealthy; production is.
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const emailRequired = process.env.VERCEL_ENV === "production";

  const [database, auth, email] = await Promise.all([
    timed(checkDatabase),
    timed(checkAuth),
    !emailConfigured && !emailRequired
      ? Promise.resolve<CheckResult>({ ok: true, ms: 0, skipped: true })
      : timed(checkEmail),
  ]);
  const checks = { database, auth, email };
  const value: Health = { status: overallStatus(checks), checks, checkedAt: new Date(now).toISOString() };
  cached = { at: now, value };
  return value;
}
