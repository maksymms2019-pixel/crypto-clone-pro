CREATE TABLE IF NOT EXISTS public.metrics_cache (
  key text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.metrics_cache TO service_role;

ALTER TABLE public.metrics_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metrics_cache no public access" ON public.metrics_cache
  FOR SELECT TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS idx_metrics_cache_expires ON public.metrics_cache(expires_at);