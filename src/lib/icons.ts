// Coin icons are served through our own edge function so they load inside the
// Telegram WebView (which blocks some third-party CDN images) and so canvas /
// PNG exports are never tainted by cross-origin pixels.

const BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/markets-proxy`;

export function iconUrl(url?: string | null): string {
  const u = (url ?? "").trim();
  if (!u || !/^https?:\/\//i.test(u)) return u;
  return `${BASE}?icon=${encodeURIComponent(u)}`;
}
