import { useQuery } from "@tanstack/react-query";
import { fetchTrending } from "@/lib/markets";
import { Link } from "react-router-dom";
import { Flame } from "lucide-react";

export function TrendingRail() {
  const q = useQuery({ queryKey: ["trending"], queryFn: fetchTrending, staleTime: 5 * 60_000 });
  if (q.isLoading || !q.data?.length) {
    return q.isLoading ? <div className="skeleton h-[64px] w-full" /> : null;
  }
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        <Flame size={12} className="text-[var(--gold)]" /> Що зараз шукають
      </h2>
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1">
        {q.data.map((c, i) => (
          <Link key={c.id} to={`/coin/${c.id}`} className="shrink-0 surface px-3 py-2 flex items-center gap-2">
            <span className="text-[10px] text-[var(--text-muted)] tabular-nums">#{i + 1}</span>
            <img src={c.image} alt="" className="h-5 w-5 rounded-full" />
            <span className="text-xs font-semibold">{c.symbol.toUpperCase()}</span>
            {c.pct24h != null && (
              <span className={`text-[11px] tabular-nums ${c.pct24h >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                {c.pct24h >= 0 ? "+" : ""}{c.pct24h.toFixed(1)}%
              </span>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
