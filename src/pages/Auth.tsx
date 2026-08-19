import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { consumeAuthReturnPath, normalizeAuthReturnPath, signInEmail, signUpEmail, useAuth } from "@/lib/auth";
import { BrandLogo, BrandWordmark } from "@/components/BrandLogo";
import { SeoHead } from "@/components/SeoHead";
import { Mail, Lock, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Navigate } from "react-router-dom";

export default function Auth() {
  const { session, loading: authLoading } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const returnPath = normalizeAuthReturnPath((loc.state as { from?: string } | null)?.from);

  if (!authLoading && session) {
    const to = consumeAuthReturnPath(returnPath);
    return <Navigate to={to} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await signInEmail(email, password);
        if (error) { toast.error(translateAuthError(error.message)); return; }
        toast.success("З поверненням!");
        nav(consumeAuthReturnPath(returnPath), { replace: true });
      } else {
        const { data, error } = await signUpEmail(email, password, name || undefined);
        if (error) { toast.error(translateAuthError(error.message)); return; }

        // Автопідтвердження увімкнено — сесія приходить одразу.
        if (data?.session) {
          toast.success("Реєстрація успішна! Вітаємо.");
          nav(consumeAuthReturnPath(returnPath), { replace: true });
        } else {
          // Резерв: якщо сесія не прийшла, спробуємо одразу увійти.
          const { error: signErr } = await signInEmail(email, password);
          if (signErr) {
            toast.success("Акаунт створено! Увійди, будь ласка.");
            setMode("signin");
          } else {
            toast.success("Реєстрація успішна! Вітаємо.");
            nav(consumeAuthReturnPath(returnPath), { replace: true });
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <SeoHead title="Вхід / Реєстрація" description="Увійди в CryptoTime — слідкуй за крипто-ринком, веди портфоліо та читай новини." />

      <header className="flex flex-col items-center text-center pt-4">
        <BrandLogo size={64} />
        <div className="mt-3 display text-[28px] font-bold"><BrandWordmark /></div>
        <p className="mt-2 text-xs text-[var(--text-muted)] max-w-[280px]">
          Крипто-огляд, портфоліо й новини. Все в одному місці.
        </p>
      </header>

      <div className="surface p-5">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg)] mb-4">
          {(["signin", "signup"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`py-2 text-sm font-medium rounded-lg transition-colors ${
                mode === m ? "bg-[var(--bg-elev)] text-[var(--gold)]" : "text-[var(--text-muted)]"
              }`}
            >
              {m === "signin" ? "Вхід" : "Реєстрація"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Field>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Імʼя (опційно)"
                className="w-full bg-transparent outline-none text-sm"
              />
            </Field>
          )}
          <Field icon={<Mail size={15} />}>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full bg-transparent outline-none text-sm"
            />
          </Field>
          <Field icon={<Lock size={15} />}>
            <input
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Пароль (мін. 6 символів)"
              className="w-full bg-transparent outline-none text-sm"
            />
          </Field>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl py-2.5 text-sm font-semibold text-[#1A0F00] disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: "var(--grad-active)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {mode === "signin" ? "Увійти" : "Створити акаунт"}
          </button>

        </form>

      </div>

      <p className="text-center text-[11px] text-[var(--text-dim)]">
        Реєструючись, ти погоджуєшся з умовами використання.
      </p>
    </div>
  );
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Невірний email або пароль.";
  if (m.includes("already registered") || m.includes("already been registered") || m.includes("user already"))
    return "Акаунт з таким email вже існує. Спробуй увійти.";
  if (m.includes("email not confirmed")) return "Email ще не підтверджено.";
  if (m.includes("password should be at least") || m.includes("at least 6"))
    return "Пароль має містити щонайменше 6 символів.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Невірний формат email.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Забагато спроб. Зачекай хвилину й спробуй знову.";
  if (m.includes("pwned") || m.includes("compromised") || m.includes("data breach"))
    return "Цей пароль скомпрометований. Обери надійніший.";
  return msg;
}

function Field({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-2.5 focus-within:border-[var(--gold)] transition-colors">
      {icon && <span className="text-[var(--text-muted)]">{icon}</span>}
      {children}
    </div>
  );
}
