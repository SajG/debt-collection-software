// Next.js instrumentation hook (called once per runtime start).
// @sentry/nextjs requires the config to load through this entrypoint
// so both the Node and Edge runtimes wire up. Config lives in the
// sentry.*.config.ts siblings and is a no-op when SENTRY_DSN is
// unset, so leaving DSN empty in dev keeps this quiet.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}
