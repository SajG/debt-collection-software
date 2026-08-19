import { db } from "@/lib/db";

// Organisation-level Tally toggle. Read from the singleton
// BusinessSettings row. Kept in a helper so every gate (UI hide,
// cron skip, honest empty states) reads the same source of truth
// instead of each caller re-shaping the query.
//
// Defaults to false when no BusinessSettings row exists — same
// behaviour as a fresh install with Tally still deferred.
export async function isTallyEnabled(): Promise<boolean> {
  const settings = await db.businessSettings.findFirst({
    select: { tallyEnabled: true },
  });
  return settings?.tallyEnabled ?? false;
}
