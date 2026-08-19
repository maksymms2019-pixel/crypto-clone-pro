
ALTER TABLE public.news_cache ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.news_cache ADD COLUMN IF NOT EXISTS summary text;
