import { useQuery } from "@tanstack/react-query";
import { fetchFearGreed } from "@/lib/markets";

export function FearGreedGauge() {
  const q = useQuery({ queryKey: ["fg"], queryFn: fetchFearGreed, staleTime: 10 * 60_000 });
  const v = q.data?.value ?? null;

  // Gauge geometry — 180° arc
  const R = 56;
  const cx = 70;
  const cy = 70;
  const startAngle = 180; // left
  const endAngle = 360;   // right (via top)
  const pct = v == null ? 0 : Math.max(0, Math.min(100, v)) / 100;
  const angle = startAngle + (endAngle - startAngle) * pct;
  const rad = (a: number) => (a * Math.PI) / 180;
  const tx = cx + R * Math.cos(rad(angle));
  const ty = cy + R * Math.sin(rad(angle));

  const tone =
    v == null ? "neutral" :
    v >= 75 ? "greed" : v >= 55 ? "warm" : v >= 45 ? "neutral" : v >= 25 ? "cool" : "fear";
  const color =
    tone === "greed" ? "#5BE49B" : tone === "warm" ? "#9BE090" :
    tone === "neutral" ? "#E7B650" : tone === "cool" ? "#FFB547" : "#FF5C7A";

  const label =
    v == null ? "—" :
    v >= 75 ? "Жадібність" : v >= 55 ? "Помірна жадібність" :
    v >= 45 ? "Нейтрально" : v >= 25 ? "Страх" : "Сильний страх";

  return (
    <div className="surface p-4 flex items-center gap-4">
      <svg width="140" height="86" viewBox="0 0 140 86">
        <defs>
          <linearGradient id="fg-grad" x1="0" x2="1">
            <stop offset="0%" stopColor="#FF5C7A" />
            <stop offset="50%" stopColor="#E7B650" />
            <stop offset="100%" stopColor="#5BE49B" />
          </linearGradient>
        </defs>
        <path
          d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke="url(#fg-grad)" strokeWidth="10" strokeLinecap="round" opacity="0.85"
        />
        {/* Needle */}
        <line x1={cx} y1={cy} x2={tx} y2={ty} stroke={color} strokeWidth="3" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="4" fill={color} />
      </svg>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Fear & Greed</div>
        <div className="display text-3xl font-bold tabular-nums" style={{ color }}>{v ?? "—"}</div>
        <div className="text-xs text-[var(--text-muted)]">{label}</div>
      </div>
    </div>
  );
}
