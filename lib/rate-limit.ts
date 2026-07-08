import { db } from "@/lib/db";

const WINDOW_MINUTES = 15;
const MAX_FAILED_ATTEMPTS = 5;

export async function checkLoginRateLimit(
  email: string
): Promise<{ limited: boolean; retryAfterMinutes: number }> {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  const failedCount = await db.loginAttempt.count({
    where: {
      email: email.toLowerCase().trim(),
      successful: false,
      createdAt: { gte: windowStart },
    },
  });

  return {
    limited: failedCount >= MAX_FAILED_ATTEMPTS,
    retryAfterMinutes: WINDOW_MINUTES,
  };
}

export async function recordLoginAttempt(
  email: string,
  successful: boolean
): Promise<void> {
  await db.loginAttempt.create({
    data: {
      email: email.toLowerCase().trim(),
      successful,
    },
  });
}

// ── Action rate limits ───────────────────────────────────────────
// Both reuse existing audit tables as the counter — every send writes a
// Message row and every import writes a SyncLog row, so no extra
// bookkeeping table is needed. These protect the platform (provider
// quotas, DB write load); the per-party messaging caps in the gate are a
// separate, stricter compliance concern.

const SEND_WINDOW_MINUTES = 1;
const MAX_MANUAL_SENDS_PER_WINDOW = 15;

/** Manual "send now" clicks per profile, per minute. */
export async function checkSendRateLimit(
  profileId: string
): Promise<{ limited: boolean }> {
  const windowStart = new Date(Date.now() - SEND_WINDOW_MINUTES * 60 * 1000);
  const count = await db.message.count({
    where: {
      sentById: profileId,
      direction: "OUTBOUND",
      createdAt: { gte: windowStart },
    },
  });
  return { limited: count >= MAX_MANUAL_SENDS_PER_WINDOW };
}

const IMPORT_WINDOW_MINUTES = 10;
const MAX_IMPORTS_PER_WINDOW = 10;

/** CSV imports + accounting-provider syncs per profile, per 10 minutes. */
export async function checkImportRateLimit(
  profileId: string
): Promise<{ limited: boolean; retryAfterMinutes: number }> {
  const windowStart = new Date(Date.now() - IMPORT_WINDOW_MINUTES * 60 * 1000);
  const count = await db.syncLog.count({
    where: { triggeredById: profileId, startedAt: { gte: windowStart } },
  });
  return {
    limited: count >= MAX_IMPORTS_PER_WINDOW,
    retryAfterMinutes: IMPORT_WINDOW_MINUTES,
  };
}
