import { Link } from "react-router-dom";
import { BrandLogo, BrandWordmark } from "@/components/BrandLogo";
import { SeoHead } from "@/components/SeoHead";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center">
      <SeoHead title="404 — Не знайдено" />
      <BrandLogo size={64} />
      <div className="mt-4 display text-[80px] font-bold leading-none gold-shimmer">404</div>
      <BrandWordmark className="mt-2 text-base" />
      <p className="mt-3 text-sm text-[var(--text-muted)] max-w-[260px]">
        Ця сторінка зникла, як alt-season коли всі чекали.
      </p>
      <Link to="/" className="mt-6 inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#1A0F00]" style={{ background: "var(--grad-active)" }}>
        <Home size={14} /> На головну
      </Link>
    </div>
  );
}
