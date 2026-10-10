-- Explicitly deny browser roles access to the private login attempt store.
-- Only the server-side secure-login function uses the service_role credential.
DROP POLICY IF EXISTS login_attempt_buckets_deny_client ON private.login_attempt_buckets;
CREATE POLICY login_attempt_buckets_deny_client
  ON private.login_attempt_buckets
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON TABLE private.login_attempt_buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.login_attempt_buckets TO service_role;
