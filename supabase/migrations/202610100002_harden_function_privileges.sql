-- Tighten RPC grants. Supabase projects may have explicit per-role default grants
-- to anon/authenticated, so revoking PUBLIC alone is not sufficient.
REVOKE EXECUTE ON FUNCTION private.current_gym_id() FROM anon;
REVOKE EXECUTE ON FUNCTION private.has_gym_role(uuid, text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dashboard_summary(date) FROM anon;

-- These are trigger/internal routines and must not be directly callable via RPC.
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.normalize_due_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_workspace_links() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_payment() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalculate_due_from_payments(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_due_after_payment_change() FROM PUBLIC, anon, authenticated;

-- Keep the required authenticated helper/summary calls available.
GRANT EXECUTE ON FUNCTION private.current_gym_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_gym_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_summary(date) TO authenticated;
