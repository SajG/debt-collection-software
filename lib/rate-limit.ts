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
