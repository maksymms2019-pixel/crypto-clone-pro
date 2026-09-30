// Markets proxy with shared 30s KV cache.
// Reduces CoinGecko load (1 fetch per cache window for all users), bypasses
// mobile CORS preflight slowness, and gives stable data in Telegram WebView.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CG_KEY = Deno.env.get("COINGECKO_API_KEY") ?? "";
const CG = "https://api.coingecko.com/api/v3";
// Attach the demo key (if configured) to every CoinGecko request.
const _fetch = globalThis.fetch;
function fetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const url = String(input);
  if (CG_KEY && url.startsWith(CG)) {
    init = { ...init, headers: { ...(init.headers ?? {}), "x-cg-demo-api-key": CG_KEY } };
  }
  return _fetch(url, init);
}

type Tick = { last: number; open: number };
// Live spot prices from exchanges (not blocked like CoinGecko free tier).
async function exchangeTickers(): Promise<Map<string, Tick>> {
  const m = new Map<string, Tick>();
  try {
    const r = await _fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", { signal: AbortSignal.timeout(7000) });
    const j = await r.json();
    for (const t of j?.data ?? []) {
      if (!String(t.instId).endsWith("-USDT")) continue;
      const last = Number(t.last), open = Number(t.sodUtc0) || Number(t.open24h);
      if (last > 0 && open > 0) m.set(String(t.instId).slice(0, -5).toUpperCase(), { last, open: Number(t.open24h) || open });
    }
  } catch (_) { /* next */ }
  try {
    const r = await _fetch("https://api.binance.com/api/v3/ticker/24hr", { signal: AbortSignal.timeout(7000) });
    const arr = await r.json();
    if (Array.isArray(arr)) for (const t of arr) {
      const s = String(t.symbol);
      if (!s.endsWith("USDT")) continue;
      const k = s.slice(0, -4);
      if (m.has(k)) continue;
      const last = Number(t.lastPrice), open = Number(t.openPrice);
      if (last > 0 && open > 0) m.set(k, { last, open });
    }
  } catch (_) { /* ignore */ }
  m.set("USDT", { last: 1, open: 1 });
  if (m.has("TON")) m.set("TON", m.get("TON")!);
  return m;
}

const SYMBOL_ALIAS: Record<string, string> = { toncoin: "TON", "the-open-network": "TON" };

// Overlay live exchange prices onto cached CoinGecko rows.
// deno-lint-ignore no-explicit-any
function overlay(rows: any[], t: Map<string, Tick>): number {
  let hit = 0;
  for (const c of rows ?? []) {
    const sym = SYMBOL_ALIAS[c.id] ?? String(c.symbol ?? "").toUpperCase();
    const k = t.get(sym) ?? (sym === "TON" ? t.get("GRAM") : undefined);
    if (!k || !c.current_price) continue;
    // guard against symbol collisions: ignore if >60% away from last known price
    const ratio = k.last / c.current_price;
    if (ratio > 1.6 || ratio < 0.4) continue;
    if (c.market_cap) c.market_cap = c.market_cap * ratio;
    c.current_price = k.last;
    const pct = (k.last / k.open - 1) * 100;
    c.price_change_percentage_24h = pct;
    if ("price_change_percentage_24h_in_currency" in c) c.price_change_percentage_24h_in_currency = pct;
    c.last_updated = new Date().toISOString();
    hit++;
  }
  return hit;
}

type Op =
  | { op: "markets"; perPage?: number; page?: number; ids?: string[]; sparkline?: boolean; category?: string }
  | { op: "global" }
  | { op: "coin"; id: string }
  | { op: "fear_greed" }
  | { op: "chart"; id: string; days: number | string }
  | { op: "ohlc"; id: string; days: number | string }
  | { op: "trending" }
  | { op: "gainers_losers" };

function ttlFor(op: Op["op"]): number {
  if (op === "markets") return 30;
  if (op === "global") return 60;
  if (op === "coin") return 45;
  if (op === "fear_greed") return 600;
  if (op === "chart") return 120;
  if (op === "ohlc") return 120;
  if (op === "trending") return 300;
  if (op === "gainers_losers") return 60;
  return 30;
}

function cacheKey(body: Op): string {
  return JSON.stringify(body);
}

// Tokens excluded from every list — community considers them either
// non-tradable (wrapped/locked claims, on-chain accounting entries) or
// having unreliable reported market caps.
const ID_BLACKLIST = new Set<string>(["figure-heloc"]);

async function callCoinGecko(body: Op): Promise<unknown> {
  if (body.op === "markets") {
    const u = new URL(`${CG}/coins/markets`);
    u.searchParams.set("vs_currency", "usd");
    u.searchParams.set("order", "market_cap_desc");
    // Over-fetch slightly so we can drop blacklisted coins and still hit perPage.
    const requested = body.perPage ?? 100;
    u.searchParams.set("per_page", String(Math.min(250, requested + 5)));
    u.searchParams.set("page", String(body.page ?? 1));
    u.searchParams.set("sparkline", String(body.sparkline ?? true));
    u.searchParams.set("price_change_percentage", "1h,24h,7d,30d");
    if (body.ids?.length) u.searchParams.set("ids", body.ids.join(","));
    if (body.category) u.searchParams.set("category", body.category);
    const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(`coingecko markets ${r.status}`);
    const arr = (await r.json()) as Array<{ id: string }>;
    return arr.filter((c) => !ID_BLACKLIST.has(c.id)).slice(0, requested);
  }
  if (body.op === "global") {
    const r = await fetch(`${CG}/global`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`coingecko global ${r.status}`);
    const j = await r.json();
    const d = j.data;
    return {
      total_market_cap_usd: d.total_market_cap.usd,
      total_volume_usd: d.total_volume.usd,
      market_cap_change_percentage_24h_usd: d.market_cap_change_percentage_24h_usd,
      btc_dominance: d.market_cap_percentage.btc,
      eth_dominance: d.market_cap_percentage.eth,
      active_cryptocurrencies: d.active_cryptocurrencies,
    };
  }
  if (body.op === "coin") {
    const r = await fetch(
      `${CG}/coins/${body.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=true`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!r.ok) throw new Error(`coingecko coin ${r.status}`);
    const j = await r.json();
    const md = j.market_data;
    return {
      id: j.id,
      symbol: j.symbol,
      name: j.name,
      image: j.image?.large,
      description: j.description?.en?.split(". ").slice(0, 2).join(". "),
      market_cap_rank: j.market_cap_rank ?? md.market_cap_rank ?? null,
      current_price: md.current_price.usd,
      market_cap: md.market_cap.usd,
      fully_diluted_valuation: md.fully_diluted_valuation?.usd ?? null,
      total_volume: md.total_volume.usd,
      high_24h: md.high_24h?.usd ?? null,
      low_24h: md.low_24h?.usd ?? null,
      circulating_supply: md.circulating_supply ?? null,
      total_supply: md.total_supply ?? null,
      max_supply: md.max_supply ?? null,
      ath: md.ath.usd,
      ath_date: md.ath_date?.usd ?? null,
      ath_change_percentage: md.ath_change_percentage?.usd ?? null,
      atl: md.atl.usd,
      atl_date: md.atl_date?.usd ?? null,
      atl_change_percentage: md.atl_change_percentage?.usd ?? null,
      price_change_percentage_24h: md.price_change_percentage_24h,
      price_change_percentage_7d: md.price_change_percentage_7d,
      price_change_percentage_30d: md.price_change_percentage_30d,
      price_change_percentage_1y: md.price_change_percentage_1y ?? null,
      sparkline_7d: md.sparkline_7d?.price ?? [],
      homepage: j.links?.homepage?.[0] ?? null,
      twitter: j.links?.twitter_screen_name ? `https://twitter.com/${j.links.twitter_screen_name}` : null,
      reddit: j.links?.subreddit_url ?? null,
      github: j.links?.repos_url?.github?.[0] ?? null,
      categories: Array.isArray(j.categories) ? j.categories.filter(Boolean).slice(0, 5) : [],
    };
  }
  if (body.op === "fear_greed") {
    const r = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(7000) });
    if (!r.ok) throw new Error("fng fail");
    const j = await r.json();
    const row = j.data?.[0];
    return { value: Number(row.value), classification: row.value_classification };
  }
  if (body.op === "chart") {
    const r = await fetch(
      `${CG}/coins/${body.id}/market_chart?vs_currency=usd&days=${body.days}`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!r.ok) throw new Error(`coingecko chart ${r.status}`);
    return r.json();
  }
  if (body.op === "ohlc") {
    const r = await fetch(
      `${CG}/coins/${body.id}/ohlc?vs_currency=usd&days=${body.days}`,
      { signal: AbortSignal.timeout(9000) },
    );
    if (!r.ok) throw new Error(`coingecko ohlc ${r.status}`);
    const arr = (await r.json()) as [number, number, number, number, number][];
    return { ohlc: arr };
  }
  if (body.op === "trending") {
    const r = await fetch(`${CG}/search/trending`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`coingecko trending ${r.status}`);
    const j = await r.json();
    type TItem = { item: { id: string; symbol: string; name: string; thumb: string; market_cap_rank: number; data?: { price?: number; price_change_percentage_24h?: { usd?: number } } } };
    return (j.coins ?? []).slice(0, 7).map((c: TItem) => ({
      id: c.item.id,
      symbol: c.item.symbol,
      name: c.item.name,
      image: c.item.thumb,
      rank: c.item.market_cap_rank,
      price: c.item.data?.price ?? null,
      pct24h: c.item.data?.price_change_percentage_24h?.usd ?? null,
    }));
  }
  if (body.op === "gainers_losers") {
    const u = new URL(`${CG}/coins/markets`);
    u.searchParams.set("vs_currency", "usd");
    u.searchParams.set("order", "market_cap_desc");
    u.searchParams.set("per_page", "250");
    u.searchParams.set("page", "1");
    u.searchParams.set("sparkline", "false");
    u.searchParams.set("price_change_percentage", "24h");
    const r = await fetch(u, { signal: AbortSignal.timeout(9000) });
    if (!r.ok) throw new Error(`coingecko gl ${r.status}`);
    const arr = await r.json() as Array<{ id: string; symbol: string; name: string; image: string; current_price: number; price_change_percentage_24h: number }>;
    const valid = arr.filter((c) => isFinite(c.price_change_percentage_24h) && !ID_BLACKLIST.has(c.id));
    const sorted = [...valid].sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
    const gainers = sorted.slice(0, 5);
    const losers = sorted.slice(-5).reverse();
    return { gainers, losers };
  }
  throw new Error("unknown op");
}

// Hosts we are willing to re-serve images from (coin logos only).
const ICON_HOSTS = new Set<string>([
  "coin-images.coingecko.com",
  "assets.coingecko.com",
  "assets.coincap.io",
  "s2.coinmarketcap.com",
  "static.coingecko.com",
]);

async function serveIcon(raw: string): Promise<Response> {
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad icon url", { status: 400, headers: corsHeaders });
  }
  if (target.protocol !== "https:" || !ICON_HOSTS.has(target.hostname)) {
    return new Response("host not allowed", { status: 403, headers: corsHeaders });
  }
  try {
    const upstream = await fetch(target.toString(), { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) return new Response("upstream error", { status: 502, headers: corsHeaders });
    const bytes = await upstream.arrayBuffer();
    return new Response(bytes, {
      headers: {
        ...corsHeaders,
        "Content-Type": upstream.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (e) {
    console.error("[markets-proxy] icon", e);
    return new Response("icon fetch failed", { status: 502, headers: corsHeaders });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: { ...corsHeaders, "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } });

  const reqUrl = new URL(req.url);
  const icon = reqUrl.searchParams.get("icon");
  if (icon) return await serveIcon(icon);



  try {
    const body = (await req.json()) as Op;
    if (!body || typeof body !== "object" || !("op" in body)) {
      return new Response(JSON.stringify({ error: "bad request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const key = cacheKey(body);
    const ttl = ttlFor(body.op);

    // Try cache first
    const { data: cached } = await supabase
      .from("metrics_cache")
      .select("payload, expires_at")
      .eq("key", key)
      .maybeSingle();

    if (cached && new Date(cached.expires_at) > new Date()) {
      return new Response(JSON.stringify({ data: cached.payload, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch fresh (with stale fallback on error)
    try {
      const fresh = await callCoinGecko(body);
      const expires = new Date(Date.now() + ttl * 1000).toISOString();
      await supabase
        .from("metrics_cache")
        .upsert({ key, payload: fresh as object, expires_at: expires, updated_at: new Date().toISOString() });
      return new Response(JSON.stringify({ data: fresh, cached: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      // Upstream failed: refresh cached rows with live exchange prices.
      if (cached && (body.op === "markets" || body.op === "gainers_losers")) {
        try {
          const t = await exchangeTickers();
          // deno-lint-ignore no-explicit-any
          const p: any = cached.payload;
          let hit = 0;
          if (body.op === "markets") hit = overlay(p, t);
          else {
            const all = [...(p.gainers ?? []), ...(p.losers ?? [])];
            hit = overlay(all, t);
            const sorted = all.sort((a, b) => b.price_change_percentage_24h - a.price_change_percentage_24h);
            p.gainers = sorted.slice(0, 5); p.losers = sorted.slice(-5).reverse();
          }
          if (hit > 0) {
            const now = new Date().toISOString();
            await supabase.from("metrics_cache").upsert({ key, payload: p, expires_at: new Date(Date.now() + ttl * 1000).toISOString(), updated_at: now });
            return new Response(JSON.stringify({ data: p, cached: false, source: "exchange", updated_at: now }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (err) { console.error("[markets-proxy] overlay", err); }
      }
      if (body.op === "global") {
        try {
          const r = await _fetch("https://api.coinpaprika.com/v1/global", { signal: AbortSignal.timeout(7000) });
          const g = await r.json();
          if (g?.market_cap_usd) {
            // deno-lint-ignore no-explicit-any
            const prev: any = cached?.payload ?? {};
            const p = {
              total_market_cap_usd: g.market_cap_usd,
              total_volume_usd: g.volume_24h_usd,
              market_cap_change_percentage_24h_usd: g.market_cap_change_24h,
              btc_dominance: g.bitcoin_dominance_percentage,
              eth_dominance: prev.eth_dominance ?? 0,
              active_cryptocurrencies: g.cryptocurrencies_number ?? prev.active_cryptocurrencies ?? 0,
            };
            const now = new Date().toISOString();
            await supabase.from("metrics_cache").upsert({ key, payload: p, expires_at: new Date(Date.now() + ttl * 1000).toISOString(), updated_at: now });
            return new Response(JSON.stringify({ data: p, cached: false, source: "paprika", updated_at: now }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (err) { console.error("[markets-proxy] paprika", err); }
      }
      if (cached && body.op === "coin") {
        try {
          // deno-lint-ignore no-explicit-any
          const p: any = cached.payload;
          if (overlay([p], await exchangeTickers()) > 0) {
            return new Response(JSON.stringify({ data: p, cached: false, source: "exchange" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } catch (_) { /* stale */ }
      }
      // If upstream fails but we have stale cache — serve stale
      if (cached) {
        return new Response(JSON.stringify({ data: cached.payload, cached: true, stale: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw e;
    }
  } catch (e) {
    console.error("[markets-proxy]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
