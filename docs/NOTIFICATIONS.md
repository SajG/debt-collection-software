# Push notifications runbook

## The chain

```
Factory taps "Start production"
        │
        ▼
mobile: submitStatusAdvance()          (mobile/src/lib/status-queue.ts)
        │
        ▼
Supabase RPC: advance_order_status()   (migration 20260821170000_advance_order_status_rpc)
        │  UPDATE SalesOrder + INSERT OrderStatusEvent, atomic
        ▼
Trigger: trg_notify_order_status_event on OrderStatusEvent
        │  fn public._notify_on_order_status_event
        │  (skips the seed 'Order placed' event to avoid double-pinging the placer)
        ▼
public._dispatch_notification(jsonb)   (migration 20260819210001_notification_triggers)
        │  reads NotificationConfig singleton row (edgeFunctionUrl + edgeFunctionSecret)
        │  pg_net.http_post → fire-and-forget, never raises
        ▼
Supabase edge function: notify         (supabase/functions/notify/index.ts)
        │  verifies x-notify-secret header
        │  resolves recipients (Profile.notifyStatusChanges filter)
        │  reads PushToken rows for those recipients
        ▼
Expo push service (https://exp.host/--/api/v2/push/send)
        │
        ▼
Device receives, taps → routeFromNotification (mobile/src/lib/notifications.ts)
        │
        ▼
router.push({ pathname: "/(staff)/orders/[id]", params: { id } })
```

## Verification (post-deploy)

Once per environment:

1. **Enable extensions** (Supabase dashboard → Database → Extensions):
   `pg_net`, `pg_cron`. The trigger migration also `CREATE EXTENSION IF NOT EXISTS` these; the dashboard toggle is belt-and-braces.
2. **Deploy the edge function:**
   ```bash
   supabase functions deploy notify --no-verify-jwt
   supabase secrets set NOTIFY_SHARED_SECRET=$(openssl rand -hex 32)
   ```
3. **Point the DB at it** (SQL, once):
   ```sql
   UPDATE "NotificationConfig" SET
     "edgeFunctionUrl"    = 'https://<project>.supabase.co/functions/v1/notify',
     "edgeFunctionSecret" = '<same value as NOTIFY_SHARED_SECRET>'
   WHERE id = 'singleton';
   ```
   Run this as `service_role` (SQL editor is fine). After migration
   `20260825120000_notification_config_lockdown`, ADMIN JWTs can no
   longer read/write this row — that's intentional: the secret was
   readable from the mobile app before.
4. **End-to-end smoke test:**
   - Install a dev-client on a real device (simulators cannot receive push).
   - Sign in as a STAFF user. Grant notification permission when prompted.
   - Confirm a row appeared in `PushToken` for that profile:
     ```sql
     SELECT id, "profileId", platform, "lastSeenAt" FROM "PushToken"
      ORDER BY "lastSeenAt" DESC LIMIT 5;
     ```
   - Sign in as FACTORY on a second device, advance one of that STAFF
     user's orders. STAFF device should receive a push within a few
     seconds; tapping it should deep-link to the order detail.
   - Confirm the edge function ran: Supabase dashboard → Edge Functions
     → notify → Logs. Look for `sent: 1` in the response body.

## The "user never granted permission" case

`requestAndRegisterToken` in `mobile/src/lib/notifications.ts`:

- Runs on every mount of the authenticated tree.
- Calls `Notifications.getPermissionsAsync()`, then
  `Notifications.requestPermissionsAsync()` if not granted.
- If the user denies **there is no `PushToken` row** for them.
- Consequently:
  - The `notify` edge function's `IN ("profileId", recipients)` lookup
    returns zero rows.
  - `messages.length === 0` short-circuits with `{ ok: true, sent: 0 }`.
  - No error is raised; the status change still writes cleanly.

The salesperson sees the update the next time they open the app (the
staff detail screen has a realtime subscription on OrderStatusEvent
via `useOrderEventStream`). Push failure is degraded, not broken.

**Recovery path:** the user can enable notifications later in OS
settings; on the next app open, `requestAndRegisterToken` reads
`getPermissionsAsync` → granted, upserts a `PushToken`, and future
events start pinging them.

## What's NOT wired (and why)

- `expo-notifications` on Expo Go SDK 53+ requires an EAS `projectId`
  to fetch a push token. `requestAndRegisterToken` reads it from
  `expoConfig.extra.eas.projectId` or `easConfig.projectId`, logs a
  warning if neither is set, and returns without crashing sign-in. A
  dev-client without EAS therefore behaves like the denied-permission
  case: everything works except push.
- Simulators (`Device.isDevice === false`) short-circuit before the
  token request. Test push on a physical device.

## Common failure modes and where to look

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| No push, no logs in `notify` | `NotificationConfig.edgeFunctionUrl` unset | Run the ops SQL from step 3 above |
| Edge function logs `forbidden` (HTTP 403) | Secret mismatch between `NOTIFY_SHARED_SECRET` (function env) and `NotificationConfig.edgeFunctionSecret` (DB) | Rotate both to the same value |
| Push sent, device silent | Notification permission denied; check `PushToken` for the profile | User must enable in OS settings |
| Push sent to some, not others | `Profile.notifyStatusChanges = false` for that user (or the corresponding pref column for the event) | Toggle on in mobile settings |
| `DeviceNotRegistered` in edge logs | Old token, app uninstalled or reset | `cleanupStaleTokens` in the edge function deletes these on the next send; no action needed |
| Ops error `insufficient_privilege` when running step 3 | Editor connected as `authenticated` role after N2 lockdown | Re-connect as `service_role` (SQL editor tab default) |

## Related files

- `supabase/functions/notify/index.ts` — edge function
- `mobile/src/lib/notifications.ts` — client registration + tap handler
- `mobile/app/_layout.tsx` — `usePushRegistration()` mount
- `prisma/migrations/20260819210000_push_notifications_schema/` — `PushToken`, `NotificationConfig`, per-user prefs
- `prisma/migrations/20260819210001_notification_triggers/` — triggers + `_dispatch_notification`
- `prisma/migrations/20260825120000_notification_config_lockdown/` — service_role-only config
