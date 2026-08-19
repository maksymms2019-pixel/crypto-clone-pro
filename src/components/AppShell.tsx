import { Outlet, useLocation } from "react-router-dom";
import { BottomTabs } from "./BottomTabs";
import { InstallPWAPrompt } from "./InstallPWAPrompt";
import { OfflineBanner } from "./OfflineBanner";
import { BackButtonHandler } from "./BackButtonHandler";
import { ScrollToTop } from "./ScrollToTop";
import { CoinReward } from "./CoinReward";
import { ErrorBoundary } from "./ErrorBoundary";
import { motion, AnimatePresence } from "framer-motion";

export function AppShell() {
  const location = useLocation();
  // Hide bottom tabs on dedicated auth screens (less chrome, more focus).
  const hideTabs = ["/auth", "/reset-password"].includes(location.pathname);

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ paddingTop: "var(--sa-top)" }}>
      <ScrollToTop />
      <BackButtonHandler />
      <OfflineBanner />
      {!hideTabs && <CoinReward />}
      <main className={`flex-1 ${hideTabs ? "pb-6" : "pb-32"}`} style={!hideTabs ? { paddingBottom: "calc(7rem + var(--sa-bottom, 0px))" } : undefined}>
        <div className="mx-auto w-full max-w-[480px] px-4 pt-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <ErrorBoundary resetKey={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      {!hideTabs && (
        <>
          <InstallPWAPrompt />
          <BottomTabs />
        </>
      )}
    </div>
  );
}
