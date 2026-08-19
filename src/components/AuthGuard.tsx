import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { isInTelegram } from "@/lib/telegram";
import type { ReactNode } from "react";

export function AuthGuard({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="space-y-3 pt-6">
        <div className="skeleton h-8 w-32" />
        <div className="skeleton h-40 w-full" />
      </div>
    );
  }

  if (!session) {
    if (isInTelegram()) {
      return (
        <div className="surface p-6 text-center">
          <div className="text-sm text-[var(--text-muted)]">
            Не вдалось виконати авто-вхід через Telegram. Перезапусти Mini-App.
          </div>
        </div>
      );
    }
    return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  }

  return <>{children}</>;
}
