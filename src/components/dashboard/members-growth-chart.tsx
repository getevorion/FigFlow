"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGroup, motion } from 'motion/react';
import { TrendingUp } from 'lucide-react';
import {
  CHART_ACCENT,
  CHART_GRID_DOT,
  KV_FONT,
  NumberSpring,
  formatInt,
  prefersReducedMotion,
  smoothstep,
} from "./chart-utils";

const RANGES = [1, 7, 14, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];

export type DayCount = { date: string; count: number };

function sampleCurve(values: number[], xFrac: number): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];
  const f = Math.max(0, Math.min(1, xFrac)) * (values.length - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(values.length - 1, i0 + 1);
  const local = f - i0;
  const s = smoothstep(0, 1, local);
  return values[i0] + (values[i1] - values[i0]) * s;
}

function labelDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function asCount(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : 0;
}

/** Ensure a contiguous daily series ending at the latest date (zero-filled). */
function normalizeSeries(series: DayCount[]): DayCount[] {
  if (!series.length) return [];
  const byDate = new Map<string, number>();
  for (const p of series) {
    if (!p?.date) continue;
    byDate.set(p.date, (byDate.get(p.date) ?? 0) + asCount(p.count));
  }
  const dates = Array.from(byDate.keys()).sort();
  if (!dates.length) return [];
  const end = new Date(dates[dates.length - 1] + 'T00:00:00Z');
  const start = new Date(dates[0] + 'T00:00:00Z');
  const out: DayCount[] = [];
  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: byDate.get(key) ?? 0 });
  }
  return out;
}

function sliceSeries(series: DayCount[], days: RangeDays) {
  const slice = series.slice(-days);
  return slice.map((p) => ({
    value: asCount(p.count),
    label: labelDate(p.date),
    date: p.date,
  }));
}

function periodDelta(series: DayCount[], days: RangeDays): number {
  const cur = series.slice(-days).reduce((a, p) => a + asCount(p.count), 0);
  const prevSlice = series.slice(-days * 2, -days);
  if (!prevSlice.length) return cur > 0 ? 100 : 0;
  const prev = prevSlice.reduce((a, p) => a + asCount(p.count), 0);
  if (prev === 0) return cur > 0 ? 100 : 0;
  return Math.round(((cur - prev) / prev) * 100);
}

const PLOT_PAD = 8;

export function MembersGrowthChart({ series }: { series: DayCount[] }) {
  const [days, setDays] = useState<RangeDays>(30);
  const [scrubIndex, setScrubIndex] = useState<number | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [showReadout, setShowReadout] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLSpanElement>(null);
  const markerWrapRef = useRef<HTMLDivElement>(null);
  const crosshairRef = useRef<HTMLDivElement>(null);
  const readoutRef = useRef<HTMLDivElement>(null);
  const readoutDateRef = useRef<HTMLDivElement>(null);
  const readoutValueRef = useRef<HTMLDivElement>(null);
  const heroSpring = useRef(new NumberSpring(0, { format: (n) => `+${formatInt(n)}` }));

  const displayed = useRef<number[]>([]);
  const fromCurve = useRef<number[]>([]);
  const targetCurve = useRef<number[]>([]);
  const fromMax = useRef(1);
  const targetMax = useRef(1);
  const displayMax = useRef(1);
  const morphStart = useRef(0);
  const morphing = useRef(false);
  const timeRef = useRef(0);
  const firstReveal = useRef(true);
  const rafRef = useRef(0);

  const markerX = useRef(50);
  const markerY = useRef(50);
  const markerVX = useRef(0);
  const markerVY = useRef(0);
  const markerTargetX = useRef(50);
  const markerTargetY = useRef(50);
  const scrubRef = useRef<number | null>(null);

  const normalized = useMemo(() => normalizeSeries(series), [series]);
  const points = useMemo(() => sliceSeries(normalized, days), [normalized, days]);
  const pointsRef = useRef(points);
  const kpiTotal = useMemo(() => points.reduce((a, p) => a + p.value, 0), [points]);
  const deltaPct = useMemo(() => periodDelta(normalized, days), [normalized, days]);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  useEffect(() => {
    scrubRef.current = scrubIndex;
  }, [scrubIndex]);

  useEffect(() => {
    heroSpring.current.attach(heroRef.current);
    return () => heroSpring.current.destroy();
  }, []);

  useEffect(() => {
    heroSpring.current.setTarget(kpiTotal);
  }, [kpiTotal]);

  useEffect(() => {
    const next = points.map((p) => p.value);
    const nextMax = Math.max(1, ...next);
    if (displayed.current.length === 0 || prefersReducedMotion() || next.length === 0) {
      displayed.current = [...next];
      displayMax.current = nextMax;
      fromCurve.current = [...next];
      targetCurve.current = [...next];
      fromMax.current = nextMax;
      targetMax.current = nextMax;
      morphing.current = false;
      setScrubIndex(null);
      setShowReadout(false);
      return;
    }
    const old = displayed.current;
    const oldMax = displayMax.current;
    const resampled = next.map((_, i) => {
      const frac = next.length === 1 ? 0 : i / (next.length - 1);
      return sampleCurve(old, frac);
    });
    fromCurve.current = resampled;
    targetCurve.current = [...next];
    fromMax.current = oldMax;
    targetMax.current = nextMax;
    displayed.current = [...resampled];
    morphStart.current = performance.now();
    morphing.current = true;
    setScrubIndex(null);
    setShowReadout(false);
    // `days` is intentional: always remorph when the range control changes,
    // even if the sliced values happen to look similar.
  }, [points, days]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const plot = plotRef.current;
    if (!canvas || !plot) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = prefersReducedMotion();

    let cssW = 0;
    let cssH = 0;
    let cell = 4;
    let cols = 0;
    let rows = 0;
    let plotW = 0;
    let plotH = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = plot.clientWidth;
      cssH = plot.clientHeight;
      canvas.width = Math.ceil(cssW * dpr);
      canvas.height = Math.ceil(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      plotW = Math.max(0, cssW - PLOT_PAD * 2);
      plotH = Math.max(0, cssH - PLOT_PAD * 2);
      cell = Math.max(3, Math.round(plotW / 160));
      cols = Math.max(1, Math.floor(plotW / cell));
      rows = Math.max(1, Math.floor(plotH / cell));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(plot);

    const springAxes = (dt: number) => {
      const k = 650;
      const d = 42;
      const m = 0.5;
      const ax = (-k * (markerX.current - markerTargetX.current) - d * markerVX.current) / m;
      const ay = (-k * (markerY.current - markerTargetY.current) - d * markerVY.current) / m;
      markerVX.current += ax * dt;
      markerVY.current += ay * dt;
      markerX.current += markerVX.current * dt;
      markerY.current += markerVY.current * dt;
    };

    const placeReadout = () => {
      const readout = readoutRef.current;
      if (!readout || scrubRef.current === null) return;

      const mx = (markerX.current / 100) * cssW;
      const my = (markerY.current / 100) * cssH;
      const rw = readout.offsetWidth || 72;
      const rh = readout.offsetHeight || 44;
      const gap = 12;
      const edge = 6;

      // Prefer above the marker; flip below when near the top edge.
      let top = my - rh - gap;
      if (top < edge) top = my + gap;
      // Prefer below when near the baseline so the chip isn't cramped on the axis.
      if (my > cssH * 0.72 && my + gap + rh <= cssH - edge) {
        top = my + gap;
      }
      top = Math.max(edge, Math.min(cssH - rh - edge, top));

      let left = mx - rw / 2;
      left = Math.max(edge, Math.min(cssW - rw - edge, left));

      readout.style.left = `${left}px`;
      readout.style.top = `${top}px`;
    };

    const syncMarkerDom = () => {
      const wrap = markerWrapRef.current;
      const cross = crosshairRef.current;
      if (wrap) {
        wrap.style.left = `${markerX.current}%`;
        wrap.style.top = `${markerY.current}%`;
      }
      if (cross) cross.style.left = `${markerX.current}%`;
      const idx = scrubRef.current;
      const pts = pointsRef.current;
      if (idx !== null && pts[idx]) {
        if (readoutDateRef.current) readoutDateRef.current.textContent = pts[idx].label;
        if (readoutValueRef.current) {
          readoutValueRef.current.textContent = pts[idx].value.toLocaleString();
        }
      }
      placeReadout();
    };

    const paint = (now: number) => {
      if (!reduced) timeRef.current += 0.016;

      if (morphing.current) {
        const t = Math.min(1, (now - morphStart.current) / 460);
        for (let i = 0; i < targetCurve.current.length; i++) {
          displayed.current[i] =
            fromCurve.current[i] + (targetCurve.current[i] - fromCurve.current[i]) * t;
        }
        displayMax.current = fromMax.current + (targetMax.current - fromMax.current) * t;
        if (t >= 1) {
          displayed.current = [...targetCurve.current];
          displayMax.current = targetMax.current;
          morphing.current = false;
        }
      }

      const values = displayed.current;
      const maxV = Math.max(displayMax.current, 1);
      const headroom = 0.12;

      ctx.clearRect(0, 0, cssW, cssH);

      const restPath = new Path2D();
      const bluePath = new Path2D();

      for (let c = 0; c < cols; c++) {
        const xFrac = cols <= 1 ? 0 : c / (cols - 1);
        const sample = values.length ? sampleCurve(values, xFrac) : 0;
        const norm = (sample / maxV) * (1 - headroom);
        const fillRows = Math.round(norm * rows);

        for (let r = 0; r < rows; r++) {
          const fromBottom = rows - 1 - r;
          const cx = PLOT_PAD + c * cell + cell / 2;
          const cy = PLOT_PAD + r * cell + cell / 2;

          const rest = cell * 0.38;
          restPath.rect(cx - rest / 2, cy - rest / 2, rest, rest);

          if (fromBottom < fillRows) {
            const nearTop = fillRows <= 1 ? 1 : 1 - fromBottom / fillRows;
            let sizeFactor = 0.32 + nearTop * 0.32;
            if (!reduced) {
              sizeFactor *= 1 + 0.05 * Math.sin(timeRef.current * 2.2 + r * 0.35 + c * 0.15);
            }
            const size = cell * Math.min(0.64, sizeFactor);
            bluePath.rect(cx - size / 2, cy - size / 2, size, size);
          }
        }
      }

      ctx.fillStyle = CHART_GRID_DOT;
      ctx.globalAlpha = 0.5;
      ctx.fill(restPath);
      ctx.fillStyle = CHART_ACCENT;
      ctx.globalAlpha = 0.88;
      ctx.fill(bluePath);
      ctx.globalAlpha = 1;

      if (!reduced) springAxes(0.016);
      else {
        markerX.current = markerTargetX.current;
        markerY.current = markerTargetY.current;
      }
      syncMarkerDom();
    };

    const loop = (now: number) => {
      paint(now);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, []);

  const yTicks = [1, 0.66, 0.33, 0];
  const maxLabel = Math.max(...points.map((p) => p.value), 1);
  const dateLabels = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    if (!points.length) return '';
    const i = Math.round(f * (points.length - 1));
    return points[i]?.label ?? '';
  });

  const updateScrub = (clientX: number) => {
    const plot = plotRef.current;
    if (!plot || points.length === 0) return;
    const rect = plot.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const innerW = Math.max(0, w - PLOT_PAD * 2);
    const innerH = Math.max(0, h - PLOT_PAD * 2);
    const frac = Math.max(0, Math.min(1, (clientX - rect.left - PLOT_PAD) / Math.max(1, innerW)));
    const idx = Math.round(frac * Math.max(0, points.length - 1));
    setScrubIndex(idx);
    scrubRef.current = idx;
    setShowReadout(true);
    const values = displayed.current.length ? displayed.current : points.map((p) => p.value);
    const maxV = Math.max(displayMax.current, 1);
    const v = values[idx] ?? points[idx].value;
    const yNorm = (v / maxV) * 0.88;
    const dataFrac = points.length <= 1 ? 0.5 : idx / (points.length - 1);
    markerTargetX.current = ((PLOT_PAD + dataFrac * innerW) / w) * 100;
    markerTargetY.current = ((PLOT_PAD + (1 - yNorm) * innerH) / h) * 100;
    if (prefersReducedMotion()) {
      markerX.current = markerTargetX.current;
      markerY.current = markerTargetY.current;
    }
  };

  return (
    <div className="card flex h-full w-full min-w-0 flex-col gap-4" style={{ fontFamily: KV_FONT }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5 text-[var(--kv-text-muted)]" strokeWidth={1.75} />
            <span className="kv-label">Uploads</span>
          </div>
          <div className="flex items-end gap-2">
            <span
              ref={heroRef}
              className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--kv-text)]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              +0
            </span>
            <span
              className="badge mb-0.5"
              style={{
                background: deltaPct >= 0 ? 'var(--kv-badge-good-bg)' : '#f3f4f6',
                color: deltaPct >= 0 ? 'var(--kv-badge-good-fg)' : 'var(--kv-text-subtle)',
              }}
            >
              {deltaPct >= 0 ? '+' : '−'}
              {Math.abs(deltaPct)}%
            </span>
          </div>
        </div>

        <LayoutGroup>
          <div className="kv-segment w-full min-w-0 sm:w-auto sm:shrink-0 sm:min-w-[210px]">
            {RANGES.map((r) => {
              const active = r === days;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDays(r)}
                  className="kv-segment-btn"
                  data-active={active}
                  aria-pressed={active}
                >
                  {active && (
                    <motion.span
                      layoutId="growth-range-pill"
                      className="kv-segment-pill"
                      transition={
                        prefersReducedMotion()
                          ? { duration: 0 }
                          : { type: 'spring', duration: 0.28, bounce: 0.18 }
                      }
                    />
                  )}
                  {r}d
                </button>
              );
            })}
          </div>
        </LayoutGroup>
      </div>

      <motion.div
        className="min-w-0 flex-1"
        initial={
          firstReveal.current && !prefersReducedMotion()
            ? { opacity: 0, y: 6 }
            : false
        }
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
        onAnimationComplete={() => {
          firstReveal.current = false;
        }}
      >
        <div className="flex gap-2">
          <div className="relative w-7 shrink-0 self-stretch" style={{ minHeight: 180 }}>
            {yTicks.map((f) => (
              <span
                key={f}
                className="absolute right-0 text-[10px] text-[var(--kv-text-muted)]"
                style={{
                  top: `calc(${(1 - f) * 100}% + ${f === 1 ? 0 : f === 0 ? -10 : -5}px)`,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Math.round(maxLabel * f)}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div
              ref={plotRef}
              className="relative w-full overflow-hidden rounded-[10px]"
              style={{
                height: 180,
                background: '#fafbfc',
                border: '1px solid var(--kv-border-subtle)',
              }}
              onPointerDown={(e) => {
                setScrubbing(true);
                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                updateScrub(e.clientX);
              }}
              onPointerMove={(e) => {
                if (scrubbing || e.buttons === 1) updateScrub(e.clientX);
              }}
              onPointerUp={() => setScrubbing(false)}
              onPointerLeave={() => {
                if (!scrubbing) {
                  setShowReadout(false);
                  setScrubIndex(null);
                  scrubRef.current = null;
                }
              }}
            >
              {yTicks.map((f, i) => (
                <div
                  key={f}
                  className="pointer-events-none absolute left-0 right-0"
                  style={{
                    top: `${PLOT_PAD + (1 - f) * (180 - PLOT_PAD * 2)}px`,
                    height: 1,
                    borderTop:
                      i === yTicks.length - 1
                        ? '1px solid #e7e9ee'
                        : '1px dashed rgba(120,130,150,0.16)',
                  }}
                />
              ))}

              <canvas ref={canvasRef} className="absolute inset-0 z-0 h-full w-full" />

              <div
                ref={crosshairRef}
                className="pointer-events-none absolute top-0 bottom-0 z-[1] w-px"
                style={{
                  left: '50%',
                  background: 'rgba(0,119,230,0.28)',
                  opacity: scrubIndex !== null ? 1 : 0,
                  transition: 'opacity 160ms ease-out',
                }}
              />

              <div
                ref={markerWrapRef}
                className="pointer-events-none absolute z-[2]"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  opacity: scrubIndex !== null ? 1 : 0,
                  transition: 'opacity 160ms ease-out',
                }}
              >
                <div
                  className="h-[10px] w-[10px] rounded-full"
                  style={{
                    background: CHART_ACCENT,
                    border: '2px solid white',
                    boxShadow: '0 1px 4px rgba(15,23,42,0.2)',
                  }}
                />
              </div>

              <div
                ref={readoutRef}
                className="pointer-events-none absolute z-[3] whitespace-nowrap bg-white"
                style={{
                  left: 0,
                  top: 0,
                  border: '1px solid var(--kv-border)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  boxShadow: '0 2px 8px rgba(15,23,42,0.08)',
                  opacity: showReadout && scrubIndex !== null ? 1 : 0,
                  transition: 'opacity 170ms ease-out',
                }}
              >
                <div ref={readoutDateRef} className="text-[11px] text-[var(--kv-text-subtle)]" />
                <div
                  ref={readoutValueRef}
                  className="text-[13px] font-semibold text-[var(--kv-text)]"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                />
              </div>
            </div>

            <div className="mt-2 flex justify-between px-0.5">
              {dateLabels.map((label, i) => (
                <span key={`${label}-${i}`} className="text-[10px] text-[var(--kv-text-subtle)]">
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
