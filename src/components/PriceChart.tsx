import { useEffect, useRef, useState } from "react";
import { Settings2, Maximize2, Minimize2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// TradingView embed — clean exchange-style toolbar.
// Row 1: timeframe segmented control (left) + settings/fullscreen (right).
// Settings popover hides: style (candles/line/area/heikin), Volume, EMA.

const TV_MAP: Record<string, string> = {
  bitcoin: "BINANCE:BTCUSDT", ethereum: "BINANCE:ETHUSDT", tether: "BINANCE:USDTUSD",
  binancecoin: "BINANCE:BNBUSDT", solana: "BINANCE:SOLUSDT", ripple: "BINANCE:XRPUSDT",
  "usd-coin": "BINANCE:USDCUSDT", cardano: "BINANCE:ADAUSDT", dogecoin: "BINANCE:DOGEUSDT",
  "avalanche-2": "BINANCE:AVAXUSDT", tron: "BINANCE:TRXUSDT", chainlink: "BINANCE:LINKUSDT",
  polkadot: "BINANCE:DOTUSDT", "matic-network": "BINANCE:MATICUSDT", "shiba-inu": "BINANCE:SHIBUSDT",
  litecoin: "BINANCE:LTCUSDT", "bitcoin-cash": "BINANCE:BCHUSDT", uniswap: "BINANCE:UNIUSDT",
  "internet-computer": "BINANCE:ICPUSDT", cosmos: "BINANCE:ATOMUSDT", "ethereum-classic": "BINANCE:ETCUSDT",
  stellar: "BINANCE:XLMUSDT", filecoin: "BINANCE:FILUSDT", "hedera-hashgraph": "BINANCE:HBARUSDT",
  aptos: "BINANCE:APTUSDT", near: "BINANCE:NEARUSDT", vechain: "BINANCE:VETUSDT",
  arbitrum: "BINANCE:ARBUSDT", optimism: "BINANCE:OPUSDT", "the-open-network": "BINANCE:TONUSDT",
  injective: "BINANCE:INJUSDT", sui: "BINANCE:SUIUSDT", sei: "BINANCE:SEIUSDT",
  monero: "BINANCE:XMRUSDT", aave: "BINANCE:AAVEUSDT", maker: "BINANCE:MKRUSDT",
  pepe: "BINANCE:PEPEUSDT", "render-token": "BINANCE:RNDRUSDT",
};

function tvSymbol(coinId: string, symbol: string): string {
  if (TV_MAP[coinId]) return TV_MAP[coinId];
  return `CRYPTO:${symbol.toUpperCase()}USD`;
}

type TF = { id: string; label: string; interval: string };
const TIMEFRAMES: TF[] = [
  { id: "1m", label: "1m", interval: "1" },
  { id: "5m", label: "5m", interval: "5" },
  { id: "15m", label: "15m", interval: "15" },
  { id: "1h", label: "1H", interval: "60" },
  { id: "4h", label: "4H", interval: "240" },
  { id: "1d", label: "1D", interval: "D" },
  { id: "1w", label: "1W", interval: "W" },
  { id: "1M", label: "1M", interval: "M" },
];

type ChartStyle = { id: string; label: string; value: string };
const STYLES: ChartStyle[] = [
  { id: "candles", label: "Свічки", value: "1" },
  { id: "heikin", label: "Heikin", value: "8" },
  { id: "bars", label: "Бари", value: "0" },
  { id: "line", label: "Лінія", value: "2" },
  { id: "area", label: "Area", value: "3" },
];

export function PriceChart({ coinId, symbol = "btc" }: { coinId: string; symbol?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  const [tf, setTf] = useState<TF>(TIMEFRAMES[5]); // 1D
  const [style, setStyle] = useState<ChartStyle>(STYLES[0]);
  const [showVolume, setShowVolume] = useState(true);
  const [showEMAs, setShowEMAs] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const sym = tvSymbol(coinId, symbol);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    container.innerHTML = "";
    setReady(false);

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.onload = () => { if (!cancelled) setReady(true); };
    script.onerror = () => { if (!cancelled) setReady(true); };
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: sym,
      interval: tf.interval,
      timezone: "Europe/Kiev",
      theme: "dark",
      style: style.value,
      locale: "uk",
      backgroundColor: "#06141C",
      gridColor: "rgba(255,255,255,0.04)",
      toolbar_bg: "#06141C",
      hide_top_toolbar: false,
      hide_side_toolbar: false,
      hide_legend: false,
      hide_volume: !showVolume,
      withdateranges: true,
      allow_symbol_change: false,
      details: false,
      calendar: false,
      save_image: true,
      studies: showEMAs
        ? [
            { id: "MAExp@tv-basicstudies", inputs: { length: 7 } },
            { id: "MAExp@tv-basicstudies", inputs: { length: 25 } },
            { id: "MAExp@tv-basicstudies", inputs: { length: 99 } },
          ]
        : [],
      overrides: {
        "paneProperties.background": "#06141C",
        "paneProperties.backgroundType": "solid",
        "paneProperties.vertGridProperties.color": "rgba(255,255,255,0.04)",
        "paneProperties.horzGridProperties.color": "rgba(255,255,255,0.04)",
        "scalesProperties.textColor": "rgba(255,255,255,0.55)",
        "scalesProperties.lineColor": "rgba(255,255,255,0.08)",
        "mainSeriesProperties.candleStyle.upColor": "#26A66C",
        "mainSeriesProperties.candleStyle.downColor": "#D6405C",
        "mainSeriesProperties.candleStyle.borderUpColor": "#26A66C",
        "mainSeriesProperties.candleStyle.borderDownColor": "#D6405C",
        "mainSeriesProperties.candleStyle.wickUpColor": "#26A66C",
        "mainSeriesProperties.candleStyle.wickDownColor": "#D6405C",
        "mainSeriesProperties.hollowCandleStyle.upColor": "#26A66C",
        "mainSeriesProperties.hollowCandleStyle.downColor": "#D6405C",
        "mainSeriesProperties.haStyle.upColor": "#26A66C",
        "mainSeriesProperties.haStyle.downColor": "#D6405C",
        "mainSeriesProperties.barStyle.upColor": "#26A66C",
        "mainSeriesProperties.barStyle.downColor": "#D6405C",
        "mainSeriesProperties.lineStyle.color": "#E7B650",
        "mainSeriesProperties.areaStyle.color1": "rgba(231,182,80,0.35)",
        "mainSeriesProperties.areaStyle.color2": "rgba(231,182,80,0.02)",
        "mainSeriesProperties.areaStyle.linecolor": "#E7B650",
      },
      studies_overrides: {
        "volume.volume.color.0": "rgba(214,64,92,.55)",
        "volume.volume.color.1": "rgba(38,166,108,.55)",
        "volume.volume.transparency": 65,
      },
      support_host: "https://www.tradingview.com",
    });
    container.appendChild(script);

    return () => {
      cancelled = true;
      try { if (container) container.innerHTML = ""; } catch { /* ignore */ }
    };
  }, [sym, tf, style, showVolume, showEMAs]);

  return (
    <div
      className={fullscreen
        ? "fixed inset-0 z-[100] flex flex-col bg-[var(--bg-base)]"
        : "surface overflow-hidden"}
      style={fullscreen ? undefined : { border: "1px solid rgba(231,182,80,.18)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[rgba(255,255,255,.05)]">
        <div className="flex items-baseline gap-1 min-w-0 shrink-0">
          <span className="text-[13px] font-bold tracking-wide text-[var(--text)] leading-none">{symbol.toUpperCase()}</span>
          <span className="text-[11px] text-[var(--text-muted)] leading-none">/USDT</span>
        </div>

        {/* Timeframe segmented control */}
        <div className="flex items-center gap-0.5 rounded-lg bg-[rgba(255,255,255,.04)] p-0.5 overflow-x-auto no-scrollbar">
          {TIMEFRAMES.map((t) => {
            const active = t.id === tf.id;
            return (
              <button
                key={t.id}
                onClick={() => setTf(t)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
                  active
                    ? "bg-[var(--gold)] text-[#1A0F00]"
                    : "text-[var(--text-muted)] hover:text-[var(--text)]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,.05)]"
                aria-label="Налаштування графіка"
              >
                <Settings2 size={14} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-3 bg-[#0c1820] border-[rgba(231,182,80,.18)]">
              <div className="space-y-3">
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)] mb-1.5 font-semibold">Тип графіка</div>
                  <div className="grid grid-cols-2 gap-1">
                    {STYLES.map((s) => {
                      const active = s.id === style.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => setStyle(s)}
                          className={`rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                            active
                              ? "bg-[var(--gold)] text-[#1A0F00]"
                              : "bg-[rgba(255,255,255,.04)] text-[var(--text-muted)] hover:text-[var(--text)]"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5 pt-1 border-t border-[rgba(255,255,255,.06)]">
                  <SettingsToggle label="Об'єм" hint="Стовпчики обʼєму" active={showVolume} onToggle={() => setShowVolume((v) => !v)} />
                  <SettingsToggle label="EMA 7 / 25 / 99" hint="Ковзні середні" active={showEMAs} onToggle={() => setShowEMAs((v) => !v)} />
                </div>
                <div className="pt-1 border-t border-[rgba(255,255,255,.06)] text-[10px] leading-snug text-[var(--text-muted)]">
                  Індикатори і малювання — у бічній панелі TradingView.
                </div>
              </div>
            </PopoverContent>
          </Popover>
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[rgba(255,255,255,.05)]"
            aria-label={fullscreen ? "Згорнути" : "На весь екран"}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      <div
        className="relative w-full overflow-hidden"
        style={{ height: fullscreen ? "100%" : 560, background: "#06141C", flex: fullscreen ? 1 : undefined }}
      >
        <div ref={containerRef} className="tradingview-widget-container h-full w-full" />
        {!ready && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-[var(--text-muted)]">
            Завантаження графіку…
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsToggle({
  label, hint, active, onToggle,
}: { label: string; hint?: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[rgba(255,255,255,.04)]"
    >
      <div className="min-w-0">
        <div className="text-[11px] font-semibold">{label}</div>
        {hint && <div className="text-[10px] text-[var(--text-muted)]">{hint}</div>}
      </div>
      <span
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${
          active ? "bg-[var(--gold)]" : "bg-[rgba(255,255,255,.12)]"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${
            active ? "left-3.5" : "left-0.5"
          }`}
        />
      </span>
    </button>
  );
}
