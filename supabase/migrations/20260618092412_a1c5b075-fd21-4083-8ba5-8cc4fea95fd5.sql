GRANT EXECUTE ON FUNCTION public.current_tg_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_app_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_news_click(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_point(text, integer, integer) TO authenticated;