import { useQuery } from "@tanstack/react-query";
import { fetchGainersLosers, type MoverRow } from "@/lib/markets";
import { Link } from "react-router-dom";
import { fmtUsd } from "@/lib/format";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from "lucide-react";

function Rail({ title, rows, kind }: { title: string; rows: MoverRow[]; kind: "up" | "down" }) {
  const Icon = kind === "up" ? TrendingUp : TrendingDown;
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        <Icon size={12} className={kind === "up" ? "text-[var(--accent)]" : "text-[var(--danger)]"} />
        {title}
      </h2>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {rows.map((c) => (
          <Link key={c.id} to={`/coin/${c.id}`} className="shrink-0 w-[140px] surface p-3">
            <div className="flex items-center gap-2">
              <img src={c.image} alt="" className="h-6 w-6 rounded-full" />
              <span className="text-xs font-semibold uppercase">{c.symbol}</span>
            </div>
            <div className="mt-2 text-sm font-semibold tabular-nums">{fmtUsd(c.current_price, { digits: c.current_price < 1 ? 4 : 2 })}</div>
            <div className={`mt-0.5 flex items-center gap-0.5 text-xs font-medium tabular-nums ${kind === "up" ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
              {kind === "up" ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
              {c.price_change_percentage_24h.toFixed(2)}%
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function GainersLosers() {
  const q = useQuery({ queryKey: ["movers"], queryFn: fetchGainersLosers, staleTime: 60_000 });
  if (q.isLoading) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-3 w-24" />
        <div className="flex gap-2"><div className="skeleton h-[90px] w-[140px]"/><div className="skeleton h-[90px] w-[140px]"/></div>
      </div>
    );
  }
  if (!q.data) return null;
  return (
    <div className="space-y-4">
      <Rail title="Зростають 24h" rows={q.data.gainers} kind="up" />
      <Rail title="Падають 24h" rows={q.data.losers} kind="down" />
    </div>
  );
}
