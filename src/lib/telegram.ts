// Telegram Mini-App SDK helpers.
// Safe to import in any environment — degrades gracefully when window.Telegram is absent.

type TgWebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe?: { user?: { id: number; username?: string; first_name?: string; photo_url?: string; language_code?: string } };
  themeParams?: Record<string, string>;
  colorScheme?: "light" | "dark";
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  MainButton?: { setText(t: string): void; show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void; enable(): void; disable(): void };
  HapticFeedback?: { impactOccurred(s: "light" | "medium" | "heavy"): void; notificationOccurred(t: "error" | "success" | "warning"): void; selectionChanged(): void };
  CloudStorage?: { getItem(k: string, cb: (e: unknown, v: string) => void): void; setItem(k: string, v: string, cb?: (e: unknown, ok: boolean) => void): void };
  openLink?: (url: string, opts?: { try_instant_view?: boolean }) => void;
  openTelegramLink?: (url: string) => void;
};

declare global {
  interface Window { Telegram?: { WebApp?: TgWebApp } }
}

export function getTg(): TgWebApp | null {
  if (typeof window === "undefined") return null;
  return window.Telegram?.WebApp ?? null;
}

export function isInTelegram(): boolean {
  const tg = getTg();
  return !!(tg && tg.initData && tg.initData.length > 0);
}

export function initTelegram() {
  const tg = getTg();
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    tg.setHeaderColor?.("#03060C");
    tg.setBackgroundColor?.("#03060C");
  } catch (e) {
    console.warn("[telegram] init failed", e);
  }
}

export function haptic(kind: "tap" | "success" | "error" = "tap") {
  const tg = getTg();
  if (!tg?.HapticFeedback) return;
  try {
    if (kind === "tap") tg.HapticFeedback.impactOccurred("light");
    else if (kind === "success") tg.HapticFeedback.notificationOccurred("success");
    else tg.HapticFeedback.notificationOccurred("error");
  } catch { /* noop */ }
}

/** Open external links via Telegram's in-app browser when available. */
export function openExternal(url: string) {
  const tg = getTg();
  if (tg?.openLink) {
    try { tg.openLink(url, { try_instant_view: true }); return; } catch { /* noop */ }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
