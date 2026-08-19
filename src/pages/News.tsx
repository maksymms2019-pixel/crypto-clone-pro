import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNews, refreshNews, bumpClick, clusterAndRank, type NewsItem, type NewsCluster } from "@/lib/news";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { SeoHead } from "@/components/SeoHead";
import { Newspaper, RefreshCw, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { timeAgo } from "@/lib/format";
import { toast } from "sonner";
import { openExternal } from "@/lib/telegram";

const FILTERS = ["Головне", "BTC", "ETH", "ETF", "Регуляції", "Макро", "Геополітика", "Безпека", "SOL", "DeFi", "AI", "Меми"] as const;
type Filter = (typeof FILTERS)[number];

function isValidHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function badgeFor(item: NewsItem): { label: string; tone: string } | null {
  const ageH = (Date.now() - new Date(item.published_at).getTime()) / 3_600_000;
  if (ageH < 1 && (item.importance_score ?? 0) >= 10) {
    return { label: "Щойно", tone: "text-[var(--gold)]" };
  }
  if (item.tags?.includes("ETF")) return { label: "ETF", tone: "text-[var(--accent)]" };
  if (item.tags?.includes("Регуляції")) return { label: "Регуляції", tone: "text-[var(--cyan)]" };
  if (item.tags?.includes("Геополітика")) return { label: "Геополітика", tone: "text-[var(--warn)]" };
  return null;
}

export default function News() {
  const [filter, setFilter] = useState<Filter>("Головне");
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const lastRefreshRef = useRef<number>(0);

  const news = useQuery({
    queryKey: ["news"],
    queryFn: () => fetchNews(120),
    staleTime: 5 * 60_000,
    refetchInterval: 2 * 60_000,
    refetchOnWindowFocus: false,
    placeholderData: (prev) => prev,
  });

  const filtered = useMemo<NewsItem[]>(() => {
    const all = news.data ?? [];
    if (filter === "Головне") return all;
    return all.filter((n) => n.tags?.includes(filter as string));
  }, [news.data, filter]);

  const clusters = useMemo<NewsCluster[]>(() => clusterAndRank(filtered), [filtered]);
  const heroCluster = clusters[0];
  const showHero = Boolean(heroCluster?.lead.image_url && isValidHttpUrl(heroCluster.lead.url));
  const restClusters = showHero ? clusters.slice(1) : clusters;

  function dispTitle(n: NewsItem): string {
    return n.title;
  }
  function dispSummary(n: NewsItem): string | null {
    return n.summary;
  }

  function openNews(item: NewsItem) {
    bumpClick(item.id);
    openExternal(item.url);
  }
  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function doRefresh() {
    if (refreshing) return;
    // Debounce manual refresh to 10s so the edge function isn't spammed.
    const since = Date.now() - lastRefreshRef.current;
    if (since < 10_000) {
      toast.message(`Зачекай ${Math.ceil((10_000 - since) / 1000)} с`);
      return;
    }
    lastRefreshRef.current = Date.now();
    setRefreshing(true);
    try {
      const r = await refreshNews() as { inserted?: number };
      toast.success(`Оновлено · ${r?.inserted ?? 0} нових`);
      await news.refetch();
    } catch (e) {
      toast.error("Не вдалось оновити");
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }

  // First-load bootstrap: if cache is empty or stale, trigger a background refresh once.
  const bootRef = useRef(false);
  useEffect(() => {
    if (bootRef.current) return;
    if (news.isLoading) return;
    bootRef.current = true;
    const newest = news.data?.[0]?.published_at;
    const stale = !newest || (Date.now() - new Date(newest).getTime()) > 10 * 60_000;
    if (stale) {
      (async () => {
        try { await refreshNews(); await news.refetch(); } catch (e) { console.error("[news] boot refresh failed", e); }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [news.isLoading]);

  return (
    <div className="space-y-4">
      <SeoHead title="Новини крипто" description="Свіжі крипто-новини з 20+ провідних джерел, українською." />
      <PageHeader
        title="Новини"
        subtitle="Оновлюється кожні 2 хвилини"
        right={
          <div className="flex items-center gap-2">
            <button onClick={doRefresh} disabled={refreshing} className="chip">
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Оновити
            </button>
          </div>
        }
      />
      {/* Hero story */}
      {showHero && heroCluster && (
        <div className="surface overflow-hidden">
          <button
            onClick={() => openNews(heroCluster.lead)}
            className="block w-full text-left"
          >
            <div className="relative h-[200px] w-full bg-center bg-cover" style={{ backgroundImage: `url(${heroCluster.lead.image_url})` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[var(--bg)]/40 to-transparent" />
              {badgeFor(heroCluster.lead) && (
                <div className={`absolute top-3 left-3 rounded-full bg-black/60 backdrop-blur px-2.5 py-1 text-[10px] font-bold ${badgeFor(heroCluster.lead)!.tone}`}>
                  {badgeFor(heroCluster.lead)!.label}
                </div>
              )}
            </div>
            <div className="p-4">
              <div className="text-[10px] uppercase tracking-wider text-[var(--gold)] font-semibold">{heroCluster.lead.source}</div>
              <div className="mt-1.5 text-base font-bold leading-snug line-clamp-3">{dispTitle(heroCluster.lead)}</div>
              <div className="mt-2 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                <span>{timeAgo(heroCluster.lead.published_at)} тому</span>
                {heroCluster.related.length > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-[var(--cyan)]">+{heroCluster.related.length} інших джерел</span>
                  </>
                )}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {FILTERS.map((f) => (
          <button key={f} className="chip whitespace-nowrap" data-active={filter === f} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>

      {news.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="surface p-3 flex gap-3">
              <div className="skeleton h-16 w-16 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-3/4" />
                <div className="skeleton h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : news.isError ? (
        <EmptyState
          icon={Newspaper}
          tone="cyan"
          title="Не вдалось завантажити новини"
          description={(news.error as Error)?.message ?? "Спробуй ще раз."}
          action={
            <button onClick={() => news.refetch()} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-[#1A0F00]" style={{ background: "var(--grad-active)" }}>
              <RefreshCw size={14} /> Спробувати ще
            </button>
          }
        />
      ) : restClusters.length === 0 && !heroCluster ? (
        <EmptyState
          icon={Newspaper}
          tone="cyan"
          title={news.data?.length ? "Нічого за цим фільтром" : "Новин ще немає"}
          description={news.data?.length ? "Спробуй інший таг або «Головне»." : "Зачекай — підтягуємо свіжі з джерел."}
        />
      ) : (
        <div className="space-y-2">
          {restClusters.map((cl) => {
            const n = cl.lead;
            const badge = badgeFor(n);
            const isOpen = expanded.has(n.id);
            return (
              <div key={n.id} className="surface overflow-hidden">
                <button
                  onClick={() => openNews(n)}
                  className="block w-full text-left p-3 hover:bg-white/[.02] transition-colors"
                >
                  <div className="flex items-start gap-3">
                    {n.image_url ? (
                      <div className="h-16 w-16 shrink-0 rounded-lg bg-center bg-cover" style={{ backgroundImage: `url(${n.image_url})` }} />
                    ) : (
                      <div className="h-16 w-16 shrink-0 rounded-lg bg-white/[.04] flex items-center justify-center">
                        <Newspaper size={20} className="text-[var(--text-muted)]" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      {badge && (
                        <div className="mb-0.5">
                          <span className={`text-[9px] font-bold ${badge.tone}`}>{badge.label}</span>
                        </div>
                      )}
                      <div className="text-sm font-medium leading-snug line-clamp-2">{dispTitle(n)}</div>
                      {dispSummary(n) && (
                        <div className="mt-1 text-[11px] leading-snug text-[var(--text-muted)] line-clamp-2">
                          {dispSummary(n)}
                        </div>
                      )}
                      <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] flex-wrap">
                        <span className="text-[var(--gold)] font-semibold">{n.source}</span>
                        <span>·</span>
                        <span>{timeAgo(n.published_at)} тому</span>
                        {n.tags?.slice(0, 2).map((t) => (
                          <span key={t} className="rounded-full bg-white/5 px-1.5 py-0.5">{t}</span>
                        ))}
                      </div>
                    </div>
                    <ExternalLink size={13} className="text-[var(--text-muted)] mt-0.5 shrink-0" />
                  </div>
                </button>
                {cl.related.length > 0 && (
                  <>
                    <button
                      onClick={() => toggleExpand(n.id)}
                      className="w-full px-3 py-1.5 text-[10px] text-[var(--cyan)] hover:bg-white/[.02] flex items-center justify-center gap-1 border-t border-[var(--line)]"
                    >
                      {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      +{cl.related.length} інших джерел про це
                    </button>
                    {isOpen && (
                      <div className="px-3 pb-2 space-y-1 border-t border-[var(--line)]">
                        {cl.related.map((r) => (
                          <button
                            key={r.id}
                            onClick={() => openNews(r)}
                            className="w-full text-left py-1.5 text-[11px] hover:text-[var(--text)] text-[var(--text-muted)] flex items-center gap-2"
                          >
                            <span className="text-[var(--gold)] font-semibold shrink-0">{r.source}</span>
                            <span className="truncate">{dispTitle(r)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

