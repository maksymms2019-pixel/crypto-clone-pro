import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "gold",
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  tone?: "gold" | "cyan" | "accent" | "danger";
}) {
  const bg =
    tone === "cyan" ? "rgba(90,200,224,.10)"
    : tone === "accent" ? "rgba(91,228,155,.10)"
    : tone === "danger" ? "rgba(255,92,122,.10)"
    : "rgba(231,182,80,.10)";
  const color =
    tone === "cyan" ? "var(--cyan)"
    : tone === "accent" ? "var(--accent)"
    : tone === "danger" ? "var(--danger)"
    : "var(--gold)";
  return (
    <div className="surface p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: bg }}>
        <Icon size={28} style={{ color }} />
      </div>
      <h3 className="display text-lg font-semibold">{title}</h3>
      {description && <p className="mt-2 mx-auto max-w-[300px] text-sm text-[var(--text-muted)]">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
