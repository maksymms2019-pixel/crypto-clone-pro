import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMarkets, type CoinRow } from "@/lib/markets";
import { Search, Check, ChevronDown } from "lucide-react";

export type CoinOption = { id: string; symbol: string; name: string; image: string };

export function CoinPicker({
  value,
  onChange,
  withUsd = false,
  placeholder = "Обери монету",
}: {
  value: string;
  onChange: (id: string, coin: CoinOption) => void;
  withUsd?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { data: coins = [] } = useQuery({
    queryKey: ["markets", "p1"],
    queryFn: () => fetchMarkets({ perPage: 100, sparkline: true }),
    staleTime: 60_000,
  });

  const selected: CoinOption | undefined = useMemo(() => {
    if (withUsd && value === "usd") return { id: "usd", symbol: "usd", name: "US Dollar", image: "" };
    return coins.find((c) => c.id === value);
  }, [coins, value, withUsd]);

  const list = useMemo<CoinOption[]>(() => {
    const base: CoinOption[] = withUsd
      ? [{ id: "usd", symbol: "usd", name: "US Dollar", image: "" }, ...coins]
      : coins;
    if (!q.trim()) return base.slice(0, 50);
    const s = q.toLowerCase();
    return base.filter((c) => c.symbol.toLowerCase().includes(s) || c.name.toLowerCase().includes(s)).slice(0, 50);
  }, [coins, q, withUsd]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg bg-white/[.04] px-2.5 py-1.5 text-sm font-medium hover:bg-white/[.08]"
      >
        {selected ? (
          selected.image ? (
            <img src={selected.image} alt="" className="h-5 w-5 rounded-full" />
          ) : (
            <div className="h-5 w-5 rounded-full bg-[var(--accent)]/20 text-[10px] flex items-center justify-center text-[var(--accent)] font-bold">$</div>
          )
        ) : (
          <span className="text-[var(--text-muted)] text-xs">{placeholder}</span>
        )}
        <span>{selected?.symbol.toUpperCase() ?? ""}</span>
        <ChevronDown size={14} className="text-[var(--text-muted)]" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full max-w-[480px] max-h-[70vh] rounded-t-2xl border border-[var(--line)] bg-[var(--bg-elev)] p-3 pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Пошук монети…"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] py-2.5 pl-9 pr-3 text-sm outline-none focus:border-[var(--gold)]"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {list.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { onChange(c.id, c); setOpen(false); setQ(""); }}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-white/[.04]"
                >
                  {c.image ? (
                    <img src={c.image} alt="" className="h-7 w-7 rounded-full" />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-[var(--accent)]/20 text-xs flex items-center justify-center text-[var(--accent)] font-bold">$</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{c.symbol.toUpperCase()}</div>
                    <div className="text-xs text-[var(--text-muted)] truncate">{c.name}</div>
                  </div>
                  {value === c.id && <Check size={16} className="text-[var(--accent)]" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export type { CoinRow };
