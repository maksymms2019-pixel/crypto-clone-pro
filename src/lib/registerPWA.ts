// Guarded PWA registration. Only registers in prod, outside iframes,
// and never on Lovable preview hosts. Supports ?sw=off kill-switch.

const SW_PATH = "/sw.js";

function inIframe(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

function isLovablePreview(host: string): boolean {
  return (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" || host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")
  );
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(regs.map((r) => {
    const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
    if (url.endsWith(SW_PATH)) return r.unregister();
    return Promise.resolve();
  }));
}

export function registerPWA() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const host = window.location.hostname;
  const killSwitch = new URLSearchParams(window.location.search).get("sw") === "off";
  const shouldSkip =
    !import.meta.env.PROD ||
    inIframe() ||
    isLovablePreview(host) ||
    killSwitch;

  if (shouldSkip) {
    void unregisterMatching();
    return;
  }

  import("virtual:pwa-register")
    .then(({ registerSW }) => {
      registerSW({ immediate: true });
    })
    .catch((e) => console.warn("[pwa] register failed", e));
}
