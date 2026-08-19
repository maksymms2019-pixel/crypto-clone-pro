import { useQuery } from "@tanstack/react-query";
import { fetchGlobal, fetchFearGreed, fetchMarkets } from "@/lib/markets";
import { MetricCard } from "@/components/MetricCard";
import { PageHeader } from "@/components/PageHeader";
import { BrandWordmark } from "@/components/BrandLogo";
import { PriceTicker } from "@/components/PriceTicker";
import { SeoHead } from "@/components/SeoHead";
import { fmtUsd, fmtPct, toneFromPct } from "@/lib/format";
import { Sparkline } from "@/components/Sparkline";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Plus, Map, Sparkles, Send } from "lucide-react";
import { isInTelegram } from "@/lib/telegram";
import { useAuth } from "@/lib/auth";
import { FearGreedGauge } from "@/components/FearGreedGauge";
import { GainersLosers } from "@/components/GainersLosers";
import { TrendingRail } from "@/components/TrendingRail";
import { MarketMetrics } from "@/components/MarketMetrics";
import { fetchMarketMetrics } from "@/lib/metrics";

export default function Dashboard() {
  const { user } = useAuth();
  const global = useQuery({ queryKey: ["global"], queryFn: fetchGlobal });
  const fg = useQuery({ queryKey: ["fg"], queryFn: fetchFearGreed });
  const metrics = useQuery({ queryKey: ["market-metrics"], queryFn: fetchMarketMetrics, staleTime: 300_000 });
  const top = useQuery({
    queryKey: ["markets", "top", 8],
    queryFn: () => fetchMarkets({ perPage: 8, sparkline: true }),
  });
  const btc = useQuery({
    queryKey: ["markets", "btc"],
    queryFn: () => fetchMarkets({ ids: ["bitcoin"], perPage: 1, sparkline: true }),
    select: (rows) => rows?.[0],
  });

  const totalCap = global.data?.total_market_cap_usd;
  const capChange = global.data?.market_cap_change_percentage_24h_usd;
  const fgTone: "up" | "down" | "neutral" =
    fg.data == null ? "neutral" : fg.data.value >= 60 ? "up" : fg.data.value <= 40 ? "down" : "neutral";

  return (
    <div className="space-y-5">
      <SeoHead title="CryptoTime · Крипто-огляд" description="Реал-тайм ціни, портфоліо та новини крипто українською." />

      <PriceTicker />

      <PageHeader
        showLogo
        title={isInTelegram() ? "Привіт 👋" : "CryptoTime"}
        subtitle="З поверненням"
        right={
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <span className="live-dot" /> Live
          </div>
        }
      />

      {/* HERO — BTC card with golden ring echo */}
      <section className="hero-ring relative mcard p-5">
        <div className="mcard__glow mcard__glow--neutral" />
        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
              <img src={btc.data?.image} alt="" className="h-4 w-4 rounded-full" />
              Bitcoin · BTC
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <div className="display text-[40px] font-bold leading-none gold-shimmer tabular-nums">
                {btc.isLoading ? "—" : fmtUsd(btc.data?.current_price, { digits: 0 })}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span
                className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
                  (btc.data?.price_change_percentage_24h ?? 0) >= 0
                    ? "text-[var(--accent)]"
                    : "text-[var(--danger)]"
                }`}
              >
                {(btc.data?.price_change_percentage_24h ?? 0) >= 0 ? (
                  <ArrowUpRight size={14} />
                ) : (
                  <ArrowDownRight size={14} />
                )}
                {fmtPct(btc.data?.price_change_percentage_24h)}
              </span>
              <span className="text-[var(--text-muted)]">за 24 год</span>
            </div>
          </div>
          {btc.data?.sparkline_in_7d?.price && (
            <div className="shrink-0">
              <Sparkline data={btc.data.sparkline_in_7d.price} tone="auto" width={120} height={48} />
            </div>
          )}
        </div>
        <div className="hairline-gold mt-4" />
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Cap</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums">
              {fmtUsd(btc.data?.market_cap, { compact: true })}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Dominance</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums num-glow-gold">
              {global.data ? `${global.data.btc_dominance.toFixed(1)}%` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">F&G</div>
            <div
              className={`mt-0.5 text-sm font-semibold tabular-nums ${
                fgTone === "up" ? "num-glow-up" : fgTone === "down" ? "num-glow-down" : ""
              }`}
            >
              {fg.data?.value ?? "—"}
            </div>
          </div>
        </div>
      </section>

      {/* SECONDARY METRICS */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="Капіталізація"
          value={fmtUsd(totalCap, { compact: true })}
          hint={
            <span className={toneFromPct(capChange) === "up" ? "text-[var(--accent)]" : "text-[var(--danger)]"}>
              {fmtPct(capChange)} 24h
            </span>
          }
          tone={toneFromPct(capChange)}
          loading={global.isLoading}
        />
        <MetricCard
          label="Об'єм 24h"
          value={fmtUsd(global.data?.total_volume_usd, { compact: true })}
          hint={
            <span className="text-[var(--text-muted)]">
              {global.data?.active_cryptocurrencies?.toLocaleString() ?? "—"} монет
            </span>
          }
          tone="neutral"
          loading={global.isLoading}
        />
      </div>

      {/* FEAR & GREED + ETH DOMINANCE */}
      <div className="grid grid-cols-1 gap-3">
        <FearGreedGauge />
      </div>

      {/* ETH DOMINANCE + ALTSEASON INDEX (compact) */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          label="ETH Dominance"
          value={global.data ? `${global.data.eth_dominance.toFixed(1)}%` : "—"}
          hint={<span className="text-[var(--text-muted)]">з усього ринку</span>}
          tone="neutral"
          loading={global.isLoading}
        />
        <section className="surface p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            <AltcoinsGlyph />
            Індекс альтсезону
          </div>
          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="display text-[22px] font-bold tabular-nums">
              {metrics.isLoading ? "—" : metrics.data?.altseason_index ?? "—"}
            </span>
            <span className="text-xs text-[var(--text-muted)]">/100</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg)]">
            <div
              className="h-full rounded-full bg-[var(--info)] transition-all"
              style={{ width: `${metrics.data?.altseason_index ?? 0}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-[var(--text-muted)]">
            {metrics.data?.altseason_label ?? "BTC проти альткоїнів"}
          </div>
        </section>
      </div>

      {/* MARKET METRICS */}
      <MarketMetrics />

      {/* AI ANALYST */}
      <Link to="/assistant" className="surface block p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(231,182,80,.10)" }}>
            <Sparkles size={18} className="text-[var(--gold)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">AI-аналітик ринку</div>
            <div className="text-xs text-[var(--text-muted)]">Запитай про монети, метрики й тренди</div>
          </div>
          <span className="chip" data-active="true">Відкрити</span>
        </div>
      </Link>

      {/* TRENDING */}
      <TrendingRail />

      {/* GAINERS / LOSERS */}
      <GainersLosers />

      {/* PORTFOLIO TEASER */}
      <section className="surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Мій портфель</div>
            <div className="mt-1 display text-[22px] font-semibold">{user ? "Відкрити" : "—"}</div>
            <div className="text-xs text-[var(--text-muted)]">
              {user ? "Перейди, щоб додати угоду і бачити P&L." : "Увійди, щоб бачити P&L і equity-кривy."}
            </div>
          </div>
          <Link to={user ? "/portfolio" : "/auth"} className="chip" data-active="true">
            <Plus size={14} /> {user ? "Додати" : "Увійти"}
          </Link>
        </div>
      </section>

      {/* TOP COINS */}
      <section>
        <header className="mb-2 flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Топ монети
          </h2>
          <Link to="/markets" className="text-xs text-[var(--gold)]">
            Усі →
          </Link>
        </header>
        <div className="surface divide-y divide-[var(--line)]">
          {top.isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="skeleton h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-3 w-20" />
                    <div className="skeleton h-2 w-12" />
                  </div>
                  <div className="skeleton h-3 w-16" />
                </div>
              ))
            : top.data?.map((c) => (
                <Link
                  key={c.id}
                  to={`/coin/${c.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[.02]"
                >
                  <img src={c.image} alt={c.symbol} className="h-8 w-8 rounded-full" loading="lazy" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.symbol.toUpperCase()}</span>
                      <span className="text-xs text-[var(--text-muted)] truncate">{c.name}</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] tabular-nums">{fmtUsd(c.current_price)}</div>
                  </div>
                  {c.sparkline_in_7d?.price && (
                    <Sparkline data={c.sparkline_in_7d.price} tone="auto" />
                  )}
                  <div
                    className={`flex items-center gap-0.5 text-sm font-medium tabular-nums ${
                      c.price_change_percentage_24h >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"
                    }`}
                  >
                    {c.price_change_percentage_24h >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(c.price_change_percentage_24h).toFixed(2)}%
                  </div>
                </Link>
              ))}
        </div>
      </section>


      {/* HEATMAP TEASER */}
      <section className="surface p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(109,168,255,.10)" }}>
            <Map size={18} className="text-[var(--info)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">Heatmap топ-100</div>
            <div className="text-xs text-[var(--text-muted)]">Карта ринку за капіталізацією і 24h</div>
          </div>
          <Link to="/heatmap" className="chip">Відкрити</Link>
        </div>
      </section>

      <a
        href="https://t.me/cryptotime_tg"
        target="_blank"
        rel="noreferrer"
        className="surface flex items-center gap-3 p-4"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(90,200,224,.10)" }}>
          <Send size={18} className="text-[var(--cyan)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Наш Telegram-канал</div>
          <div className="text-xs text-[var(--text-muted)]">Новини, сигнали та апдейти CryptoTime</div>
        </div>
        <span className="chip">Підписатись</span>
      </a>

      <footer className="pt-2 text-center text-[10px] text-[var(--text-dim)]">
        <BrandWordmark className="text-[13px]" />
      </footer>
    </div>
  );
}

// Altcoin season glyph: three bars (alts) with the middle one taller and
// brighter — reads as "altcoins outperforming" at icon size, with a small
// up-arrow on top of the leading bar.
function AltcoinsGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="9.5" width="3" height="4.5" rx="0.6" fill="var(--gold)" opacity="0.55" />
      <rect x="6.5" y="5" width="3" height="9" rx="0.6" fill="var(--gold)" />
      <rect x="11" y="7.5" width="3" height="6.5" rx="0.6" fill="var(--gold)" opacity="0.7" />
      <path d="M8 2 L10 4 L9 4 L9 4.5 L7 4.5 L7 4 L6 4 Z" fill="var(--accent)" />
    </svg>
  );
}

