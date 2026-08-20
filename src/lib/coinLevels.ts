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
    id: "rookie",
    name: "Новачок",
    min: 0,
    next: 10,
    tagline: "Лови монетки, що з'являються на екрані",
    color: "#9AA6AD",
    glow: "rgba(154,166,173,.35)",
    gradient: "linear-gradient(135deg,#C2CBD1,#7D888F)",
    onGradient: "#12191D",
    emoji: "🪙",
  },
  {
    id: "bronze",
    name: "Бронза",
    min: 10,
    next: 50,
    tagline: "Гарний старт — колекція росте",
    color: "#CD8B4A",
    glow: "rgba(205,139,74,.45)",
    gradient: "linear-gradient(135deg,#E7B071,#A95F2B)",
    onGradient: "#1A0F00",
    emoji: "🥉",
  },
  {
    id: "silver",
    name: "Срібло",
    min: 50,
    next: 150,
    tagline: "Ти вже серед активних мисливців",
    color: "#B9C7D6",
    glow: "rgba(185,199,214,.5)",
    gradient: "linear-gradient(135deg,#F0F6FF,#8FA3B8)",
    onGradient: "#0E1620",
    emoji: "🥈",
  },
  {
    id: "gold",
    name: "Золото",
    min: 150,
    next: 500,
    tagline: "Золотий статус — тримай темп",
    color: "#E7B650",
    glow: "rgba(231,182,80,.6)",
    gradient: "linear-gradient(135deg,#FFE9A8,#DFA22A)",
    onGradient: "#1A0F00",
    emoji: "🥇",
  },
  {
    id: "legend",
    name: "Легенда",
    min: 500,
    next: null,
    tagline: "Топ-колекціонер CryptoTime 🔥",
    color: "#FF9B3D",
    glow: "rgba(255,122,60,.7)",
    gradient: "linear-gradient(135deg,#FFD98A,#FF7A3C 55%,#E7455F)",
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
