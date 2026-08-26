-- notification_config_lockdown
--
-- NotificationConfig.edgeFunctionSecret is a bearer secret for the
-- `notify` edge function. Before this migration ADMIN could
-- SELECT the row (policy notification_config_select_admin), which
-- meant any admin's mobile JWT could read the secret. Tighten to
-- service_role only.
--
-- Consequence for ops: admins can no longer configure the notify URL
-- from the mobile app. They shouldn't be doing that from a phone
-- anyway — the deploy step is a one-time SQL update on the server.
-- If a self-serve admin UI is needed later, front it with a
-- SECURITY DEFINER RPC that never returns the secret in its result.
--
-- Trigger dispatch keeps working because _dispatch_notification runs
-- SECURITY DEFINER and reads the row as the function owner (schema
-- owner bypasses RLS).

DROP POLICY IF EXISTS notification_config_select_admin ON "NotificationConfig";
DROP POLICY IF EXISTS notification_config_update_admin ON "NotificationConfig";

-- Row-level security stays enabled; the absence of a permissive
-- policy plus these explicit revokes means no authenticated role can
-- reach the row.
REVOKE ALL ON TABLE "NotificationConfig" FROM authenticated;
REVOKE ALL ON TABLE "NotificationConfig" FROM anon;

-- service_role bypasses RLS by default; grant it explicitly so an
-- ops SQL session (JWT stripped) can still read/update the row.
GRANT SELECT, UPDATE ON TABLE "NotificationConfig" TO service_role;
