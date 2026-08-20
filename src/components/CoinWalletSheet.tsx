import { useEffect, useState } from "react";
import { Coins, Sparkles, Gift, Trophy, X } from "lucide-react";
import { COIN_LEVELS, levelProgress } from "@/lib/coinLevels";

/**
 * Coin wallet popup — opened from the balance pill.
 * Shows the balance, the current tier styling and how far the next tier is.
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
  const { level, nextLevel, pct, remaining, balance: b } = levelProgress(balance);
  const [shown, setShown] = useState(0);

  // Count-up animation for the big number.
  useEffect(() => {
    if (!open) { setShown(0); return; }
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
        className="relative w-full max-w-[440px] rounded-t-3xl sm:rounded-3xl border border-[var(--line)] bg-[var(--bg-elev)] p-5 shadow-2xl animate-in slide-in-from-bottom-4"
        style={{ paddingBottom: "calc(1.25rem + var(--sa-bottom, 0px))", boxShadow: `0 -10px 60px ${level.glow}` }}
      >
        <button
          onClick={onClose}
          aria-label="Закрити"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-white/5 hover:text-[var(--text)]"
        >
          <X size={16} />
        </button>

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
              Монетка з'являється на екрані час від часу — тапни по ній, щоб зібрати.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white/[.02] px-3 py-2">
            <Gift size={13} className="mt-0.5 shrink-0 text-[var(--gold)]" />
            <p className="text-[11px] leading-snug text-[var(--text-muted)]">
              Баланс зберігається — згодом монетки дадуть участь у розіграшах і бонусах.
            </p>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-[var(--line)] bg-white/[.02] px-3 py-2">
            <Trophy size={13} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <p className="text-[11px] leading-snug text-[var(--text-muted)]">
              Чим вищий рівень — тим яскравіший твій лічильник у застосунку.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
