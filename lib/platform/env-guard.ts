// SY40 — a Vercel Preview deployment must never talk to the production
// Supabase project. Previews are built from unreviewed branches; one
// pointed at production can run a half-written migration's code, send
// real customers reminders, or let a test sign-up create a real company.
//
// PRODUCTION_SUPABASE_REF is the production project's ref (the
// "abcd1234" in https://abcd1234.supabase.co). Set it in EVERY Vercel
// environment. If a Preview's Supabase URL or database URL contains it,
// the server refuses to start (instrumentation.ts) and the reason shows
// in the deployment's logs.

export type EnvGuardResult =
  | { ok: true; warning?: string }
  | { ok: false; reason: string };

export function checkPreviewIsolation(env: Record<string, string | undefined>): EnvGuardResult {
  if (env.VERCEL_ENV !== "preview") return { ok: true };
  const prodRef = (env.PRODUCTION_SUPABASE_REF ?? "").trim().toLowerCase();
  if (!prodRef) {
    return {
      ok: true,
      warning:
        "PRODUCTION_SUPABASE_REF is not set, so this Preview cannot verify it is on the staging database. See docs/ENVIRONMENTS.md.",
    };
  }
  const leaks = ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "DIRECT_URL"].filter((name) =>
    (env[name] ?? "").toLowerCase().includes(prodRef),
  );
  if (leaks.length > 0) {
    return {
      ok: false,
      reason: `Preview deployment is configured with the PRODUCTION Supabase project (${leaks.join(", ")}). Point Preview at the staging project — docs/ENVIRONMENTS.md.`,
    };
  }
  return { ok: true };
}
