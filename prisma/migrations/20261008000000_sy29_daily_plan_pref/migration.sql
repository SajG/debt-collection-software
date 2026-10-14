-- SY29 — per-person switch for the 9:00 "Today: 6 customers, ₹3.4L to
-- follow up" push. On by default, like the other notification prefs;
-- turned off in the app under Settings → Notifications. Read by the
-- notify edge function before it sends (event "daily_followups").
-- Profile already has RLS (own-row select/update), so the column needs
-- no new policy.

ALTER TABLE "Profile"
  ADD COLUMN IF NOT EXISTS "notifyDailyPlan" BOOLEAN NOT NULL DEFAULT true;
