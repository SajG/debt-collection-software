-- SY41 — "Last synced with Tally" on mobile.
--
-- The app shows a banner at the top of each screen ("Tally synced
-- 14 Oct, 3:45 PM"), amber when the last sync is old. TallyConnector
-- is RLS-locked with no client policies (SY33), so the phone reads the
-- answer through this function instead.
--
-- Source of truth: SyncLog rows written by /api/sync/tally, which
-- covers both the paired Windows connector ("tally-connector") and the
-- legacy agent ("tally-agent-legacy"). TallyConnector.lastSyncAt is
-- folded in too, and its lastError is surfaced so the banner can say
-- the connector is failing rather than just "old".
--
-- SyncLog.completedAt is UTC `timestamp without time zone`;
-- TallyConnector.lastSyncAt is timestamptz. Both come back as
-- timestamptz so the client gets an unambiguous ISO string.
--
-- Returns NULL when the company has never synced Tally and has no
-- connector — the app then shows nothing.

CREATE OR REPLACE FUNCTION public.get_tally_sync_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org        uuid := public.current_org_id();
  v_log_at     timestamptz;
  v_conn_at    timestamptz;
  v_has_conn   boolean;
  v_last_error text;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT max(s."completedAt") AT TIME ZONE 'UTC'
    INTO v_log_at
    FROM "SyncLog" s
   WHERE s."organizationId" = v_org
     AND s."status" IN ('COMPLETED', 'PARTIAL')
     AND s."details"->>'source' IN ('tally-connector', 'tally-agent-legacy');

  SELECT max(c."lastSyncAt"), count(*) > 0
    INTO v_conn_at, v_has_conn
    FROM "TallyConnector" c
   WHERE c."organizationId" = v_org
     AND c."revokedAt" IS NULL;

  -- Error from the most recently heard-from connector, only while it is
  -- newer than that connector's last good sync.
  SELECT c."lastError"
    INTO v_last_error
    FROM "TallyConnector" c
   WHERE c."organizationId" = v_org
     AND c."revokedAt" IS NULL
     AND c."lastError" IS NOT NULL
     AND (c."lastSyncAt" IS NULL OR c."lastSeenAt" > c."lastSyncAt")
   ORDER BY c."lastSeenAt" DESC NULLS LAST
   LIMIT 1;

  IF v_log_at IS NULL AND v_conn_at IS NULL AND NOT v_has_conn THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'lastSyncAt', greatest(v_log_at, v_conn_at),
    'hasConnector', v_has_conn,
    'lastError', v_last_error
  );
END;
$$;

-- SY33 default privileges start new functions closed; grant explicitly.
REVOKE ALL ON FUNCTION public.get_tally_sync_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_tally_sync_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tally_sync_status() TO service_role;
