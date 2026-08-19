-- Helper: current Telegram ID from JWT claims
CREATE OR REPLACE FUNCTION public.current_tg_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id', '')::bigint
$$;

CREATE TABLE public.tg_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint UNIQUE,
  username text, first_name text, last_name text, photo_url text,
  lang text DEFAULT 'uk',
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tg_users_auth_user_idx ON public.tg_users(auth_user_id);
GRANT SELECT, INSERT, UPDATE ON public.tg_users TO authenticated;
GRANT ALL ON public.tg_users TO service_role;
ALTER TABLE public.tg_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_users self read" ON public.tg_users FOR SELECT TO authenticated USING (telegram_id = public.current_tg_id() OR auth_user_id = auth.uid());
CREATE POLICY "tg_users self update" ON public.tg_users FOR UPDATE TO authenticated USING (telegram_id = public.current_tg_id() OR auth_user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TABLE public.holdings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  symbol text NOT NULL, coingecko_id text,
  amount numeric(28, 12) NOT NULL DEFAULT 0,
  avg_cost numeric(28, 12) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);
CREATE INDEX holdings_user_idx ON public.holdings(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO authenticated;
GRANT ALL ON public.holdings TO service_role;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "holdings owner all" ON public.holdings FOR ALL TO authenticated
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()));
CREATE TRIGGER holdings_touch BEFORE UPDATE ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TYPE public.trade_side AS ENUM ('buy', 'sell', 'transfer_in', 'transfer_out');
CREATE TABLE public.trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  symbol text NOT NULL, coingecko_id text,
  side public.trade_side NOT NULL,
  amount numeric(28, 12) NOT NULL,
  price numeric(28, 12) NOT NULL DEFAULT 0,
  fee numeric(28, 12) NOT NULL DEFAULT 0,
  note text,
  executed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trades_user_executed_idx ON public.trades(user_id, executed_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trades owner all" ON public.trades FOR ALL TO authenticated
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()));

CREATE TABLE public.watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  symbol text NOT NULL, coingecko_id text NOT NULL,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, coingecko_id)
);
CREATE INDEX watchlist_user_pos_idx ON public.watchlist(user_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;
GRANT ALL ON public.watchlist TO service_role;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist owner all" ON public.watchlist FOR ALL TO authenticated
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()));

CREATE TYPE public.alert_kind AS ENUM (
  'price_above', 'price_below', 'pct_change_24h_above', 'pct_change_24h_below',
  'btc_dominance_cross', 'fear_greed_cross'
);
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  symbol text, coingecko_id text,
  kind public.alert_kind NOT NULL,
  threshold numeric(28, 12) NOT NULL,
  active boolean NOT NULL DEFAULT true,
  one_shot boolean NOT NULL DEFAULT false,
  last_triggered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_user_active_idx ON public.alerts(user_id, active);
CREATE INDEX alerts_active_idx ON public.alerts(active) WHERE active = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "alerts owner all" ON public.alerts FOR ALL TO authenticated
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()))
  WITH CHECK (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()));

CREATE TABLE public.portfolio_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.tg_users(id) ON DELETE CASCADE,
  taken_at date NOT NULL DEFAULT CURRENT_DATE,
  total_value numeric(28, 4) NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, taken_at)
);
CREATE INDEX snapshots_user_date_idx ON public.portfolio_snapshots(user_id, taken_at DESC);
GRANT SELECT ON public.portfolio_snapshots TO authenticated;
GRANT ALL ON public.portfolio_snapshots TO service_role;
ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots owner read" ON public.portfolio_snapshots FOR SELECT TO authenticated
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id() OR auth_user_id = auth.uid()));

CREATE TABLE public.news_clusters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text,
  headline text NOT NULL,
  summary_uk text,
  sentiment_avg text CHECK (sentiment_avg IN ('bullish','bearish','neutral')),
  tags text[] NOT NULL DEFAULT '{}',
  story_count int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_clusters_updated_idx ON public.news_clusters(updated_at DESC);
GRANT SELECT ON public.news_clusters TO anon, authenticated;
GRANT ALL ON public.news_clusters TO service_role;
ALTER TABLE public.news_clusters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news_clusters public read" ON public.news_clusters FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.news_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  url text UNIQUE NOT NULL,
  title text NOT NULL,
  title_uk text,
  summary text,
  summary_uk text,
  image_url text,
  sentiment text CHECK (sentiment IN ('bullish','bearish','neutral')),
  tags text[] NOT NULL DEFAULT '{}',
  cluster_id text,
  importance_score numeric NOT NULL DEFAULT 0,
  click_count int NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_cache_published_idx ON public.news_cache(published_at DESC);
CREATE INDEX news_cache_tags_idx ON public.news_cache USING gin(tags);
CREATE INDEX news_cache_cluster_idx ON public.news_cache (cluster_id, published_at DESC);
CREATE INDEX news_cache_importance_idx ON public.news_cache (importance_score DESC, published_at DESC);
GRANT SELECT ON public.news_cache TO anon, authenticated;
GRANT ALL ON public.news_cache TO service_role;
ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news public read" ON public.news_cache FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.metrics_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.metrics_cache TO service_role;
ALTER TABLE public.metrics_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metrics_cache no public access" ON public.metrics_cache FOR SELECT TO authenticated USING (false);
CREATE INDEX idx_metrics_cache_expires ON public.metrics_cache(expires_at);

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
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email), NEW.raw_user_meta_data ->> 'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.user_points (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_points TO authenticated;
GRANT ALL ON public.user_points TO service_role;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_points self read" ON public.user_points FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE public.point_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  delta int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX point_events_user_reason_idx ON public.point_events(user_id, reason, created_at DESC);
GRANT SELECT ON public.point_events TO authenticated;
GRANT ALL ON public.point_events TO service_role;
ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "point_events self read" ON public.point_events FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.award_point(_reason text DEFAULT 'misc', _cooldown_seconds int DEFAULT 0, _delta int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_balance int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  IF _cooldown_seconds > 0 THEN
    SELECT created_at INTO v_last FROM public.point_events
      WHERE user_id = v_uid AND reason = _reason
      ORDER BY created_at DESC LIMIT 1;
    IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => _cooldown_seconds) THEN
      SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid;
      RETURN jsonb_build_object('ok', false, 'error', 'cooldown', 'balance', coalesce(v_balance, 0));
    END IF;
  END IF;
  INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, GREATEST(_delta, 0))
    ON CONFLICT (user_id) DO UPDATE SET balance = public.user_points.balance + _delta, updated_at = now()
    RETURNING balance INTO v_balance;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, _reason, _delta);
  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_point(text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_app_user()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO v_id FROM public.tg_users WHERE auth_user_id = auth.uid();
  IF v_id IS NULL THEN
    INSERT INTO public.tg_users (telegram_id, auth_user_id, first_name)
    VALUES (-extract(epoch from now())::bigint, auth.uid(), coalesce((SELECT email FROM auth.users WHERE id = auth.uid()), 'user'))
    RETURNING id INTO v_id;
  END IF;
  INSERT INTO public.user_points (user_id, balance) VALUES (auth.uid(), 0) ON CONFLICT DO NOTHING;
  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_app_user() TO authenticated;

CREATE OR REPLACE FUNCTION public.bump_news_click(_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.news_cache SET click_count = click_count + 1 WHERE id = _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bump_news_click(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_tg_id() TO anon, authenticated;

CREATE TABLE public.translation_cache (
  key text PRIMARY KEY,
  text_uk text NOT NULL,
  kind text NOT NULL DEFAULT 'generic',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.translation_cache TO anon, authenticated;
GRANT ALL ON public.translation_cache TO service_role;
ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "translations readable to all" ON public.translation_cache FOR SELECT TO anon, authenticated USING (true);