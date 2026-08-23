import { useEffect, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Coins } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/telegram";
import { levelFor } from "@/lib/coinLevels";
import { CoinWalletSheet } from "./CoinWalletSheet";

type Pos = { top: number; left: number };

function randomPos(): Pos {
  return {
    top: 20 + Math.random() * 60,
    left: 8 + Math.random() * 78,
  };
}

export function CoinReward() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Pos>({ top: 40, left: 40 });
  const [claiming, setClaiming] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [pulse, setPulse] = useState(false);

  // Отримуємо Telegram ID
  const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

  // Зберігаємо Telegram ID в Supabase при завантаженні
  useEffect(() => {
    if (user && tgUserId) {
      supabase.from("user_points").update({ telegram_id: tgUserId }).eq("user_id", user.id);
    }
  }, [user, tgUserId]);

  const balance = useQuery({
    queryKey: ["points", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("user_points").select("balance").eq("user_id", user!.id).maybeSingle();
      return data?.balance ?? 0;
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    let spawnTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const delay = 25_000 + Math.random() * 45_000;
      spawnTimer = setTimeout(() => {
        setPos(randomPos());
        setVisible(true);
        hideTimer = setTimeout(() => {
          setVisible(false);
          schedule();
        }, 9_000);
      }, delay);
    };
    schedule();
    return () => {
      clearTimeout(spawnTimer);
      clearTimeout(hideTimer);
    };
  }, [user]);

  const claim = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    setVisible(false);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        toast.message("Увійди, щоб збирати монетки");
        return;
      }
      type AwardResp = { ok: boolean; balance?: number; error?: string };
      let { data, error } = await supabase.rpc("award_point", { _reason: "coin", _cooldown_seconds: 15 });
      if (error) {
        await new Promise((r) => setTimeout(r, 400));
        const retry = await supabase.rpc("award_point", { _reason: "coin", _cooldown_seconds: 15 });
        data = retry.data; error = retry.error;
      }
      if (error) throw error;
      const res = (data ?? {}) as AwardResp;
      if (!res.ok) {
        if (res.error === "cooldown") {
          toast.message("Зачекай трохи перед наступною монеткою");
        } else if (res.error === "not_authenticated") {
          toast.message("Увійди, щоб збирати монетки");
        } else {
          toast.message("Не вдалось зарахувати монетку");
        }
        if (typeof res.balance === "number") {
          qc.setQueryData(["points", user?.id], res.balance);
        }
      } else {
        haptic("success");
        toast.success("+1 монетка 🪙");
        
        // Негайно зберігаємо Telegram ID після збору
        if (tgUserId) {
          supabase.from("user_points").update({ telegram_id: tgUserId }).eq("user_id", user!.id);
        }

        if (typeof res.balance === "number") {
          qc.setQueryData(["points", user?.id], res.balance);
        } else {
          qc.invalidateQueries({ queryKey: ["points", user?.id] });
        }
      }
    } catch (e) {
      console.warn("[coin] award failed", e);
      toast.message("Спробуй ще раз за мить");
    } finally {
      setClaiming(false);
    }
  }, [claiming, qc, user?.id, tgUserId, user]);

  if (!user) return null;

  const bal = balance.data ?? 0;
  const level = levelFor(bal);

  return (
    <>
      <div className="pointer-events-none fixed right-3 z-50" style={{ top: "calc(var(--sa-top) + 8px)" }}>
        <button
          onClick={() => { haptic("tap"); setWalletOpen(true); }}
          aria-label="Мої монетки"
          className={`pointer-events-auto inline-flex items-center gap-1 rounded-full bg-[var(--bg-elev)]/90 px-2.5 py-1 text-xs font-semibold tabular-nums backdrop-blur transition-transform active:scale-95 ${pulse ? "animate-coin-pop" : ""}`}
          style={{
            color: level.color,
            border: `1px solid ${level.color}66`,
            boxShadow: `0 0 14px ${level.glow}`,
          }}
        >
          <Coins size={13} />
          {bal}
        </button>
      </div>

      <CoinWalletSheet open={walletOpen} onClose={() => setWalletOpen(false)} balance={bal} />

      {visible && (
        <button
          onClick={claim}
          aria-label="Зібрати монетку"
          className="fixed z-50 animate-coin-pop"
          style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-[#F5D77A] to-[#E7B650] text-[#1A0F00] shadow-[0_0_24px_rgba(231,182,80,.7)]">
            <Coins size={24} />
          </span>
        </button>
      )}
    </>
  );
}
