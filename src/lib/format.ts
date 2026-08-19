export const fmtUsd = (n: number | null | undefined, opts?: { compact?: boolean; digits?: number }): string => {
  if (n == null || !isFinite(n)) return "—";
  const { compact, digits } = opts ?? {};
  if (compact) {
    if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
    if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
    if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
    if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  }
  const d = digits ?? (Math.abs(n) >= 1 ? 2 : 6);
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
};

export const fmtPct = (n: number | null | undefined, digits = 2): string => {
  if (n == null || !isFinite(n)) return "—";
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(digits)}%`;
};

export const toneFromPct = (n: number | null | undefined): "up" | "down" | "neutral" => {
  if (n == null || !isFinite(n)) return "neutral";
  if (n > 0) return "up";
  if (n < 0) return "down";
  return "neutral";
};

export const fmtNum = (n: number | null | undefined, digits = 2): string => {
  if (n == null || !isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

export const fmtCompact = (n: number | null | undefined, digits = 2): string => {
  if (n == null || !isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(digits)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(digits)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(digits)}K`;
  return n.toFixed(0);
};

export const timeAgo = (date: string | number | Date): string => {
  const d = new Date(date);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return `${sec}с`;
  if (sec < 3600) return `${Math.floor(sec / 60)}хв`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}год`;
  return `${Math.floor(sec / 86400)}д`;
};
