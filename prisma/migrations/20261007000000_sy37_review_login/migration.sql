-- SY37 — store-review sign-in.
--
-- Google Play and App Store reviewers sign in to the "Syncit Demo"
-- company with a fixed code (POST /api/auth/review-login). Attempts are
-- counted in LoginAttempt under their own factor so the per-email
-- lock-out (5 wrong codes / 15 min) is independent of real sign-ins.
-- Successful uses are written to PlatformAuditLog (action
-- 'review_login') by the route.

ALTER TYPE "LoginAttemptFactor" ADD VALUE IF NOT EXISTS 'REVIEW_CODE';
