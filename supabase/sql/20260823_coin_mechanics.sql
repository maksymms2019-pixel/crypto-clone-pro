-- Coin mechanics: +10 per claim, rare coin tiers, daily cap 2000,
-- and public winner verification by Coin ID.
-- Applied via Supabase Management API on 2026-08-23.

-- 1) award_point: whitelist deltas (10/30/100), daily cap 2000 ---------------
CREATE OR REPLACE FUNCTION public.award_point(_reason text DEFAULT 'misc', _cooldown_seconds int DEFAULT 0, _delta int DEFAULT 10)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_balance int;
  v_today int;
  c_daily_cap constant int := 2000;
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

  SELECT coalesce(sum(delta), 0) INTO v_today FROM public.point_events
    WHERE user_id = v_uid AND created_at > now() - interval '24 hours';
  IF v_today + _delta > c_daily_cap THEN
    SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', false, 'error', 'daily_limit', 'balance', coalesce(v_balance, 0));
  END IF;

  INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, _delta)
    ON CONFLICT (user_id) DO UPDATE SET balance = public.user_points.balance + _delta, updated_at = now()
    RETURNING balance INTO v_balance;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, _reason, _delta);
  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_point(text, int, int) TO authenticated;

-- 2) verify_coin_id: public winner check by Coin ID ---------------------------
-- Returns only data that is public by design (name/code/balance/rank + latest
-- snapshot result) so organizers can verify winners without screenshots.
CREATE OR REPLACE FUNCTION public.verify_coin_id(_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code text := upper(trim(_code));
  v_user uuid;
  v_name text;
  v_balance int;
  v_rank bigint;
  v_snap record;
BEGIN
  IF v_code IS NULL OR v_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'bad_code');
  END IF;

  SELECT up.user_id, up.balance INTO v_user, v_balance
    FROM public.user_points up WHERE up.public_code = v_code;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT coalesce(p.display_name, 'Учасник') INTO v_name
    FROM public.profiles p WHERE p.id = v_user;
  v_name := coalesce(v_name, 'Учасник');

  SELECT count(*) + 1 INTO v_rank FROM public.user_points up2
    WHERE up2.balance > v_balance;

  SELECT s.title, s.taken_at, e.balance AS s_balance, e.rank AS s_rank
    INTO v_snap
    FROM public.coin_snapshot_entries e
    JOIN public.coin_snapshots s ON s.id = e.snapshot_id
    WHERE e.user_id = v_user
    ORDER BY s.taken_at DESC LIMIT 1;

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_code,
    'display_name', v_name,
    'balance', v_balance,
    'rank', v_rank,
    'snapshot', CASE WHEN v_snap IS NULL THEN NULL ELSE jsonb_build_object(
      'title', v_snap.title,
      'taken_at', v_snap.taken_at,
      'balance', v_snap.s_balance,
      'rank', v_snap.s_rank
    ) END
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_coin_id(text) TO authenticated;
