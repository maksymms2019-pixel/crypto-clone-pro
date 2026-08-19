import { useEffect, useState } from "react";
import { Download, X, Share } from "lucide-react";
import { isInTelegram } from "@/lib/telegram";

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "ct.install.dismissedAt";
const DISMISS_TTL = 7 * 24 * 60 * 60 * 1000;

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  const ua = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && !/crios|fxios/.test(ua);
}

export function InstallPWAPrompt() {
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [showIOS, setShowIOS] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isInTelegram() || isStandalone()) return;
    const dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (Date.now() - dismissed < DISMISS_TTL) return;

    const onBIP = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    if (isIOS()) {
      // iOS Safari doesn't fire beforeinstallprompt — show manual instructions
      const t = setTimeout(() => {
        setShowIOS(true);
        setHidden(false);
      }, 3500);
      return () => {
        clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBIP);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  if (hidden) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setHidden(true);
  }

  async function install() {
    if (!evt) return;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") dismiss();
  }

  return (
    <div
      className="fixed left-1/2 z-50 w-[calc(100%-24px)] max-w-[440px] -translate-x-1/2 surface p-3.5"
      style={{ bottom: `calc(80px + var(--sa-bottom))`, boxShadow: "0 20px 60px -20px rgba(0,0,0,.7)" }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: "var(--grad-active)" }}
        >
          {showIOS ? <Share size={18} className="text-[#1A0F00]" /> : <Download size={18} className="text-[#1A0F00]" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold">Встановити CryptoTime</div>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            {showIOS
              ? "Натисни «Поділитись» → «На екран Домівка» — і додаток працюватиме як нативний."
              : "Один тап — і CryptoTime з’явиться на головному екрані як справжній додаток."}
          </p>
          {!showIOS && (
            <button
              onClick={install}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#1A0F00]"
              style={{ background: "var(--grad-active)" }}
            >
              <Download size={13} /> Встановити
            </button>
          )}
        </div>
        <button onClick={dismiss} className="p-1 text-[var(--text-muted)] hover:text-[var(--text)]">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
