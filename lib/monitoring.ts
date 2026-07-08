// Basic server-side error monitoring. Every capture always lands in the
// server log; when SENTRY_DSN is set, it also goes to Sentry. Used on the
// paths where a silent failure costs money or trust: the outbound send
// pipeline and the daily cron pass.

import * as Sentry from "@sentry/node";

let initialized = false;

function client(): typeof Sentry | null {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;
  if (!initialized) {
    Sentry.init({
      dsn,
      environment:
        process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    });
    initialized = true;
  }
  return Sentry;
}

/**
 * Report an error with context. Flushes before returning so events are not
 * lost when the serverless function freezes right after the response.
 */
export async function captureError(
  error: unknown,
  context: Record<string, unknown> = {}
): Promise<void> {
  console.error("[monitoring]", JSON.stringify(context), error);
  const s = client();
  if (!s) return;
  s.captureException(error instanceof Error ? error : new Error(String(error)), {
    extra: context,
  });
  await s.flush(2000).catch(() => {});
}
