-- 2026-08-24: daily chest, x2 boost, promo codes, no daily cap.
-- Chest slots reuse the in-game coin tiers: common +10 (75%), silver +30 (20%), diamond +100 (5%).

-- 1) user_points: chest + boost state ----------------------------------------
ALTER TABLE public.user_points
  ADD COLUMN IF NOT EXISTS last_chest_at timestamptz,
  ADD COLUMN IF NOT EXISTS boost_until timestamptz,
  ADD COLUMN IF NOT EXISTS chest_streak int NOT NULL DEFAULT 0;

-- 2) award_point: no daily cap, x2 while boost is active ---------------------
CREATE OR REPLACE FUNCTION public.award_point(_reason text DEFAULT 'misc', _cooldown_seconds int DEFAULT 0, _delta int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_balance int;
  v_boost timestamptz;
  v_delta int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  -- Only the coin tiers are allowed; anything else is rejected server-side.
  IF _delta NOT IN (10, 30, 100) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_delta');
  END IF;

  IF _cooldown_seconds > 0 THEN
    SELECT created_at INTO v_last FROM public.point_events
      WHERE user_id = v_uid AND reason = _reason
      ORDER BY created_at DESC LIMIT 1;
    IF v_last IS NOT NULL AND v_last > now() - make_interval(secs => _cooldown_seconds) THEN
      SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid;
      RETURN jsonb_build_object('ok', false, 'error', 'cooldown', 'balance', coalesce(v_balance, 0));
    END IF;
  END IF;

  -- Active x2 boost doubles the claim.
  SELECT boost_until INTO v_boost FROM public.user_points WHERE user_id = v_uid;
  v_delta := _delta * CASE WHEN v_boost IS NOT NULL AND v_boost > now() THEN 2 ELSE 1 END;

  INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, v_delta)
    ON CONFLICT (user_id) DO UPDATE SET balance = public.user_points.balance + v_delta, updated_at = now()
    RETURNING balance INTO v_balance;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, _reason, v_delta);
  RETURN jsonb_build_object('ok', true, 'balance', v_balance, 'delta', v_delta,
    'boosted', v_delta <> _delta);
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_point(text, int, int) TO authenticated;

-- 3) Daily chest --------------------------------------------------------------
-- Server-side reward roll. One chest per 20h. Streak grows when claiming
-- within 44h of the previous chest, else resets to 1.
CREATE OR REPLACE FUNCTION public.claim_daily_chest()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.user_points%ROWTYPE;
  v_next timestamptz;
  v_streak int;
  v_streak_bonus int;
  v_roll float;
  v_reward text;
  v_coins int[] := '{}';
  v_total int := 0;
  v_balance int;
  v_boost_until timestamptz;
  i int;
  r float;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  -- Ensure the row exists.
  INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, 0)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.user_points WHERE user_id = v_uid FOR UPDATE;

  v_next := coalesce(v_row.last_chest_at, 'epoch'::timestamptz) + interval '20 hours';
  IF v_next > now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'wait', 'next_at', v_next,
      'balance', v_row.balance, 'streak', v_row.chest_streak);
  END IF;

  -- Streak: kept when the previous chest was less than 44h ago.
  IF v_row.last_chest_at IS NOT NULL AND v_row.last_chest_at > now() - interval '44 hours' THEN
    v_streak := v_row.chest_streak + 1;
  ELSE
    v_streak := 1;
  END IF;
  v_streak_bonus := LEAST(v_streak, 10) * 5;

  -- Reward roll: slots 50%, x2 boost 25%, coin shower 25%.
  v_roll := random();
  IF v_roll < 0.50 THEN
    v_reward := 'slots';
    -- 5 coins with the same odds as the game: 75% common (10), 20% silver (30), 5% diamond (100).
    FOR i IN 1..5 LOOP
      r := random();
      v_coins := v_coins || (CASE WHEN r < 0.75 THEN 10 WHEN r < 0.95 THEN 30 ELSE 100 END);
    END LOOP;
    SELECT coalesce(sum(c), 0) INTO v_total FROM unnest(v_coins) AS c;
    v_total := v_total + v_streak_bonus;
  ELSIF v_roll < 0.75 THEN
    v_reward := 'boost';
    v_boost_until := now() + interval '1 hour';
    v_total := v_streak_bonus;
  ELSE
    v_reward := 'shower';
    v_total := 20 + floor(random() * 61)::int + v_streak_bonus; -- 20..80 + streak
  END IF;

  UPDATE public.user_points
  SET balance = balance + v_total,
      last_chest_at = now(),
      chest_streak = v_streak,
      boost_until = coalesce(v_boost_until, boost_until),
      updated_at = now()
  WHERE user_id = v_uid
  RETURNING balance INTO v_balance;

  IF v_total > 0 THEN
    INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, 'daily_chest', v_total);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reward', v_reward,
    'coins', v_coins,
    'total', v_total,
    'streak', v_streak,
    'boost_until', v_boost_until,
    'balance', v_balance,
    'next_at', now() + interval '20 hours'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_daily_chest() TO authenticated;

-- 4) my_coin_stats: + chest/boost/admin state --------------------------------
CREATE OR REPLACE FUNCTION public.my_coin_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object(
        'balance', up.balance,
        'code', up.public_code,
        'opt_in', up.leaderboard_opt_in,
        'rank', (SELECT count(*) + 1 FROM public.user_points x
                  WHERE x.leaderboard_opt_in AND x.balance > up.balance),
        'total', (SELECT count(*) FROM public.user_points x
                   WHERE x.leaderboard_opt_in AND x.balance > 0),
        'streak', up.chest_streak,
        'boost_until', up.boost_until,
        'chest_available', coalesce(up.last_chest_at, 'epoch'::timestamptz) + interval '20 hours' <= now(),
        'chest_next_at', coalesce(up.last_chest_at, 'epoch'::timestamptz) + interval '20 hours',
        'is_admin', public.has_role(auth.uid(), 'admin'))
     FROM public.user_points up WHERE up.user_id = auth.uid()),
    jsonb_build_object('balance', 0, 'code', null, 'opt_in', true, 'rank', null, 'total', 0,
      'streak', 0, 'boost_until', null, 'chest_available', true,
      'chest_next_at', null, 'is_admin', public.has_role(auth.uid(), 'admin')));
$$;
GRANT EXECUTE ON FUNCTION public.my_coin_stats() TO authenticated;

-- 5) Promo codes --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promo_codes (
  code text PRIMARY KEY,
  coins int NOT NULL CHECK (coins > 0 AND coins <= 100000),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_at timestamptz
);
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
-- No policies: direct table access is denied; everything goes through RPCs.

-- First one to redeem gets the coins — atomic.
CREATE OR REPLACE FUNCTION public.redeem_promo_code(_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(_code, '')));
  v_coins int;
  v_balance int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;
  IF v_code = '' THEN RETURN jsonb_build_object('ok', false, 'error', 'bad_code'); END IF;

  UPDATE public.promo_codes
  SET redeemed_by = v_uid, redeemed_at = now()
  WHERE code = v_code AND redeemed_by IS NULL
  RETURNING coins INTO v_coins;

  IF v_coins IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.promo_codes WHERE code = v_code) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'already_used');
    END IF;
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, v_coins)
    ON CONFLICT (user_id) DO UPDATE SET balance = public.user_points.balance + v_coins, updated_at = now()
    RETURNING balance INTO v_balance;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, 'promo', v_coins);

  RETURN jsonb_build_object('ok', true, 'coins', v_coins, 'balance', v_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text) TO authenticated;

-- Admin: create a promo code (auto-generated CT-XXXXXX when _code is null).
CREATE OR REPLACE FUNCTION public.create_promo_code(_coins int, _code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := upper(trim(coalesce(_code, '')));
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  IF _coins IS NULL OR _coins < 1 OR _coins > 100000 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_coins');
  END IF;

  IF v_code = '' THEN
    LOOP
      v_code := 'CT-';
      FOR i IN 1..6 LOOP
        v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.promo_codes WHERE code = v_code)
              AND NOT EXISTS (SELECT 1 FROM public.user_points WHERE public_code = v_code);
    END LOOP;
  ELSIF EXISTS (SELECT 1 FROM public.promo_codes WHERE code = v_code) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'exists');
  END IF;

  INSERT INTO public.promo_codes (code, coins, created_by) VALUES (v_code, _coins, auth.uid());
  RETURN jsonb_build_object('ok', true, 'code', v_code, 'coins', _coins);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_promo_code(int, text) TO authenticated;

-- Admin: list all promo codes with redemption status.
CREATE OR REPLACE FUNCTION public.list_promo_codes()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN public.has_role(auth.uid(), 'admin') THEN
    coalesce((SELECT jsonb_agg(jsonb_build_object(
        'code', pc.code, 'coins', pc.coins, 'created_at', pc.created_at,
        'redeemed_at', pc.redeemed_at,
        'redeemed_name', coalesce(p.display_name, up.public_code))
      FROM public.promo_codes pc
      LEFT JOIN public.profiles p ON p.id = pc.redeemed_by
      LEFT JOIN public.user_points up ON up.user_id = pc.redeemed_by
      ORDER BY pc.created_at DESC), '[]'::jsonb)
  ELSE jsonb_build_object('ok', false, 'error', 'forbidden') END;
$$;
GRANT EXECUTE ON FUNCTION public.list_promo_codes() TO authenticated;
