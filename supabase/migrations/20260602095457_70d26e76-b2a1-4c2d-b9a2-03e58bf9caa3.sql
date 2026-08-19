CREATE OR REPLACE FUNCTION public.current_tg_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'telegram_id', '')::bigint
$$;

CREATE TABLE public.tg_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id bigint UNIQUE NOT NULL,
  username text, first_name text, last_name text, photo_url text,
  lang text DEFAULT 'uk',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.tg_users TO authenticated;
GRANT ALL ON public.tg_users TO service_role;
ALTER TABLE public.tg_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_users self read" ON public.tg_users FOR SELECT TO authenticated USING (telegram_id = public.current_tg_id());
CREATE POLICY "tg_users self update" ON public.tg_users FOR UPDATE TO authenticated USING (telegram_id = public.current_tg_id());

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
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()))
  WITH CHECK (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()));

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
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()))
  WITH CHECK (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()));

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
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()))
  WITH CHECK (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()));

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
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()))
  WITH CHECK (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()));

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
  USING (user_id IN (SELECT id FROM public.tg_users WHERE telegram_id = public.current_tg_id()));

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
  summary_uk text,
  sentiment text CHECK (sentiment IN ('bullish','bearish','neutral')),
  tags text[] NOT NULL DEFAULT '{}',
  cluster_id uuid REFERENCES public.news_clusters(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX news_cache_published_idx ON public.news_cache(published_at DESC);
CREATE INDEX news_cache_tags_idx ON public.news_cache USING gin(tags);
GRANT SELECT ON public.news_cache TO anon, authenticated;
GRANT ALL ON public.news_cache TO service_role;
ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "news public read" ON public.news_cache FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER holdings_touch BEFORE UPDATE ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();