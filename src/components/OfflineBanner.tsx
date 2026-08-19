import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <div
      className="fixed left-1/2 z-40 -translate-x-1/2 rounded-full border border-[var(--line-strong)] px-3 py-1.5 text-xs flex items-center gap-1.5"
      style={{ top: `calc(8px + var(--sa-top))`, background: "rgba(20,30,40,.95)", backdropFilter: "blur(10px)" }}
    >
      <WifiOff size={12} className="text-[var(--warn)]" /> Офлайн — показуємо збережені дані
    </div>
  );
}
