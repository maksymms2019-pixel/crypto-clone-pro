// news-aggregator — fetches RSS/Atom from a wide list of crypto sources,
// normalizes URLs (unwraps Feedburner, strips utm_*), extracts thumbnails
// and short summaries, and upserts into news_cache. Idempotent on url.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SOURCES: { name: string; url: string }[] = [
  { name: "CoinDesk",        url: "https://www.coindesk.com/arc/outboundfeeds/rss/" },
  { name: "Decrypt",         url: "https://decrypt.co/feed" },
  { name: "Cointelegraph",   url: "https://cointelegraph.com/rss" },
  { name: "The Block",       url: "https://www.theblock.co/rss.xml" },
  { name: "Bitcoin Magazine",url: "https://bitcoinmagazine.com/.rss/full/" },
  { name: "CryptoSlate",     url: "https://cryptoslate.com/feed/" },
  { name: "BeInCrypto",      url: "https://beincrypto.com/feed/" },
  { name: "CryptoPotato",    url: "https://cryptopotato.com/feed/" },
  { name: "NewsBTC",         url: "https://www.newsbtc.com/feed/" },
  { name: "U.Today",         url: "https://u.today/rss" },
  { name: "Bankless",        url: "https://newsletter.banklesshq.com/feed" },
  { name: "Watcher.Guru",    url: "https://watcher.guru/news/feed" },
  { name: "Crypto Briefing", url: "https://cryptobriefing.com/feed/" },
  { name: "AMBCrypto",       url: "https://ambcrypto.com/feed/" },
  // Geopolitics & macro — markets react heavily to these.
  { name: "Reuters World",   url: "https://www.reutersagency.com/feed/?best-topics=political-general&post_type=best" },
  { name: "Al Jazeera",      url: "https://www.aljazeera.com/xml/rss/all.xml" },
  { name: "CNBC Economy",    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258" },
  { name: "CNBC Finance",    url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664" },
  { name: "Investing.com",   url: "https://www.investing.com/rss/news_25.rss" },
  { name: "Yahoo Finance",   url: "https://finance.yahoo.com/news/rssindex" },
  { name: "ZeroHedge",       url: "https://feeds.feedburner.com/zerohedge/feed" },
];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;/g, "“")
    .replace(/&#8221;/g, "”")
    .replace(/&hellip;/g, "…");
}
function stripTags(s: string): string {
  return decodeEntities(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function normalizeUrl(raw: string, origLink?: string | null): string {
  let u = (origLink ?? raw).trim();
  // Unwrap common feedproxy redirects (best-effort)
  try {
    const parsed = new URL(u);
    if (parsed.hostname.includes("feedproxy.google.com") ||
        parsed.hostname.includes("feeds.feedburner.com")) {
      // Last segment is typically the destination slug; we keep the URL since
      // the redirect itself is HTTPS and resolves. The bigger fix is preferring
      // <feedburner:origLink>, which we already do via origLink param.
    }
    // Strip tracking params
    const toDelete: string[] = [];
    parsed.searchParams.forEach((_v, k) => {
      if (/^utm_/i.test(k) || k === "source" || k === "ref" || k === "from") toDelete.push(k);
    });
    toDelete.forEach((k) => parsed.searchParams.delete(k));
    return parsed.toString();
  } catch {
    return u;
  }
}

type Parsed = {
  title: string;
  link: string;
  pubDate: string;
  summary: string | null;
  image: string | null;
};

function pickFirst(block: string, regexes: RegExp[]): string | null {
  for (const re of regexes) {
    const m = block.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

function parseFeed(xml: string): Parsed[] {
  const items: Parsed[] = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry[\s\S]*?<\/entry>/g : /<item[\s\S]*?<\/item>/g;
  const blocks = xml.match(blockRe) ?? [];

  for (const block of blocks) {
    const titleRaw =
      pickFirst(block, [/<title[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/title>/i, /<title[^>]*>([\s\S]*?)<\/title>/i]);
    if (!titleRaw) continue;
    const title = stripTags(titleRaw);

    // Prefer feedburner origLink to get the real publisher URL
    const orig = pickFirst(block, [/<feedburner:origLink>([\s\S]*?)<\/feedburner:origLink>/i]);

    let link: string | null = null;
    if (isAtom) {
      // Prefer alternate text/html
      const altMatch = block.match(/<link[^>]+rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)
                    ?? block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?>/i);
      link = altMatch?.[1] ?? null;
    } else {
      link = pickFirst(block, [/<link>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/link>/i, /<link>([\s\S]*?)<\/link>/i]);
    }
    if (!link) continue;

    const dateRaw =
      pickFirst(block, [
        /<pubDate>([\s\S]*?)<\/pubDate>/i,
        /<dc:date>([\s\S]*?)<\/dc:date>/i,
        /<published>([\s\S]*?)<\/published>/i,
        /<updated>([\s\S]*?)<\/updated>/i,
      ]) ?? new Date().toISOString();

    let pubDate: string;
    try { pubDate = new Date(dateRaw.trim()).toISOString(); }
    catch { pubDate = new Date().toISOString(); }

    // Summary candidates
    const summaryRaw =
      pickFirst(block, [
        /<description[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/description>/i,
        /<description[^>]*>([\s\S]*?)<\/description>/i,
        /<summary[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/summary>/i,
        /<summary[^>]*>([\s\S]*?)<\/summary>/i,
        /<content:encoded[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/content:encoded>/i,
      ]);
    let summary = summaryRaw ? stripTags(summaryRaw) : null;
    if (summary && summary.length > 220) summary = summary.slice(0, 217).trimEnd() + "…";

    // Image candidates
    let image: string | null =
      pickFirst(block, [
        /<media:content[^>]+url=["']([^"']+)["']/i,
        /<media:thumbnail[^>]+url=["']([^"']+)["']/i,
        /<enclosure[^>]+type=["']image\/[^"']+["'][^>]+url=["']([^"']+)["']/i,
        /<enclosure[^>]+url=["']([^"']+)["'][^>]+type=["']image\/[^"']+["']/i,
      ]);
    if (!image && summaryRaw) {
      const imgInHtml = summaryRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgInHtml) image = imgInHtml[1];
    }

    items.push({
      title,
      link: normalizeUrl(link, orig),
      pubDate,
      summary,
      image,
    });
  }
  return items;
}

function deriveTags(title: string, summary: string | null): string[] {
  const t = `${title} ${summary ?? ""}`.toLowerCase();
  const tags: string[] = [];
  if (/(\bbtc\b|bitcoin)/.test(t)) tags.push("BTC");
  if (/(\beth\b|ethereum|ether\b)/.test(t)) tags.push("ETH");
  if (/(\bsol\b|solana)/.test(t)) tags.push("SOL");
  if (/(\betf\b)/.test(t)) tags.push("ETF");
  if (/(sec |\bsec\b|regul|cftc|law|court|sanction|lawsuit|enforce)/.test(t)) tags.push("Регуляції");
  if (/(\bfed\b|federal reserve|inflation|macro|\bcpi\b|fomc|\bgdp\b|rate cut|interest rate|jobs report|unemployment|recession|treasury yield|\bppi\b|jerome powell|gold price|oil price|crude|dollar index|\bdxy\b)/.test(t)) tags.push("Макро");
  if (/(\bwar\b|warfare|military|missile|geopolit|sanction|china|\bxi jinping\b|russia|ukraine|israel|gaza|iran|middle east|\bopec\b|tariff|trade war|election|white house|\btrump\b|\bnato\b|conflict|invasion|ceasefire)/.test(t)) tags.push("Геополітика");
  if (/(hack|exploit|drain|stolen|breach|phishing)/.test(t)) tags.push("Безпека");
  if (/(defi|dex|liquidity|tvl|staking)/.test(t)) tags.push("DeFi");
  if (/(\bnft\b|collectible)/.test(t)) tags.push("NFT");
  if (/(memecoin|meme coin|\bdoge\b|\bshib\b|\bpepe\b|\bwif\b|\bbonk\b)/.test(t)) tags.push("Меми");
  if (/(\bai\b|artificial intelligence|machine learning|gpt|openai)/.test(t)) tags.push("AI");
  return tags;
}

// Sources that publish broad news — only keep items relevant to a crypto investor.
const GENERAL_SOURCES = new Set(["Reuters World", "Al Jazeera", "CNBC Economy", "CNBC Finance", "Investing.com", "Yahoo Finance", "ZeroHedge"]);
const RELEVANT_TAGS = new Set(["BTC", "ETH", "SOL", "ETF", "Регуляції", "Макро", "Геополітика", "DeFi", "Безпека", "NFT", "Меми", "AI"]);
function isRelevantForInvestor(source: string, tags: string[]): boolean {
  if (!GENERAL_SOURCES.has(source)) return true;
  return tags.some((t) => RELEVANT_TAGS.has(t));
}

// ---- Smart ranking ----------------------------------------------------------
const TAG_WEIGHT: Record<string, number> = {
  BTC: 6, ETH: 5, ETF: 5, "Геополітика": 6, "Регуляції": 5, "Макро": 5, "Безпека": 5,
  SOL: 3, DeFi: 2, AI: 2, NFT: 1, "Меми": 1,
};
const SOURCE_TRUST: Record<string, number> = {
  "CoinDesk": 4, "Cointelegraph": 3, "The Block": 4, "Decrypt": 3, "Crypto Briefing": 3,
  "Bitcoin Magazine": 3, "Bankless": 3, "Watcher.Guru": 2,
  "Reuters World": 4, "CNBC Economy": 3, "CNBC Finance": 3, "Al Jazeera": 2,
};

function freshnessBoost(publishedAt: string): number {
  const ageH = (Date.now() - new Date(publishedAt).getTime()) / 3_600_000;
  if (ageH < 1) return 7;
  if (ageH < 3) return 5;
  if (ageH < 8) return 3;
  if (ageH < 24) return 1.5;
  if (ageH < 48) return 0.5;
  return 0;
}

// Hot coins reflect what the market reacts to right now.
async function fetchHotCoins(): Promise<{ symbols: Set<string>; movers: Record<string, number> }> {
  try {
    const r = await fetch(
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h",
      { signal: AbortSignal.timeout(7000) },
    );
    if (!r.ok) return { symbols: new Set(), movers: {} };
    const arr = (await r.json()) as Array<{ symbol: string; price_change_percentage_24h: number }>;
    const movers: Record<string, number> = {};
    for (const c of arr) {
      if (Math.abs(c.price_change_percentage_24h) >= 5) movers[c.symbol.toLowerCase()] = c.price_change_percentage_24h;
    }
    return { symbols: new Set(arr.map((c) => c.symbol.toLowerCase())), movers };
  } catch {
    return { symbols: new Set(), movers: {} };
  }
}

function computeScore(row: { title: string; source: string; tags: string[]; image_url: string | null; published_at: string }, hot: { symbols: Set<string>; movers: Record<string, number> }): number {
  let s = 0;
  for (const t of row.tags) s += TAG_WEIGHT[t] ?? 0;
  s += SOURCE_TRUST[row.source] ?? 1;
  s += freshnessBoost(row.published_at);
  if (row.image_url) s += 1.5;
  // money-mention boost: explicit price/amount in headline grabs attention
  if (/\$\s?\d|\d+%|\d+\s?(million|billion|trillion|млрд|млн)/i.test(row.title)) s += 2;
  // hot-coin mentions
  const title = row.title.toLowerCase();
  for (const sym of Object.keys(hot.movers)) {
    if (sym.length < 3) continue;
    if (new RegExp(`\\b${sym}\\b`).test(title)) {
      s += Math.min(4, Math.abs(hot.movers[sym]) / 3);
      break;
    }
  }
  // demote very short clickbait titles
  if (row.title.length < 30) s -= 1;
  return Math.round(s * 10) / 10;
}

// Token-based shingling for cheap clustering across sources
const STOPWORDS = new Set("a an the and or of to in for on at by with from is are was were be been being as that this it its will would could should has have had say says said new now today this week".split(" "));
function tokens(title: string): string[] {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}
function clusterKey(title: string): string {
  // Pick top-4 most distinctive tokens, sorted, as a deterministic cluster id.
  const tks = tokens(title);
  const uniq = Array.from(new Set(tks));
  // prefer longer/proper-noun-looking tokens first
  uniq.sort((a, b) => b.length - a.length);
  return uniq.slice(0, 4).sort().join("-") || title.slice(0, 24);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    type Row = {
      url: string; title: string; source: string;
      published_at: string; tags: string[];
      summary: string | null; image_url: string | null;
      title_uk: string | null; summary_uk: string | null; sentiment: null;
      importance_score: number; cluster_id: string;
    };
    const all: Row[] = [];
    const hot = await fetchHotCoins();

    const results = await Promise.allSettled(SOURCES.map(async (src) => {
      const r = await fetch(src.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; CryptoTimeBot/1.0; +https://cryptotime.app)",
          "Accept": "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
        },
        signal: AbortSignal.timeout(9000),
      });
      if (!r.ok) throw new Error(`${src.name} ${r.status}`);
      const xml = await r.text();
      const items = parseFeed(xml).slice(0, 18);
      for (const it of items) {
        const tags = deriveTags(it.title, it.summary);
        if (!isRelevantForInvestor(src.name, tags)) continue;
        const base = {
          url: it.link,
          title: it.title,
          source: src.name,
          published_at: it.pubDate,
          tags,
          summary: it.summary,
          image_url: it.image,
        };
        all.push({
          ...base,
          title_uk: null,
          summary_uk: null,
          sentiment: null,
          importance_score: computeScore(base, hot),
          cluster_id: clusterKey(it.title),
        });
      }
    }));

    const failed = results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason?.message ?? "?");
    if (failed.length) console.warn("[news] failed sources:", failed);

    if (all.length === 0) {
      return new Response(JSON.stringify({ ok: true, inserted: 0, failed }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // De-dup by url within this batch (some sources cross-post)
    const seen = new Set<string>();
    const unique = all.filter((it) => (seen.has(it.url) ? false : (seen.add(it.url), true)));

    const { error } = await supabase
      .from("news_cache")
      .upsert(unique, { onConflict: "url", ignoreDuplicates: true });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, inserted: unique.length, sources: SOURCES.length, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[news-aggregator]", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
