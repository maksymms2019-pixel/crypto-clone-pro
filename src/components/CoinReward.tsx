import { useEffect, useState, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Coins, Gem } from "lucide-react";
import { toast } from "sonner";
import { haptic } from "@/lib/telegram";
import { levelFor } from "@/lib/coinLevels";
import { CoinWalletSheet } from "./CoinWalletSheet";

type Pos = { top: number; left: number };

// Generated DB types lack telegram_id and the coin RPCs (external DB), so
// coin calls go through a loosely-typed facade.
const sb = supabase as unknown as {
  rpc<T = unknown>(
    fn: string,
    args?: Record<string, unknown>,
  ): Promise<{ data: T | null; error: { message: string } | null }>;
  from(table: string): {
    update(values: Record<string, unknown>): { eq(col: string, val: unknown): Promise<unknown> };
  };
};

type CoinStats = {
  balance: number;
  code: string | null;
  opt_in: boolean;
  rank: number | null;
  total: number;
};

type CoinType = {
  id: "common" | "silver" | "diamond";
  delta: number;
  chance: number;
  size: number;
  gradient: string;
  text: string;
  glow: string;
  label: string;
};

const COIN_TYPES: CoinType[] = [
  {
    id: "common",
    delta: 10,
    chance: 0.75,
    size: 48,
    gradient: "linear-gradient(135deg,#F5D77A,#E7B650)",
    text: "#1A0F00",
    glow: "rgba(231,182,80,.7)",
    label: "Монетка",
  },
  {
    id: "silver",
    delta: 30,
    chance: 0.2,
    size: 54,
    gradient: "linear-gradient(135deg,#F4F9FF,#A9BCD6 55%,#7E93AF)",
    text: "#0E1620",
    glow: "rgba(185,205,235,.85)",
    label: "Срібна монета",
  },
  {
    id: "diamond",
    delta: 100,
    chance: 0.05,
    size: 60,
    gradient: "linear-gradient(135deg,#DCF6FF,#7CD4F5 45%,#5B8DEF)",
    text: "#06121F",
    glow: "rgba(127,216,247,.95)",
    label: "Діамантова монета",
  },
];

function rollCoinType(): CoinType {
  const r = Math.random();
  let acc = 0;
  for (const t of COIN_TYPES) {
    acc += t.chance;
    if (r < acc) return t;
  }
  return COIN_TYPES[0];
}

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
  const [coin, setCoin] = useState<CoinType>(COIN_TYPES[0]);
  const [claiming, setClaiming] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevLevel = useRef<string | null>(null);

  // Отримуємо Telegram ID
  const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;

  const saveTelegramId = useCallback(() => {
    if (user && tgUserId) {
      void sb.from("user_points").update({ telegram_id: tgUserId }).eq("user_id", user.id);
    }
  }, [user, tgUserId]);

  // Зберігаємо Telegram ID в Supabase при завантаженні
  useEffect(() => {
    saveTelegramId();
  }, [saveTelegramId]);

  const stats = useQuery({
    queryKey: ["coin-stats", user?.id],
    queryFn: async () => {
      const { data, error } = await sb.rpc<CoinStats>("my_coin_stats");
      if (error) throw new Error(error.message);
      return data;
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!user) return;
    let spawnTimer: ReturnType<typeof setTimeout>;
    let hideTimer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      const delay = 25_000 + Math.random() * 45_000;
      spawnTimer = setTimeout(() => {
        setPos(randomPos());
        setCoin(rollCoinType());
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
      const args = { _reason: "coin", _cooldown_seconds: 15, _delta: coin.delta };
      let { data, error } = await sb.rpc<AwardResp>("award_point", args);
      if (error) {
        await new Promise((r) => setTimeout(r, 400));
        const retry = await sb.rpc<AwardResp>("award_point", args);
        data = retry.data; error = retry.error;
      }
      if (error) throw error;
      const res = (data ?? {}) as AwardResp;
      if (!res.ok) {
        if (res.error === "cooldown") {
          toast.message("Зачекай трохи перед наступною монеткою");
        } else if (res.error === "daily_limit") {
          toast.message("Денний ліміт монеток — повертайся завтра 🌙");
        } else if (res.error === "not_authenticated") {
          toast.message("Увійди, щоб збирати монетки");
        } else {
          toast.message("Не вдалось зарахувати монетку");
        }
        if (typeof res.balance === "number") {
          qc.setQueryData<CoinStats | undefined>(["coin-stats", user?.id], (old) =>
            old ? { ...old, balance: res.balance! } : old,
          );
        }
      } else {
        haptic(coin.id === "common" ? "success" : "success");
        if (coin.id === "diamond") toast.success(`ДІАМАНТОВА! +${coin.delta} монеток 💎`);
        else if (coin.id === "silver") toast.success(`Срібна монета! +${coin.delta} ✨`);
        else toast.success(`+${coin.delta} монеток 🪙`);

        // Негайно зберігаємо Telegram ID після збору
        saveTelegramId();

        if (typeof res.balance === "number") {
          const prevBal = stats.data?.balance;
          qc.setQueryData<CoinStats | undefined>(["coin-stats", user?.id], (old) =>
            old ? { ...old, balance: res.balance! } : old,
          );
          // Разова анімація + тост при підвищенні рівня
          if (typeof prevBal === "number") {
            const now = levelFor(res.balance);
            const before = levelFor(prevBal);
            if (now.id !== before.id && prevLevel.current !== now.id) {
              prevLevel.current = now.id;
              setPulse(true);
              setTimeout(() => setPulse(false), 900);
              toast.success(`Новий рівень: ${now.name} ${now.emoji}`);
            }
          }
        } else {
          qc.invalidateQueries({ queryKey: ["coin-stats", user?.id] });
        }
      }
    } catch (e) {
      console.warn("[coin] award failed", e);
      toast.message("Спробуй ще раз за мить");
    } finally {
      setClaiming(false);
    }
  }, [claiming, qc, user?.id, coin, stats.data?.balance, saveTelegramId]);

  if (!user) return null;

  const bal = stats.data?.balance ?? 0;
  const level = levelFor(bal);
  const Icon = coin.id === "diamond" ? Gem : Coins;

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
          aria-label={`Зібрати: ${coin.label} (+${coin.delta})`}
          className={`fixed z-50 animate-coin-pop ${coin.id === "diamond" ? "animate-pulse" : ""}`}
          style={{ top: `${pos.top}%`, left: `${pos.left}%` }}
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              width: coin.size,
              height: coin.size,
              background: coin.gradient,
              color: coin.text,
              boxShadow: `0 0 ${coin.id === "common" ? 24 : 34}px ${coin.glow}`,
              border: coin.id === "common" ? "none" : "2px solid rgba(255,255,255,.55)",
            }}
          >
            <Icon size={coin.size / 2} />
          </span>
        </button>
      )}
    </>
  );
}
