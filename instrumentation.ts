// Next.js instrumentation hook (called once per runtime start).
// @sentry/nextjs requires the config to load through this entrypoint
// so both the Node and Edge runtimes wire up. Config lives in the
// sentry.*.config.ts siblings and is a no-op when SENTRY_DSN is
// unset, so leaving DSN empty in dev keeps this quiet.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // SY40 — refuse to serve a Preview that points at production data.
    const { checkPreviewIsolation } = await import("./lib/platform/env-guard");
    const guard = checkPreviewIsolation(process.env);
    if (!guard.ok) throw new Error(guard.reason);
    if (guard.warning) console.warn(`[env-guard] ${guard.warning}`);
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
