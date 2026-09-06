import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { haptic } from "@/lib/telegram";
import { toast } from "sonner";
import { Gift, X, Zap, Coins, Sparkles } from "lucide-react";

const sb = supabase as unknown as {
  rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<{ data: T | null; error: { message: string } | null }>;
};

export type ChestResp = {
  ok: boolean;
  error?: string;
  reward?: "slots" | "boost" | "shower";
  coins?: number[];
  total?: number;
  streak?: number;
  boost_until?: string | null;
  balance?: number;
  next_at?: string;
};

const COIN_FACE: Record<number, { bg: string; fg: string; label: string }> = {
  10: { bg: "linear-gradient(135deg,#F5D77A,#E7B650)", fg: "#1A0F00", label: "10" },
  30: { bg: "linear-gradient(135deg,#F4F9FF,#A9BCD6 55%,#7E93AF)", fg: "#0E1620", label: "30" },
  100: { bg: "linear-gradient(135deg,#DCF6FF,#7CD4F5 45%,#5B8DEF)", fg: "#06121F", label: "100" },
};

/** Human countdown like «за 3 год 12 хв». */
export function untilText(iso?: string | null) {
  if (!iso) return "";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "зараз";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `${h} год ${m} хв` : `${m} хв`;
}

/**
 * Daily chest modal. The reward is rolled entirely on the server —
 * the client only plays the animation of what came back.
 */
export function DailyChest({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [state, setState] = useState<"idle" | "opening" | "done">("idle");
  const [res, setRes] = useState<ChestResp | null>(null);
  const [revealed, setRevealed] = useState(0);

  if (!open) return null;

  const claim = async () => {
    if (state !== "idle") return;
    setState("opening");
    haptic("tap");
    try {
      const { data, error } = await sb.rpc<ChestResp>("claim_daily_chest");
      if (error) throw new Error(error.message);
      const r = (data ?? { ok: false }) as ChestResp;
      if (!r.ok) {
        toast.message(r.error === "wait" ? "Скриня вже відкрита — заходь пізніше 🎁" : "Не вдалось відкрити скриню");
        setState("idle");
        onClose();
        return;
      }
      setRes(r);
      setState("done");
      haptic("success");
      qc.invalidateQueries({ queryKey: ["coin-stats"] });
      qc.invalidateQueries({ queryKey: ["coin-leaderboard"] });
      if (r.reward === "slots" && r.coins?.length) {
        r.coins.forEach((_, i) => setTimeout(() => setRevealed(i + 1), 260 * i));
      }
    } catch {
      toast.message("Спробуй ще раз за мить");
      setState("idle");
    }
  };

  const close = () => {
    setState("idle");
    setRes(null);
    setRevealed(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-5">
      <button aria-label="Закрити" onClick={close} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-label="Щоденна скриня"
        className="relative w-full max-w-[360px] rounded-3xl border border-[var(--line)] bg-[var(--bg-elev)] p-5 text-center animate-in zoom-in-95"
        style={{ boxShadow: "0 0 60px rgba(240,192,78,.35)" }}
      >
        <button
          onClick={close}
          aria-label="Закрити"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-white/5"
        >
          <X size={15} />
        </button>

        {state !== "done" && (
          <>
            <div
              className={`mx-auto flex h-24 w-24 items-center justify-center rounded-3xl ${state === "opening" ? "animate-pulse" : "chest-ready"}`}
              style={{ background: "linear-gradient(135deg,#FFEBA6,#EBB63B 55%,#C98A12)", color: "#1A0F00", boxShadow: "0 0 34px rgba(240,192,78,.6)" }}
            >
              <Gift size={44} />
            </div>
            <h2 className="mt-4 text-lg font-bold">Щоденна скриня</h2>
            <p className="mt-1 text-[12px] leading-snug text-[var(--text-muted)]">
              Усередині — комбінація з 5 монет, буст ×2 на годину або золотий дощ.
              Заходь щодня: серія входів додає бонус.
            </p>
            <button
              onClick={claim}
              disabled={state === "opening"}
              className="mt-4 w-full rounded-full px-4 py-2.5 text-sm font-bold transition-transform active:scale-95 disabled:opacity-60"
              style={{ background: "linear-gradient(135deg,#FFEBA6,#EBB63B 55%,#C98A12)", color: "#1A0F00" }}
            >
              {state === "opening" ? "Відкриваю…" : "Відкрити скриню"}
            </button>
          </>
        )}

        {state === "done" && res && (
          <>
            {res.reward === "slots" && (
              <>
                <div className="flex items-center justify-center gap-1.5 pt-2">
                  {(res.coins ?? []).map((c, i) => {
                    const face = COIN_FACE[c] ?? COIN_FACE[10];
                    return (
                      <span
                        key={i}
                        className={`flex h-11 w-11 items-center justify-center rounded-full text-[11px] font-bold ${i < revealed ? "slot-in" : "opacity-0"}`}
                        style={{ background: face.bg, color: face.fg, boxShadow: "0 0 14px rgba(255,255,255,.25)" }}
                      >
                        +{face.label}
                      </span>
                    );
                  })}
                </div>
                <h2 className="mt-4 text-2xl font-bold text-[var(--gold)]">+{res.total} монеток</h2>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">Комбінація з 5 монет 🎰</p>
              </>
            )}

            {res.reward === "boost" && (
              <>
                <div
                  className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl lvl-badge lvl-diamond"
                  style={{ background: "linear-gradient(135deg,#DCF6FF,#7CD4F5 45%,#5B8DEF)", color: "#06121F" }}
                >
                  <Zap size={44} className="relative z-[2]" />
                </div>
                <h2 className="mt-4 text-2xl font-bold" style={{ color: "#8ADCF9" }}>Буст ×2</h2>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">
                  Найближчу годину кожна монетка дає вдвічі більше{res.total ? ` · +${res.total} бонусом` : ""}.
                </p>
              </>
            )}

            {res.reward === "shower" && (
              <>
                <div
                  className="mx-auto flex h-24 w-24 items-center justify-center rounded-3xl lvl-badge lvl-gold"
                  style={{ background: "linear-gradient(135deg,#FFEBA6,#EBB63B 55%,#C98A12)", color: "#1A0F00" }}
                >
                  <Coins size={44} className="relative z-[2]" />
                </div>
                <h2 className="mt-4 text-2xl font-bold text-[var(--gold)]">+{res.total} монеток</h2>
                <p className="mt-1 text-[12px] text-[var(--text-muted)]">Золотий дощ ✨</p>
              </>
            )}

            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1 text-[11px] text-[var(--text-muted)]">
              <Sparkles size={11} className="text-[var(--gold)]" /> Серія: {res.streak} дн. · баланс {res.balance}
            </div>
            <button
              onClick={close}
              className="mt-4 w-full rounded-full border border-[var(--line)] px-4 py-2.5 text-sm font-semibold active:scale-95"
            >
              Забрати
            </button>
          </>
        )}
      </div>
    </div>
  );
}
