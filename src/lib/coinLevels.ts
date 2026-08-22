/**
 * Coin (points) gamification levels.
 *
 * Each tier changes the look of the balance pill and of the wallet sheet, so
 * collecting more coins visibly upgrades the UI — the whole point of the
 * reward loop. Thresholds are inclusive on `min`.
 */
export type CoinLevel = {
  id: string;
  name: string;
  min: number;
  /** First coin count of the NEXT level; null for the last one. */
  next: number | null;
  tagline: string;
  /** Main accent color of the tier. */
  color: string;
  /** Soft glow color (rgba). */
  glow: string;
  /** Gradient used for the big coin badge. */
  gradient: string;
  /** Text color that reads well on top of `gradient`. */
  onGradient: string;
  emoji: string;
};

export const COIN_LEVELS: CoinLevel[] = [
  {
    id: "bronze",
    name: "Бронза",
    min: 0,
    next: 15,
    tagline: "Початок колекції — лови монетки на екрані",
    color: "#D08A4E",
    glow: "rgba(208,138,78,.5)",
    gradient: "linear-gradient(135deg,#EBB582,#B06F3A 55%,#8A4F26)",
    onGradient: "#1F1206",
    emoji: "🥉",
  },
  {
    id: "silver",
    name: "Срібло",
    min: 15,
    next: 50,
    tagline: "Холодний метал — ти вже в грі",
    color: "#C9D8EC",
    glow: "rgba(185,205,235,.55)",
    gradient: "linear-gradient(135deg,#F4F9FF,#A9BCD6 55%,#7E93AF)",
    onGradient: "#0E1620",
    emoji: "🥈",
  },
  {
    id: "gold",
    name: "Золото",
    min: 50,
    next: 150,
    tagline: "Золотий статус — тримай темп",
    color: "#F0C04E",
    glow: "rgba(240,192,78,.6)",
    gradient: "linear-gradient(135deg,#FFEBA6,#EBB63B 55%,#C98A12)",
    onGradient: "#1A0F00",
    emoji: "🥇",
  },
  {
    id: "diamond",
    name: "Діамант",
    min: 150,
    next: 300,
    tagline: "Крижаний кристал — еліта мисливців",
    color: "#8ADCF9",
    glow: "rgba(127,216,247,.65)",
    gradient: "linear-gradient(135deg,#DCF6FF,#7CD4F5 45%,#5B8DEF)",
    onGradient: "#06121F",
    emoji: "💎",
  },
  {
    id: "legend",
    name: "Легенда",
    min: 300,
    next: null,
    tagline: "Топ-колекціонер CryptoTime 🔥",
    color: "#FF8A3D",
    glow: "rgba(255,122,60,.75)",
    gradient: "linear-gradient(135deg,#FFD98A,#FF7A3C 50%,#F43F5E)",
    onGradient: "#26100A",
    emoji: "🔥",
  },
];

export function levelFor(balance: number): CoinLevel {
  const b = Math.max(0, Math.floor(balance || 0));
  let lvl = COIN_LEVELS[0];
  for (const l of COIN_LEVELS) if (b >= l.min) lvl = l;
  return lvl;
}

export function levelProgress(balance: number) {
  const b = Math.max(0, Math.floor(balance || 0));
  const level = levelFor(b);
  const idx = COIN_LEVELS.findIndex((l) => l.id === level.id);
  const nextLevel = level.next === null ? null : COIN_LEVELS[idx + 1];
  const span = level.next === null ? 0 : level.next - level.min;
  const pct = level.next === null ? 100 : Math.min(100, Math.round(((b - level.min) / span) * 100));
  const remaining = level.next === null ? 0 : Math.max(0, level.next - b);
  return { level, nextLevel, pct, remaining, balance: b };
}
