import { useEffect, useState } from "react"; // ДОДАНО useEffect та useState
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
import { syncCoinsToBot } from "@/App";

const API_URL = "http://95.182.82.131:8000";

export default function Dashboard() {
  const { user } = useAuth();
  const [localCoins, setLocalCoins] = useState<number | null>(null); // ДОДАНО для завантаження балансу

  // ДОДАНО: Завантажуємо баланс з сервера при відкритті
  useEffect(() => {
    if (user?.id && window.Telegram?.WebApp) {
      fetch(`${API_URL}/api/user/${user.id}`)
        .then(res => res.json())
        .then(data => {
          if (data.exists) {
            setLocalCoins(data.coins);
          } else {
            setLocalCoins(0);
          }
        })
        .catch(err => console.error("Не вдалося завантажити монети:", err));
    }
  }, [user?.id]);

  // ДОДАНО: Якщо локальні монети змінилися, синхронізуємо з ботом
  useEffect(() => {
    if (localCoins !== null) {
      syncCoinsToBot(localCoins);
    }
  }, [localCoins]);

  // ДОДАНО: Функція для збору монети
  const handleCollectCoin = () => {
    setLocalCoins(prev => (prev ?? 0) + 1);
  };

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

      {/* ДОДАНО: Блок з монетами та кнопкою збору (приклад) */}
      <section className="surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Твій баланс</div>
            <div className="display text-[22px] font-semibold">{localCoins ?? "..."} монет</div>
          </div>
          <button onClick={handleCollectCoin} className="chip" data-active="true">+1</button>
        </div>
      </section>

      {/* HERO — BTC card */}
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

      {/* ... Решта коду Dashboard.tsx без змін (всі секції нижче) ... */}
      
      {/* REPLACE EVERYTHING BELOW HERE WITH YOUR EXISTING DASHBOARD CODE AFTER THE HERO SECTION */}
      {/* ПРОСТО ВСТАВ ТУТ ВЕСЬ СВІЙ СТАРИЙ КОД З DASHBOARD ПІСЛЯ HERO SECTION */}
      
      {/* Нижче - приклад, щоб показати, що решта коду залишається без змін */}
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
        {/* ... решта ... */}
      </div>

      <footer className="pt-2 text-center text-[10px] text-[var(--text-dim)]">
        <BrandWordmark className="text-[13px]" />
      </footer>
    </div>
  );
}

// Altcoin season glyph
function AltcoinsGlyph() { /* ... */ }
