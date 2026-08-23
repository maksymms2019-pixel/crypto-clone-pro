import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { ArrowLeft, Box, Check, Clock3, Coins, Gem, LockKeyhole, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

type Reward = { value: number; tier: "common" | "silver" | "diamond" };
type Booster = { type: "double_farm"; multiplier: number; expires_at: string } | null;
type CrateResult = { ok: boolean; already_opened?: boolean; rewards?: Reward[]; booster?: Booster; error?: string };

const tierStyles = {
  common: { label: "Монетка", icon: Coins, className: "border-[#e7b650]/30 bg-[#e7b650]/10 text-[#f4d58a]" },
  silver: { label: "Срібна", icon: Coins, className: "border-[#b9cdeb]/30 bg-[#b9cdeb]/10 text-[#dbe8fa]" },
  diamond: { label: "Діамант", icon: Gem, className: "border-[#7cd4f5]/40 bg-[#7cd4f5]/10 text-[#a9ebff]" },
} as const;

function nextReset() {
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  return next.toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}

export default function DailyCrates() {
  const { user } = useAuth();
  const [opening, setOpening] = useState(false);
  const [result, setResult] = useState<CrateResult | null>(null);

  async function openCrate() {
    setOpening(true);
    const { data, error } = await (supabase as unknown as { rpc: (name: string) => Promise<{ data: CrateResult | null; error: unknown }> }).rpc("open_daily_crate");
    setOpening(false);
    if (error || !data?.ok) {
      toast.error("Не вдалося відкрити скриню. Спробуй ще раз пізніше.");
      return;
    }
    setResult(data);
    if (!data.already_opened) toast.success("Скриню відкрито — нагороди вже додано!");
  }

  return (
    <div className="space-y-5 pb-4">
      <PageHeader title="Daily Crates" subtitle="Щоденний шанс на рідкісні монети" />
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] transition-colors hover:text-[var(--text)]"><ArrowLeft size={16} /> Назад до огляду</Link>

      <section className="relative overflow-hidden rounded-[28px] border border-[var(--gold)]/25 bg-[radial-gradient(circle_at_50%_20%,rgba(231,182,80,.18),transparent_48%),linear-gradient(145deg,#102b35,#07141b)] p-6 text-center shadow-[0_20px_70px_-30px_rgba(231,182,80,.45)]">
        <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-[#5ac8e0]/10 blur-3xl" />
        <div className="relative mx-auto mb-5 flex h-28 w-28 items-center justify-center rounded-[30px] border border-[#f4d58a]/40 bg-gradient-to-br from-[#ffe9a3] via-[#e7b650] to-[#9c6527] shadow-[0_14px_45px_-8px_rgba(231,182,80,.75)] transition-transform duration-500 hover:rotate-3 hover:scale-105">
          <Box size={58} strokeWidth={1.35} className="text-[#241506]" />
          <Sparkles size={20} className="absolute right-3 top-3 text-[#fff4c9]" />
        </div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[.22em] text-[var(--gold-soft)]">Скриня дня</p>
        <h2 className="display text-2xl font-bold text-[var(--text)]">Відкрий свій лут</h2>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[var(--text-muted)]">5 випадкових монет із шансом вибити срібну або діамантову.</p>
        {!user ? (
          <Link to="/auth" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-5 py-3 text-sm font-bold text-[#1a0f00] transition-transform hover:scale-[1.02]"><LockKeyhole size={16} /> Увійти, щоб відкрити</Link>
        ) : (
          <button type="button" onClick={openCrate} disabled={opening || Boolean(result)} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[var(--gold)] px-6 py-3 text-sm font-bold text-[#1a0f00] transition-all hover:scale-[1.02] hover:shadow-[0_0_28px_rgba(231,182,80,.35)] disabled:cursor-not-allowed disabled:opacity-60">
            {opening ? <><Sparkles size={16} className="animate-spin" /> Відкриваємо...</> : result ? <><Check size={16} /> Уже відкрито сьогодні</> : <><Box size={16} /> Відкрити скриню</>}
          </button>
        )}
      </section>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[{ label: "Монетка", value: "75%" }, { label: "Срібна", value: "20%" }, { label: "Діамант", value: "5%" }].map((item) => <div key={item.label} className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elev)] px-2 py-3"><div className="font-bold text-[var(--text)]">{item.value}</div><div className="mt-1 text-[var(--text-muted)]">{item.label}</div></div>)}
+      </div>
+
+      {result?.rewards && <section className="space-y-3 rounded-3xl border border-[var(--line)] bg-[var(--bg-elev)] p-4"><div className="flex items-center justify-between"><div><p className="text-xs uppercase tracking-[.16em] text-[var(--text-dim)]">Твій дроп</p><h3 className="mt-1 font-semibold text-[var(--text)]">{result.already_opened ? "Сьогоднішня нагорода" : "Скриню відкрито"}</h3></div><span className="text-xs text-[var(--text-muted)]">Наступна о {nextReset()}</span></div><div className="grid grid-cols-5 gap-2">{result.rewards.map((reward, index) => { const style = tierStyles[reward.tier]; const Icon = style.icon; return <div key={`${reward.tier}-${index}`} className={`flex flex-col items-center gap-2 rounded-2xl border p-3 ${style.className}`}><Icon size={18} /><span className="text-sm font-bold">+{reward.value}</span></div>; })}</div>{result.booster && <div className="flex items-center gap-3 rounded-2xl border border-[#5be49b]/25 bg-[#5be49b]/10 p-3"><div className="rounded-xl bg-[#5be49b]/15 p-2 text-[#5be49b]"><Zap size={18} /></div><div><p className="text-sm font-semibold text-[#b8f6d2]">2× фарм на 1 годину</p><p className="mt-0.5 text-xs text-[#8dcaa8]">Бустер активовано автоматично</p></div></div>}</section>}
+
+      <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-dim)]"><Clock3 size={14} /> Нова скриня доступна щодня після {nextReset()}</div>
+    </div>
+  );
+}
