import { AlertTriangle, RefreshCw, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function ErrorState({
  title = "Щось пішло не так",
  description,
  onRetry,
  showBack = true,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  showBack?: boolean;
}) {
  const nav = useNavigate();
  return (
    <div className="surface p-6 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: "rgba(255,92,122,.10)" }}>
        <AlertTriangle size={22} className="text-[var(--danger)]" />
      </div>
      <div className="text-sm font-semibold">{title}</div>
      {description && <div className="mt-1.5 text-xs text-[var(--text-muted)] break-words">{description}</div>}
      <div className="mt-4 flex items-center justify-center gap-2">
        {showBack && (
          <button
            onClick={() => nav(-1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs font-medium hover:bg-white/[.03]"
          >
            <ArrowLeft size={13} /> Назад
          </button>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1A0F00]"
            style={{ background: "var(--grad-active)" }}
          >
            <RefreshCw size={13} /> Спробувати ще
          </button>
        )}
      </div>
    </div>
  );
}
