import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMarkets } from "@/lib/markets";
import { PageHeader } from "@/components/PageHeader";
import { CoinPicker, type CoinOption } from "@/components/CoinPicker";
import { SeoHead } from "@/components/SeoHead";
import { ArrowDownUp, Copy, History, X } from "lucide-react";
import { haptic } from "@/lib/telegram";
import { toast } from "sonner";

type HistoryItem = { from: string; to: string; amount: string; result: string; at: number };

const HISTORY_KEY = "ct.calc.history.v1";

export default function Calc() {
  const { data: coins = [] } = useQuery({
    queryKey: ["markets", "p1"],
    queryFn: () => fetchMarkets({ perPage: 100, sparkline: true }),
    staleTime: 60_000,
  });

  const [from, setFrom] = useState("bitcoin");
  const [to, setTo] = useState("usd");
  const [amount, setAmount] = useState("1");
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
  });

  const fromCoin = useMemo<CoinOption | undefined>(
    () => from === "usd" ? { id: "usd", symbol: "usd", name: "US Dollar", image: "" } : coins.find((c) => c.id === from),
    [coins, from],
  );
  const toCoin = useMemo<CoinOption | undefined>(
    () => to === "usd" ? { id: "usd", symbol: "usd", name: "US Dollar", image: "" } : coins.find((c) => c.id === to),
    [coins, to],
  );

  const result = useMemo<number | null>(() => {
    const a = parseFloat(amount.replace(",", "."));
    if (!isFinite(a) || a <= 0) return null;
    const fromPx = from === "usd" ? 1 : coins.find((c) => c.id === from)?.current_price;
    const toPx = to === "usd" ? 1 : coins.find((c) => c.id === to)?.current_price;
    if (!fromPx || !toPx) return null;
    return (a * fromPx) / toPx;
  }, [amount, from, to, coins]);

  // Save to history (debounced via effect)
  useEffect(() => {
    if (result == null || !fromCoin || !toCoin) return;
    const t = setTimeout(() => {
      const item: HistoryItem = {
        from: fromCoin.symbol.toUpperCase(),
        to: toCoin.symbol.toUpperCase(),
        amount,
        result: result.toLocaleString("en-US", { maximumFractionDigits: to === "usd" ? 2 : 8 }),
        at: Date.now(),
      };
      setHistory((prev) => {
        const next = [item, ...prev.filter((p) => !(p.from === item.from && p.to === item.to && p.amount === item.amount))].slice(0, 10);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    }, 800);
    return () => clearTimeout(t);
  }, [result, fromCoin, toCoin, amount, to]);

  const swap = () => { haptic("tap"); setFrom(to); setTo(from); };
  const copy = async () => {
    if (result == null || !toCoin) return;
    const v = result.toLocaleString("en-US", { maximumFractionDigits: to === "usd" ? 2 : 8 });
    await navigator.clipboard.writeText(v);
    toast.success(`Скопійовано: ${v} ${toCoin.symbol.toUpperCase()}`);
    haptic("success");
  };

  return (
    <div className="space-y-4">
      <SeoHead title="Калькулятор крипто" description="Конвертер крипто і USD з реальними курсами." />
      <PageHeader title="Калькулятор" subtitle="Конвертер крипти і USD" />

      <div className="surface p-4 space-y-3">
        <Row label="З" coin={fromCoin}>
          <CoinPicker withUsd value={from} onChange={(id) => setFrom(id)} />
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-right text-lg font-medium outline-none tabular-nums truncate"
            placeholder="0"
          />
        </Row>


        <div className="flex justify-center">
          <button onClick={swap} className="rounded-full border border-[var(--line)] bg-[var(--bg-elev)] p-2.5 hover:border-[var(--gold)] transition-colors">
            <ArrowDownUp size={16} />
          </button>
        </div>

        <Row label="В" coin={toCoin}>
          <CoinPicker withUsd value={to} onChange={(id) => setTo(id)} />
          <input
            readOnly
            value={result == null ? "" : result.toLocaleString("en-US", { maximumFractionDigits: to === "usd" ? 2 : 8 })}
            className="min-w-0 flex-1 bg-transparent text-right text-lg font-medium outline-none tabular-nums truncate text-[var(--gold)]"
            placeholder="0"
          />

        </Row>

        <button onClick={copy} disabled={result == null} className="w-full mt-1 rounded-xl border border-[var(--line)] py-2 text-xs text-[var(--text-muted)] hover:text-[var(--text)] flex items-center justify-center gap-1.5 disabled:opacity-40">
          <Copy size={12} /> Скопіювати результат
        </button>
      </div>

      {fromCoin && fromCoin.id !== "usd" && (
        <div className="surface p-3 text-xs text-[var(--text-muted)] flex items-center justify-between">
          <span>1 {fromCoin.symbol.toUpperCase()}</span>
          <span className="tabular-nums">${coins.find((c) => c.id === fromCoin.id)?.current_price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
        </div>
      )}

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            <History size={12} /> Історія
          </h2>
          <div className="surface divide-y divide-[var(--line)]">
            {history.map((h) => (
              <div key={`${h.at}-${h.from}-${h.to}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="flex-1 tabular-nums">
                  <span>{h.amount} {h.from}</span>
                  <span className="text-[var(--text-muted)]"> → </span>
                  <span className="text-[var(--gold)]">{h.result} {h.to}</span>
                </div>
                <button
                  onClick={() => { setHistory((prev) => { const n = prev.filter((p) => p.at !== h.at); localStorage.setItem(HISTORY_KEY, JSON.stringify(n)); return n; }); }}
                  className="p-1 text-[var(--text-muted)] hover:text-[var(--danger)]"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, coin: _coin, children }: { label: string; coin?: CoinOption; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{label}</div>
      <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] p-3">
        {children}
      </div>
    </div>
  );
}
