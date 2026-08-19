// Markets proxy with shared 30s KV cache.
// Reduces CoinGecko load (1 fetch per cache window for all users), bypasses
// mobile CORS preflight slowness, and gives stable data in Telegram WebView.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CG = "https://api.coingecko.com/api/v3";

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
