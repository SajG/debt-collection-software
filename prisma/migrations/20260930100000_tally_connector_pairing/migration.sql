-- SY27 — Tally per-org pairing.
--
-- Two tables:
--   TallyPairingCode — 8-char code generated in Settings → Tally. Only
--     the SHA-256 hash is stored; the plaintext lives in the admin's
--     browser for 15 minutes.
--   TallyConnector — the paired Windows PC. Only the token hash is
--     stored; revocation flips revokedAt so subsequent /api/sync/tally
--     hits fail 401.
--
-- Kept out of the SY22 restrictive RLS loop deliberately: /api/sync/*
-- runs with the service role (bearer-token auth, not Supabase JWT),
-- so tenant scoping is enforced by tokenHash → organizationId lookup
-- in the route, not by RLS.

CREATE TABLE IF NOT EXISTS "TallyPairingCode" (
  "id"             TEXT        PRIMARY KEY,
  "organizationId" UUID        NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "codeHash"       TEXT        NOT NULL UNIQUE,
  "createdById"    UUID        NOT NULL,
  "expiresAt"      TIMESTAMPTZ NOT NULL,
  "consumedAt"     TIMESTAMPTZ,
  "createdAt"      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "TallyPairingCode_organizationId_expiresAt_idx"
  ON "TallyPairingCode" ("organizationId", "expiresAt");

CREATE TABLE IF NOT EXISTS "TallyConnector" (
  "id"              TEXT        PRIMARY KEY,
  "organizationId"  UUID        NOT NULL REFERENCES "Organization"("id") ON DELETE CASCADE,
  "name"            TEXT        NOT NULL,
  "tokenHash"       TEXT        NOT NULL UNIQUE,
  "lastSeenAt"      TIMESTAMPTZ,
  "lastSyncAt"      TIMESTAMPTZ,
  "lastError"       TEXT,
  "rowsSyncedTotal" INTEGER     NOT NULL DEFAULT 0,
  "revokedAt"       TIMESTAMPTZ,
  "revokedById"     UUID,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "TallyConnector_organizationId_revokedAt_idx"
  ON "TallyConnector" ("organizationId", "revokedAt");
