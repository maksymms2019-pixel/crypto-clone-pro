// predictions-cron — opens "Прогноз дня" rounds at 12:00 Kyiv and settles them at 21:00.
// Idempotent: safe to call any time (pg_cron every 5 min + app open as a fallback).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const ASSETS: Record<string, { okx: string; binance: string; gecko: string }> = {
  BTC: { okx: "BTC-USDT", binance: "BTCUSDT", gecko: "bitcoin" },
  GRAM: { okx: "GRAM-USDT", binance: "TONUSDT", gecko: "the-open-network" },
};

async function price(asset: string): Promise<number> {
  const a = ASSETS[asset];
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${a.okx}`);
    const j = await r.json();
    const p = Number(j?.data?.[0]?.last);
    if (p > 0) return p;
  } catch (_) { /* fallback */ }
  try {
    const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${a.binance}`);
    const p = Number((await r.json())?.price);
    if (p > 0) return p;
  } catch (_) { /* fallback */ }
  const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${a.gecko}&vs_currencies=usd`);
  const p = Number((await r.json())?.[a.gecko]?.usd);
  if (p > 0) return p;
  throw new Error(`no price for ${asset}`);
}

// Kyiv wall-clock -> UTC instant.
function kyivOffsetMin(d: Date): number {
  const s = d.toLocaleString("en-US", { timeZone: "Europe/Kyiv", timeZoneName: "shortOffset" });
  const m = s.match(/GMT([+-]\d+)/);
  return m ? Number(m[1]) * 60 : 180;
}
function kyivDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Kyiv" });
}
function at(date: string, hour: number): Date {
  const guess = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  return new Date(guess.getTime() - kyivOffsetMin(guess) * 60_000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const now = new Date();
    const log: unknown[] = [];

    // Settle due rounds.
    const { data: due } = await sb.from("prediction_rounds").select("id, asset")
      .eq("status", "open").lte("settles_at", now.toISOString());
    for (const r of due ?? []) {
      const p = await price(r.asset);
      const { data } = await sb.rpc("settle_prediction_round", { _round_id: r.id, _price: p });
      log.push({ settled: r.asset, price: p, data });
    }

    // Open today's rounds (only within the betting window).
    const date = kyivDate(now);
    const opens = at(date, 12), locks = at(date, 20), settles = at(date, 21);
    if (now >= opens && now < locks) {
      const { data: existing } = await sb.from("prediction_rounds").select("asset").eq("round_date", date);
      const have = new Set((existing ?? []).map((e) => e.asset));
      for (const asset of Object.keys(ASSETS)) {
        if (have.has(asset)) continue;
        const p = await price(asset);
        const { data } = await sb.rpc("open_prediction_round", {
          _asset: asset, _date: date, _price: p,
          _opens: opens.toISOString(), _locks: locks.toISOString(), _settles: settles.toISOString(),
        });
        log.push({ opened: asset, price: p, id: data });
      }
    }

    return new Response(JSON.stringify({ ok: true, log }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[predictions-cron]", e);
    return new Response(JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
