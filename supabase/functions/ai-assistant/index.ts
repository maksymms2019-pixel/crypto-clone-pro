// CryptoTime AI — direct Google Gemini API (no Lovable AI Gateway).
// Tools call our markets-proxy and news_cache so the model answers with real,
// current data instead of hallucinating prices.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
const geminiUrl = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

const SYSTEM = `Ти — CryptoTime AI, досвідчений крипто-аналітик у застосунку CryptoTime. Відповідай українською, стисло, по суті.

ЩО ТИ РОБИШ:
1) Відповідаєш на ЛЮБІ питання про крипту, блокчейн, технології, проєкти, історію, людей у галузі (напр. «хто створив BTC?», «що таке rollup?», «як працює PoS?», «біографія Віталіка Бутеріна») — використовуй власні знання, інструменти НЕ потрібні.
2) Для ПОТОЧНИХ цін, метрик ринку, трендів, gainers/losers, новин — ОБОВʼЯЗКОВО викликай інструменти, не вигадуй цифр.
3) Можеш пояснювати загальні фінансові/економічні поняття, якщо це пов'язано з крипто-контекстом.

Інструменти (для live-даних):
- get_market_overview — глобальні дані ринку, fear/greed, домінація
- get_coin — поточні деталі по монеті (ціна, ATH/ATL, обʼєми)
- get_trending — гарячі монети зараз
- get_gainers_losers — топ рухів за 24h
- search_news — пошук свіжих новин
- compare_coins — порівняти монети

ВІДМОВЛЯЙСЯ ТІЛЬКИ якщо питання взагалі НЕ стосується крипти/блокчейну/фінансів/технологій (напр. «рецепт борщу», «допоможи з домашкою з біології»). Тоді коротко скажи що ти крипто-аналітик і запропонуй крипто-тему.

Форматуй у Markdown: заголовки, списки, виділення. «Це не фінансова порада» — додавай лише якщо даєш конкретні поради щодо покупки/продажу.`;

// Gemini function declarations
const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "get_market_overview",
        description: "Глобальні метрики крипторинку: капіталізація, обʼєм, домінація BTC/ETH, індекс страху/жадібності.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_coin",
        description: "Поточні дані по конкретній криптовалюті: ціна, market cap, обʼєм, ATH/ATL, зміни за 24h/7d/30d.",
        parameters: {
          type: "OBJECT",
          properties: { id: { type: "STRING", description: "CoinGecko id, напр. bitcoin, ethereum, solana" } },
          required: ["id"],
        },
      },
      {
        name: "get_trending",
        description: "Топ-7 трендових монет за пошуком на CoinGecko.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "get_gainers_losers",
        description: "Топ-5 зростання і падіння за 24 години.",
        parameters: { type: "OBJECT", properties: {} },
      },
      {
        name: "search_news",
        description: "Пошук свіжих новин з нашої бази по ключовому слову. Повертає до 8 заголовків.",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Ключове слово, напр. 'Solana', 'ETF', 'регуляції'" },
            limit: { type: "NUMBER", description: "Скільки повернути, 1-10" },
          },
          required: ["query"],
        },
      },
      {
        name: "compare_coins",
        description: "Порівняти 2-5 монет.",
        parameters: {
          type: "OBJECT",
          properties: { ids: { type: "ARRAY", items: { type: "STRING" } } },
          required: ["ids"],
        },
      },
    ],
  },
];

async function callMarketsProxy(body: Record<string, unknown>): Promise<unknown> {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/markets-proxy`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`markets-proxy ${r.status}`);
  const j = await r.json();
  return j.data ?? j;
}

async function runTool(name: string, args: Record<string, unknown>, supabase: ReturnType<typeof createClient>): Promise<unknown> {
  try {
    if (name === "get_market_overview") {
      const [global, fg] = await Promise.all([
        callMarketsProxy({ op: "global" }),
        callMarketsProxy({ op: "fear_greed" }).catch(() => null),
      ]);
      return { global, fear_greed: fg };
    }
    if (name === "get_coin") return await callMarketsProxy({ op: "coin", id: String(args.id) });
    if (name === "get_trending") return await callMarketsProxy({ op: "trending" });
    if (name === "get_gainers_losers") return await callMarketsProxy({ op: "gainers_losers" });
    if (name === "compare_coins") {
      const ids = (args.ids as string[]) ?? [];
      return await callMarketsProxy({ op: "markets", ids, sparkline: false, perPage: ids.length });
    }
    if (name === "search_news") {
      const q = String(args.query ?? "").trim().replace(/[%,]/g, " ");
      const limit = Math.min(10, Math.max(1, Number(args.limit ?? 6)));
      const { data, error } = await supabase
        .from("news_cache")
        .select("title,source,published_at,url,tags")
        .ilike("title", `%${q}%`)
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) return { error: error.message };
      return data ?? [];
    }
    return { error: "unknown tool" };
  } catch (e) {
    return { error: String((e as Error)?.message ?? e) };
  }
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: { content: unknown } } };
type GeminiContent = { role: "user" | "model" | "function"; parts: GeminiPart[] };

async function callGemini(contents: GeminiContent[]): Promise<GeminiContent> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY не налаштовано");

  const body = JSON.stringify({
    systemInstruction: { role: "user", parts: [{ text: SYSTEM }] },
    contents,
    tools: TOOLS,
    generationConfig: { temperature: 0.7, maxOutputTokens: 1536 },
  });

  let lastErr = "";
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(`${geminiUrl(model)}?key=${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
        if (r.ok) {
          const j = await r.json();
          const cand = j.candidates?.[0];
          if (!cand?.content) throw new Error("empty");
          return cand.content as GeminiContent;
        }
        const txt = await r.text().catch(() => "");
        lastErr = `${model} ${r.status}`;
        console.warn("[ai-assistant] gemini", model, r.status, txt.slice(0, 300));
        // Retry only on 429/5xx; otherwise jump to next model.
        if (r.status !== 429 && r.status < 500) break;
        await sleep(400 * Math.pow(3, attempt) + Math.random() * 200);
      } catch (e) {
        lastErr = String((e as Error)?.message ?? e);
        await sleep(500);
      }
    }
  }
  throw new Error(`Gemini тимчасово недоступний. Спробуй за хвилину. (${lastErr})`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "bad request" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Convert chat history → Gemini contents
    const contents: GeminiContent[] = (messages as Array<{ role: string; content: string }>)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m.content ?? "") }],
      }));

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const emit = (event: Record<string, unknown>) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

        try {
          let steps = 0;
          while (steps < 6) {
            steps++;
            const modelTurn = await callGemini(contents);
            const parts = modelTurn.parts ?? [];
            const calls = parts.filter((p): p is { functionCall: { name: string; args: Record<string, unknown> } } => "functionCall" in p);
            const texts = parts.filter((p): p is { text: string } => "text" in p);
            const textOut = texts.map((p) => p.text).join("");

            if (textOut) emit({ type: "text", delta: textOut });

            if (!calls.length) break;

            // Append model turn (must include the functionCall parts)
            contents.push({ role: "model", parts });

            const responses: GeminiPart[] = [];
            for (const c of calls) {
              const name = c.functionCall.name;
              const args = c.functionCall.args ?? {};
              emit({ type: "tool_use", name, args });
              const out = await runTool(name, args, supabase);
              emit({ type: "tool_result", name, ok: !(out as { error?: string })?.error });
              responses.push({ functionResponse: { name, response: { content: out } } });
            }
            contents.push({ role: "user", parts: responses });
          }

          emit({ type: "done" });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (e) {
          console.error("[ai-assistant] stream error", e);
          emit({ type: "error", message: String((e as Error)?.message ?? e) });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("[ai-assistant]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
