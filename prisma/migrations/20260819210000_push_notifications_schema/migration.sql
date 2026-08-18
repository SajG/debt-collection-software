-- Push-notification storage: tokens, per-user prefs, and one row of
-- global config (stale-order threshold, edge function URL/secret so the
-- triggers in the next migration don't hardcode them).

-- ─────────────────────────────────────────────────────────────────
-- PushToken — one row per device per user. Token is unique so a
-- re-register updates lastSeenAt rather than duplicating.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE "PushToken" (
  "id"          TEXT PRIMARY KEY,
  "profileId"   UUID NOT NULL REFERENCES "Profile"("id") ON DELETE CASCADE,
  "token"       TEXT NOT NULL UNIQUE,
  "platform"    TEXT NOT NULL CHECK ("platform" IN ('ios', 'android', 'web')),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  "lastSeenAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "PushToken_profileId_idx" ON "PushToken" ("profileId");

ALTER TABLE "PushToken" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_token_select_own ON "PushToken";
DROP POLICY IF EXISTS push_token_insert_own ON "PushToken";
DROP POLICY IF EXISTS push_token_update_own ON "PushToken";
DROP POLICY IF EXISTS push_token_delete_own ON "PushToken";

CREATE POLICY push_token_select_own ON "PushToken"
  FOR SELECT TO authenticated
  USING ("profileId" = auth.uid());

CREATE POLICY push_token_insert_own ON "PushToken"
  FOR INSERT TO authenticated
  WITH CHECK ("profileId" = auth.uid());

CREATE POLICY push_token_update_own ON "PushToken"
  FOR UPDATE TO authenticated
  USING ("profileId" = auth.uid())
  WITH CHECK ("profileId" = auth.uid());

CREATE POLICY push_token_delete_own ON "PushToken"
  FOR DELETE TO authenticated
  USING ("profileId" = auth.uid());

-- ─────────────────────────────────────────────────────────────────
-- Per-user notification preferences on Profile. Default all ON;
-- non-critical (documents, stale, credit) can be muted per user.
-- Status-change notifications on your own orders stay ON by default
-- but are still toggleable — a user who's actively at the shop floor
-- may still want to silence them.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE "Profile"
  ADD COLUMN "notifyStatusChanges" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyDocuments"     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyStaleOrders"   BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "notifyCreditIssues"  BOOLEAN NOT NULL DEFAULT true;

-- ─────────────────────────────────────────────────────────────────
-- NotificationConfig — singleton row. Kept in a table (not a GUC or
-- env-var-in-Postgres) so the trigger can read it in the same
-- transaction as the insert that fires it. `id` is hard-coded to
-- 'singleton' to keep the shape obvious.
--
-- edgeFunctionUrl + edgeFunctionSecret are populated once via SQL
-- (see mobile/README.md) after the notify function is deployed.
-- Trigger no-ops if URL is null so a fresh DB doesn't error on inserts
-- before the ops step has been done.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE "NotificationConfig" (
  "id"                 TEXT PRIMARY KEY,
  "edgeFunctionUrl"    TEXT,
  "edgeFunctionSecret" TEXT,
  "staleOrderHours"    INT NOT NULL DEFAULT 24,
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO "NotificationConfig" ("id", "staleOrderHours")
VALUES ('singleton', 24)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "NotificationConfig" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_config_select_admin ON "NotificationConfig";
DROP POLICY IF EXISTS notification_config_update_admin ON "NotificationConfig";

CREATE POLICY notification_config_select_admin ON "NotificationConfig"
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'ADMIN');

CREATE POLICY notification_config_update_admin ON "NotificationConfig"
  FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'ADMIN')
  WITH CHECK (public.current_user_role() = 'ADMIN');
