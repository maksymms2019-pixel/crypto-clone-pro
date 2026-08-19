import { NavLink } from "react-router-dom";
import { LayoutGrid, LineChart, Wallet, Newspaper, MoreHorizontal } from "lucide-react";
import { haptic } from "@/lib/telegram";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

export function BottomTabs() {
  const { t } = useT();
  const tabs = [
    { to: "/", label: t("tab.dashboard"), Icon: LayoutGrid, end: true },
    { to: "/markets", label: t("tab.markets"), Icon: LineChart, end: false },
    { to: "/portfolio", label: t("tab.portfolio"), Icon: Wallet, end: false },
    { to: "/news", label: t("tab.news"), Icon: Newspaper, end: false },
    { to: "/settings", label: t("tab.more"), Icon: MoreHorizontal, end: false },
  ];
  return (
    <nav
      className="tabbar fixed bottom-0 inset-x-0 z-40 border-t border-[var(--line)]"
      style={{
        background: "linear-gradient(180deg, rgba(7,9,15,.85) 0%, rgba(3,6,12,.95) 100%)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="mx-auto max-w-[480px] grid grid-cols-5">
        {tabs.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            onClick={() => haptic("tap")}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors",
                isActive ? "text-[var(--accent-active)]" : "text-[var(--text-muted)]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={20}
                  strokeWidth={isActive ? 2.4 : 1.8}
                  style={isActive ? { filter: "drop-shadow(0 0 10px var(--accent-active-glow))" } : undefined}
                />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
