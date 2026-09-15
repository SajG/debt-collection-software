-- One OPEN escalation per party. Run once per Supabase project
-- (SQL editor or psql) after `npm run db:push`.
-- App code also guards this in a transaction; the index is the backstop.
CREATE UNIQUE INDEX IF NOT EXISTS "Escalation_partyId_open_key"
  ON "Escalation" ("partyId")
  WHERE status = 'OPEN';
