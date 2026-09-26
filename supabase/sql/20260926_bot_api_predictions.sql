-- 2026-09-26: Bot API (telegram_id on user_points + bot_* RPCs) and "Прогноз дня".

-- =============================================================================
-- 1) telegram_id directly on user_points
-- =============================================================================
ALTER TABLE public.user_points ADD COLUMN IF NOT EXISTS telegram_id bigint;
CREATE UNIQUE INDEX IF NOT EXISTS user_points_telegram_id_idx ON public.user_points(telegram_id) WHERE telegram_id IS NOT NULL;

-- Backfill: every tg user gets a user_points row with telegram_id.
INSERT INTO public.user_points (user_id, telegram_id)
SELECT DISTINCT ON (t.auth_user_id) t.auth_user_id, t.telegram_id
FROM public.tg_users t
WHERE t.auth_user_id IS NOT NULL
ORDER BY t.auth_user_id, t.last_seen_at DESC NULLS LAST
ON CONFLICT (user_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id
WHERE public.user_points.telegram_id IS DISTINCT FROM EXCLUDED.telegram_id;

-- Keep in sync automatically whenever tg_users changes.
CREATE OR REPLACE FUNCTION public.sync_tg_to_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.auth_user_id IS NOT NULL THEN
    UPDATE public.user_points SET telegram_id = NULL
      WHERE telegram_id = NEW.telegram_id AND user_id <> NEW.auth_user_id;
    INSERT INTO public.user_points (user_id, telegram_id) VALUES (NEW.auth_user_id, NEW.telegram_id)
    ON CONFLICT (user_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS tg_users_sync_points ON public.tg_users;
CREATE TRIGGER tg_users_sync_points AFTER INSERT OR UPDATE OF auth_user_id, telegram_id ON public.tg_users
FOR EACH ROW EXECUTE FUNCTION public.sync_tg_to_points();

-- =============================================================================
-- 2) Bot API (service_role only)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.coin_level_name(_bal int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN _bal >= 300 THEN 'legend' WHEN _bal >= 150 THEN 'diamond'
              WHEN _bal >= 75 THEN 'gold' WHEN _bal >= 25 THEN 'silver' ELSE 'bronze' END;
$$;

CREATE OR REPLACE FUNCTION public.bot_resolve_user(_tg bigint)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  SELECT user_id INTO v FROM public.user_points WHERE telegram_id = _tg;
  IF v IS NOT NULL THEN RETURN v; END IF;
  SELECT auth_user_id INTO v FROM public.tg_users WHERE telegram_id = _tg AND auth_user_id IS NOT NULL LIMIT 1;
  IF v IS NULL THEN RETURN NULL; END IF;
  INSERT INTO public.user_points (user_id, telegram_id) VALUES (v, _tg)
  ON CONFLICT (user_id) DO UPDATE SET telegram_id = EXCLUDED.telegram_id;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.bot_get_user(tg_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public.bot_resolve_user(tg_id); r record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;
  SELECT * INTO r FROM public.user_points WHERE user_id = v_uid;
  RETURN jsonb_build_object(
    'ok', true, 'telegram_id', tg_id, 'user_id', v_uid,
    'balance', r.balance, 'level', public.coin_level_name(r.balance),
    'coin_id', r.public_code,
    'rank', (SELECT count(*) + 1 FROM public.user_points x WHERE x.leaderboard_opt_in AND x.balance > r.balance),
    'chest_available', coalesce(r.last_chest_at, 'epoch'::timestamptz) + interval '20 hours' <= now(),
    'boost_until', r.boost_until,
    'tickets', (SELECT count(*) FROM public.raffle_tickets t WHERE t.user_id = v_uid),
    'active_predictions', (SELECT count(*) FROM public.prediction_bets b JOIN public.prediction_rounds pr ON pr.id = b.round_id
                            WHERE b.user_id = v_uid AND pr.status = 'open'));
END $$;

CREATE OR REPLACE FUNCTION public.bot_award_points(tg_id bigint, amount int, reason text DEFAULT 'bot')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public.bot_resolve_user(tg_id); v_bal int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;
  IF amount IS NULL OR amount <= 0 OR amount > 1000000 THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_amount'); END IF;
  UPDATE public.user_points SET balance = balance + amount, updated_at = now() WHERE user_id = v_uid RETURNING balance INTO v_bal;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, 'bot:' || coalesce(reason, 'bot'), amount);
  RETURN jsonb_build_object('ok', true, 'balance', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.bot_deduct_points(tg_id bigint, amount int, reason text DEFAULT 'bot')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public.bot_resolve_user(tg_id); v_bal int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;
  IF amount IS NULL OR amount <= 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_amount'); END IF;
  UPDATE public.user_points SET balance = balance - amount, updated_at = now()
  WHERE user_id = v_uid AND balance >= amount RETURNING balance INTO v_bal;
  IF v_bal IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance',
      'balance', (SELECT balance FROM public.user_points WHERE user_id = v_uid));
  END IF;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, 'bot:' || coalesce(reason, 'bot'), -amount);
  RETURN jsonb_build_object('ok', true, 'balance', v_bal);
END $$;

CREATE OR REPLACE FUNCTION public.bot_set_points(tg_id bigint, balance int, reason text DEFAULT 'bot_set')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := public.bot_resolve_user(tg_id); v_old int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'user_not_found'); END IF;
  IF bot_set_points.balance IS NULL OR bot_set_points.balance < 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_amount'); END IF;
  SELECT up.balance INTO v_old FROM public.user_points up WHERE up.user_id = v_uid FOR UPDATE;
  UPDATE public.user_points up SET balance = bot_set_points.balance, updated_at = now() WHERE up.user_id = v_uid;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, 'bot:' || coalesce(reason, 'bot_set'), bot_set_points.balance - v_old);
  RETURN jsonb_build_object('ok', true, 'balance', bot_set_points.balance);
END $$;

-- =============================================================================
-- 3) Прогноз дня
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.prediction_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL CHECK (asset IN ('BTC', 'GRAM')),
  round_date date NOT NULL,
  open_price numeric NOT NULL,
  close_price numeric,
  opens_at timestamptz NOT NULL,
  locks_at timestamptz NOT NULL,
  settles_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'cancelled')),
  result text CHECK (result IN ('up', 'down', 'flat')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset, round_date)
);
GRANT SELECT ON public.prediction_rounds TO anon, authenticated;
GRANT ALL ON public.prediction_rounds TO service_role;
ALTER TABLE public.prediction_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rounds readable" ON public.prediction_rounds;
CREATE POLICY "rounds readable" ON public.prediction_rounds FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.prediction_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.prediction_rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('up', 'down')),
  stake int NOT NULL CHECK (stake IN (20, 50, 100)),
  payout int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, user_id)
);
CREATE INDEX IF NOT EXISTS prediction_bets_user_idx ON public.prediction_bets(user_id, created_at DESC);
GRANT SELECT ON public.prediction_bets TO authenticated;
GRANT ALL ON public.prediction_bets TO service_role;
ALTER TABLE public.prediction_bets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own bets" ON public.prediction_bets;
CREATE POLICY "own bets" ON public.prediction_bets FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.raffle_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL,
  round_id uuid REFERENCES public.prediction_rounds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raffle_tickets_user_idx ON public.raffle_tickets(user_id);
GRANT SELECT ON public.raffle_tickets TO authenticated;
GRANT ALL ON public.raffle_tickets TO service_role;
ALTER TABLE public.raffle_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own tickets" ON public.raffle_tickets;
CREATE POLICY "own tickets" ON public.raffle_tickets FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Place a bet (atomic stake deduction).
CREATE OR REPLACE FUNCTION public.place_prediction(_round_id uuid, _side text, _stake int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r record; v_bal int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  IF _side NOT IN ('up', 'down') OR _stake NOT IN (20, 50, 100) THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_input'); END IF;
  SELECT * INTO r FROM public.prediction_rounds WHERE id = _round_id;
  IF r.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF r.status <> 'open' OR now() >= r.locks_at THEN RETURN jsonb_build_object('ok', false, 'error', 'locked'); END IF;
  IF EXISTS (SELECT 1 FROM public.prediction_bets WHERE round_id = _round_id AND user_id = v_uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_bet');
  END IF;
  UPDATE public.user_points SET balance = balance - _stake, updated_at = now()
  WHERE user_id = v_uid AND balance >= _stake RETURNING balance INTO v_bal;
  IF v_bal IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'insufficient_balance'); END IF;
  BEGIN
    INSERT INTO public.prediction_bets (round_id, user_id, side, stake) VALUES (_round_id, v_uid, _side, _stake);
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'already_bet';
  END;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, 'prediction_stake', -_stake);
  RETURN jsonb_build_object('ok', true, 'balance', v_bal);
END $$;

-- Overview for the card: today's/latest rounds per asset, crowd %, my bet.
CREATE OR REPLACE FUNCTION public.prediction_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'asset'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'asset', r.asset, 'round_date', r.round_date, 'open_price', r.open_price,
      'close_price', r.close_price, 'locks_at', r.locks_at, 'settles_at', r.settles_at,
      'status', r.status, 'result', r.result,
      'up', (SELECT count(*) FROM public.prediction_bets b WHERE b.round_id = r.id AND b.side = 'up'),
      'down', (SELECT count(*) FROM public.prediction_bets b WHERE b.round_id = r.id AND b.side = 'down'),
      'my', (SELECT jsonb_build_object('side', b.side, 'stake', b.stake, 'payout', b.payout)
             FROM public.prediction_bets b WHERE b.round_id = r.id AND b.user_id = auth.uid())) AS x
    FROM (SELECT DISTINCT ON (asset) * FROM public.prediction_rounds
          WHERE status <> 'cancelled' ORDER BY asset, round_date DESC) r
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.my_prediction_history()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'tickets', (SELECT count(*) FROM public.raffle_tickets WHERE user_id = auth.uid()),
    'wins', (SELECT count(*) FROM public.prediction_bets b JOIN public.prediction_rounds r ON r.id = b.round_id
             WHERE b.user_id = auth.uid() AND r.status = 'settled' AND b.side = r.result),
    'total', (SELECT count(*) FROM public.prediction_bets b JOIN public.prediction_rounds r ON r.id = b.round_id
              WHERE b.user_id = auth.uid() AND r.status = 'settled'),
    'streak', (SELECT count(*) FROM (
        SELECT b.side = r.result AS won, sum(CASE WHEN b.side = r.result THEN 0 ELSE 1 END)
               OVER (ORDER BY r.settles_at DESC, r.asset) AS losses
        FROM public.prediction_bets b JOIN public.prediction_rounds r ON r.id = b.round_id
        WHERE b.user_id = auth.uid() AND r.status = 'settled' AND r.result <> 'flat') s WHERE losses = 0),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'asset', r.asset, 'round_date', r.round_date, 'side', b.side, 'stake', b.stake, 'payout', b.payout,
        'status', r.status, 'result', r.result, 'open_price', r.open_price, 'close_price', r.close_price)
        ORDER BY r.round_date DESC, r.asset)
      FROM (SELECT * FROM public.prediction_bets WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 30) b
      JOIN public.prediction_rounds r ON r.id = b.round_id), '[]'::jsonb));
$$;

-- Internal: open & settle (service_role only; called by predictions-cron).
CREATE OR REPLACE FUNCTION public.open_prediction_round(_asset text, _date date, _price numeric,
  _opens timestamptz, _locks timestamptz, _settles timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.prediction_rounds (asset, round_date, open_price, opens_at, locks_at, settles_at)
  VALUES (_asset, _date, _price, _opens, _locks, _settles)
  ON CONFLICT (asset, round_date) DO NOTHING RETURNING id INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.settle_prediction_round(_round_id uuid, _price numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_res text; b record; v_winners int := 0;
BEGIN
  SELECT * INTO r FROM public.prediction_rounds WHERE id = _round_id FOR UPDATE;
  IF r.id IS NULL OR r.status <> 'open' THEN RETURN jsonb_build_object('ok', false, 'error', 'not_open'); END IF;
  v_res := CASE WHEN _price > r.open_price THEN 'up' WHEN _price < r.open_price THEN 'down' ELSE 'flat' END;
  UPDATE public.prediction_rounds SET status = 'settled', result = v_res, close_price = _price WHERE id = _round_id;
  FOR b IN SELECT * FROM public.prediction_bets WHERE round_id = _round_id LOOP
    IF v_res = 'flat' THEN
      UPDATE public.prediction_bets SET payout = b.stake WHERE id = b.id;
      UPDATE public.user_points SET balance = balance + b.stake, updated_at = now() WHERE user_id = b.user_id;
      INSERT INTO public.point_events (user_id, reason, delta) VALUES (b.user_id, 'prediction_refund', b.stake);
    ELSIF b.side = v_res THEN
      v_winners := v_winners + 1;
      UPDATE public.prediction_bets SET payout = b.stake * 2 WHERE id = b.id;
      UPDATE public.user_points SET balance = balance + b.stake * 2, updated_at = now() WHERE user_id = b.user_id;
      INSERT INTO public.point_events (user_id, reason, delta) VALUES (b.user_id, 'prediction_win', b.stake * 2);
      INSERT INTO public.raffle_tickets (user_id, source, round_id) VALUES (b.user_id, 'prediction', _round_id);
    ELSE
      UPDATE public.prediction_bets SET payout = 0 WHERE id = b.id;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'result', v_res, 'winners', v_winners);
END $$;

CREATE OR REPLACE FUNCTION public.admin_cancel_round(_round_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RETURN jsonb_build_object('ok', false, 'error', 'forbidden'); END IF;
  UPDATE public.prediction_rounds SET status = 'cancelled' WHERE id = _round_id AND status = 'open';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_open'); END IF;
  FOR b IN SELECT * FROM public.prediction_bets WHERE round_id = _round_id LOOP
    UPDATE public.prediction_bets SET payout = b.stake WHERE id = b.id;
    UPDATE public.user_points SET balance = balance + b.stake, updated_at = now() WHERE user_id = b.user_id;
    INSERT INTO public.point_events (user_id, reason, delta) VALUES (b.user_id, 'prediction_refund', b.stake);
  END LOOP;
  RETURN jsonb_build_object('ok', true);
END $$;

-- =============================================================================
-- 4) Grants
-- =============================================================================
REVOKE ALL ON FUNCTION public.bot_resolve_user(bigint), public.bot_get_user(bigint),
  public.bot_award_points(bigint, int, text), public.bot_deduct_points(bigint, int, text),
  public.bot_set_points(bigint, int, text),
  public.open_prediction_round(text, date, numeric, timestamptz, timestamptz, timestamptz),
  public.settle_prediction_round(uuid, numeric), public.sync_tg_to_points()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bot_get_user(bigint), public.bot_award_points(bigint, int, text),
  public.bot_deduct_points(bigint, int, text), public.bot_set_points(bigint, int, text),
  public.open_prediction_round(text, date, numeric, timestamptz, timestamptz, timestamptz),
  public.settle_prediction_round(uuid, numeric) TO service_role;
GRANT EXECUTE ON FUNCTION public.place_prediction(uuid, text, int), public.my_prediction_history(),
  public.admin_cancel_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.prediction_overview() TO anon, authenticated;
