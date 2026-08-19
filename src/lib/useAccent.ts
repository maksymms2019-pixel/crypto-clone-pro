// Accent system — applies CSS variables to <html> so any component that uses
// var(--accent-active) / var(--grad-active) follows the user's choice.

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type AccentName = "gold" | "cyan" | "accent" | "ocean";

const STORAGE_KEY = "ct.accent";
const EVENT = "accent-change";

const ACCENTS: Record<AccentName, { color: string; glow: string; grad: string }> = {
  gold:   { color: "#E7B650", glow: "rgba(231,182,80,.42)", grad: "linear-gradient(135deg,#F4D58A 0%,#E7B650 45%,#B6863A 100%)" },
  cyan:   { color: "#5AC8E0", glow: "rgba(90,200,224,.42)", grad: "linear-gradient(135deg,#9EE6F5 0%,#5AC8E0 45%,#2A7D96 100%)" },
  accent: { color: "#5BE49B", glow: "rgba(91,228,155,.42)", grad: "linear-gradient(135deg,#A8F2C9 0%,#5BE49B 45%,#2E9A66 100%)" },
  ocean:  { color: "#6DA8FF", glow: "rgba(109,168,255,.42)", grad: "linear-gradient(135deg,#9DC4FF 0%,#6DA8FF 45%,#2A5BA8 100%)" },
};

function readStored(): AccentName {
  if (typeof window === "undefined") return "gold";
  const v = localStorage.getItem(STORAGE_KEY) as AccentName | null;
  return v && v in ACCENTS ? v : "gold";
}

export function applyAccent(name: AccentName) {
  const a = ACCENTS[name] ?? ACCENTS.gold;
  const root = document.documentElement;
  root.style.setProperty("--accent-active", a.color);
  root.style.setProperty("--accent-active-glow", a.glow);
  root.style.setProperty("--grad-active", a.grad);
  root.dataset.accent = name;
}

export function setAccentLocal(name: AccentName) {
  localStorage.setItem(STORAGE_KEY, name);
  applyAccent(name);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: name }));
}

export function initAccent() {
  applyAccent(readStored());
}

export function useAccent() {
  const { user } = useAuth();
  const [accent, setAccentState] = useState<AccentName>(() => readStored());

  // Listen for changes from other components
  useEffect(() => {
    const onChange = (e: Event) => setAccentState((e as CustomEvent).detail as AccentName);
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  // Sync from profile on sign-in
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("profiles").select("accent_color").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      const v = data?.accent_color as AccentName | undefined;
      if (v && v in ACCENTS && v !== readStored()) {
        setAccentLocal(v);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const change = useCallback(async (name: AccentName) => {
    setAccentLocal(name);
    if (user) {
      await supabase.from("profiles").update({ accent_color: name }).eq("id", user.id);
    }
  }, [user]);

  return { accent, setAccent: change };
}
