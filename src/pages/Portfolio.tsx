import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, getAppUserId } from "@/lib/auth";
import { fetchMarkets } from "@/lib/markets";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { CoinPicker } from "@/components/CoinPicker";
import { SeoHead } from "@/components/SeoHead";
import { fmtUsd, fmtPct } from "@/lib/format";
import { Wallet, Plus, Trash2, X, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/telegram";

type Trade = {
  id: string;
  user_id: string;
  symbol: string;
  coingecko_id: string | null;
  side: "buy" | "sell";
  amount: number;
  price: number;
  fee: number;
  executed_at: string;
  note: string | null;
};

export default function Portfolio() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);

  const trades = useQuery({
    queryKey: ["trades", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .order("executed_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Trade[];
    },
    enabled: !!user,
  });

  const ids = useMemo(() => {
    const s = new Set<string>();
    trades.data?.forEach((t) => t.coingecko_id && s.add(t.coingecko_id));
    return [...s];
  }, [trades.data]);

  const markets = useQuery({
    queryKey: ["markets", "by-ids", ids.sort().join(",")],
    queryFn: () => fetchMarkets({ ids, perPage: Math.max(1, ids.length) }),
    enabled: ids.length > 0,
    staleTime: 60_000,
  });

  const holdings = useMemo(() => {
    const map = new Map<string, { id: string; symbol: string; amount: number; cost: number }>();
    for (const t of trades.data ?? []) {
      if (!t.coingecko_id) continue;
      const cur = map.get(t.coingecko_id) ?? { id: t.coingecko_id, symbol: t.symbol, amount: 0, cost: 0 };
      if (t.side === "buy") {
        cur.amount += Number(t.amount);
        cur.cost += Number(t.amount) * Number(t.price) + Number(t.fee ?? 0);
      } else {
        cur.amount -= Number(t.amount);
        cur.cost -= Number(t.amount) * Number(t.price) - Number(t.fee ?? 0);
      }
      map.set(t.coingecko_id, cur);
    }
    return [...map.values()].filter((h) => h.amount > 0.0000001);
  }, [trades.data]);

  const priceById = useMemo(() => {
    const m = new Map<string, { price: number; image: string; name: string; pct: number }>();
    markets.data?.forEach((c) => m.set(c.id, { price: c.current_price, image: c.image, name: c.name, pct: c.price_change_percentage_24h }));
    return m;
  }, [markets.data]);

  const totalValue = holdings.reduce((s, h) => s + (priceById.get(h.id)?.price ?? 0) * h.amount, 0);
  const totalCost = holdings.reduce((s, h) => s + h.cost, 0);
  const pnl = totalValue - totalCost;
  const pnlPct = totalCost > 0 ? (pnl / totalCost) * 100 : 0;

  const removeTrade = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trades").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trades"] });
      toast.success("Угоду видалено");
      haptic("success");
    },
  });

  return (
    <div className="space-y-4">
      <SeoHead title="Портфель" description="P&L, holdings, equity. Веди крипто-портфоліо у CryptoTime." />
      <PageHeader
        title="Портфель"
        subtitle="P&L · holdings"
        right={
          <button
            onClick={() => { setFormOpen(true); haptic("tap"); }}
            className="chip"
            data-active="true"
          >
            <Plus size={14} /> Угода
          </button>
        }
      />

      {trades.isError && <ErrorState description={(trades.error as Error)?.message} onRetry={() => trades.refetch()} />}

      {trades.isLoading ? (
        <div className="surface p-6"><div className="skeleton h-8 w-32 mb-3" /><div className="skeleton h-20 w-full" /></div>
      ) : holdings.length === 0 ? (
        <EmptyState
          icon={Wallet}
          tone="accent"
          title="Почни з першої угоди"
          description="Додай buy-угоду — портфоліо порахує середню ціну, поточну вартість і P&L автоматично."
          action={
            <button
              onClick={() => setFormOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-[#1A0F00]"
              style={{ background: "var(--grad-active)" }}
            >
              <Plus size={14} /> Додати угоду
            </button>
          }
        />
      ) : (
        <>
          {/* SUMMARY */}
          <div className="mcard">
            <div className={`mcard__glow mcard__glow--${pnl >= 0 ? "up" : "down"}`} />
            <div className="relative">
              <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">Загальна вартість</div>
              <div className="mt-1 display text-[32px] font-bold tabular-nums gold-shimmer">{fmtUsd(totalValue)}</div>
              <div className="mt-1 flex items-center gap-2 text-sm">
                <span className={`tabular-nums font-medium ${pnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                  {pnl >= 0 ? "+" : ""}{fmtUsd(pnl)} ({fmtPct(pnlPct)})
                </span>
                <span className="text-[var(--text-muted)]">P&L</span>
              </div>
              <div className="hairline-gold mt-3" />
              <div className="mt-2.5 grid grid-cols-2 gap-2 text-center text-xs">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Вкладено</div>
                  <div className="mt-0.5 font-semibold tabular-nums">{fmtUsd(totalCost)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Активів</div>
                  <div className="mt-0.5 font-semibold tabular-nums">{holdings.length}</div>
                </div>
              </div>
            </div>
          </div>

          {/* HOLDINGS LIST */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Активи</h2>
            <div className="surface divide-y divide-[var(--line)]">
              {holdings.map((h) => {
                const m = priceById.get(h.id);
                const value = (m?.price ?? 0) * h.amount;
                const avgCost = h.cost / h.amount;
                const itemPnl = value - h.cost;
                const itemPct = h.cost > 0 ? (itemPnl / h.cost) * 100 : 0;
                return (
                  <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                    {m?.image ? <img src={m.image} alt="" className="h-9 w-9 rounded-full" /> : <div className="h-9 w-9 rounded-full bg-white/5" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{h.symbol.toUpperCase()}</span>
                        <span className="text-xs text-[var(--text-muted)] tabular-nums">{h.amount.toLocaleString("en-US", { maximumFractionDigits: 6 })}</span>
                      </div>
                      <div className="text-xs text-[var(--text-muted)] tabular-nums">avg {fmtUsd(avgCost, { digits: avgCost < 1 ? 4 : 2 })}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums">{fmtUsd(value)}</div>
                      <div className={`text-xs tabular-nums inline-flex items-center gap-0.5 ${itemPnl >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                        {itemPnl >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                        {fmtPct(itemPct)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* TRADES LIST */}
          <section>
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Останні угоди</h2>
            <div className="surface divide-y divide-[var(--line)]">
              {trades.data?.slice(0, 20).map((t) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${t.side === "buy" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--danger)]/15 text-[var(--danger)]"}`}>
                    {t.side === "buy" ? "buy" : "sell"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{t.symbol.toUpperCase()}</div>
                    <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                      {Number(t.amount)} @ {fmtUsd(Number(t.price))} · {new Date(t.executed_at).toLocaleDateString("uk-UA")}
                    </div>
                  </div>
                  <button onClick={() => removeTrade.mutate(t.id)} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--danger)]">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {formOpen && <TradeForm onClose={() => setFormOpen(false)} onSaved={() => qc.invalidateQueries({ queryKey: ["trades"] })} userId={user?.id ?? ""} />}
    </div>
  );
}

function TradeForm({ onClose, onSaved, userId }: { onClose: () => void; onSaved: () => void; userId: string }) {
  const [coinId, setCoinId] = useState<string>("");
  const [symbol, setSymbol] = useState<string>("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [fee, setFee] = useState("0");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) { toast.error("Сесія неактивна — увійди ще раз."); return; }
    if (!coinId) { toast.error("Обери монету"); return; }
    const a = parseFloat(amount.replace(",", "."));
    const p = parseFloat(price.replace(",", "."));
    if (!isFinite(a) || a <= 0) { toast.error("Невірна кількість"); return; }
    if (!isFinite(p) || p < 0) { toast.error("Невірна ціна"); return; }
    setBusy(true);
    const appUserId = await getAppUserId();
    if (!appUserId) {
      setBusy(false);
      toast.error("Сесія неактивна — увійди ще раз.");
      return;
    }
    const payload = {
      user_id: appUserId,
      coingecko_id: coinId,
      symbol: symbol || coinId.slice(0, 6).toUpperCase(),
      side,
      amount: a,
      price: p,
      fee: parseFloat(fee.replace(",", ".")) || 0,
      executed_at: new Date(date).toISOString(),
    };
    const { error } = await supabase.from("trades").insert(payload);
    setBusy(false);
    if (error) {
      console.error("[trades.insert] failed", { error, payload });
      const code = (error as { code?: string }).code;
      const msg = code === "42501"
        ? "Доступ заборонено (RLS). Перезайди, будь ласка."
        : code === "23502"
          ? "Не заповнене поле — перевір кількість/ціну."
          : error.message;
      toast.error(msg);
      return;
    }
    toast.success("Угоду додано");
    haptic("success");
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="relative w-full max-w-[480px] rounded-t-2xl border border-[var(--line)] bg-[var(--bg-elev)] p-4 pb-6 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="display text-lg font-semibold">Нова угода</h3>
          <button type="button" onClick={onClose} className="p-1 text-[var(--text-muted)]"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg)]">
          {(["buy", "sell"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSide(s)} className={`py-2 text-sm font-semibold rounded-lg ${side === s ? (s === "buy" ? "bg-[var(--accent)]/15 text-[var(--accent)]" : "bg-[var(--danger)]/15 text-[var(--danger)]") : "text-[var(--text-muted)]"}`}>
              {s === "buy" ? "Купив" : "Продав"}
            </button>
          ))}
        </div>

        <div>
          <Label>Монета</Label>
          <div className="mt-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-2">
            <CoinPicker value={coinId} onChange={(id, c) => { setCoinId(id); setSymbol(c.symbol); }} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div><Label>Кількість</Label><Input value={amount} onChange={setAmount} placeholder="0.5" /></div>
          <div><Label>Ціна USD</Label><Input value={price} onChange={setPrice} placeholder="42000" /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>Комісія USD</Label><Input value={fee} onChange={setFee} placeholder="0" /></div>
          <div><Label>Дата</Label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]" />
          </div>
        </div>

        <button type="submit" disabled={busy || !userId} className="w-full rounded-xl py-2.5 text-sm font-semibold text-[#1A0F00] flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "var(--grad-active)" }}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          Зберегти угоду
        </button>
      </form>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{children}</div>;
}
function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 text-sm tabular-nums outline-none focus:border-[var(--gold)]" />
  );
}
