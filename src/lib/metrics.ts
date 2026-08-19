import { supabase } from "@/integrations/supabase/client";

export type MarketMetrics = {
  altseason_index: number;
  altseason_label: string;
  btc_7d: number;
  market_state_score: number;
  market_state_label: string;
  market_cap_change_24h: number;
  btc_dominance: number;
  fear_greed: number;
  breadth_up_pct: number;
  avg_change_24h: number;
  today_label: string;
  today_summary: string;
  updated_at: string;
};

export async function fetchMarketMetrics(): Promise<MarketMetrics> {
  const { data, error } = await supabase.functions.invoke("market-metrics", { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data.data as MarketMetrics;
}
