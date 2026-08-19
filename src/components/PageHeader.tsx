import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";

export function PageHeader({
  title,
  subtitle,
  right,
  showLogo = false,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  showLogo?: boolean;
}) {
  return (
    <header className="mb-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {showLogo && <BrandLogo size={40} />}
        <div className="min-w-0">
          <h1 className="display text-[22px] font-semibold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--text-muted)] truncate">{subtitle}</p>}
        </div>
      </div>
      {right}
    </header>
  );
}
