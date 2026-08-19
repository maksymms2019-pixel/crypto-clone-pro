// Aggregated market metrics: altseason index + overall market state.
// Computed from CoinGecko (top coins, global) and Fear & Greed. Cached 5 min
// in metrics_cache so we stay within rate limits.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CG = "https://api.coingecko.com/api/v3";
const STABLE = new Set(["tether", "usd-coin", "dai", "first-digital-usd", "true-usd", "usds", "ethena-usde", "binance-peg-busd", "paypal-usd"]);

async function compute() {
  // Top 50 by market cap with 7d change.
  const u = new URL(`${CG}/coins/markets`);
  u.searchParams.set("vs_currency", "usd");
  u.searchParams.set("order", "market_cap_desc");
  u.searchParams.set("per_page", "60");
  u.searchParams.set("page", "1");
  u.searchParams.set("sparkline", "false");
  u.searchParams.set("price_change_percentage", "24h,7d");
  const mr = await fetch(u, { signal: AbortSignal.timeout(9000) });
  if (!mr.ok) throw new Error(`markets ${mr.status}`);
  const rows = (await mr.json()) as Array<{ id: string; symbol: string; price_change_percentage_7d_in_currency: number; price_change_percentage_24h_in_currency: number }>;

  const btc = rows.find((r) => r.id === "bitcoin");
  const btc7d = btc?.price_change_percentage_7d_in_currency ?? 0;

  const alts = rows
    .filter((r) => r.id !== "bitcoin" && !STABLE.has(r.id) && isFinite(r.price_change_percentage_7d_in_currency))
    .slice(0, 50);
  const outperformers = alts.filter((r) => r.price_change_percentage_7d_in_currency > btc7d).length;
  const altseason_index = alts.length ? Math.round((outperformers / alts.length) * 100) : 0;
  const altseason_label = altseason_index >= 75 ? "Альтсезон" : altseason_index >= 50 ? "Альти сильні" : altseason_index >= 25 ? "Баланс" : "Сезон біткоїна";

  // Daily market breadth — how broad today's move is across the top coins.
  const nonStable = rows.filter((r) => !STABLE.has(r.id) && isFinite(r.price_change_percentage_24h_in_currency));
  const up = nonStable.filter((r) => r.price_change_percentage_24h_in_currency > 0).length;
  const breadth_up_pct = nonStable.length ? Math.round((up / nonStable.length) * 100) : 50;
  const avg_change_24h = nonStable.length
    ? nonStable.reduce((s, r) => s + r.price_change_percentage_24h_in_currency, 0) / nonStable.length
    : 0;

  // Global + fear & greed.
  const [gr, fr] = await Promise.all([
    fetch(`${CG}/global`, { signal: AbortSignal.timeout(8000) }),
    fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(7000) }),
  ]);
  const gj = gr.ok ? (await gr.json()).data : null;
  const capChange = gj?.market_cap_change_percentage_24h_usd ?? 0;
  const btcDom = gj?.market_cap_percentage?.btc ?? 0;
  const fj = fr.ok ? (await fr.json()).data?.[0] : null;
  const fg = fj ? Number(fj.value) : 50;

  // Rule-based market-state score (0-100) — emphasises TODAY (24h breadth + cap move).
  let score = 50;
  score += Math.max(-22, Math.min(22, capChange * 4));
  score += (breadth_up_pct - 50) * 0.45;
  score += Math.max(-12, Math.min(12, avg_change_24h * 1.2));
  score += (fg - 50) * 0.25;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const market_state_label =
    score >= 75 ? "Сильно бичачий" :
    score >= 60 ? "Бичачий" :
    score >= 45 ? "Нейтральний" :
    score >= 30 ? "Обережний" : "Ведмежий";

  // Human, today-focused one-liner.
  let today_label: string;
  let today_summary: string;
  if (score >= 70) {
    today_label = "Сильний оптимізм";
    today_summary = `Сьогодні ринок впевнено зростає — у плюсі ${breadth_up_pct}% топ-монет.`;
  } else if (score >= 58) {
    today_label = "Переважає оптимізм";
    today_summary = `Бики тримають ініціативу: зростає ${breadth_up_pct}% топ-монет.`;
  } else if (score >= 46) {
    today_label = "Ринок у балансі";
    today_summary = `Сьогодні без явного напрямку — у плюсі ${breadth_up_pct}% монет.`;
  } else if (score >= 32) {
    today_label = "Обережні настрої";
    today_summary = `Тиск продавців: лише ${breadth_up_pct}% топ-монет у зеленому.`;
  } else {
    today_label = "Ведмеді тиснуть";
    today_summary = `Сьогодні переважає падіння — у плюсі тільки ${breadth_up_pct}% монет.`;
  }

  return {
    altseason_index,
    altseason_label,
    btc_7d: btc7d,
    market_state_score: score,
    market_state_label,
    market_cap_change_24h: capChange,
    btc_dominance: btcDom,
    fear_greed: fg,
    breadth_up_pct,
    avg_change_24h,
    today_label,
    today_summary,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const key = "market_metrics_v2";

    const { data: cached } = await supabase.from("metrics_cache").select("payload, expires_at").eq("key", key).maybeSingle();
    if (cached && new Date(cached.expires_at) > new Date()) {
      return new Response(JSON.stringify({ data: cached.payload, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const fresh = await compute();
      await supabase.from("metrics_cache").upsert({
        key,
        payload: fresh as object,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
        updated_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ data: fresh, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      if (cached) {
        return new Response(JSON.stringify({ data: cached.payload, cached: true, stale: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
  } catch (e) {
    console.error("[market-metrics]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
