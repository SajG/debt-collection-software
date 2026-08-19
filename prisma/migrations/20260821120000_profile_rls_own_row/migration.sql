-- AuthContext loads Profile with the user JWT. Settings updates
-- notification prefs on the same row. RLS was enabled on Profile with
-- zero policies, so every mobile login was signed back out immediately.

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
