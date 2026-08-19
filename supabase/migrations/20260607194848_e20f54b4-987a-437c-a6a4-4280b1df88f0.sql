-- Allow internal app users that come from email/Google auth (no telegram_id)
ALTER TABLE public.tg_users ALTER COLUMN telegram_id DROP NOT NULL;

-- Returns the internal tg_users.id for the current authenticated session,
-- creating a row on first use. Works for email/Google auth (auth.uid()).
CREATE OR REPLACE FUNCTION public.ensure_app_user()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  existing uuid;
  display text;
  avatar text;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  -- Already linked?
  SELECT id INTO existing FROM public.tg_users WHERE auth_user_id = uid LIMIT 1;
  IF existing IS NOT NULL THEN
    RETURN existing;
  END IF;

  -- Telegram session linked by telegram_id?
  SELECT id INTO existing FROM public.tg_users WHERE telegram_id = public.current_tg_id() LIMIT 1;
  IF existing IS NOT NULL THEN
    UPDATE public.tg_users SET auth_user_id = uid WHERE id = existing AND auth_user_id IS NULL;
    RETURN existing;
  END IF;

  SELECT raw_user_meta_data->>'display_name', raw_user_meta_data->>'avatar_url'
    INTO display, avatar
    FROM auth.users WHERE id = uid;

  INSERT INTO public.tg_users (auth_user_id, first_name, photo_url)
  VALUES (uid, display, avatar)
  RETURNING id INTO existing;

  RETURN existing;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_app_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_app_user() TO authenticated, service_role;