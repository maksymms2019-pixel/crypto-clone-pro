-- Coin gamification: public code, leaderboard, anti-abuse cap and raffle snapshots.

-- 1) Roles (admin) ----------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_roles self read" ON public.user_roles;
CREATE POLICY "user_roles self read" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

-- 2) user_points: public code + leaderboard opt-in --------------------------
ALTER TABLE public.user_points
  ADD COLUMN IF NOT EXISTS public_code text,
  ADD COLUMN IF NOT EXISTS leaderboard_opt_in boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.gen_coin_code()
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path = public AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  res text;
  i int;
BEGIN
  LOOP
    res := 'CT-';
    FOR i IN 1..6 LOOP
      res := res || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.user_points WHERE public_code = res);
  END LOOP;
  RETURN res;
END;
$$;

UPDATE public.user_points SET public_code = public.gen_coin_code() WHERE public_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_points_public_code_idx ON public.user_points(public_code);
CREATE INDEX IF NOT EXISTS user_points_balance_idx
  ON public.user_points(balance DESC, updated_at ASC) WHERE leaderboard_opt_in;

CREATE OR REPLACE FUNCTION public.user_points_set_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.public_code IS NULL THEN NEW.public_code := public.gen_coin_code(); END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS user_points_code ON public.user_points;
CREATE TRIGGER user_points_code BEFORE INSERT ON public.user_points
  FOR EACH ROW EXECUTE FUNCTION public.user_points_set_code();

CREATE OR REPLACE FUNCTION public.set_leaderboard_opt_in(_value boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  INSERT INTO public.user_points (user_id, balance, leaderboard_opt_in)
  VALUES (auth.uid(), 0, _value)
  ON CONFLICT (user_id) DO UPDATE SET leaderboard_opt_in = _value, updated_at = now();
  RETURN _value;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_leaderboard_opt_in(boolean) TO authenticated;

-- 3) Leaderboard ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.coin_leaderboard(int);
CREATE FUNCTION public.coin_leaderboard(_limit int DEFAULT 100)
RETURNS TABLE (rank bigint, code text, display_name text, avatar_url text, balance int, is_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.rank, r.public_code, r.display_name, r.avatar_url, r.balance, r.user_id = auth.uid()
  FROM (
    SELECT up.user_id, up.public_code, up.balance,
           coalesce(p.display_name, 'Учасник') AS display_name,
           p.avatar_url,
           row_number() OVER (ORDER BY up.balance DESC, up.updated_at ASC) AS rank
    FROM public.user_points up
    LEFT JOIN public.profiles p ON p.id = up.user_id
    WHERE up.leaderboard_opt_in AND up.balance > 0
  ) r
  ORDER BY r.rank
  LIMIT LEAST(GREATEST(_limit, 1), 200);
$$;
GRANT EXECUTE ON FUNCTION public.coin_leaderboard(int) TO anon, authenticated;

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
                   WHERE x.leaderboard_opt_in AND x.balance > 0))
     FROM public.user_points up WHERE up.user_id = auth.uid()),
    jsonb_build_object('balance', 0, 'code', null, 'opt_in', true, 'rank', null, 'total', 0));
$$;
GRANT EXECUTE ON FUNCTION public.my_coin_stats() TO authenticated;

-- 4) Raffle snapshots -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coin_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  note text,
  taken_at timestamptz NOT NULL DEFAULT now(),
  participants int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS coin_snapshots_taken_idx ON public.coin_snapshots(taken_at DESC);
GRANT SELECT ON public.coin_snapshots TO anon, authenticated;
GRANT ALL ON public.coin_snapshots TO service_role;
ALTER TABLE public.coin_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_snapshots public read" ON public.coin_snapshots;
CREATE POLICY "coin_snapshots public read" ON public.coin_snapshots
  FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.coin_snapshot_entries (
  snapshot_id uuid NOT NULL REFERENCES public.coin_snapshots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  code text,
  display_name text,
  balance int NOT NULL,
  rank int NOT NULL,
  PRIMARY KEY (snapshot_id, user_id)
);
CREATE INDEX IF NOT EXISTS coin_snapshot_entries_rank_idx ON public.coin_snapshot_entries(snapshot_id, rank);
GRANT SELECT ON public.coin_snapshot_entries TO anon, authenticated;
GRANT ALL ON public.coin_snapshot_entries TO service_role;
ALTER TABLE public.coin_snapshot_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "coin_snapshot_entries public read" ON public.coin_snapshot_entries;
CREATE POLICY "coin_snapshot_entries public read" ON public.coin_snapshot_entries
  FOR SELECT TO anon, authenticated USING (true);

-- Admin-only: freeze all balances at this moment.
CREATE OR REPLACE FUNCTION public.create_coin_snapshot(_title text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_count int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;
  INSERT INTO public.coin_snapshots (title, note, created_by) VALUES (_title, _note, auth.uid())
    RETURNING id INTO v_id;
  INSERT INTO public.coin_snapshot_entries (snapshot_id, user_id, code, display_name, balance, rank)
  SELECT v_id, up.user_id, up.public_code, coalesce(p.display_name, 'Учасник'), up.balance,
         row_number() OVER (ORDER BY up.balance DESC, up.updated_at ASC)
  FROM public.user_points up
  LEFT JOIN public.profiles p ON p.id = up.user_id
  WHERE up.balance > 0;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.coin_snapshots SET participants = v_count WHERE id = v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id, 'participants', v_count);
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_coin_snapshot(text, text) TO authenticated;

-- My results across snapshots (proof instead of screenshots).
DROP FUNCTION IF EXISTS public.my_snapshot_results(int);
CREATE FUNCTION public.my_snapshot_results(_limit int DEFAULT 10)
RETURNS TABLE (snapshot_id uuid, title text, taken_at timestamptz, participants int, balance int, rank int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.title, s.taken_at, s.participants, e.balance, e.rank
  FROM public.coin_snapshots s
  JOIN public.coin_snapshot_entries e ON e.snapshot_id = s.id AND e.user_id = auth.uid()
  ORDER BY s.taken_at DESC
  LIMIT LEAST(GREATEST(_limit, 1), 50);
$$;
GRANT EXECUTE ON FUNCTION public.my_snapshot_results(int) TO authenticated;

-- 5) Anti-abuse: daily cap inside award_point --------------------------------
CREATE INDEX IF NOT EXISTS point_events_user_created_idx ON public.point_events(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.award_point(_reason text DEFAULT 'misc', _cooldown_seconds int DEFAULT 0, _delta int DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_last timestamptz;
  v_balance int;
  v_today int;
  c_daily_cap constant int := 60;
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

  SELECT coalesce(sum(delta), 0) INTO v_today FROM public.point_events
    WHERE user_id = v_uid AND created_at > now() - interval '24 hours';
  IF v_today + GREATEST(_delta, 0) > c_daily_cap THEN
    SELECT balance INTO v_balance FROM public.user_points WHERE user_id = v_uid;
    RETURN jsonb_build_object('ok', false, 'error', 'daily_limit', 'balance', coalesce(v_balance, 0));
  END IF;

  INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, GREATEST(_delta, 0))
    ON CONFLICT (user_id) DO UPDATE SET balance = public.user_points.balance + _delta, updated_at = now()
    RETURNING balance INTO v_balance;
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, _reason, _delta);
  RETURN jsonb_build_object('ok', true, 'balance', v_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_point(text, int, int) TO authenticated;
