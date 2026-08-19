-- AuthContext loads Profile with the user JWT. Settings updates
-- notification prefs on the same row. RLS was enabled on Profile with
-- zero policies, so every mobile login was signed back out immediately.

-- Idempotent so a partial apply (this file was landed by-hand once
-- before Prisma had a chance to record it) doesn't wedge future
-- deploys.
DROP POLICY IF EXISTS profile_select_own ON "Profile";
DROP POLICY IF EXISTS profile_update_own ON "Profile";

CREATE POLICY profile_select_own
  ON "Profile"
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY profile_update_own
  ON "Profile"
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
