import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "up" | "down" | "neutral";

export function MetricCard({
  label,
  value,
  hint,
  tone = "neutral",
  children,
  loading,
  className,
}: {
  label: string;
  value?: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  children?: ReactNode;
  loading?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("mcard", className)}>
      <div className={`mcard__glow mcard__glow--${tone}`} />
      <div className="relative">
        <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{label}</div>
        <div className="mt-2 min-h-[32px]">
          {loading ? (
            <div className="skeleton h-7 w-24" />
          ) : (
            <div
              className={cn(
                "text-[26px] font-semibold leading-none",
                tone === "up" && "num-glow-up",
                tone === "down" && "num-glow-down",
              )}
            >
              {value ?? "—"}
            </div>
          )}
        </div>
        {hint && <div className="mt-2 text-xs text-[var(--text-muted)]">{hint}</div>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </div>
  );
}
