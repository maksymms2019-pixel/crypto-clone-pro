import { supabase } from "@/integrations/supabase/client";

export type NewsItem = {
  id: string;
  title: string;
  title_uk: string | null;
  url: string;
  source: string;
  published_at: string;
  summary: string | null;
  summary_uk: string | null;
  image_url: string | null;
  tags: string[];
  sentiment: string | null;
  importance_score?: number;
  cluster_id?: string | null;
  click_count?: number;
};

const COLS = "id,title,title_uk,url,source,published_at,summary,summary_uk,image_url,tags,sentiment,importance_score,cluster_id,click_count";

export async function fetchNews(limit = 60): Promise<NewsItem[]> {
  // CRITICAL: must call supabase.from(...) — do NOT destructure `from`,
  // it breaks the `this` binding and explodes with "reading 'rest'".
  const { data, error } = await supabase
    .from("news_cache" as never)
    .select(COLS)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[news] fetch failed:", error.message);
    throw new Error(error.message);
  }
  return (data ?? []) as unknown as NewsItem[];
}

export async function fetchNewsForCoin(symbol: string, name: string, limit = 6): Promise<NewsItem[]> {
  const sym = symbol.toUpperCase();
  try {
    const tagQ = await supabase
      .from("news_cache" as never)
      .select(COLS)
      .contains("tags", [sym])
      .order("published_at", { ascending: false })
      .limit(limit);
    const a = ((tagQ.data ?? []) as unknown) as NewsItem[];
    if (a.length >= 3) return a;

    const titleQ = await supabase
      .from("news_cache" as never)
      .select(COLS)
      .ilike("title", `%${name}%`)
      .order("published_at", { ascending: false })
      .limit(limit);
    const b = ((titleQ.data ?? []) as unknown) as NewsItem[];
    const seen = new Set<string>();
    const merged: NewsItem[] = [];
    for (const it of [...a, ...b]) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      merged.push(it);
      if (merged.length >= limit) break;
    }
    return merged;
  } catch (e) {
    console.warn("[news] fetchNewsForCoin failed", e);
    return [];
  }
}

export async function refreshNews() {
  const { data, error } = await supabase.functions.invoke("news-aggregator", { body: {} });
  if (error) throw error;
  return data;
}

export async function bumpClick(id: string) {
  try {
    await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<unknown>)("bump_news_click", { _id: id });
  } catch { /* ignore */ }
}

export type NewsCluster = { lead: NewsItem; related: NewsItem[]; score: number };

// Jargon that signals a "technical / deep-dive" piece rather than a general
// market-moving headline. We demote these so the feed reads like the top
// stories on a news homepage, not an RSS dump.
const JARGON_RE = /\b(airdrop|yield|tvl|liquidity pool|rollup|mev|validator|epoch|testnet|mainnet upgrade|eip-?\d+|bip-?\d+|merkle|zk[- ]?proof|zk[- ]?rollup|staking|restaking|tokenomics|governance proposal|whitepaper|devnet|sidechain|l2 fees|gas fees|gas optimization|opcode|smart contract audit|proof of stake|proof of work|consensus mechanism)\b/i;
const OPINION_RE = /\b(opinion|analysis|deep dive|guide|how to|explained|tutorial|interview|podcast|review|why .{1,40}\?|here's why|recap|weekly digest|sponsored)\b/i;

function fallbackScore(n: NewsItem): number {
  const ageH = (Date.now() - new Date(n.published_at).getTime()) / 3_600_000;
  let s = 0;
  // Freshness
  if (ageH < 1) s += 8; else if (ageH < 3) s += 6; else if (ageH < 8) s += 4; else if (ageH < 24) s += 2;
  // Source trust
  const trust: Record<string, number> = {
    "Reuters World": 5, "CoinDesk": 4, "The Block": 4, "CNBC Economy": 4, "CNBC Finance": 4,
    "Cointelegraph": 3, "Decrypt": 3, "Bitcoin Magazine": 3, "Bankless": 2, "Watcher.Guru": 2,
    "Al Jazeera": 3, "Yahoo Finance": 2, "Investing.com": 2,
  };
  s += trust[n.source] ?? 1;
  // Topic weights — strongly favour consumer-friendly major stories,
  // and demote niche/technical verticals.
  const weights: Record<string, number> = {
    BTC: 9, ETH: 6, ETF: 9, "Геополітика": 8, "Регуляції": 7, "Макро": 7, "Безпека": 6,
    SOL: 1, DeFi: -2, AI: -1, NFT: -3, "Меми": -3,
  };
  for (const t of n.tags ?? []) s += weights[t] ?? 0;
  // Money / big-number mentions in the headline — almost always a real story.
  if (/\$\s?\d|\d+%|\d+\s?(million|billion|trillion|млрд|млн)/i.test(n.title)) s += 3;
  // Penalize technical jargon and opinion/explainer pieces heavily.
  if (JARGON_RE.test(n.title)) s -= 8;
  if (OPINION_RE.test(n.title)) s -= 5;
  // Long, complicated headlines are usually deep-dives, not breaking news.
  if (n.title.length > 100) s -= 2;
  if (n.title.length < 28) s -= 1; // clickbait stubs
  // Visual stories grab attention.
  if (n.image_url) s += 1.5;
  return s;
}

export function clusterAndRank(items: NewsItem[]): NewsCluster[] {
  // ALWAYS apply our consumer-friendly scoring on top of any backend score.
  // The aggregator's scores are tuned for raw "newsworthiness" — we want
  // "what would a casual user care about right now".
  const scored = items.map((i) => ({ ...i, importance_score: fallbackScore(i) }));
  const groups = new Map<string, NewsItem[]>();
  for (const it of scored) {
    const key = it.cluster_id || it.id;
    const arr = groups.get(key) ?? [];
    arr.push(it);
    groups.set(key, arr);
  }
  const clusters: NewsCluster[] = [];
  for (const arr of groups.values()) {
    arr.sort((a, b) => (b.importance_score ?? 0) - (a.importance_score ?? 0));
    const lead = arr[0];
    const score = (lead.importance_score ?? 0) + Math.min(4, (arr.length - 1) * 0.8);
    clusters.push({ lead, related: arr.slice(1, 6), score });
  }
  clusters.sort((a, b) => b.score - a.score);
  return clusters;
}
