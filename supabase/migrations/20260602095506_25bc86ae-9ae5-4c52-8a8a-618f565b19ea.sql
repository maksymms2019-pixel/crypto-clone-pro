-- Lock down helper: revoke EXECUTE from anon/authenticated (used only by RLS policies via SECURITY DEFINER)
REVOKE EXECUTE ON FUNCTION public.current_tg_id() FROM PUBLIC, anon, authenticated;

-- touch_updated_at — fix search_path
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;