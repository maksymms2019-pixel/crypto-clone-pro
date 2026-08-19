import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { getTg } from "@/lib/telegram";

/** Wires Telegram BackButton to react-router for nested pages. */
export function BackButtonHandler() {
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    const tg = getTg();
    if (!tg?.BackButton) return;
    const isRoot = ["/", "/markets", "/portfolio", "/news", "/settings"].includes(loc.pathname);
    const onBack = () => nav(-1);
    if (isRoot) {
      tg.BackButton.hide();
    } else {
      tg.BackButton.onClick(onBack);
      tg.BackButton.show();
    }
    return () => {
      tg.BackButton?.offClick(onBack);
      tg.BackButton?.hide();
    };
  }, [loc.pathname, nav]);

  return null;
}
