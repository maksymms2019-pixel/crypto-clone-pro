import { useQuery } from "@tanstack/react-query";
import { fetchMarkets } from "@/lib/markets";
import { fmtUsd } from "@/lib/format";
import { Link } from "react-router-dom";

const IDS = ["bitcoin", "ethereum", "solana", "binancecoin", "ripple", "sui", "toncoin", "cardano"];

export function PriceTicker() {
  const { data } = useQuery({
    queryKey: ["ticker", IDS.join(",")],
    queryFn: () => fetchMarkets({ ids: IDS, perPage: IDS.length, sparkline: false }),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const rows = data ?? [];
  // duplicate to make a seamless marquee
  const items = [...rows, ...rows];

  return (
    <div className="relative overflow-hidden rounded-full border border-[var(--line)] bg-[var(--bg-elev)]/60 backdrop-blur">
      <div className="pointer-events-none absolute inset-y-0 left-0 w-8 z-10" style={{ background: "linear-gradient(90deg, var(--bg), transparent)" }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-8 z-10" style={{ background: "linear-gradient(270deg, var(--bg), transparent)" }} />
      <div className="flex gap-5 py-2 px-4 whitespace-nowrap animate-marquee">
        {items.map((c, i) => {
          const up = c.price_change_percentage_24h >= 0;
          return (
            <Link key={`${c.id}-${i}`} to={`/coin/${c.id}`} className="inline-flex items-center gap-1.5 text-xs">
              <img src={c.image} alt="" className="h-4 w-4 rounded-full" loading="lazy" />
              <span className="font-medium">{c.symbol.toUpperCase()}</span>
              <span className="tabular-nums text-[var(--text-muted)]">{fmtUsd(c.current_price, { digits: c.current_price < 1 ? 4 : 2 })}</span>
              <span className={`tabular-nums ${up ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                {up ? "+" : ""}{c.price_change_percentage_24h.toFixed(2)}%
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
