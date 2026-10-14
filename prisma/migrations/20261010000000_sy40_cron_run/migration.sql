-- SY40 — launch operations.
--
-- CronRun — one row per scheduled pass (app/api/cron/*), written by
-- lib/platform/cron-run.ts: when it ran, how long it took, how many
-- companies it covered and how many failures it had. Read only by the
-- Syncit operator console (/platform/crons).
--
-- Platform table, not tenant data: no organizationId, RLS on with no
-- policies, and no grants for anon / authenticated — service role and
-- Prisma only. Idempotent, like every migration since SY33.

CREATE TABLE IF NOT EXISTS "CronRun" (
  "id"         TEXT        PRIMARY KEY,
  "job"        TEXT        NOT NULL,
  "startedAt"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "durationMs" INTEGER     NOT NULL,
  -- OK | PARTIAL (finished, some failures) | FAILED (threw or HTTP 5xx)
  "status"     TEXT        NOT NULL,
  "orgCount"   INTEGER     NOT NULL DEFAULT 0,
  "failures"   INTEGER     NOT NULL DEFAULT 0,
  -- Counts only. Never names, emails or amounts.
  "detail"     JSONB
);
CREATE INDEX IF NOT EXISTS "CronRun_job_startedAt_idx" ON "CronRun" ("job", "startedAt");
CREATE INDEX IF NOT EXISTS "CronRun_startedAt_idx" ON "CronRun" ("startedAt");

ALTER TABLE "CronRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CronRun" FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "CronRun" FROM PUBLIC;

DO $$
BEGIN
  EXECUTE 'REVOKE ALL ON TABLE "CronRun" FROM anon, authenticated';
EXCEPTION WHEN undefined_object THEN NULL;
END $$;
