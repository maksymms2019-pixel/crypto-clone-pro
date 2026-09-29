import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, ArrowDown, Ticket, Trophy, History, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { haptic } from "@/lib/telegram";

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }>;
  functions: typeof supabase.functions;
};

type Round = {
  id: string; asset: string; name?: string | null; round_date: string; open_price: number; close_price: number | null;
  locks_at: string; settles_at: string; status: string; result: string | null;
  up: number; down: number; my: { side: string; stake: number; payout: number | null } | null;
};
type HistoryResp = {
  tickets: number; wins: number; total: number; streak: number;
  items: { asset: string; round_date: string; side: string; stake: number; payout: number | null; status: string; result: string | null; open_price: number; close_price: number | null }[];
};

const STAKES = [20, 50, 100];
const ERR: Record<string, string> = {
  insufficient_balance: "Недостатньо монеток",
  locked: "Ставки вже закрито",
  already_bet: "Ти вже зробив прогноз",
  not_authenticated: "Увійди, щоб грати",
};

const fmtP = (p: number | null | undefined, a: string) =>
  p == null ? "—" : "$" + Number(p).toLocaleString("en-US", { maximumFractionDigits: Number(p) >= 1000 ? 0 : Number(p) >= 1 ? 3 : 5 });

function useNow() {
  const [n, setN] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setN(Date.now()), 1000); return () => clearInterval(t); }, []);
  return n;
}
const left = (ms: number) => {
  if (ms <= 0) return "0:00:00";
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

function RoundCard({ r, now, onBet, busy }: { r: Round; now: number; onBet: (side: string, stake: number) => void; busy: boolean }) {
  const [stake, setStake] = useState(50);
  const total = r.up + r.down;
  const upPct = total ? Math.round((r.up / total) * 100) : 50;
  const locked = r.status !== "open" || now >= +new Date(r.locks_at);
  const settled = r.status === "settled";
  const won = settled && r.my && r.my.side === r.result;
  const flat = settled && r.result === "flat";

  return (
    <div className="pred-round">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold">{r.name ?? (r.asset === "GRAM" ? "GRAM (TON)" : r.asset === "BTC" ? "Bitcoin" : r.asset)}</div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          {settled ? "Результат" : locked ? `Результат через ${left(+new Date(r.settles_at) - now)}` : `Закриття через ${left(+new Date(r.locks_at) - now)}`}
        </div>
      </div>
      <div className="mt-1 text-[12px] text-[var(--text-muted)]">
        Ціна о 21:00 буде вище за <span className="font-semibold text-[var(--gold)] tabular-nums">{fmtP(r.open_price, r.asset)}</span>?
      </div>

      {settled && (
        <div className={`pred-result ${flat ? "" : won ? "pred-result--win" : r.my ? "pred-result--lose" : ""}`}>
          <div className="text-[12px]">Фінал: <b className="tabular-nums">{fmtP(r.close_price, r.asset)}</b> · {r.result === "up" ? "▲ UP" : r.result === "down" ? "▼ DOWN" : "= без змін"}</div>
          {r.my && (
            <div className="text-[13px] font-bold">
              {flat ? `Повернено ${r.my.stake}` : won ? `🎉 Вгадав! +${r.my.payout} і квиток 🎟` : `Не вгадав · −${r.my.stake}`}
            </div>
          )}
        </div>
      )}

      {!settled && r.my && (
        <div className="pred-mine">
          Твій прогноз: <b className={r.my.side === "up" ? "text-[var(--accent)]" : "text-[var(--danger)]"}>{r.my.side === "up" ? "▲ UP" : "▼ DOWN"}</b> · {r.my.stake} монеток → виграш {r.my.stake * 2}
        </div>
      )}

      {!settled && !r.my && !locked && (
        <>
          <div className="mt-3 flex gap-1.5">
            {STAKES.map((s) => (
              <button key={s} onClick={() => { haptic("tap"); setStake(s); }}
                className={`pred-stake ${stake === s ? "pred-stake--on" : ""}`}>🪙 {s}</button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => onBet("up", stake)} className="pred-btn pred-btn--up"><ArrowUp className="h-4 w-4" /> UP</button>
            <button disabled={busy} onClick={() => onBet("down", stake)} className="pred-btn pred-btn--down"><ArrowDown className="h-4 w-4" /> DOWN</button>
          </div>
        </>
      )}
      {!settled && !r.my && locked && <div className="pred-mine">Ставки закрито</div>}

      <div className="mt-3">
        <div className="pred-bar"><div style={{ width: `${upPct}%` }} /></div>
        <div className="mt-1 flex justify-between text-[10px] text-[var(--text-muted)] tabular-nums">
          <span className="text-[var(--accent)]">{upPct}% UP</span>
          <span>{total} учасн.</span>
          <span className="text-[var(--danger)]">{100 - upPct}% DOWN</span>
        </div>
      </div>
    </div>
  );
}

export function DailyPrediction() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = useNow();
  const [showHist, setShowHist] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const adm = useQuery({
    queryKey: ["pred-admin", user?.id], enabled: !!user, staleTime: 600_000,
    queryFn: async () => { const { data } = await sb.rpc("my_coin_stats"); return !!(data as any)?.is_admin; },
  });
  const isAdmin = !!adm.data;
  const cancel = useMutation({
    mutationFn: async (id: string) => { const { error } = await sb.rpc("admin_cancel_round", { _round_id: id }); if (error) throw new Error(error.message); },
    onSuccess: () => { setMsg("Раунд скасовано, ставки повернено"); setOpenId(null); qc.invalidateQueries({ queryKey: ["predictions"] }); },
    onError: (e: Error) => setMsg(e.message),
  });

  const ov = useQuery({
    queryKey: ["predictions", user?.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc("prediction_overview");
      if (error) throw new Error(error.message);
      return (data ?? []) as Round[];
    },
    refetchInterval: 30_000,
  });
  const hist = useQuery({
    queryKey: ["prediction-history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await sb.rpc("my_prediction_history");
      if (error) throw new Error(error.message);
      return data as HistoryResp;
    },
  });

  // Fallback: nudge the round service if a round is overdue.
  const overdue = (ov.data ?? []).some((r) => r.status === "open" && now > +new Date(r.settles_at) + 60_000);
  useEffect(() => {
    if (!overdue) return;
    sb.functions.invoke("predictions-cron").finally(() => qc.invalidateQueries({ queryKey: ["predictions"] }));
  }, [overdue, qc]);

  const bet = useMutation({
    mutationFn: async ({ id, side, stake }: { id: string; side: string; stake: number }) => {
      const { data, error } = await sb.rpc("place_prediction", { _round_id: id, _side: side, _stake: stake });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(ERR[data?.error] ?? "Помилка");
      return data;
    },
    onSuccess: () => {
      haptic("success"); setMsg("Прогноз прийнято! Результат о 21:00");
      qc.invalidateQueries({ queryKey: ["predictions"] });
      qc.invalidateQueries({ queryKey: ["coin-stats"] });
    },
    onError: (e: Error) => { haptic("error"); setMsg(e.message); },
  });

  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 3500); return () => clearTimeout(t); }, [msg]);

  const rounds = ov.data ?? [];
  const openRound = rounds.find((r) => r.id === openId) ?? null;
  const h = hist.data;

  return (
    <section className="pred-card mcard p-3">
      <div className="relative flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-[var(--gold)]">🔮 Прогноз дня</div>
          <div className="text-[11px] text-[var(--text-muted)]">Вгадай — ×2 і квиток 🎟</div>
        </div>
        {user && (
          <button onClick={() => setShowHist(true)} className="pred-chip">
            <Ticket className="h-3.5 w-3.5" /> {h?.tickets ?? 0}
            <History className="ml-1 h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="relative mt-2 grid grid-cols-2 gap-2">
        {ov.isLoading && <div className="col-span-2 h-14 animate-pulse rounded-xl bg-[var(--bg-elev)]" />}
        {!ov.isLoading && rounds.length === 0 && (
          <div className="col-span-2 text-center text-[11px] text-[var(--text-muted)]">Новий раунд стартує щодня о 12:00 (Київ)</div>
        )}
        {rounds.map((r) => {
          const total = r.up + r.down;
          const upPct = total ? Math.round((r.up / total) * 100) : 50;
          const locked = r.status !== "open" || now >= +new Date(r.locks_at);
          const settled = r.status === "settled";
          const tag = settled ? (r.result === "up" ? "▲ UP" : r.result === "down" ? "▼ DOWN" : "=")
            : r.my ? (r.my.side === "up" ? "▲ твій" : "▼ твій")
            : locked ? left(+new Date(r.settles_at) - now) : left(+new Date(r.locks_at) - now);
          return (
            <button key={r.id} onClick={() => { haptic("tap"); setOpenId(r.id); }}
              className="rounded-xl border border-[var(--line)] bg-[var(--bg)]/40 px-2.5 py-2 text-left">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[12px] font-bold">{r.asset}</span>
                <span className="text-[10px] tabular-nums text-[var(--text-muted)]">{tag}</span>
              </div>
              <div className="text-[11px] tabular-nums text-[var(--gold)]">{fmtP(r.open_price, r.asset)}</div>
              <div className="pred-bar mt-1"><div style={{ width: `${upPct}%` }} /></div>
            </button>
          );
        })}
      </div>
      {openRound && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--bg)]/80 backdrop-blur-sm" onClick={() => setOpenId(null)}>
          <div className="w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-3xl border border-[var(--line-strong)] bg-[var(--bg-elev)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-[var(--gold)]">🔮 Прогноз дня</div>
              <button onClick={() => setOpenId(null)} aria-label="Закрити"><X className="h-5 w-5" /></button>
            </div>
            <RoundCard r={openRound} now={now} busy={bet.isPending}
              onBet={(side, stake) => user ? bet.mutate({ id: openRound.id, side, stake }) : setMsg(ERR.not_authenticated)} />
            {isAdmin && openRound.status === "open" && (
              <button onClick={() => { if (confirm("Скасувати раунд і повернути ставки?")) cancel.mutate(openRound.id); }}
                className="mt-3 w-full rounded-xl border border-[var(--danger)] py-2 text-[12px] text-[var(--danger)]">
                Адмін: скасувати раунд і повернути ставки
              </button>
            )}
            {msg && <div className="pred-toast">{msg}</div>}
          </div>
        </div>
      )}
      {msg && !openRound && <div className="pred-toast">{msg}</div>}

      {showHist && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--bg)]/80 backdrop-blur-sm" onClick={() => setShowHist(false)}>
          <div className="w-full max-w-md max-h-[80dvh] overflow-y-auto rounded-t-3xl border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold">Мої прогнози</div>
              <button onClick={() => setShowHist(false)} aria-label="Закрити"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="pred-stat"><Ticket className="mx-auto h-4 w-4 text-[var(--gold)]" /><b>{h?.tickets ?? 0}</b><span>квитків</span></div>
              <div className="pred-stat"><Trophy className="mx-auto h-4 w-4 text-[var(--accent)]" /><b>{h?.wins ?? 0}/{h?.total ?? 0}</b><span>вгадано</span></div>
              <div className="pred-stat">🔥<b>{h?.streak ?? 0}</b><span>серія</span></div>
            </div>
            <div className="mt-4 space-y-2">
              {(h?.items ?? []).length === 0 && <div className="text-center text-[12px] text-[var(--text-muted)]">Ще немає прогнозів</div>}
              {(h?.items ?? []).map((it, i) => {
                const res = it.status === "settled" ? (it.result === "flat" ? "=" : it.side === it.result ? `+${it.payout}` : `−${it.stake}`) : it.status === "cancelled" ? "повернено" : "очікує";
                return (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-[var(--line)] px-3 py-2 text-[12px]">
                    <span>{it.round_date} · {it.asset} · {it.side === "up" ? "▲" : "▼"} {it.stake}</span>
                    <b className={res.startsWith("+") ? "text-[var(--accent)]" : res.startsWith("−") ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}>{res}</b>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
