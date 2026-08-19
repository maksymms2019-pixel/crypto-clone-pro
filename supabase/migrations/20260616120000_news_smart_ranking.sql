-- Smart news ranking: importance score, story clusters, click tracking.
alter table public.news_cache
  add column if not exists importance_score numeric not null default 0,
  add column if not exists cluster_id text,
  add column if not exists cluster_size int not null default 1,
  add column if not exists click_count int not null default 0;

create index if not exists idx_news_score_pub
  on public.news_cache (importance_score desc, published_at desc);

create index if not exists idx_news_cluster
  on public.news_cache (cluster_id, published_at desc);

create or replace function public.bump_news_click(_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.news_cache set click_count = click_count + 1 where id = _id;
$$;

grant execute on function public.bump_news_click(uuid) to anon, authenticated;
