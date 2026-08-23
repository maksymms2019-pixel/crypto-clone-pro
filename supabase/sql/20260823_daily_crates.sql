/*
# Add Daily Crates with server-controlled rewards

1. New Tables
- `daily_crate_claims` stores one immutable crate result per signed-in user and calendar day.
- `id`, `user_id`, `opened_on`, `rewards`, booster fields, and `created_at` record the claim and its server-generated contents.

2. Security
- Row-level security is enabled.
- Users can read only their own claim history.
- Client writes are denied; `open_daily_crate()` is the only mutation path.
- The function is available only to authenticated users and derives ownership from `auth.uid()`.

3. Reward rules
- Every crate contains exactly five coins.
- Coin tiers use server-side weights of 75%, 20%, and 5% for 10, 30, and 100 points.
- A 35% roll grants a two-times farming booster for one hour.
- A unique user/day key and atomic insert prevent duplicate rewards.
*/

CREATE TABLE IF NOT EXISTS public.daily_crate_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_on date NOT NULL DEFAULT CURRENT_DATE,
  rewards jsonb NOT NULL,
  booster_type text,
  booster_multiplier integer,
  booster_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, opened_on)
);

CREATE INDEX IF NOT EXISTS daily_crate_claims_user_opened_idx
  ON public.daily_crate_claims(user_id, opened_on DESC);

ALTER TABLE public.daily_crate_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own daily crates" ON public.daily_crate_claims;
CREATE POLICY "Users can view own daily crates" ON public.daily_crate_claims
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Daily crates cannot be inserted by clients" ON public.daily_crate_claims;
CREATE POLICY "Daily crates cannot be inserted by clients" ON public.daily_crate_claims
  FOR INSERT TO authenticated WITH CHECK (false);
DROP POLICY IF EXISTS "Daily crates cannot be updated by clients" ON public.daily_crate_claims;
CREATE POLICY "Daily crates cannot be updated by clients" ON public.daily_crate_claims
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Daily crates cannot be deleted by clients" ON public.daily_crate_claims;
CREATE POLICY "Daily crates cannot be deleted by clients" ON public.daily_crate_claims
  FOR DELETE TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.open_daily_crate()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_existing public.daily_crate_claims;
  v_claim public.daily_crate_claims;
  v_rewards jsonb := '[]'::jsonb;
  v_coin integer;
  v_total integer := 0;
  v_booster_type text := NULL;
  v_booster_multiplier integer := NULL;
  v_booster_expires_at timestamptz := NULL;
  i integer;
  r double precision;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated'); END IF;

  SELECT * INTO v_existing FROM public.daily_crate_claims
    WHERE user_id = v_uid AND opened_on = CURRENT_DATE;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already_opened', true, 'opened_on', v_existing.opened_on,
      'rewards', v_existing.rewards, 'booster', CASE WHEN v_existing.booster_type IS NULL THEN NULL ELSE
        jsonb_build_object('type', v_existing.booster_type, 'multiplier', v_existing.booster_multiplier, 'expires_at', v_existing.booster_expires_at) END);
  END IF;

  FOR i IN 1..5 LOOP
    r := random();
    IF r < 0.75 THEN v_coin := 10;
    ELSIF r < 0.95 THEN v_coin := 30;
    ELSE v_coin := 100;
    END IF;
    v_total := v_total + v_coin;
    v_rewards := v_rewards || jsonb_build_object('value', v_coin,
      'tier', CASE v_coin WHEN 10 THEN 'common' WHEN 30 THEN 'silver' ELSE 'diamond' END);
  END LOOP;

  IF random() < 0.35 THEN
    v_booster_type := 'double_farm';
    v_booster_multiplier := 2;
    v_booster_expires_at := now() + interval '1 hour';
  END IF;

  INSERT INTO public.daily_crate_claims (user_id, opened_on, rewards, booster_type, booster_multiplier, booster_expires_at)
  VALUES (v_uid, CURRENT_DATE, v_rewards, v_booster_type, v_booster_multiplier, v_booster_expires_at)
  ON CONFLICT (user_id, opened_on) DO NOTHING RETURNING * INTO v_claim;

  IF NOT FOUND THEN
    SELECT * INTO v_claim FROM public.daily_crate_claims WHERE user_id = v_uid AND opened_on = CURRENT_DATE;
    RETURN jsonb_build_object('ok', true, 'already_opened', true, 'opened_on', v_claim.opened_on,
      'rewards', v_claim.rewards, 'booster', CASE WHEN v_claim.booster_type IS NULL THEN NULL ELSE
        jsonb_build_object('type', v_claim.booster_type, 'multiplier', v_claim.booster_multiplier, 'expires_at', v_claim.booster_expires_at) END);
  END IF;

  INSERT INTO public.user_points (user_id, balance) VALUES (v_uid, v_total)
    ON CONFLICT (user_id) DO UPDATE SET balance = public.user_points.balance + v_total, updated_at = now();
  INSERT INTO public.point_events (user_id, reason, delta) VALUES (v_uid, 'daily_crate', v_total);

  RETURN jsonb_build_object('ok', true, 'already_opened', false, 'opened_on', v_claim.opened_on,
    'rewards', v_claim.rewards, 'booster', CASE WHEN v_claim.booster_type IS NULL THEN NULL ELSE
      jsonb_build_object('type', v_claim.booster_type, 'multiplier', v_claim.booster_multiplier, 'expires_at', v_claim.booster_expires_at) END);
END;
$$;

REVOKE ALL ON FUNCTION public.open_daily_crate() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_daily_crate() TO authenticated;
