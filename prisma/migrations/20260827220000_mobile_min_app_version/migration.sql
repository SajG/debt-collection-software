-- mobile_min_app_version (SY6)
--
-- Minimum mobile app version the server accepts. When a device
-- reports a lower Constants.expoConfig.version at bootstrap, the app
-- shows a blocking "update required" screen and refuses to render
-- the shell. Used exclusively for security releases — the OTA
-- update banner covers routine version bumps.
--
-- NULL means "no floor" — the default, so existing rows keep
-- behaving as before.
--
-- Readable by any authenticated user via the existing
-- BusinessSettings SELECT policy; only the ADMIN of the deployment
-- can UPDATE it.

ALTER TABLE "BusinessSettings"
  ADD COLUMN IF NOT EXISTS "mobileMinAppVersion" text;
