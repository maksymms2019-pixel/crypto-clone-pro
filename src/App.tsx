import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthGuard } from "@/components/AuthGuard";
import { HelmetProvider } from "react-helmet-async";
import Dashboard from "@/pages/Dashboard";
import Markets from "@/pages/Markets";
import Portfolio from "@/pages/Portfolio";
import News from "@/pages/News";
import Calc from "@/pages/Calc";
import Settings from "@/pages/Settings";
import CoinDetail from "@/pages/CoinDetail";
import NotFound from "@/pages/NotFound";
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import Heatmap from "@/pages/Heatmap";
import Assistant from "@/pages/Assistant";
import DailyCrates from "@/pages/DailyCrates";
import { Toaster } from "sonner";
import { ensureTelegramSession } from "@/lib/auth";
import { isInTelegram } from "@/lib/telegram";

const API_URL = "http://95.182.82.131:8000";
export async function syncCoinsToBot(totalCoins: number) {
  if (window.Telegram?.WebApp) {
    const initData = window.Telegram.WebApp.initData;
    try { await fetch(`${API_URL}/api/update_coins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, coins: totalCoins }) }); } catch (error) { console.error("Помилка синхронізації монет:", error); }
  }
}

export default function App() {
  useEffect(() => { if (isInTelegram()) void ensureTelegramSession(); }, []);
  return <HelmetProvider><ErrorBoundary><Routes><Route element={<AppShell />}><Route path="/" element={<Dashboard />} /><Route path="/markets" element={<Markets />} /><Route path="/portfolio" element={<AuthGuard><Portfolio /></AuthGuard>} /><Route path="/news" element={<News />} /><Route path="/calc" element={<Calc />} /><Route path="/settings" element={<Settings />} /><Route path="/coin/:id" element={<CoinDetail />} /><Route path="/heatmap" element={<Heatmap />} /><Route path="/assistant" element={<Assistant />} /><Route path="/crates" element={<DailyCrates />} /><Route path="/auth" element={<Auth />} /><Route path="/reset-password" element={<ResetPassword />} /><Route path="/dashboard" element={<Navigate to="/" replace />} /><Route path="*" element={<NotFound />} /></Route></Routes><Toaster theme="dark" position="top-center" richColors closeButton offset="calc(var(--sa-top, 0px) + 64px)" mobileOffset="calc(var(--sa-top, 0px) + 64px)" /></ErrorBoundary></HelmetProvider>;
}
