CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url text,
  accent_color text NOT NULL DEFAULT 'gold',
  theme text NOT NULL DEFAULT 'midnight',
  lang text NOT NULL DEFAULT 'uk',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self read" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles self update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles self insert" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.tg_users
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tg_users_auth_user_idx ON public.tg_users(auth_user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.is_owner(target uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    target = auth.uid()
    OR target IN (SELECT id FROM public.tg_users WHERE auth_user_id = auth.uid())
    OR target IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id());
$$;

DROP POLICY IF EXISTS "holdings owner all" ON public.holdings;
CREATE POLICY "holdings owner all" ON public.holdings
  FOR ALL TO authenticated USING (public.is_owner(user_id)) WITH CHECK (public.is_owner(user_id));
DROP POLICY IF EXISTS "trades owner all" ON public.trades;
CREATE POLICY "trades owner all" ON public.trades
  FOR ALL TO authenticated USING (public.is_owner(user_id)) WITH CHECK (public.is_owner(user_id));
DROP POLICY IF EXISTS "alerts owner all" ON public.alerts;
CREATE POLICY "alerts owner all" ON public.alerts
  FOR ALL TO authenticated USING (public.is_owner(user_id)) WITH CHECK (public.is_owner(user_id));
DROP POLICY IF EXISTS "watchlist owner all" ON public.watchlist;
CREATE POLICY "watchlist owner all" ON public.watchlist
  FOR ALL TO authenticated USING (public.is_owner(user_id)) WITH CHECK (public.is_owner(user_id));
DROP POLICY IF EXISTS "snapshots owner read" ON public.portfolio_snapshots;
CREATE POLICY "snapshots owner read" ON public.portfolio_snapshots
  FOR SELECT TO authenticated USING (public.is_owner(user_id));

DROP POLICY IF EXISTS "tg_users self read" ON public.tg_users;
CREATE POLICY "tg_users self read" ON public.tg_users
  FOR SELECT TO authenticated USING (telegram_id = public.current_tg_id() OR auth_user_id = auth.uid());
DROP POLICY IF EXISTS "tg_users self update" ON public.tg_users;
CREATE POLICY "tg_users self update" ON public.tg_users
  FOR UPDATE TO authenticated USING (telegram_id = public.current_tg_id() OR auth_user_id = auth.uid());

REVOKE ALL ON FUNCTION public.is_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_owner(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.current_tg_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_tg_id() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.touch_updated_at() TO service_role;

ALTER TABLE public.news_cache
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS summary text;