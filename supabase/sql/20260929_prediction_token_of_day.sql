-- Token of the day: any symbol allowed; card shows only the latest day's rounds.
ALTER TABLE public.prediction_rounds DROP CONSTRAINT IF EXISTS prediction_rounds_asset_check;
ALTER TABLE public.prediction_rounds ADD COLUMN IF NOT EXISTS name text;

CREATE OR REPLACE FUNCTION public.prediction_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'asset') <> 'BTC', x->>'asset'), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'asset', r.asset, 'name', r.name, 'round_date', r.round_date, 'open_price', r.open_price,
      'close_price', r.close_price, 'locks_at', r.locks_at, 'settles_at', r.settles_at,
      'status', r.status, 'result', r.result,
      'up', (SELECT count(*) FROM public.prediction_bets b WHERE b.round_id = r.id AND b.side = 'up'),
      'down', (SELECT count(*) FROM public.prediction_bets b WHERE b.round_id = r.id AND b.side = 'down'),
      'my', (SELECT jsonb_build_object('side', b.side, 'stake', b.stake, 'payout', b.payout)
             FROM public.prediction_bets b WHERE b.round_id = r.id AND b.user_id = auth.uid())) AS x
    FROM public.prediction_rounds r
    WHERE r.status <> 'cancelled'
      AND r.round_date = (SELECT max(round_date) FROM public.prediction_rounds WHERE status <> 'cancelled')
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.open_prediction_round_named(_asset text, _name text, _date date, _price numeric,
  _opens timestamptz, _locks timestamptz, _settles timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.prediction_rounds (asset, name, round_date, open_price, opens_at, locks_at, settles_at)
  VALUES (_asset, _name, _date, _price, _opens, _locks, _settles)
  ON CONFLICT (asset, round_date) DO NOTHING RETURNING id INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.open_prediction_round_named(text, text, date, numeric, timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_prediction_round_named(text, text, date, numeric, timestamptz, timestamptz, timestamptz) TO service_role;
