import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchCoinDetail } from "@/lib/markets";
import { fetchNewsForCoin } from "@/lib/news";
import { translateToUk } from "@/lib/translate";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, getAppUserId } from "@/lib/auth";
import { fmtUsd, fmtPct, fmtCompact, toneFromPct, timeAgo } from "@/lib/format";
import { ArrowLeft, Star, Calculator, ExternalLink, Globe, Twitter, Github, MessageCircle, Newspaper, Languages, Loader2 } from "lucide-react";
import { MetricCard } from "@/components/MetricCard";
import { PriceChart } from "@/components/PriceChart";
import { SeoHead } from "@/components/SeoHead";
import { ErrorState } from "@/components/ErrorState";
import { toast } from "sonner";
import { haptic, openExternal } from "@/lib/telegram";

export default function CoinDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["coin", id],
    queryFn: () => fetchCoinDetail(id!),
    enabled: !!id,
  });

  const news = useQuery({
    queryKey: ["coin-news", id],
    queryFn: () => fetchNewsForCoin(data!.symbol, data!.name, 6),
    enabled: !!data,
    staleTime: 5 * 60_000,
  });

  const watching = useQuery({
    queryKey: ["watch", id, user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("watchlist").select("id").eq("coingecko_id", id!).maybeSingle();
      return !!data;
    },
    enabled: !!id && !!user,
  });

  const toggleWatch = useMutation({
    mutationFn: async () => {
      if (!data || !user) throw new Error("Увійди, щоб користуватись Watchlist");
      if (watching.data) {
        const { error } = await supabase.from("watchlist").delete().eq("coingecko_id", data.id);
        if (error) throw error;
        return false;
      }
      const appUserId = await getAppUserId();
      if (!appUserId) throw new Error("Сесія неактивна — увійди ще раз.");
      const { error } = await supabase
        .from("watchlist")
        .insert({ user_id: appUserId, coingecko_id: data.id, symbol: data.symbol });
      if (error) throw error;
      return true;
    },
    onSuccess: (added) => {
      qc.invalidateQueries({ queryKey: ["watch"] });
      qc.invalidateQueries({ queryKey: ["watchlist"] });
      toast.success(added ? "Додано в Watchlist" : "Прибрано зі списку");
      haptic("success");
    },
    onError: (e) => {
      toast.error((e as Error)?.message ?? "Не вдалось оновити Watchlist");
    },
  });

  if (isError) {
    return (
      <div className="space-y-4">
        <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
          <ArrowLeft size={16} /> Назад
        </button>
        <ErrorState
          title="Не вдалось завантажити монету"
          description="Дані ринку тимчасово недоступні. Спробуй за хвилину."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-6 w-24" />
        <div className="skeleton h-32 w-full" />
        <div className="skeleton h-64 w-full" />
      </div>
    );
  }

  const tone = toneFromPct(data.price_change_percentage_24h);
  const supplyPct = data.max_supply && data.circulating_supply
    ? Math.min(100, (data.circulating_supply / data.max_supply) * 100)
    : null;
  const volMcap = data.market_cap > 0 ? (data.total_volume / data.market_cap) * 100 : null;
  const fromAth = data.ath_change_percentage;

  return (
    <div className="space-y-4">
      <SeoHead title={`${data.name} ${fmtUsd(data.current_price, { digits: data.current_price < 1 ? 4 : 2 })}`} description={`Ціна ${data.name} (${data.symbol.toUpperCase()}), графік, ATH/ATL, метрики, новини.`} />

      <button onClick={() => nav(-1)} className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Назад">
        <ArrowLeft size={16} /> Назад
      </button>

      <header className="flex items-center gap-3">
        {data.image && <img src={data.image} alt={data.symbol} className="h-12 w-12 rounded-full" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="display text-xl font-semibold leading-tight truncate">{data.name}</h1>
            {data.market_cap_rank && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--gold)]/15 text-[var(--gold)]">#{data.market_cap_rank}</span>
            )}
          </div>
          <div className="text-xs text-[var(--text-muted)]">{data.symbol.toUpperCase()}</div>
        </div>
        {user && (
          <button
            onClick={() => toggleWatch.mutate()}
            aria-label={watching.data ? "Прибрати з Watchlist" : "Додати в Watchlist"}
            className={`p-2 rounded-xl border ${watching.data ? "border-[var(--gold)] bg-[var(--gold)]/10 text-[var(--gold)]" : "border-[var(--line)] text-[var(--text-muted)]"}`}>
            <Star size={16} fill={watching.data ? "currentColor" : "none"} />
          </button>
        )}
      </header>

      <div className="mcard">
        <div className={`mcard__glow mcard__glow--${tone}`} />
        <div className="relative">
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Ціна</div>
          <div className="mt-1 display text-[36px] font-bold leading-none gold-shimmer tabular-nums">{fmtUsd(data.current_price, { digits: data.current_price < 1 ? 4 : 2 })}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className={`tabular-nums font-medium ${tone === "up" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
              {fmtPct(data.price_change_percentage_24h)} <span className="text-[var(--text-muted)] text-xs">24h</span>
            </span>
            <span className={`tabular-nums ${toneFromPct(data.price_change_percentage_7d) === "up" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>{fmtPct(data.price_change_percentage_7d)} <span className="text-[10px] text-[var(--text-muted)]">7d</span></span>
            <span className={`tabular-nums ${toneFromPct(data.price_change_percentage_30d) === "up" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>{fmtPct(data.price_change_percentage_30d)} <span className="text-[10px] text-[var(--text-muted)]">30d</span></span>
            {data.price_change_percentage_1y != null && (
              <span className={`tabular-nums ${toneFromPct(data.price_change_percentage_1y) === "up" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>{fmtPct(data.price_change_percentage_1y)} <span className="text-[10px] text-[var(--text-muted)]">1y</span></span>
            )}
          </div>
          {data.high_24h != null && data.low_24h != null && (
            <div className="mt-3 text-[11px] text-[var(--text-muted)] flex items-center gap-3 tabular-nums">
              <span>L: <span className="text-[var(--danger)]">{fmtUsd(data.low_24h, { digits: data.low_24h < 1 ? 4 : 2 })}</span></span>
              <span>H: <span className="text-[var(--accent)]">{fmtUsd(data.high_24h, { digits: data.high_24h < 1 ? 4 : 2 })}</span></span>
            </div>
          )}
        </div>
      </div>

      <PriceChart coinId={data.id} symbol={data.symbol} />

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <ActionButton to={`/portfolio?add=${data.id}`} icon={Star} label="В портфель" />
        <ActionButton to={`/calc?from=${data.id}`} icon={Calculator} label="Конвертер" />
      </div>

      {/* Detailed metrics */}
      <section>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Метрики</h2>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard label="Капіталізація" value={fmtUsd(data.market_cap, { compact: true })} hint={data.market_cap_rank ? `Ранг #${data.market_cap_rank}` : undefined} />
          <MetricCard label="Об'єм 24h" value={fmtUsd(data.total_volume, { compact: true })} hint={volMcap != null ? `${volMcap.toFixed(1)}% від MCap` : undefined} />
          <MetricCard label="FDV" value={data.fully_diluted_valuation ? fmtUsd(data.fully_diluted_valuation, { compact: true }) : "—"} />
          <MetricCard
            label="ATH"
            value={fmtUsd(data.ath, { digits: data.ath < 1 ? 4 : 2 })}
            tone={fromAth != null && fromAth > -10 ? "up" : "down"}
            hint={fromAth != null ? `${fmtPct(fromAth, 1)} від ATH` : undefined}
          />
          <MetricCard label="ATL" value={fmtUsd(data.atl, { digits: data.atl < 1 ? 4 : 2 })} tone="up" hint={data.atl_change_percentage != null ? `${fmtPct(data.atl_change_percentage, 0)} від ATL` : undefined} />
          <MetricCard
            label="Циркуляція"
            value={data.circulating_supply ? fmtCompact(data.circulating_supply, 1) : "—"}
            hint={data.max_supply ? `Max: ${fmtCompact(data.max_supply, 1)}` : data.total_supply ? `Total: ${fmtCompact(data.total_supply, 1)}` : undefined}
          />
        </div>
        {supplyPct != null && (
          <div className="mt-3 surface px-3 py-2.5">
            <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] mb-1.5">
              <span>Випущено від макс. сапплая</span>
              <span className="tabular-nums text-[var(--text)] font-semibold">{supplyPct.toFixed(1)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[var(--gold)] to-[var(--accent)]" style={{ width: `${supplyPct}%` }} />
            </div>
          </div>
        )}
      </section>


      {/* Social links */}
      {(data.homepage || data.twitter || data.reddit || data.github) && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Посилання</h2>
          <div className="grid grid-cols-2 gap-2">
            {data.homepage && <LinkChip href={data.homepage} icon={Globe} label="Сайт" />}
            {data.twitter && <LinkChip href={data.twitter} icon={Twitter} label="Twitter / X" />}
            {data.reddit && <LinkChip href={data.reddit} icon={MessageCircle} label="Reddit" />}
            {data.github && <LinkChip href={data.github} icon={Github} label="GitHub" />}
          </div>
        </section>
      )}

      {/* News for this coin */}
      {news.data && news.data.length > 0 && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
            <Newspaper size={12} /> Новини про {data.name}
          </h2>
          <div className="surface divide-y divide-[var(--line)]">
            {news.data.map((n) => (
              <button
                key={n.id}
                onClick={() => openExternal(n.url)}
                className="w-full text-left p-3 hover:bg-white/[.02] transition-colors flex gap-3"
              >
                {n.image_url ? (
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-center bg-cover" style={{ backgroundImage: `url(${n.image_url})` }} />
                ) : (
                  <div className="h-14 w-14 shrink-0 rounded-lg bg-white/[.04] flex items-center justify-center">
                    <Newspaper size={18} className="text-[var(--text-muted)]" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium leading-snug line-clamp-2">{n.title}</div>
                  <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                    <span className="text-[var(--gold)] font-semibold">{n.source}</span>
                    <span>·</span>
                    <span>{timeAgo(n.published_at)} тому</span>
                  </div>
                </div>
                <ExternalLink size={12} className="text-[var(--text-muted)] shrink-0 mt-1" />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* About */}
      {typeof data.description === "string" && data.description.trim().length > 0 && (
        <CoinAbout html={data.description} />
      )}
    </div>
  );
}

function ActionButton({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <Link to={to} className="surface flex flex-col items-center gap-1 px-3 py-3 text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:border-[var(--line-strong)] transition-colors">
      <Icon size={16} />
      {label}
    </Link>
  );
}

function LinkChip({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="surface flex items-center gap-2 px-3 py-2.5 text-xs text-[var(--text)] hover:border-[var(--line-strong)] transition-colors"
    >
      <Icon size={14} className="text-[var(--gold)]" />
      <span className="flex-1 truncate">{label}</span>
      <ExternalLink size={12} className="text-[var(--text-muted)]" />
    </a>
  );
}

function CoinAbout({ html }: { html: string }) {
  const [uk, setUk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showUk, setShowUk] = useState(false);

  // Auto-translate on first render — small, async, cached. Users see UA by default
  // and can toggle back to the original via the button.
  useEffect(() => {
    let cancel = false;
    setBusy(true);
    translateToUk(html, "coin_description")
      .then((res) => { if (!cancel) { setUk(res); setShowUk(true); } })
      .finally(() => { if (!cancel) setBusy(false); });
    return () => { cancel = true; };
  }, [html]);

  const body = showUk && uk ? uk : html;

  return (
    <div className="surface p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Про монету</div>
        <button
          onClick={() => setShowUk((v) => !v)}
          disabled={busy || !uk}
          className="inline-flex items-center gap-1 text-[10px] text-[var(--gold)] disabled:opacity-50"
        >
          {busy
            ? <Loader2 size={11} className="animate-spin" />
            : <Languages size={11} />}
          {showUk ? "EN" : "UA"}
        </button>
      </div>
      <p className="text-sm leading-relaxed text-[var(--text-muted)]" dangerouslySetInnerHTML={{ __html: body }} />
    </div>
  );
}

