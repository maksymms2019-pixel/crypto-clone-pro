CREATE TABLE IF NOT EXISTS public.point_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  delta int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS point_events_user_reason_idx ON public.point_events(user_id, reason, created_at DESC);
GRANT SELECT ON public.point_events TO authenticated;
GRANT ALL ON public.point_events TO service_role;
ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "point_events self read" ON public.point_events FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP FUNCTION IF EXISTS public.award_point(int);
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