import { levelFor } from "@/lib/coinLevels";

/**
 * Tiny animated level chip — used next to names in the leaderboard.
 */
export function LevelBadge({ balance, size = 18 }: { balance: number; size?: number }) {
  const level = levelFor(balance);
  return (
    <span
      title={level.name}
      aria-label={`Рівень: ${level.name}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full ${level.aura}`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.58,
        background: level.gradient,
        color: level.onGradient,
      }}
    >
      <span className="relative z-[2]">{level.emoji}</span>
    </span>
  );
}
