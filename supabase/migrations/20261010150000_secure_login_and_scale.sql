-- Three-attempt sign-in lockout and performance indexes for larger gym workspaces.
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO service_role;
CREATE TABLE IF NOT EXISTS private.login_attempt_buckets (
  bucket_hash text PRIMARY KEY CHECK (bucket_hash ~ '^[a-f0-9]{64}$'),
  failed_attempts smallint NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 3),
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.login_attempt_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.login_attempt_buckets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.login_attempt_buckets TO service_role;
CREATE INDEX IF NOT EXISTS login_attempt_buckets_updated_at_idx ON private.login_attempt_buckets (updated_at);

CREATE OR REPLACE FUNCTION public.login_lock_status(p_bucket_hash text)
RETURNS TABLE (is_locked boolean, attempts smallint, locked_until timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT coalesce(b.locked_until > now(), false), b.failed_attempts, b.locked_until
 FROM private.login_attempt_buckets AS b WHERE b.bucket_hash = p_bucket_hash AND p_bucket_hash ~ '^[a-f0-9]{64}$' $$;

CREATE OR REPLACE FUNCTION public.login_record_failure(p_bucket_hash text)
RETURNS TABLE (attempts smallint, locked_until timestamptz)
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE changed private.login_attempt_buckets%ROWTYPE;
BEGIN
 IF p_bucket_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Invalid login throttle bucket.'; END IF;
 INSERT INTO private.login_attempt_buckets (bucket_hash, failed_attempts, locked_until, updated_at)
 VALUES (p_bucket_hash, 1, NULL, now())
 ON CONFLICT (bucket_hash) DO UPDATE
 SET failed_attempts = CASE
       WHEN private.login_attempt_buckets.locked_until > now() THEN 3
       WHEN private.login_attempt_buckets.locked_until IS NOT NULL THEN 1
       ELSE least(private.login_attempt_buckets.failed_attempts + 1, 3) END,
     locked_until = CASE
       WHEN private.login_attempt_buckets.locked_until > now() THEN private.login_attempt_buckets.locked_until
       WHEN private.login_attempt_buckets.locked_until IS NOT NULL THEN NULL
       WHEN private.login_attempt_buckets.failed_attempts + 1 >= 3 THEN now() + interval '24 hours'
       ELSE NULL END,
     updated_at = now()
 RETURNING * INTO changed;
 RETURN QUERY SELECT changed.failed_attempts, changed.locked_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.login_clear_failures(p_bucket_hash text)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ DELETE FROM private.login_attempt_buckets WHERE bucket_hash = p_bucket_hash AND p_bucket_hash ~ '^[a-f0-9]{64}$' $$;
REVOKE ALL ON FUNCTION public.login_lock_status(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_record_failure(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.login_clear_failures(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_lock_status(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.login_record_failure(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.login_clear_failures(text) TO service_role;

CREATE INDEX IF NOT EXISTS gym_users_created_by_idx ON public.gym_users (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS gym_users_gym_status_role_idx ON public.gym_users (gym_id, status, role);
CREATE INDEX IF NOT EXISTS membership_plans_created_by_idx ON public.membership_plans (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS gym_members_plan_idx ON public.gym_members (plan_c) WHERE plan_c IS NOT NULL;
CREATE INDEX IF NOT EXISTS gym_members_created_by_idx ON public.gym_members (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS membership_dues_plan_idx ON public.membership_dues (plan_c) WHERE plan_c IS NOT NULL;
CREATE INDEX IF NOT EXISTS membership_dues_created_by_idx ON public.membership_dues (created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_created_by_idx ON public.payments (created_by) WHERE created_by IS NOT NULL;

ALTER POLICY gyms_read_current_gym ON public.gyms USING (id = (SELECT private.current_gym_id()));
ALTER POLICY profiles_read_workspace ON public.profiles USING (
 id = (SELECT auth.uid()) OR (
  (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin']::text[]))
  AND EXISTS (SELECT 1 FROM public.gym_users AS other_user WHERE other_user.user_id = profiles.id
    AND other_user.gym_id = (SELECT private.current_gym_id()) AND other_user.status = 'active')
 ));
ALTER POLICY gym_users_read_workspace ON public.gym_users USING (
 gym_id = (SELECT private.current_gym_id()) AND (
  user_id = (SELECT auth.uid()) OR (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin']::text[]))
 ));
ALTER POLICY plans_read_workspace ON public.membership_plans USING (gym_id = (SELECT private.current_gym_id()));
ALTER POLICY plans_insert_admin_manager ON public.membership_plans WITH CHECK (
 gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[]))
 AND created_by = (SELECT auth.uid()));
ALTER POLICY plans_update_admin_manager ON public.membership_plans
 USING (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])))
 WITH CHECK (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])));
ALTER POLICY plans_delete_admin_manager ON public.membership_plans
 USING (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])));
ALTER POLICY members_read_workspace ON public.gym_members USING (gym_id = (SELECT private.current_gym_id()));
ALTER POLICY members_insert_admin_manager ON public.gym_members WITH CHECK (
 gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[]))
 AND created_by = (SELECT auth.uid()));
ALTER POLICY members_update_admin_manager ON public.gym_members
 USING (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])))
 WITH CHECK (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])));
ALTER POLICY members_delete_admin_manager ON public.gym_members
 USING (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])));
ALTER POLICY dues_read_workspace ON public.membership_dues USING (gym_id = (SELECT private.current_gym_id()));
ALTER POLICY dues_insert_admin_manager ON public.membership_dues WITH CHECK (
 gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[]))
 AND created_by = (SELECT auth.uid()));
ALTER POLICY dues_update_admin_manager ON public.membership_dues
 USING (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])))
 WITH CHECK (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])));
ALTER POLICY dues_delete_admin_manager ON public.membership_dues
 USING (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])));
ALTER POLICY payments_read_workspace ON public.payments USING (gym_id = (SELECT private.current_gym_id()));
ALTER POLICY payments_insert_members ON public.payments WITH CHECK (
 gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager','staff']::text[]))
 AND created_by = (SELECT auth.uid()));
ALTER POLICY payments_update_admin_manager ON public.payments
 USING (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])))
 WITH CHECK (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])));
ALTER POLICY payments_delete_admin_manager ON public.payments
 USING (gym_id = (SELECT private.current_gym_id()) AND (SELECT private.has_gym_role((SELECT private.current_gym_id()), ARRAY['admin','manager']::text[])));
