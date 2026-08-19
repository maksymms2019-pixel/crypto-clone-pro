import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { sendReset } from "@/lib/auth";
import { BrandLogo } from "@/components/BrandLogo";
import { SeoHead } from "@/components/SeoHead";
import { Loader2, Mail, Lock } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const nav = useNavigate();
  // detect recovery flow
  const [phase, setPhase] = useState<"request" | "set">("request");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Supabase puts type=recovery in URL hash after the email link is clicked.
    if (typeof window === "undefined") return;
    const hash = window.location.hash;
    if (hash.includes("type=recovery") || hash.includes("access_token")) {
      setPhase("set");
    }
    // also listen for PASSWORD_RECOVERY event
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setPhase("set");
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function request(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    setBusy(true);
    const { error } = await sendReset(email);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Лист відправлено — перевір пошту");
  }

  async function set(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Пароль оновлено");
    nav("/", { replace: true });
  }

  return (
    <div className="space-y-5">
      <SeoHead title="Відновлення пароля" />
      <header className="flex flex-col items-center text-center pt-4">
        <BrandLogo size={56} />
        <h1 className="display text-xl font-semibold mt-3">
          {phase === "request" ? "Відновити пароль" : "Новий пароль"}
        </h1>
        <p className="mt-1.5 text-xs text-[var(--text-muted)] max-w-[280px]">
          {phase === "request" ? "Введи email — надішлемо посилання для відновлення." : "Введи новий пароль для свого акаунту."}
        </p>
      </header>

      <form onSubmit={phase === "request" ? request : set} className="surface p-5 space-y-3">
        {phase === "request" ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5">
            <Mail size={15} className="text-[var(--text-muted)]" />
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" className="w-full bg-transparent outline-none text-sm" />
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5">
            <Lock size={15} className="text-[var(--text-muted)]" />
            <input type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Новий пароль" className="w-full bg-transparent outline-none text-sm" />
          </div>
        )}
        <button type="submit" disabled={busy} className="w-full rounded-xl py-2.5 text-sm font-semibold text-[#1A0F00] flex items-center justify-center gap-2" style={{ background: "var(--grad-active)" }}>
          {busy && <Loader2 size={14} className="animate-spin" />}
          {phase === "request" ? "Надіслати" : "Зберегти"}
        </button>
      </form>
    </div>
  );
}
