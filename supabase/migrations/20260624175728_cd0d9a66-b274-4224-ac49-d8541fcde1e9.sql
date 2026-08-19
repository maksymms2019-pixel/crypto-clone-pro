ALTER TABLE public.news_cache ADD COLUMN IF NOT EXISTS title_uk text;

CREATE TABLE IF NOT EXISTS public.translation_cache (
  key text PRIMARY KEY,
  text_uk text NOT NULL,
  kind text NOT NULL DEFAULT 'generic',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.translation_cache TO anon, authenticated;
GRANT ALL ON public.translation_cache TO service_role;
ALTER TABLE public.translation_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "translations readable to all" ON public.translation_cache FOR SELECT USING (true);