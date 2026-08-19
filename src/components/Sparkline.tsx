export function Sparkline({
  data,
  width = 80,
  height = 28,
  tone,
}: {
  data: number[];
  width?: number;
  height?: number;
  tone?: "up" | "down" | "auto";
}) {
  if (!data || data.length < 2) return <div style={{ width, height }} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = width / (data.length - 1);
  const path = data
    .map((v, i) => {
      const x = i * step;
      const y = height - ((v - min) / span) * height;
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const actualTone =
    tone === "auto" || !tone ? (data[data.length - 1] >= data[0] ? "up" : "down") : tone;
  const color = actualTone === "up" ? "var(--accent)" : "var(--danger)";
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none">
      <path d={path} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
