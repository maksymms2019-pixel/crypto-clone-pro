import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toPng } from "html-to-image";
import { toast } from "sonner";
import { Download, Loader2 } from "lucide-react";
import { fetchMarkets, type CoinRow } from "@/lib/markets";
import { PageHeader } from "@/components/PageHeader";
import { SeoHead } from "@/components/SeoHead";
import { CryptoBubbles } from "@/components/CryptoBubbles";
import { Link } from "react-router-dom";
import { fmtPct, fmtUsd } from "@/lib/format";
import { iconUrl } from "@/lib/icons";

type Range = "1h" | "24h" | "7d" | "30d";
type Sector = { id: string; label: string; cgCategory?: string };
const SECTORS: Sector[] = [
  { id: "all", label: "Усі" },
  { id: "l1", label: "L1", cgCategory: "layer-1" },
  { id: "l2", label: "L2", cgCategory: "layer-2" },
  { id: "defi", label: "DeFi", cgCategory: "decentralized-finance-defi" },
  { id: "meme", label: "Meme", cgCategory: "meme-token" },
  { id: "ai", label: "AI", cgCategory: "artificial-intelligence" },
  { id: "rwa", label: "RWA", cgCategory: "real-world-assets-rwa" },
  { id: "stable", label: "Stables", cgCategory: "stablecoins" },
];
const RANGES: Range[] = ["1h", "24h", "7d", "30d"];

type Cell = { id: string; symbol: string; image: string; value: number; pct: number; price: number; rank?: number };
type Rect = { x: number; y: number; w: number; h: number };
type Placed = Cell & Rect;

// ---- Squarified treemap (Bruls, Huizing, van Wijk) -----------------------
function worst(row: Cell[], len: number, scale: number): number {
  if (row.length === 0) return Infinity;
  let max = -Infinity, min = Infinity, sum = 0;
  for (const c of row) {
    const a = c.value * scale;
    sum += a;
    if (a > max) max = a;
    if (a < min) min = a;
  }
  const s2 = sum * sum;
  const l2 = len * len;
  return Math.max((l2 * max) / s2, s2 / (l2 * min));
}
function squarify(items: Cell[], rect: Rect): Placed[] {
  const out: Placed[] = [];
  const totalValue = items.reduce((s, c) => s + c.value, 0) || 1;
  const totalArea = rect.w * rect.h;
  const scale = totalArea / totalValue;
  let { x, y, w, h } = rect;
  let remaining = items.slice();
  while (remaining.length) {
    let shortest = Math.min(w, h);
    const row: Cell[] = [];
    let i = 0;
    while (i < remaining.length) {
      const candidate = remaining[i];
      const withCandidate = [...row, candidate];
      if (row.length === 0 || worst(withCandidate, shortest, scale) <= worst(row, shortest, scale)) {
        row.push(candidate); i++;
      } else break;
    }
    remaining = remaining.slice(row.length);
    const rowArea = row.reduce((s, c) => s + c.value * scale, 0);
    if (w >= h) {
      const colW = rowArea / h;
      let oy = y;
      for (const c of row) {
        const ch = (c.value * scale) / colW;
        out.push({ ...c, x, y: oy, w: colW, h: ch });
        oy += ch;
      }
      x += colW; w -= colW;
    } else {
      const rowH = rowArea / w;
      let ox = x;
      for (const c of row) {
        const cw = (c.value * scale) / rowH;
        out.push({ ...c, x: ox, y, w: cw, h: rowH });
        ox += cw;
      }
      y += rowH; h -= rowH;
    }
    shortest = Math.min(w, h);
    if (w < 0.5 || h < 0.5) break;
  }
  return out;
}

function colorFor(pct: number, max: number): string {
  const m = Math.max(1, max);
  const p = Math.max(-m, Math.min(m, pct));
  const t = Math.abs(p) / m;
  if (Math.abs(p) < m * 0.02) return "rgb(58, 64, 72)";
  if (p >= 0) {
    const r = Math.round(26 + (1 - t) * 26);
    const g = Math.round(70 + t * 120);
    const b = Math.round(52 + (1 - t) * 18);
    return `rgb(${r}, ${g}, ${b})`;
  }
  const r = Math.round(90 + t * 130);
  const g = Math.round(44 - t * 14);
  const b = Math.round(56 - t * 18);
  return `rgb(${r}, ${g}, ${b})`;
}

function pctFor(c: CoinRow, r: Range): number {
  if (r === "1h") return c.price_change_percentage_1h_in_currency ?? 0;
  if (r === "7d") return c.price_change_percentage_7d_in_currency ?? 0;
  if (r === "30d") return c.price_change_percentage_30d_in_currency ?? 0;
  return c.price_change_percentage_24h ?? 0;
}

// Story export dimensions — portrait, full-bleed treemap, tiny header,
// legend strip at the bottom (matches the reference layout the user sent).
const STORY_W = 1080;
const STORY_HEAD = 90;
const STORY_BODY = 1170;
const STORY_LEGEND = 90;
const STORY_H = STORY_HEAD + STORY_BODY + STORY_LEGEND; // 1350

export default function Heatmap() {
  const [range, setRange] = useState<50 | 100>(100);
  const [mode, setMode] = useState<"map" | "bubbles">("map");
  const [timeRange, setTimeRange] = useState<Range>("24h");
  const [sector, setSector] = useState<Sector>(SECTORS[0]);
  const [preview, setPreview] = useState<Cell | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(360);
  const [H, setH] = useState(540);
  const [savingPng, setSavingPng] = useState(false);
  const [imgOverride, setImgOverride] = useState<Record<string, string> | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(() => {
      const w = Math.max(280, wrap.clientWidth - 12);
      setW(w);
      setH(w);
    });
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const top = useQuery({
    queryKey: ["markets", "heatmap", range, sector.id],
    queryFn: () => fetchMarkets({ perPage: range, sparkline: false, category: sector.cgCategory }),
    staleTime: 60_000,
  });

  const legendMax = useMemo(() => {
    const pcts = (top.data ?? []).map((c) => Math.abs(pctFor(c, timeRange)));
    if (!pcts.length) return 13;
    pcts.sort((a, b) => b - a);
    const p95 = pcts[Math.min(pcts.length - 1, Math.floor(pcts.length * 0.05))];
    return Math.max(5, Math.min(80, Math.round(p95)));
  }, [top.data, timeRange]);

  const sortedItems = useMemo<Cell[]>(() => {
    return (top.data ?? [])
      .filter((c) => c.market_cap > 0 && c.id !== "figure-heloc")
      .map((c, idx) => ({
        id: c.id, symbol: c.symbol, image: c.image,
        value: c.market_cap, pct: pctFor(c, timeRange),
        price: c.current_price, rank: idx,
      }))
      .sort((a, b) => b.value - a.value);
  }, [top.data, timeRange]);

  const cells = useMemo(() => squarify(sortedItems, { x: 0, y: 0, w: W, h: H }), [sortedItems, W, H]);
  const exportCells = useMemo(() => squarify(sortedItems, { x: 0, y: 0, w: STORY_W, h: STORY_BODY }), [sortedItems]);

  const legendStops = useMemo(
    () => [-legendMax, -legendMax * 0.66, -legendMax * 0.33, 0, legendMax * 0.33, legendMax * 0.66, legendMax],
    [legendMax],
  );
  const legendGradient = `linear-gradient(90deg, ${legendStops.map((s) => colorFor(s, legendMax)).join(", ")})`;

  async function fetchAsDataUrl(url: string): Promise<string | null> {
    try {
      const res = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  async function savePng() {
    const node = exportRef.current;
    if (!node) return;
    setSavingPng(true);
    try {
      const urls = Array.from(new Set(exportCells.map((c) => iconUrl(c.image)).filter(Boolean)));
      const pairs = await Promise.all(urls.map(async (u) => [u, await fetchAsDataUrl(u)] as const));
      const map: Record<string, string> = {};
      for (const [u, d] of pairs) if (d) map[u] = d;
      setImgOverride(map);
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: false,
        backgroundColor: "#06141C",
        skipFonts: false,
        fetchRequestInit: { mode: "cors" },
      });

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `cryptotime-heatmap-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "CryptoTime — Heatmap" });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      toast.success("Картинку збережено");
    } catch (e) {
      console.error(e);
      toast.error("Не вдалось згенерувати картинку");
    } finally {
      setImgOverride(null);
      setSavingPng(false);
    }
  }

  // Reusable cell renderer — same look on screen and in export.
  function renderCell(c: Placed, opts: { scale?: number } = {}) {
    const scale = opts.scale ?? 1;
    const minSide = Math.min(c.w, c.h);
    const sizeBase = Math.min(c.w * 0.18, c.h * 0.18);
    const symFs = Math.max(8 * scale, Math.min(sizeBase, 22 * scale));
    const priceFs = Math.max(8 * scale, Math.min(symFs * 0.78, 16 * scale));
    const iconSize = Math.max(14 * scale, Math.min(Math.min(c.w, c.h) * 0.32, 56 * scale));
    const isTop10 = (c.rank ?? 99) < 10;
    const showAll = minSide > 80 * scale || (isTop10 && minSide > 44 * scale);
    const showSymPrice = minSide > 46 * scale;
    const showSym = minSide > 22 * scale;
    const top10SmallIcon = isTop10 && !showAll && minSide > 22 * scale;
    const effIcon = top10SmallIcon ? Math.max(12 * scale, Math.min(minSide * 0.42, 26 * scale)) : iconSize;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const stackH = showAll
      ? effIcon + symFs + priceFs + 10
      : top10SmallIcon ? effIcon + symFs + 4 : showSymPrice ? symFs + priceFs + 4 : symFs;
    const topY = cy - stackH / 2;
    return (
      <g key={c.id} onClick={() => setPreview(c)} style={{ cursor: "pointer" }}>
        <rect
          x={c.x + 0.7} y={c.y + 0.7}
          width={Math.max(0, c.w - 1.4)} height={Math.max(0, c.h - 1.4)}
          fill={colorFor(c.pct, legendMax)} stroke="rgba(6,20,28,.9)" strokeWidth="1" rx="2"
        />
        {(showAll || top10SmallIcon) && c.image && (
          <image href={imgOverride?.[iconUrl(c.image)] ?? iconUrl(c.image)} x={cx - effIcon / 2} y={topY} width={effIcon} height={effIcon}
            crossOrigin="anonymous" style={{ pointerEvents: "none" }} preserveAspectRatio="xMidYMid meet" />
        )}
        {(showAll || showSymPrice || showSym || top10SmallIcon) && (
          <text x={cx}
            y={showAll ? topY + effIcon + symFs * 0.7
                : top10SmallIcon ? topY + effIcon + symFs * 0.7
                : showSymPrice ? cy - priceFs * 0.55 : cy}
            textAnchor="middle" dominantBaseline="central"
            fill="#F8FAFC" fontWeight={800} fontSize={symFs} style={{ pointerEvents: "none" }}>
            {c.symbol.toUpperCase()}
          </text>
        )}
        {(showAll || (showSymPrice && !top10SmallIcon)) && (
          <text x={cx}
            y={showAll ? topY + effIcon + symFs * 1.55 + priceFs * 0.3 : cy + symFs * 0.55}
            textAnchor="middle" dominantBaseline="central"
            fill="rgba(248,250,252,.88)" fontSize={priceFs} fontWeight={600}
            style={{ pointerEvents: "none" }}>
            {fmtUsd(c.price, { digits: c.price < 1 ? 4 : 2 })}
          </text>
        )}
      </g>
    );
  }

  return (
    <div className="space-y-3">
      <SeoHead title="Heatmap · Крипто-карта" description="Карта ринку крипто за капіталізацією і зміною ціни." />
      <PageHeader
        title="Карта ринку"
        subtitle={`Топ-${range} · ${timeRange}${sector.cgCategory ? " · " + sector.label : ""}`}
        right={
          <div className="flex items-center gap-1.5">
            {([50, 100] as const).map((n) => (
              <button key={n} onClick={() => setRange(n)} className="chip" data-active={range === n}>{n}</button>
            ))}
            <button
              onClick={savePng}
              disabled={savingPng || top.isLoading}
              className="chip"
              aria-label="Завантажити картинку"
            >
              {savingPng ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            </button>
          </div>
        }
      />

      {/* Mode switch */}
      <div className="flex gap-1.5">
        <button onClick={() => setMode("map")} className="chip flex-1 justify-center py-2" data-active={mode === "map"}>Карта</button>
        <button onClick={() => setMode("bubbles")} className="chip flex-1 justify-center py-2" data-active={mode === "bubbles"}>Бульбашки</button>
      </div>

      {/* Time range */}
      <div className="flex gap-1.5">
        {RANGES.map((r) => (
          <button key={r} onClick={() => setTimeRange(r)} className="chip flex-1 justify-center py-1.5" data-active={timeRange === r}>{r}</button>
        ))}
      </div>

      {/* Sector chips */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
        {SECTORS.map((s) => (
          <button key={s.id} onClick={() => setSector(s)} className="chip whitespace-nowrap" data-active={sector.id === s.id}>{s.label}</button>
        ))}
      </div>

      {/* On-screen heatmap */}
      <div className="rounded-2xl p-3 space-y-2" style={{ background: "#06141C", border: "1px solid rgba(231,182,80,.18)" }}>
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-bold tracking-wider">
            CRYPTO<span style={{ color: "var(--gold)" }}>TIME</span>
            <span className="ml-2 text-[10px] font-normal text-[var(--text-muted)]">
              Heatmap · Топ-{range} · {timeRange}
            </span>
          </div>
          <div className="text-[10px] text-[var(--text-muted)]">
            {new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long" })}
          </div>
        </div>

        <div className="px-1 py-1">
          <div className="h-2 w-full rounded-full" style={{ background: legendGradient }} />
          <div className="mt-1 flex items-center justify-between">
            {legendStops.map((p, i) => (
              <span key={i} className="text-[9px] tabular-nums text-[var(--text-muted)]">
                {p > 0 ? `+${p.toFixed(0)}` : p.toFixed(0)}%
              </span>
            ))}
          </div>
        </div>

        <div ref={wrapRef}>
          {top.isLoading ? (
            <div className="surface p-4"><div className="skeleton h-[540px] w-full" /></div>
          ) : mode === "bubbles" ? (
            <CryptoBubbles coins={top.data ?? []} range={timeRange} />
          ) : (
            <div className="surface p-1.5 overflow-hidden relative">
              <div className="relative w-full" style={{ aspectRatio: `${W} / ${H}` }}>
                <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                  {cells.map((c) => renderCell(c))}
                </svg>
              </div>

              {preview && (
                <div className="absolute inset-x-2 bottom-2 surface p-3 flex items-center gap-3 shadow-2xl animate-coin-pop">
                  <img src={preview.image} alt="" className="h-10 w-10 rounded-full" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{preview.symbol.toUpperCase()}</div>
                    <div className="text-[11px] tabular-nums text-[var(--text-muted)]">{fmtUsd(preview.price)}</div>
                  </div>
                  <div className={`text-sm font-bold tabular-nums ${preview.pct >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                    {fmtPct(preview.pct)}
                  </div>
                  <Link to={`/coin/${preview.id}`} className="chip" data-active="true" onClick={() => setPreview(null)}>Деталі</Link>
                  <button onClick={() => setPreview(null)} className="chip" aria-label="Закрити">✕</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* OFF-SCREEN STORY-FORMAT EXPORT — 1080×1350, no padding, legend at bottom */}
      <div style={{ position: "fixed", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
        <div
          ref={exportRef}
          style={{
            width: STORY_W, height: STORY_H, background: "#06141C", color: "#F8FAFC",
            fontFamily: "Inter, system-ui, sans-serif", display: "flex", flexDirection: "column",
          }}
        >
          {/* Header */}
          <div style={{ height: STORY_HEAD, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 0.8 }}>
              CRYPTO<span style={{ color: "#E7B650" }}>TIME</span>
              <span style={{ marginLeft: 14, fontSize: 16, fontWeight: 600, color: "#8A9BA8", letterSpacing: 0.4 }}>
                Heatmap · Топ-{range} · {timeRange}
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#8A9BA8" }}>
              {new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long", year: "numeric" })}
            </div>
          </div>

          {/* Body — full-bleed treemap */}
          <svg
            width={STORY_W} height={STORY_BODY}
            viewBox={`0 0 ${STORY_W} ${STORY_BODY}`}
            preserveAspectRatio="none"
            style={{ display: "block" }}
          >
            {exportCells.map((c) => renderCell(c, { scale: 2.2 }))}
          </svg>

          {/* Legend strip — bottom */}
          <div style={{ height: STORY_LEGEND, padding: "18px 32px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ height: 18, borderRadius: 4, background: legendGradient }} />
            <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between" }}>
              {legendStops.map((p, i) => (
                <span key={i} style={{ fontSize: 16, fontWeight: 700, color: "#C8D2DC" }}>
                  {p > 0 ? `+${p.toFixed(0)}` : p.toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center">
        {mode === "bubbles"
          ? "Розмір — капіталізація · колір — зміна · тап → деталі"
          : "Площа — частка капіталізації · колір — зміна · тап → міні-картка"}
      </p>

      {top.data && (
        <section>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Найбільші рухи · {timeRange}</h2>
          <div className="surface divide-y divide-[var(--line)]">
            {[...top.data]
              .filter((c) => c.id !== "figure-heloc")
              .sort((a, b) => Math.abs(pctFor(b, timeRange)) - Math.abs(pctFor(a, timeRange)))
              .slice(0, 5)
              .map((c) => {
                const p = pctFor(c, timeRange);
                return (
                  <Link key={c.id} to={`/coin/${c.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[.02]">
                    <img src={iconUrl(c.image)} alt="" className="h-7 w-7 rounded-full" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{c.symbol.toUpperCase()}</div>
                      <div className="text-[11px] text-[var(--text-muted)] tabular-nums">{fmtUsd(c.current_price)}</div>
                    </div>
                    <div className={`text-sm font-semibold tabular-nums ${p >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
                      {fmtPct(p)}
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}
