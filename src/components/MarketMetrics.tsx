import { useQuery } from "@tanstack/react-query";
import { fetchMarketMetrics } from "@/lib/metrics";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";

export function MarketMetrics() {
  const m = useQuery({ queryKey: ["market-metrics"], queryFn: fetchMarketMetrics, staleTime: 300_000 });
  if (m.isError) return null;

  const score = m.data?.market_state_score ?? 50;
  const breadth = m.data?.breadth_up_pct ?? 50;
  const bullish = score >= 50;
  const tone = bullish ? "text-[var(--accent)]" : "text-[var(--danger)]";
  const Icon = bullish ? TrendingUp : TrendingDown;

  return (
    <section className="surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={14} className="text-[var(--gold)]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Стан ринку · сьогодні
          </h2>
        </div>
        {m.data?.market_state_label && (
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider ${tone}`}>
            <Icon size={11} /> {m.data.market_state_label}
          </span>
        )}
      </div>

      <p className="mt-3 text-sm font-medium leading-snug text-[var(--text)]">
        {m.isLoading ? "Аналізуємо ринок…" : (m.data?.today_label ?? "—")}
      </p>
      {m.data?.today_summary && (
        <p className="mt-1 text-xs leading-snug text-[var(--text-muted)]">
          {m.data.today_summary}
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${breadth}%`, background: bullish ? "var(--accent)" : "var(--danger)" }}
          />
        </div>
        <span className="text-[10px] font-semibold tabular-nums text-[var(--text-muted)] shrink-0">
          {breadth}% у плюсі
        </span>
      </div>
    </section>
  );
}
