import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { BrandWordmark } from "@/components/BrandLogo";
import { SeoHead } from "@/components/SeoHead";
import { LogOut, Send, Palette, Globe, Trash2, Loader2, Map, Calculator, Camera, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getTg, isInTelegram } from "@/lib/telegram";
import { useAccent, type AccentName } from "@/lib/useAccent";
import { useT, setLang, type Lang } from "@/lib/i18n";

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  accent_color: string;
  theme: string;
  lang: string;
};

const ACCENT_OPTIONS: { name: AccentName; color: string; labelKey: "accent.gold" | "accent.cyan" | "accent.accent" | "accent.ocean" }[] = [
  { name: "gold",   color: "#E7B650", labelKey: "accent.gold" },
  { name: "cyan",   color: "#5AC8E0", labelKey: "accent.cyan" },
  { name: "accent", color: "#5BE49B", labelKey: "accent.accent" },
  { name: "ocean",  color: "#6DA8FF", labelKey: "accent.ocean" },
];

export default function Settings() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { t, lang } = useT();
  const { accent, setAccent } = useAccent();
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);

  const profile = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!user,
  });

  const updateProfile = useMutation({
    mutationFn: async (patch: Partial<Profile>) => {
      const { error } = await supabase.from("profiles").update(patch).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); toast.success(t("settings.saved")); },
    onError: (e: Error) => toast.error(e.message),
  });

  async function deleteAccount() {
    if (!confirm(lang === "uk"
      ? "Видалити дані назавжди? Це не можна скасувати."
      : "Delete data permanently? This cannot be undone.")) return;
    await Promise.all([
      supabase.from("trades").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      supabase.from("watchlist").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      supabase.from("holdings").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
    ]);
    await signOut();
    toast.success(lang === "uk" ? "Дані видалено." : "Data removed.");
    nav("/auth", { replace: true });
  }

  function handleLangChange(newLang: Lang) {
    setLang(newLang);
    if (user) {
      void supabase.from("profiles").update({ lang: newLang }).eq("id", user.id);
    }
  }

  const tgUser = getTg()?.initDataUnsafe?.user;
  const inTelegram = isInTelegram();
  const fallbackName = useMemo(() => {
    if (inTelegram && tgUser) return tgUser.username ? `@${tgUser.username}` : tgUser.first_name ?? "";
    return user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? "";
  }, [inTelegram, tgUser, user]);

  useEffect(() => {
    let cancelled = false;
    async function resolveAvatar() {
      const value = profile.data?.avatar_url?.trim();
      if (value) {
        if (/^https?:\/\//i.test(value) || value.startsWith("blob:")) {
          if (!cancelled) setAvatarSrc(inTelegram ? value : null);
          return;
        }
        const { data } = await supabase.storage.from("avatars").createSignedUrl(value, 60 * 60);
        if (!cancelled) setAvatarSrc(data?.signedUrl ?? null);
        return;
      }
      if (inTelegram && tgUser?.photo_url) {
        if (!cancelled) setAvatarSrc(tgUser.photo_url);
        return;
      }
      if (!cancelled) setAvatarSrc(null);
    }
    void resolveAvatar();
    return () => { cancelled = true; };
  }, [profile.data?.avatar_url, inTelegram, tgUser?.photo_url]);

  async function uploadAvatar(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error(lang === "uk" ? "Обери зображення" : "Choose an image");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error(lang === "uk" ? "Зображення має бути до 4 МБ" : "Image must be under 4 MB");
      return;
    }
    setUploadingAvatar(true);
    const previous = profile.data?.avatar_url?.trim();
    const preview = URL.createObjectURL(file);
    setAvatarSrc(preview);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;
      await updateProfile.mutateAsync({ avatar_url: path });
      const { data: signed } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
      setAvatarSrc(signed?.signedUrl ?? preview);
      if (previous && !/^https?:\/\//i.test(previous)) {
        void supabase.storage.from("avatars").remove([previous]);
      }
      toast.success(lang === "uk" ? "Аватарку оновлено" : "Avatar updated");
    } catch (e) {
      toast.error((e as Error)?.message ?? (lang === "uk" ? "Не вдалось завантажити" : "Upload failed"));
    } finally {
      URL.revokeObjectURL(preview);
      setUploadingAvatar(false);
    }
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <PageHeader title={t("settings.title")} />
        <div className="surface p-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            {lang === "uk" ? "Увійди, щоб керувати акаунтом і даними." : "Sign in to manage your account and data."}
          </p>
          <Link to="/auth" className="mt-4 inline-flex rounded-xl px-4 py-2 text-sm font-semibold text-[#1A0F00]" style={{ background: "var(--grad-active)" }}>
            {t("common.sign_in")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SeoHead title={t("settings.title")} />
      <PageHeader title={t("settings.title")} subtitle={user.email ?? ""} />

      {/* PROFILE */}
      <section className="surface p-4">
        <div className="flex items-center gap-3">
          <label className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--line)] bg-[var(--bg)] text-[var(--text-muted)]">
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound size={20} />
            )}
            {!inTelegram && (
              <>
                <span className="absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity hover:opacity-100">
                  {uploadingAvatar ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingAvatar}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void uploadAvatar(file);
                  }}
                  className="sr-only"
                />
              </>
            )}
          </label>
          <div className="flex-1 min-w-0">
            <input
              key={`${profile.data?.id ?? "profile"}-${profile.data?.display_name ?? fallbackName}`}
              defaultValue={profile.data?.display_name ?? fallbackName}
              placeholder={lang === "uk" ? "Імʼя" : "Name"}
              onBlur={async (e) => {
                const v = e.target.value.trim();
                if (v && v !== profile.data?.display_name) {
                  setSavingName(true);
                  await updateProfile.mutateAsync({ display_name: v });
                  setSavingName(false);
                }
              }}
              className="w-full bg-transparent text-base font-medium outline-none"
            />
            <div className="text-xs text-[var(--text-muted)] truncate">{user.email}</div>
          </div>
          {(savingName || uploadingAvatar) && <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />}
        </div>
      </section>

      {/* ACCENT */}
      <section className="surface p-4">
        <div className="flex items-center gap-2 mb-1">
          <Palette size={14} className="text-[var(--text-muted)]" />
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{t("settings.accent")}</div>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">{t("settings.accent_hint")}</p>
        <div className="flex gap-3">
          {ACCENT_OPTIONS.map((opt) => {
            const active = accent === opt.name;
            return (
              <button
                key={opt.name}
                onClick={() => { setAccent(opt.name); updateProfile.mutate({ accent_color: opt.name }); }}
                className="flex flex-col items-center gap-1"
                aria-label={t(opt.labelKey)}
              >
                <span
                  className="h-10 w-10 rounded-full transition-transform"
                  style={{
                    background: opt.color,
                    transform: active ? "scale(1.08)" : "scale(1)",
                    boxShadow: active ? `0 0 0 3px var(--bg), 0 0 0 5px ${opt.color}` : "none",
                  }}
                />
                <span className={`text-[10px] ${active ? "text-[var(--text)] font-semibold" : "text-[var(--text-muted)]"}`}>
                  {t(opt.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* LANGUAGE */}
      <section className="surface p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-[var(--text-muted)]" />
          <div className="text-[11px] uppercase tracking-wider text-[var(--text-muted)]">{t("settings.lang")}</div>
        </div>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--bg)]">
          {(["uk", "en"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => handleLangChange(l)}
              className={`py-2 text-sm font-semibold rounded-lg transition-colors ${
                lang === l ? "bg-white/[.06] text-[var(--accent-active)]" : "text-[var(--text-muted)]"
              }`}
            >
              {l === "uk" ? "Українська" : "English"}
            </button>
          ))}
        </div>
      </section>

      {/* CHANNEL */}
      <a href="https://t.me/cryptotime_tg" target="_blank" rel="noreferrer" className="surface flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "rgba(90,200,224,.10)" }}>
          <Send size={16} className="text-[var(--cyan)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium">Наш Telegram-канал</div>
          <div className="text-xs text-[var(--text-muted)]">@cryptotime_tg</div>
        </div>
        <span className="chip">Відкрити</span>
      </a>

      {/* QUICK LINKS */}
      <section className="surface divide-y divide-[var(--line)]">
        <Link to="/heatmap" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[.02]">
          <Map size={16} className="text-[var(--text-muted)]" />
          <span className="flex-1 text-sm">{t("common.heatmap")}</span>
        </Link>
        <Link to="/calc" className="flex items-center gap-3 px-4 py-3 hover:bg-white/[.02]">
          <Calculator size={16} className="text-[var(--text-muted)]" />
          <span className="flex-1 text-sm">{t("common.calc")}</span>
        </Link>
      </section>

      {/* ACTIONS */}
      <section className="surface divide-y divide-[var(--line)]">
        <button onClick={async () => { await signOut(); nav("/auth", { replace: true }); }} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[.02]">
          <LogOut size={16} className="text-[var(--text-muted)]" />
          <span className="flex-1 text-sm">{t("common.sign_out")}</span>
        </button>
        <button onClick={deleteAccount} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--danger)]/5 text-[var(--danger)]">
          <Trash2 size={16} />
          <span className="flex-1 text-sm">{t("settings.delete")}</span>
        </button>
      </section>

      <footer className="pt-3 text-center">
        <BrandWordmark className="text-[14px]" />
        <div className="mt-1 text-[10px] text-[var(--text-dim)]">v1.1 · Data: CoinGecko</div>
      </footer>
    </div>
  );
}
