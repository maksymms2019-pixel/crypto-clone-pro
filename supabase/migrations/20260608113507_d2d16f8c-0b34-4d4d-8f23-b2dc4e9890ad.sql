-- Balance table
CREATE TABLE public.user_points (
  user_id uuid NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_points TO authenticated;
GRANT ALL ON public.user_points TO service_role;
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own points" ON public.user_points
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own points" ON public.user_points
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own points" ON public.user_points
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Events log
CREATE TABLE public.point_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount integer NOT NULL DEFAULT 1,
  reason text NOT NULL DEFAULT 'coin',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.point_events TO authenticated;
GRANT ALL ON public.point_events TO service_role;
ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own events" ON public.point_events
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_point_events_user ON public.point_events(user_id, created_at DESC);

CREATE TRIGGER trg_user_points_updated
  BEFORE UPDATE ON public.user_points
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Award a coin with cooldown (default 30s). Returns new balance, or NULL if on cooldown.
CREATE OR REPLACE FUNCTION public.award_point(_reason text DEFAULT 'coin', _cooldown_seconds integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  last_at timestamptz;
  new_balance integer;
BEGIN
  IF uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT created_at INTO last_at
  FROM public.point_events
  WHERE user_id = uid
  ORDER BY created_at DESC
  LIMIT 1;

  IF last_at IS NOT NULL AND last_at > now() - make_interval(secs => _cooldown_seconds) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.point_events (user_id, amount, reason) VALUES (uid, 1, _reason);

  INSERT INTO public.user_points (user_id, balance)
  VALUES (uid, 1)
  ON CONFLICT (user_id) DO UPDATE SET balance = public.user_points.balance + 1
  RETURNING balance INTO new_balance;

  RETURN new_balance;
END;
$$;