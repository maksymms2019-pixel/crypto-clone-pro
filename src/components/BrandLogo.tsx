import { cn } from "@/lib/utils";

export function BrandLogo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("relative inline-flex items-center justify-center overflow-hidden rounded-full", className)}
      style={{
        width: size,
        height: size,
        boxShadow: "0 0 0 1px rgba(231,182,80,.35), 0 6px 22px -8px rgba(231,182,80,.6)",
      }}
    >
      <img src="/icon-512.png" alt="CryptoTime" className="h-full w-full object-cover" />
    </div>
  );
}

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className="display font-extrabold uppercase tracking-[0.06em] text-[var(--text)]">Crypto</span>
      <span
        className="script font-bold text-[var(--gold)]"
        style={{ fontSize: "1.5em", lineHeight: 1, textShadow: "0 0 16px var(--gold-glow)" }}
      >
        Time
      </span>
    </span>
  );
}
