-- BusinessSettings.tallyEnabled — organisation-level Tally-integration
-- toggle. Defaults false so a fresh install (or a distributor who
-- hasn't wired the LAN agent yet) does not see Tally-specific UI
-- surfaces, does not run the reconciliation cron, and does not show
-- "Last synced: never" banners that look like errors.
--
-- The Tally sync route (app/api/sync/tally/route.ts) intentionally
-- does NOT read this flag. Sync writes are always merge-on-tallyRef
-- (see the ingest module and the contract comment in route.ts);
-- flipping tallyEnabled off after data has been synced does not
-- destroy anything.

ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "tallyEnabled" BOOLEAN NOT NULL DEFAULT false;
