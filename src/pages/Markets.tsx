import { useQuery } from "@tanstack/react-query";
import { fetchMarkets } from "@/lib/markets";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { Sparkline } from "@/components/Sparkline";
import { SeoHead } from "@/components/SeoHead";
import { EmptyState } from "@/components/EmptyState";
import { fmtUsd } from "@/lib/format";
import { Link } from "react-router-dom";
import { useState, useMemo } from "react";
import { Search, Star, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from "lucide-react";

type Tab = "top" | "gainers" | "losers" | "watch";

const TABS: { id: Tab; label: string }[] = [
  { id: "top", label: "Топ" },
  { id: "gainers", label: "Гейнери" },
  { id: "losers", label: "Лузери" },
  { id: "watch", label: "Watchlist" },
];

export default function Markets() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("top");
  const [perPage, setPerPage] = useState<50 | 100 | 250>(100);

  const { data, isLoading } = useQuery({
    queryKey: ["markets", "p1", perPage],
    queryFn: () => fetchMarkets({ perPage, sparkline: true }),
  });

  const watch = useQuery({
    queryKey: ["watchlist", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("watchlist").select("coingecko_id");
      return new Set((data ?? []).map((r) => r.coingecko_id));
    },
    enabled: !!user,
  });

  const filtered = useMemo(() => {
    let list = data ?? [];
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter((c) => c.symbol.includes(s) || c.name.toLowerCase().includes(s));
    }
    if (tab === "gainers") list = [...list].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h).slice(0, 50);
    else if (tab === "losers") list = [...list].sort((a, b) => a.price_change_percentage_24h - b.price_change_percentage_24h).slice(0, 50);
    else if (tab === "watch") list = list.filter((c) => watch.data?.has(c.id));
    return list;
  }, [data, q, tab, watch.data]);

  return (
    <div className="space-y-3">
      <SeoHead title="Ринки крипто" description="Топ криптовалют у реальному часі — ціна, капіталізація, графік за 24 години." />
      <PageHeader title="Ринки" subtitle={`Топ-${perPage} за капіталізацією`} />

      <div className="sticky top-[var(--sa-top)] z-20 -mx-4 px-4 py-2 backdrop-blur" style={{ background: "rgba(6,20,28,.85)" }}>
        <div className="relative mb-2">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Пошук BTC, ETH, SOL…"
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--gold)]"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className="chip whitespace-nowrap" data-active={tab === t.id}>
              {t.id === "gainers" && <TrendingUp size={12} />}
              {t.id === "losers" && <TrendingDown size={12} />}
              {t.id === "watch" && <Star size={12} />}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "watch" && !user ? (
        <EmptyState icon={Star} title="Watchlist для авторизованих" description="Увійди, щоб зберігати улюблені монети." />
      ) : tab === "watch" && filtered.length === 0 ? (
        <EmptyState icon={Star} title="Watchlist порожній" description="Відкрий монету і додай у Watchlist кнопкою із зіркою." />
      ) : (
        <>
          <div className="surface divide-y divide-[var(--line)]">
            {isLoading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3">
                    <div className="skeleton h-8 w-8 rounded-full" />
                    <div className="flex-1 space-y-2"><div className="skeleton h-3 w-20" /><div className="skeleton h-2 w-12" /></div>
                    <div className="skeleton h-3 w-16" />
                  </div>
                ))
              : filtered.map((c, i) => (
                  <Link key={c.id} to={`/coin/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[.02] transition-colors">
                    <span className="text-[10px] text-[var(--text-dim)] tabular-nums w-5">{c.market_cap_rank ?? i + 1}</span>
                    <img src={c.image} alt={c.symbol} className="h-8 w-8 rounded-full" loading="lazy" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.symbol.toUpperCase()}</span>
                        <span className="text-xs text-[var(--text-muted)] truncate">{c.name}</span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] tabular-nums">{fmtUsd(c.current_price, { digits: c.current_price < 1 ? 4 : 2 })}</div>
                    </div>
                    {c.sparkline_in_7d?.price && <Sparkline data={c.sparkline_in_7d.price} tone="auto" />}
                    <div className={`min-w-[64px] text-right text-sm font-medium tabular-nums inline-flex items-center justify-end gap-0.5 ${c.price_change_percentage_24h >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                      {c.price_change_percentage_24h >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                      {Math.abs(c.price_change_percentage_24h).toFixed(2)}%
                    </div>
                  </Link>
                ))}
          </div>

          {!isLoading && tab === "top" && (
            <div className="flex justify-center gap-2 pt-2 pb-4">
              {([50, 100, 250] as const).map((n) => (
                <button key={n} onClick={() => setPerPage(n)} className="chip" data-active={perPage === n}>
                  {n}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
