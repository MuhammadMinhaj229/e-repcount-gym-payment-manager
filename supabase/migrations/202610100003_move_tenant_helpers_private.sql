-- Move tenant helper RPCs out of the API-exposed public schema.
-- The conditional makes this safe both for existing projects and fresh installs
-- whose initial schema already creates these functions in private.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.current_gym_id()') IS NOT NULL THEN
    ALTER FUNCTION public.current_gym_id() SET SCHEMA private;
  END IF;
  IF to_regprocedure('public.has_gym_role(uuid, text[])') IS NOT NULL THEN
    ALTER FUNCTION public.has_gym_role(uuid, text[]) SET SCHEMA private;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.current_gym_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_gym_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_gym_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_gym_role(uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_summary(p_today date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'outstanding',
    coalesce((
      SELECT sum(d.balance_c)
      FROM public.membership_dues d
      WHERE d.gym_id = private.current_gym_id()
        AND d.balance_c > 0
        AND d.status_c <> 'Waived'
    ), 0),
    'due_today_balance',
    coalesce((
      SELECT sum(d.balance_c)
      FROM public.membership_dues d
      WHERE d.gym_id = private.current_gym_id()
        AND d.due_date_c = p_today
        AND d.balance_c > 0
        AND d.status_c <> 'Waived'
    ), 0),
    'collected_today',
    coalesce((
      SELECT sum(p.amount_c)
      FROM public.payments p
      WHERE p.gym_id = private.current_gym_id()
        AND p.paid_on_c = p_today
        AND p.status_c = 'Paid'
    ), 0)
  )
$$;

REVOKE ALL ON FUNCTION public.dashboard_summary(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(date) TO authenticated;
