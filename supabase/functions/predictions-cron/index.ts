// predictions-cron — opens "Прогноз дня" rounds at 12:00 Kyiv and settles them at 21:00.
// Idempotent: safe to call any time (pg_cron every 5 min + app open as a fallback).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

// Token of the day rotates through the top-10 (no BTC, no stablecoins).
const FALLBACK_TOP = ["ETH", "XRP", "BNB", "SOL", "DOGE", "TRX", "ADA", "TON", "LINK", "AVAX"];
const NAMES: Record<string, string> = { BTC: "Bitcoin", GRAM: "GRAM (TON)", TON: "Toncoin" };
const STABLE = new Set(["USDT", "USDC", "DAI", "USDE", "FDUSD", "TUSD", "USDS", "PYUSD", "USD1", "BUSD", "WBTC", "STETH", "WSTETH", "WETH", "WEETH", "LEO"]);

async function top10(): Promise<{ sym: string; name: string }[]> {
  try {
    const r = await fetch("https://api.coinpaprika.com/v1/tickers?limit=40", { signal: AbortSignal.timeout(7000) });
    const arr = await r.json();
    const out = (arr as { symbol: string; name: string }[])
      .filter((c) => c.symbol !== "BTC" && !STABLE.has(c.symbol.toUpperCase()))
      .slice(0, 10).map((c) => ({ sym: c.symbol.toUpperCase(), name: c.name }));
    if (out.length === 10) return out;
  } catch (_) { /* fallback */ }
  return FALLBACK_TOP.map((s) => ({ sym: s, name: NAMES[s] ?? s }));
}

async function price(asset: string): Promise<number> {
  const okx = asset === "TON" ? "GRAM" : asset;
  const bin = asset === "GRAM" ? "TON" : asset;
  try {
    const r = await fetch(`https://www.okx.com/api/v5/market/ticker?instId=${okx}-USDT`);
    const p = Number((await r.json())?.data?.[0]?.last);
    if (p > 0) return p;
  } catch (_) { /* fallback */ }
  const r = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${bin}USDT`);
  const p = Number((await r.json())?.price);
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
      const dayIdx = Math.floor(Date.parse(date + "T00:00:00Z") / 86_400_000);
      const list = await top10();
      const tok = list[dayIdx % list.length];
      const want = [{ sym: "BTC", name: "Bitcoin" }, tok];
      for (const w of want) {
        if (have.has(w.sym) || (w.sym !== "BTC" && have.size >= 2)) continue;
        const p = await price(w.sym);
        const { data } = await sb.rpc("open_prediction_round_named", {
          _asset: w.sym, _name: w.name, _date: date, _price: p,
          _opens: opens.toISOString(), _locks: locks.toISOString(), _settles: settles.toISOString(),
        });
        log.push({ opened: w.sym, price: p, id: data });
        have.add(w.sym);
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
