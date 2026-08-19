import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { CoinRow } from "@/lib/markets";
import { fmtPct, fmtUsd } from "@/lib/format";
import { iconUrl } from "@/lib/icons";

type Range = "1h" | "24h" | "7d" | "30d";

type Bubble = {
  id: string; symbol: string; image: string; pct: number; price: number; mcap: number;
  r: number; x: number; y: number; vx: number; vy: number;
  img?: HTMLImageElement;
};

function pctFor(c: CoinRow, r: Range): number {
  if (r === "1h") return c.price_change_percentage_1h_in_currency ?? 0;
  if (r === "7d") return c.price_change_percentage_7d_in_currency ?? 0;
  if (r === "30d") return c.price_change_percentage_30d_in_currency ?? 0;
  return c.price_change_percentage_24h ?? 0;
}

function colorFor(pct: number, maxAbs: number, alpha = 1): string {
  const m = Math.max(1, maxAbs);
  const p = Math.max(-m, Math.min(m, pct));
  const t = Math.abs(p) / m;
  if (p >= 0) return `rgba(91, 228, 155, ${(0.22 + t * 0.6) * alpha})`;
  return `rgba(255, 92, 122, ${(0.22 + t * 0.6) * alpha})`;
}
function strokeFor(pct: number): string {
  return pct >= 0 ? "rgba(91,228,155,.95)" : "rgba(255,92,122,.95)";
}

export function CryptoBubbles({ coins, range = "24h" }: { coins: CoinRow[]; range?: Range }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const nav = useNavigate();
  const bubblesRef = useRef<Bubble[]>([]);
  const [focused, setFocused] = useState<Bubble | null>(null);
  const draggingRef = useRef<{ b: Bubble; offX: number; offY: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const data = useMemo(
    () => coins
      .filter((c) => c.id !== "figure-heloc")
      .filter((c) => isFinite(pctFor(c, range)))
      .slice(0, 80),
    [coins, range],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = wrap.clientWidth;
    let H = wrap.clientHeight;

    const ctx = canvas.getContext("2d")!;
    const resize = () => {
      W = wrap.clientWidth; H = wrap.clientHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    resize();

    const ro = new ResizeObserver(() => resize());
    ro.observe(wrap);

    const maxAbs = Math.max(...data.map((c) => Math.abs(pctFor(c, range))), 3);
    const maxMcap = Math.max(...data.map((c) => c.market_cap), 1);
    const minR = 22, maxR = Math.min(78, Math.max(46, Math.sqrt(W * H) / 8.5));
    bubblesRef.current = data.map((c) => {
      const pct = pctFor(c, range);
      const sizeFromMcap = Math.sqrt(c.market_cap / maxMcap);
      const sizeFromMove = Math.abs(pct) / maxAbs;
      const r = minR + (sizeFromMcap * 0.7 + sizeFromMove * 0.3) * (maxR - minR);
      const img = new Image();
      // Critical for canvas export: request CORS so toDataURL doesn't taint.
      img.crossOrigin = "anonymous";
      const sym = c.symbol.toLowerCase();
      const fallbacks = [
        c.image,
        `https://assets.coincap.io/assets/icons/${sym}@2x.png`,
      ].filter(Boolean).map((u) => iconUrl(u as string));
      let idx = 0;
      img.onerror = () => {
        idx++;
        if (idx < fallbacks.length) img.src = fallbacks[idx];
      };
      img.src = fallbacks[0];
      return {
        id: c.id, symbol: c.symbol, image: c.image, pct, price: c.current_price, mcap: c.market_cap,
        r, x: r + Math.random() * (W - 2 * r), y: r + Math.random() * (H - 2 * r),
        vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.4, img,
      };
    });

    let raf = 0;
    const step = () => {
      ctx.clearRect(0, 0, W, H);
      const bs = bubblesRef.current;
      const cx0 = W / 2, cy0 = H / 2;
      for (let i = 0; i < bs.length; i++) {
        const b = bs[i];
        if (draggingRef.current?.b === b) continue;
        b.vx += (cx0 - b.x) * 0.00015;
        b.vy += (cy0 - b.y) * 0.00015;
        b.vx *= 0.985; b.vy *= 0.985;
        b.x += b.vx; b.y += b.vy;
        if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
        if (b.y - b.r < 0) { b.y = b.r; b.vy = Math.abs(b.vy); }
        if (b.y + b.r > H) { b.y = H - b.r; b.vy = -Math.abs(b.vy); }
        for (let j = i + 1; j < bs.length; j++) {
          const o = bs[j];
          const dx = o.x - b.x, dy = o.y - b.y;
          const dist = Math.hypot(dx, dy) || 0.01;
          const min = b.r + o.r + 1;
          if (dist < min) {
            const ox = (dx / dist) * (min - dist) / 2;
            const oy = (dy / dist) * (min - dist) / 2;
            b.x -= ox; b.y -= oy; o.x += ox; o.y += oy;
            b.vx -= ox * 0.04; b.vy -= oy * 0.04; o.vx += ox * 0.04; o.vy += oy * 0.04;
          }
        }
      }
      for (const b of bs) {
        const grad = ctx.createRadialGradient(
          b.x - b.r * 0.3, b.y - b.r * 0.35, b.r * 0.1,
          b.x, b.y, b.r,
        );
        grad.addColorStop(0, colorFor(b.pct, maxAbs, 1));
        grad.addColorStop(1, colorFor(b.pct, maxAbs, 0.55));
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = strokeFor(b.pct);
        ctx.stroke();
        // One vertically centred stack: icon → symbol → percent.
        const hasText = b.r >= 22;
        const symSize = Math.max(11, Math.min(20, b.r * 0.40));
        const pctSize = Math.max(10, Math.min(16, b.r * 0.30));
        const iconS = b.r * (hasText ? 0.5 : 0.66);
        const gap = Math.max(2, b.r * 0.07);
        const stackH = hasText ? iconS + gap + symSize + gap * 0.6 + pctSize : iconS;
        const stackTop = b.y - stackH / 2;
        const iconCy = stackTop + iconS / 2;
        const symCy = stackTop + iconS + gap + symSize / 2;
        const pctCy = symCy + symSize / 2 + gap * 0.6 + pctSize / 2;
        if (b.img?.complete && b.img.naturalWidth) {
          const s = iconS;
          const iy = iconCy;
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, iy, s / 2, 0, Math.PI * 2);
          ctx.clip();
          try {
            ctx.drawImage(b.img, b.x - s / 2, iy - s / 2, s, s);
          } catch { /* ignore */ }
          ctx.restore();
        } else {
          const s = iconS;
          const iy = iconCy;
          ctx.save();
          ctx.beginPath();
          ctx.arc(b.x, iy, s / 2, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,.18)";
          ctx.fill();
          ctx.fillStyle = "#F4F7FA";
          ctx.font = `800 ${Math.max(8, s * 0.55)}px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(b.symbol.charAt(0).toUpperCase(), b.x, iy);
          ctx.restore();
        }
        if (hasText) {
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,.55)";
          ctx.shadowBlur = 3;
          ctx.fillStyle = "#F4F7FA";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.font = `800 ${symSize}px Inter, sans-serif`;
          ctx.fillText(b.symbol.toUpperCase(), b.x, symCy);
          ctx.font = `700 ${pctSize}px Inter, sans-serif`;
          ctx.fillText(fmtPct(b.pct, 1), b.x, pctCy);
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);

    const getPos = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };
    let downAt = 0;
    let downPos = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => {
      const p = getPos(e);
      downAt = Date.now(); downPos = p;
      for (const b of bubblesRef.current) {
        if (Math.hypot(p.x - b.x, p.y - b.y) <= b.r) {
          draggingRef.current = { b, offX: b.x - p.x, offY: b.y - p.y };
          canvas.setPointerCapture(e.pointerId);
          break;
        }
      }
    };
    const onMove = (e: PointerEvent) => {
      const d = draggingRef.current;
      if (!d) return;
      const p = getPos(e);
      d.b.x = Math.max(d.b.r, Math.min(W - d.b.r, p.x + d.offX));
      d.b.y = Math.max(d.b.r, Math.min(H - d.b.r, p.y + d.offY));
      d.b.vx = 0; d.b.vy = 0;
    };
    const onUp = (e: PointerEvent) => {
      const wasDragging = !!draggingRef.current;
      const moved = Math.hypot(getPos(e).x - downPos.x, getPos(e).y - downPos.y);
      const quick = Date.now() - downAt < 250 && moved < 6;
      draggingRef.current = null;
      try { canvas.releasePointerCapture(e.pointerId); } catch { /* noop */ }
      if (quick) {
        const p = getPos(e);
        const hit = bubblesRef.current.find((b) => Math.hypot(p.x - b.x, p.y - b.y) <= b.r);
        if (hit) setFocused(hit);
      } else if (wasDragging) {
        // nudge
      }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [data, range]);

  const upCount = data.filter((c) => pctFor(c, range) > 0).length;
  const downCount = data.length - upCount;

  async function savePng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      // Compose a framed export canvas with header + the bubbles + footer.
      const W = canvas.width;
      const H = canvas.height;
      const PAD = 32;
      const HEADER = 80;
      const FOOTER = 60;
      const out = document.createElement("canvas");
      out.width = W + PAD * 2;
      out.height = H + PAD * 2 + HEADER + FOOTER;
      const ctx = out.getContext("2d")!;
      ctx.fillStyle = "#06141C";
      ctx.fillRect(0, 0, out.width, out.height);

      // Header
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "800 32px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText("CRYPTO", PAD, PAD + HEADER / 2);
      const cw = ctx.measureText("CRYPTO").width;
      ctx.fillStyle = "#E7B650";
      ctx.fillText("TIME", PAD + cw, PAD + HEADER / 2);
      ctx.fillStyle = "#8A9BA8";
      ctx.font = "600 18px Inter, sans-serif";
      const sub = `Bubbles · ${range}`;
      ctx.fillText(sub, PAD + cw + ctx.measureText("TIME").width + 18, PAD + HEADER / 2);
      const dateStr = new Date().toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
      ctx.textAlign = "right";
      ctx.fillText(dateStr, out.width - PAD, PAD + HEADER / 2);
      ctx.textAlign = "left";

      ctx.drawImage(canvas, PAD, PAD + HEADER, W, H);

      // Footer summary
      ctx.fillStyle = "#8A9BA8";
      ctx.font = "600 16px Inter, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(`▲ ${upCount}   ▼ ${downCount}`, PAD, PAD + HEADER + H + FOOTER / 2);

      const dataUrl = out.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `cryptotime-bubbles-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
      const navAny = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (navAny.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "CryptoTime — Bubbles" });
      } else {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = file.name;
        a.click();
      }
      toast.success("Картинку збережено");
    } catch (e) {
      console.error(e);
      toast.error("Не вдалось згенерувати картинку");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] px-1">
        <span><span className="text-[var(--accent)] font-bold">▲ {upCount}</span> · <span className="text-[var(--danger)] font-bold">▼ {downCount}</span></span>
        <div className="flex items-center gap-2">
          <span>Розмір = капіталізація · колір = {range}</span>
          <button
            onClick={savePng}
            disabled={saving}
            className="chip"
            aria-label="Завантажити картинку"
          >
            {saving ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
          </button>
        </div>
      </div>
      <div ref={wrapRef} className="surface relative w-full overflow-hidden" style={{ height: "min(72vh, 640px)", minHeight: 420 }}>
        <canvas ref={canvasRef} className="absolute inset-0 cursor-grab active:cursor-grabbing touch-none" />
        {focused && (
          <div className="absolute inset-x-2 bottom-2 surface p-3 flex items-center gap-3 shadow-2xl animate-coin-pop">
            <img src={focused.image} alt="" className="h-10 w-10 rounded-full" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold">{focused.symbol.toUpperCase()}</div>
              <div className="text-[11px] tabular-nums text-[var(--text-muted)]">{fmtUsd(focused.price)} · MC {fmtUsd(focused.mcap)}</div>
            </div>
            <div className={`text-sm font-bold tabular-nums ${focused.pct >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"}`}>
              {fmtPct(focused.pct)}
            </div>
            <button
              onClick={() => { const id = focused.id; setFocused(null); nav(`/coin/${id}`); }}
              className="chip"
              data-active="true"
            >
              Деталі
            </button>
            <button onClick={() => setFocused(null)} className="chip" aria-label="Закрити">✕</button>
          </div>
        )}
      </div>
    </div>
  );
}
