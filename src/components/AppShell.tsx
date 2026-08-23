import { Outlet, useLocation, Link } from "react-router-dom";
import { BottomTabs } from "./BottomTabs";
import { InstallPWAPrompt } from "./InstallPWAPrompt";
import { OfflineBanner } from "./OfflineBanner";
import { BackButtonHandler } from "./BackButtonHandler";
import { ScrollToTop } from "./ScrollToTop";
import { CoinReward } from "./CoinReward";
import { ErrorBoundary } from "./ErrorBoundary";
import { motion, AnimatePresence } from "framer-motion";
import { Box, ChevronRight } from "lucide-react";

export function AppShell() {
  const location = useLocation();
  const hideTabs = ["/auth", "/reset-password"].includes(location.pathname);
  return <div className="min-h-[100dvh] flex flex-col" style={{ paddingTop: "var(--sa-top)" }}><ScrollToTop /><BackButtonHandler /><OfflineBanner />{!hideTabs && <CoinReward />}<main className={`flex-1 ${hideTabs ? "pb-6" : "pb-32"}`} style={!hideTabs ? { paddingBottom: "calc(7rem + var(--sa-bottom, 0px))" } : undefined}><div className="mx-auto w-full max-w-[480px] px-4 pt-3">{!hideTabs && location.pathname !== "/crates" && <Link to="/crates" className="group mb-3 flex items-center justify-between rounded-2xl border border-[var(--gold)]/20 bg-[linear-gradient(100deg,rgba(231,182,80,.12),rgba(90,200,224,.06))] px-4 py-3 transition-all hover:border-[var(--gold)]/40"><span className="flex items-center gap-3"><span className="rounded-xl bg-[var(--gold)]/15 p-2 text-[var(--gold)]"><Box size={17} /></span><span><span className="block text-sm font-semibold text-[var(--text)]">Daily Crate</span><span className="block text-xs text-[var(--text-muted)]">5 монет + шанс на 2× фарм</span></span></span><ChevronRight size={17} className="text-[var(--gold)] transition-transform group-hover:translate-x-1" /></Link>}<AnimatePresence mode="wait"><motion.div key={location.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}><ErrorBoundary resetKey={location.pathname}><Outlet /></ErrorBoundary></motion.div></AnimatePresence></div></main>{!hideTabs && <><InstallPWAPrompt /><BottomTabs /></>}</div>;
}
