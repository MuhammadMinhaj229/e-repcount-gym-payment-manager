-- Fix the member/dues validation trigger without accessing dues-only record fields
-- while an INSERT/UPDATE is running on gym_members.
CREATE OR REPLACE FUNCTION public.validate_workspace_links()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $workspace$
BEGIN
  IF NEW.plan_c IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.membership_plans p
    WHERE p.id = NEW.plan_c
      AND p.gym_id = NEW.gym_id
  ) THEN
    RAISE EXCEPTION 'The selected membership plan does not belong to this gym.';
  END IF;

  IF TG_TABLE_NAME = 'membership_dues' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.gym_members m
      WHERE m.id = NEW.member_c
        AND m.gym_id = NEW.gym_id
    ) THEN
      RAISE EXCEPTION 'The selected member does not belong to this gym.';
    END IF;
  END IF;

  RETURN NEW;
END;
$workspace$;

REVOKE EXECUTE ON FUNCTION public.validate_workspace_links() FROM PUBLIC, anon, authenticated;
