import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { COIN_LEVELS, levelProgress } from "@/lib/coinLevels";
import { haptic } from "@/lib/telegram";
import { toast } from "sonner";
import { Coins, Sparkles, Gift, Trophy, X, Copy, Check, Crown, Ticket, Search } from "lucide-react";

type Tab = "wallet" | "rating" | "raffles";

type CoinStats = {
  balance: number;
  code: string | null;
  opt_in: boolean;
  rank: number | null;
  total: number;
};

type LeaderRow = {
  rank: number;
  code: string | null;
  display_name: string;
  avatar_url: string | null;
  balance: number;
  is_me: boolean;
};

type SnapshotRow = {
  snapshot_id: string;
  title: string;
  taken_at: string;
  participants: number;
  balance: number;
  rank: number;
};

type VerifyResp = {
  ok: boolean;
  error?: string;
  code?: string;
  display_name?: string;
  balance?: number;
  rank?: number;
  snapshot?: { title: string; taken_at: string; balance: number; rank: number } | null;
};

// The managed types file is generated from the external DB and can't be edited,
// so the coin RPCs are called through a loosely-typed facade with local types.
const sb = supabase as unknown as {
  rpc<T = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: { message: string } | null }>;
};

const MEDALS = ["🥇", "🥈", "🥉"];

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "2-digit" });
  } catch {
    return iso;
  }
}

/**
 * Coin wallet popup — opened from the balance pill.
 * Tabs: wallet (levels), public leaderboard, raffles (Coin ID + snapshots).
 */
export function CoinWalletSheet({
  open,
  onClose,
  balance,
}: {
  open: boolean;
  onClose: () => void;
  balance: number;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { level, nextLevel, pct, remaining, balance: b } = levelProgress(balance);
  const [tab, setTab] = useState<Tab>("wallet");
  const [shown, setShown] = useState(0);
  const [copied, setCopied] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ startY: number; active: boolean }>({ startY: 0, active: false });

  const stats = useQuery({
    queryKey: ["coin-stats", user?.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc<CoinStats>("my_coin_stats");
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: open && !!user,
    staleTime: 60_000,
  });

  const leaderboard = useQuery({
    queryKey: ["coin-leaderboard"],
    queryFn: async () => {
      const { data, error } = await sb.rpc<LeaderRow[]>("coin_leaderboard", { _limit: 100 });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: open && !!user && tab === "rating",
    staleTime: 60_000,
  });

  const snapshots = useQuery({
    queryKey: ["coin-snapshots", user?.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc<SnapshotRow[]>("my_snapshot_results", { _limit: 10 });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: open && !!user && tab === "raffles",
    staleTime: 60_000,
  });

  const optIn = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await sb.rpc<boolean>("set_leaderboard_opt_in", { _value: value });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, value) => {
      qc.invalidateQueries({ queryKey: ["coin-stats"] });
      qc.invalidateQueries({ queryKey: ["coin-leaderboard"] });
      toast.success(value ? "Ти в рейтингу 🏆" : "Тебе приховано з рейтингу");
    },
    onError: () => toast.message("Не вдалось змінити налаштування"),
  });

  // Count-up animation for the big number.
  useEffect(() => {
    if (!open) { setShown(0); setTab("wallet"); return; }
    let raf = 0;
    const start = performance.now();
    const dur = 600;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      setShown(Math.round(b * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open, b]);

  // Lock background scroll + close on Esc while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const code = stats.data?.code ?? null;
  const myRank = stats.data?.rank ?? null;
  const optedIn = stats.data?.opt_in ?? true;

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback for webviews without clipboard permission.
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* noop */ }
      ta.remove();
    }
    haptic("success");
    setCopied(true);
    toast.success("Coin ID скопійовано");
    setTimeout(() => setCopied(false), 1500);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    drag.current = { startY: e.touches[0].clientY, active: true };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!drag.current.active) return;
    const dy = e.touches[0].clientY - drag.current.startY;
    if (dy > 0) setDragY(dy);
  };
  const onTouchEnd = () => {
    if (dragY > 90) { haptic("tap"); onClose(); }
    drag.current.active = false;
    setDragY(0);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "wallet", label: "Гаманець" },
    { id: "rating", label: "Рейтинг" },
    { id: "raffles", label: "Розіграші" },
  ];

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center">
      <button
        aria-label="Закрити"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in"
      />
      <div
        role="dialog"
        aria-label="Мої монетки"
        className="relative flex w-full max-w-[440px] flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border border-[var(--line)] bg-[var(--bg-elev)] animate-in slide-in-from-bottom-4"
        style={{
          maxHeight: "88dvh",
          marginTop: "calc(var(--sa-top, 0px) + 12px)",
          boxShadow: `0 -10px 60px ${level.glow}`,
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragY ? "none" : "transform .2s ease-out",
        }}
      >
        {/* Sticky header: drag handle + balance + close + tabs */}
        <div
          className="shrink-0 touch-none border-b border-[var(--line)]"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-white/15 sm:hidden" />
          <div className="flex items-center gap-3 px-4 pb-2.5 pt-2">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${level.id === "legend" ? "animate-pulse" : ""}`}
              style={{ background: level.gradient, color: level.onGradient, boxShadow: `0 0 18px ${level.glow}` }}
            >
              <Coins size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-bold leading-tight tabular-nums" style={{ color: level.color }}>
                {balance} <span className="text-[11px] font-medium text-[var(--text-muted)]">монеток</span>
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {level.emoji} {level.name}
                {myRank ? <> · місце #{myRank}</> : null}
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Закрити"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]"
            >
              <X size={16} />
            </button>
          </div>
          <div className="flex gap-1 px-4 pb-2.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => { haptic("tap"); setTab(t.id); }}
                className="flex-1 rounded-full px-2 py-1.5 text-[11px] font-semibold transition-colors"
                style={
                  tab === t.id
                    ? { background: `${level.color}1F`, color: level.color, border: `1px solid ${level.color}55` }
                    : { color: "var(--text-muted)", border: "1px solid transparent" }
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable body */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-5 pt-4"
          style={{ paddingBottom: "calc(1.25rem + var(--sa-bottom, 0px))" }}
        >
          {tab === "wallet" && (
            <>
              {/* Badge + balance */}
              <div className="flex flex-col items-center pt-1 text-center">
                <div className="relative">
                  <span
                    className="absolute inset-0 -z-10 rounded-full blur-2xl"
                    style={{ background: level.glow }}
                  />
                  <span
                    className={`flex h-20 w-20 items-center justify-center rounded-full text-3xl ${level.id === "legend" ? "animate-pulse" : ""}`}
                    style={{ background: level.gradient, color: level.onGradient, boxShadow: `0 0 30px ${level.glow}` }}
                  >
                    <Coins size={34} />
                  </span>
                </div>
                <div className="mt-3 display text-4xl font-bold tabular-nums" style={{ color: level.color }}>
                  {shown}
                </div>
                <div className="text-xs text-[var(--text-muted)]">монеток зібрано</div>

                <div
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: `${level.color}1F`, color: level.color, border: `1px solid ${level.color}55` }}
                >
                  <span>{level.emoji}</span> Рівень: {level.name}
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">{level.tagline}</p>
              </div>

              {/* Progress */}
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                  <span>{level.name}</span>
                  <span>{nextLevel ? nextLevel.name : "Максимум"}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/[.06]">
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{ width: `${pct}%`, background: level.gradient, boxShadow: `0 0 12px ${level.glow}` }}
                  />
                </div>
                <div className="mt-1.5 text-center text-[11px] text-[var(--text-muted)]">
                  {nextLevel
                    ? <>Ще <span className="font-semibold" style={{ color: level.color }}>{remaining}</span> монеток до рівня «{nextLevel.name}»</>
                    : "Ти на максимальному рівні 🔥"}
                </div>
              </div>

              {/* All levels */}
              <div className="mt-4 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Рівні</div>
                {COIN_LEVELS.map((l) => {
                  const reached = b >= l.min;
                  const current = l.id === level.id;
                  return (
                    <div
                      key={l.id}
                      className="flex items-center gap-2.5 rounded-xl border px-2.5 py-1.5"
                      style={{
                        borderColor: current ? `${l.color}66` : "var(--line)",
                        background: current ? `${l.color}14` : "transparent",
                        opacity: reached ? 1 : 0.5,
                      }}
                    >
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full text-[11px]"
                        style={{ background: l.gradient, color: l.onGradient }}
                      >
                        {l.emoji}
                      </span>
                      <span className="flex-1 text-xs font-medium">{l.name}</span>
                      <span className="text-[11px] tabular-nums text-[var(--text-muted)]">
                        {l.next === null ? `${l.min}+` : `${l.min}–${l.next - 1}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Teasers */}
              <div className="mt-4 space-y-1.5">
                <div className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white/[.02] px-3 py-2">
                  <Sparkles size={13} className="mt-0.5 shrink-0 text-[var(--cyan)]" />
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                    Монетка з'являється на екрані час від часу — тапни по ній, щоб зібрати. Денний ліміт — 60.
                  </p>
                </div>
                <div className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white/[.02] px-3 py-2">
                  <Gift size={13} className="mt-0.5 shrink-0 text-[var(--gold)]" />
                  <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                    Монетки дають участь у розіграшах і аірдропах — деталі у вкладці «Розіграші».
                  </p>
                </div>
              </div>
            </>
          )}

          {tab === "rating" && (
            <>
              {/* My rank card */}
              <div
                className="flex items-center gap-3 rounded-2xl border px-3.5 py-3"
                style={{ borderColor: `${level.color}55`, background: `${level.color}0F` }}
              >
                <Crown size={18} style={{ color: level.color }} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold">
                    {myRank ? <>Ти — #{myRank}</> : "Ти поки поза рейтингом"}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {optedIn
                      ? `${balance} монеток · учасників: ${stats.data?.total ?? "—"}`
                      : "Участь вимкнена — увімкни, щоб з'явитись"}
                  </div>
                </div>
              </div>

              {/* Opt-in toggle */}
              <button
                onClick={() => optIn.mutate(!optedIn)}
                disabled={optIn.isPending}
                className="mt-2.5 flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-white/[.02] px-3.5 py-2.5 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium">Брати участь у розіграшах</div>
                  <div className="text-[10px] text-[var(--text-muted)]">Твоє ім'я та баланс видно в рейтингу</div>
                </div>
                <span
                  className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
                  style={{ background: optedIn ? level.color : "rgba(255,255,255,.12)" }}
                >
                  <span
                    className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                    style={{ left: optedIn ? "22px" : "2px" }}
                  />
                </span>
              </button>

              {/* Leaderboard */}
              <div className="mt-4 space-y-1">
                {leaderboard.isLoading && (
                  <div className="py-6 text-center text-[11px] text-[var(--text-muted)]">Завантажую рейтинг…</div>
                )}
                {leaderboard.data?.length === 0 && (
                  <div className="py-6 text-center text-[11px] text-[var(--text-muted)]">
                    Рейтинг поки порожній — будь першим 🚀
                  </div>
                )}
                {leaderboard.data?.map((row) => (
                  <div
                    key={row.rank}
                    className="flex items-center gap-2.5 rounded-xl border px-2.5 py-2"
                    style={{
                      borderColor: row.is_me ? `${level.color}66` : "var(--line)",
                      background: row.is_me ? `${level.color}14` : "transparent",
                    }}
                  >
                    <span className="w-7 shrink-0 text-center text-[11px] font-bold tabular-nums text-[var(--text-muted)]">
                      {row.rank <= 3 ? MEDALS[row.rank - 1] : `#${row.rank}`}
                    </span>
                    {row.avatar_url ? (
                      <img src={row.avatar_url} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/[.07] text-[10px] font-bold">
                        {row.display_name.slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {row.display_name}
                      {row.is_me && <span className="ml-1 text-[10px]" style={{ color: level.color }}>(ти)</span>}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: row.is_me ? level.color : "var(--text-muted)" }}>
                      {row.balance} 🪙
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {tab === "raffles" && (
            <>
              {/* Coin ID card */}
              <div
                className="rounded-2xl border p-4 text-center"
                style={{ borderColor: `${level.color}55`, background: `${level.color}0F` }}
              >
                <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  <Ticket size={12} /> Твій Coin ID
                </div>
                <div className="mt-2 text-2xl font-bold tracking-widest tabular-nums" style={{ color: level.color }}>
                  {stats.isLoading ? "········" : code ?? "—"}
                </div>
                <button
                  onClick={copyCode}
                  disabled={!code}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-transform active:scale-95"
                  style={{ background: level.gradient, color: level.onGradient, boxShadow: `0 0 16px ${level.glow}` }}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? "Скопійовано" : "Копіювати"}
                </button>
                <p className="mt-3 text-[11px] leading-snug text-[var(--text-muted)]">
                  Замість скріншотів: під час розіграшу просто називаєш свій Coin ID —
                  організатор звіряє його з офіційним зрізом балансів.
                </p>
              </div>

              {/* Snapshots history */}
              <div className="mt-4 space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Мої результати в розіграшах
                </div>
                {snapshots.isLoading && (
                  <div className="py-4 text-center text-[11px] text-[var(--text-muted)]">Завантажую…</div>
                )}
                {snapshots.data?.length === 0 && (
                  <div className="rounded-xl border border-[var(--line)] bg-white/[.02] px-3 py-3 text-center text-[11px] text-[var(--text-muted)]">
                    Розіграшів ще не було — твій баланс уже рахується 🎯
                  </div>
                )}
                {snapshots.data?.map((s) => (
                  <div
                    key={s.snapshot_id}
                    className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white/[.02] px-3 py-2.5"
                  >
                    <Trophy size={14} className="shrink-0" style={{ color: level.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{s.title}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {fmtDate(s.taken_at)} · учасників: {s.participants}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-xs font-bold tabular-nums" style={{ color: level.color }}>{s.balance} 🪙</div>
                      <div className="text-[10px] tabular-nums text-[var(--text-muted)]">місце #{s.rank}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white/[.02] px-3 py-2">
                <Gift size={13} className="mt-0.5 shrink-0 text-[var(--gold)]" />
                <p className="text-[11px] leading-snug text-[var(--text-muted)]">
                  Зріз балансів фіксується в момент розіграшу і незмінний — твій результат
                  завжди можна перевірити тут. Жодних скріншотів.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
