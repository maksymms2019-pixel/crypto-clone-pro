import { useEffect, useRef, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { SeoHead } from "@/components/SeoHead";
import { streamAssistant, type ChatMsg, type ToolEvent } from "@/lib/ai";
import { Send, Loader2, Sparkles, Wrench, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

const SUGGESTIONS: { q: string; sub: string }[] = [
  { q: "Який зараз стан ринку?", sub: "Огляд капіталізації, тренду, F&G" },
  { q: "Що відбувається з Solana?", sub: "Ціна, новини, метрики" },
  { q: "Покажи топ-гейнерів за 24h", sub: "Лідери ринку зараз" },
  { q: "Які важливі новини про ETF?", sub: "Свіже з джерел" },
];

const TOOL_LABEL: Record<string, string> = {
  get_market_overview: "Огляд ринку",
  get_coin: "Дані монети",
  get_trending: "Тренди",
  get_gainers_losers: "Лідери руху",
  search_news: "Пошук новин",
  compare_coins: "Порівняння",
};

const STORAGE_KEY = "cryptotime.ai.history.v2";

function loadHistory(): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatMsg[];
  } catch { return []; }
}

function ToolCard({ ev }: { ev: ToolEvent }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-[var(--line)] bg-white/[.02] px-2.5 py-1.5 text-[11px]">
      {ev.status === "running" && <Loader2 size={11} className="animate-spin text-[var(--cyan)]" />}
      {ev.status === "done" && <CheckCircle2 size={11} className="text-[var(--accent)]" />}
      {ev.status === "error" && <AlertCircle size={11} className="text-[var(--danger)]" />}
      <Wrench size={10} className="text-[var(--text-muted)]" />
      <span className="font-semibold">{TOOL_LABEL[ev.name] ?? ev.name}</span>
      {ev.args && Object.keys(ev.args).length > 0 && (
        <span className="text-[var(--text-muted)] truncate">
          · {Object.values(ev.args).map(String).join(", ")}
        </span>
      )}
    </div>
  );
}

export default function Assistant() {
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadHistory());
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  // Intentionally NOT auto-focusing the input on mount — opening the on-screen
  // keyboard immediately when the user enters the screen is jarring and shifts
  // the layout. Focus happens on first user interaction instead.
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); } catch { /* noop */ }
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    const next: ChatMsg[] = [...messages, userMsg, { role: "assistant", content: "", tools: [] }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      await streamAssistant([...messages, userMsg], (ev) => {
        setMessages((cur) => {
          const copy = [...cur];
          const last = copy[copy.length - 1];
          if (ev.type === "text") {
            copy[copy.length - 1] = { ...last, content: last.content + ev.delta };
          } else if (ev.type === "tool_use") {
            copy[copy.length - 1] = {
              ...last,
              tools: [...(last.tools ?? []), { name: ev.name, args: ev.args, status: "running" }],
            };
          } else if (ev.type === "tool_result") {
            const tools = [...(last.tools ?? [])];
            for (let i = tools.length - 1; i >= 0; i--) {
              if (tools[i].name === ev.name && tools[i].status === "running") {
                tools[i] = { ...tools[i], status: ev.ok ? "done" : "error", ok: ev.ok };
                break;
              }
            }
            copy[copy.length - 1] = { ...last, tools };
          } else if (ev.type === "error") {
            copy[copy.length - 1] = { ...last, content: last.content + `\n\n⚠️ ${ev.message}` };
          }
          return copy;
        });
      });
    } catch (e) {
      toast.error((e as Error).message);
      setMessages((cur) => cur.slice(0, -1));
    } finally {
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function clearChat() {
    setMessages([]);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }

  return (
    <div className="flex min-h-[70vh] flex-col">
      <SeoHead title="AI-аналітик · CryptoTime" description="Розумний AI з доступом до живих даних ринку та новин." />
      <PageHeader
        title="AI-аналітик"
        subtitle="Підключено до live-даних"
        right={messages.length > 0 ? (
          <button onClick={clearChat} className="chip" aria-label="Очистити">
            <Trash2 size={12} /> Новий
          </button>
        ) : undefined}
      />

      <div className="flex-1 space-y-3">
        {messages.length === 0 && (
          <>
            {/* Hero — explains what this is */}
            <section className="relative overflow-hidden rounded-2xl p-5" style={{ background: "linear-gradient(135deg, rgba(231,182,80,.15), rgba(90,200,224,.08))", border: "1px solid rgba(231,182,80,.25)" }}>
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "rgba(231,182,80,.20)" }}>
                  <Sparkles size={20} className="text-[var(--gold)]" />
                </div>
                <div className="flex-1">
                  <div className="display text-base font-semibold">Аналітик ринку з живими даними</div>
                  <p className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
                    Запитай про монету, метрики, тренди чи новину. AI підтягне свіжі дані
                    через інструменти і відповість українською.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[10px] text-[var(--text-muted)] uppercase tracking-wider">
                <span className="flex items-center gap-1"><span className="live-dot" /> Live</span>
                <span>·</span>
                <span>Інструменти</span>
                <span>·</span>
                <span>Без обмежень тем</span>
              </div>
            </section>

            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)] pt-1">З чого почати</div>
            <div className="grid gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.q}
                  onClick={() => send(s.q)}
                  className="surface flex items-start gap-3 p-3 text-left transition-colors hover:border-[var(--line-strong)]"
                >
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: "rgba(90,200,224,.10)" }}>
                    <Sparkles size={14} className="text-[var(--cyan)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{s.q}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{s.sub}</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[88%] space-y-1.5 ${m.role === "user" ? "" : "w-full"}`}>
              {m.role === "assistant" && m.tools && m.tools.length > 0 && (
                <div className="space-y-1">
                  {m.tools.map((t, ti) => <ToolCard key={ti} ev={t} />)}
                </div>
              )}
              <div className={`rounded-2xl px-3.5 py-2.5 text-sm ${m.role === "user" ? "bg-[var(--gold)]/15 text-[var(--text)]" : "surface"}`}>
                {m.role === "assistant" && !m.content && (!m.tools || m.tools.every((t) => t.status !== "done")) ? (
                  <Loader2 size={14} className="animate-spin text-[var(--text-muted)]" />
                ) : m.role === "assistant" ? (
                  <div className="prose-chat space-y-2 leading-relaxed text-sm">
                    <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                  </div>
                ) : (
                  m.content
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="sticky bottom-0 mt-3 flex gap-2 bg-[var(--bg)]/80 py-2 backdrop-blur"
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Напиши питання…"
          className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg-elev)] px-3 py-2.5 text-sm outline-none focus:border-[var(--gold)]"
        />
        <button type="submit" disabled={busy || !input.trim()} className="flex h-[42px] w-[42px] items-center justify-center rounded-xl text-[#1A0F00] disabled:opacity-50" style={{ background: "var(--grad-active)" }}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}
