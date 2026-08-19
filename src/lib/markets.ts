// Markets data layer — uses our edge function `markets-proxy` for shared 30s KV cache,
// resilient to CoinGecko rate-limits and slow Telegram WebView CORS preflights.

import { supabase } from "@/integrations/supabase/client";

export type CoinRow = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  market_cap: number;
  market_cap_rank?: number;
  total_volume?: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  price_change_percentage_30d_in_currency?: number;
  sparkline_in_7d?: { price: number[] };
};

export type GlobalData = {
  total_market_cap_usd: number;
  total_volume_usd: number;
  market_cap_change_percentage_24h_usd: number;
  btc_dominance: number;
  eth_dominance: number;
  active_cryptocurrencies: number;
};

export type CoinDetail = {
  id: string;
  symbol: string;
  name: string;
  image: string;
  description?: string;
  market_cap_rank?: number | null;
  current_price: number;
  market_cap: number;
  fully_diluted_valuation?: number | null;
  total_volume: number;
  high_24h?: number | null;
  low_24h?: number | null;
  circulating_supply?: number | null;
  total_supply?: number | null;
  max_supply?: number | null;
  ath: number;
  ath_date?: string | null;
  ath_change_percentage?: number | null;
  atl: number;
  atl_date?: string | null;
  atl_change_percentage?: number | null;
  price_change_percentage_24h: number;
  price_change_percentage_7d: number;
  price_change_percentage_30d: number;
  price_change_percentage_1y?: number | null;
  sparkline_7d: number[];
  homepage?: string | null;
  twitter?: string | null;
  reddit?: string | null;
  github?: string | null;
  categories?: string[];
};

async function callProxy<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("markets-proxy", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.data as T;
}

export function fetchMarkets(opts: { perPage?: number; page?: number; ids?: string[]; sparkline?: boolean; category?: string } = {}): Promise<CoinRow[]> {
  return callProxy<CoinRow[]>({ op: "markets", ...opts });
}

export function fetchGlobal(): Promise<GlobalData> {
  return callProxy<GlobalData>({ op: "global" });
}

export function fetchFearGreed(): Promise<{ value: number; classification: string }> {
  return callProxy({ op: "fear_greed" });
}

export function fetchCoinDetail(id: string): Promise<CoinDetail> {
  return callProxy<CoinDetail>({ op: "coin", id });
}

export function fetchCoinChart(id: string, days: number | string): Promise<{ prices: [number, number][] }> {
  return callProxy({ op: "chart", id, days });
}

export type OHLCCandle = [number, number, number, number, number]; // [time, open, high, low, close]

export function fetchCoinOHLC(id: string, days: number | string): Promise<{ ohlc: OHLCCandle[] }> {
  return callProxy({ op: "ohlc", id, days });
}

export type TrendingCoin = {
  id: string; symbol: string; name: string; image: string;
  rank: number | null; price: number | null; pct24h: number | null;
};

export function fetchTrending(): Promise<TrendingCoin[]> {
  return callProxy<TrendingCoin[]>({ op: "trending" });
}

export type MoverRow = {
  id: string; symbol: string; name: string; image: string;
  current_price: number; price_change_percentage_24h: number;
};

export function fetchGainersLosers(): Promise<{ gainers: MoverRow[]; losers: MoverRow[] }> {
  return callProxy({ op: "gainers_losers" });
}
