
-- Fix news_cache: drop FK and convert cluster_id to text, add ranking columns
ALTER TABLE public.news_cache DROP CONSTRAINT IF EXISTS news_cache_cluster_id_fkey;
ALTER TABLE public.news_cache ALTER COLUMN cluster_id TYPE text USING cluster_id::text;
ALTER TABLE public.news_cache ADD COLUMN IF NOT EXISTS importance_score numeric NOT NULL DEFAULT 0;
ALTER TABLE public.news_cache ADD COLUMN IF NOT EXISTS click_count int NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS news_cache_cluster_idx ON public.news_cache (cluster_id, published_at DESC);
CREATE INDEX IF NOT EXISTS news_cache_importance_idx ON public.news_cache (importance_score DESC, published_at DESC);

CREATE OR REPLACE FUNCTION public.bump_news_click(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.news_cache SET click_count = click_count + 1 WHERE id = _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bump_news_click(uuid) TO anon, authenticated;
