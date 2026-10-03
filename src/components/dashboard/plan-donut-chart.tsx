"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { PieChart } from 'lucide-react';
import {
  KV_FONT,
  NumberSpring,
  expoOut,
  formatInt,
  hash2,
  prefersReducedMotion,
  smoothstep,
} from "./chart-utils";

export type ProductCount = { product: string; count: number };

export type ProductPeriodData = {
  week: ProductCount[];
  month: ProductCount[];
  quarter: ProductCount[];
  year: ProductCount[];
};

const PERIODS = [
  { id: 'week', label: 'Week', caption: 'Week to date' },
  { id: 'month', label: 'Month', caption: 'Month to date' },
  { id: 'quarter', label: 'Quarter', caption: 'Quarter to date' },
  { id: 'year', label: 'Year', caption: 'Year to date' },
] as const;

type PeriodId = (typeof PERIODS)[number]['id'];

const BLUE_RAMP = [
  '#0077E6',
  '#2B8AEB',
  '#4C9AEF',
  '#6EA9F2',
  '#90B9F5',
  '#B1C9F8',
  '#C9D8FB',
  '#DEE8FD',
];

const LOGICAL = 200;
const CX = 100;
const CY = 100;
const OUTER = 82;
const INNER = 52;
const GAP = 0.07;
const CORNER = 5;
const CELL = 4.6;

type Slice = { name: string; color: string; value: number; share: number };

function toSlices(rows: ProductCount[]): Slice[] {
  const normalized = rows
    .map((r) => ({
      product: r.product || 'Unknown',
      count: typeof r.count === 'number' ? r.count : Number(r.count) || 0,
    }))
    .filter((r) => r.count > 0);
  const total = normalized.reduce((a, r) => a + r.count, 0);
  if (!normalized.length || total <= 0) return [];
  return normalized.map((r, i) => ({
    name: r.product,
    color: BLUE_RAMP[i % BLUE_RAMP.length],
    value: r.count,
    share: r.count / total,
  }));
}

function slicePath(start: number, end: number, gap = GAP): Path2D {
  const halfGap = gap / 2;
  let a0 = start + halfGap;
  let a1 = end - halfGap;
  if (a1 - a0 < 0.02) {
    const mid = (start + end) / 2;
    a0 = mid - 0.01;
    a1 = mid + 0.01;
  }
  const span = a1 - a0;
  const corner = Math.min(CORNER, (OUTER - INNER) * 0.45, (span * OUTER) / 2.5);
  const path = new Path2D();
  const midR = (OUTER + INNER) / 2;
  path.arc(CX, CY, OUTER, a0 + corner / OUTER, a1 - corner / OUTER, false);
  path.quadraticCurveTo(
    CX + Math.cos(a1) * OUTER,
    CY + Math.sin(a1) * OUTER,
    CX + Math.cos(a1) * midR,
    CY + Math.sin(a1) * midR
  );
  path.quadraticCurveTo(
    CX + Math.cos(a1) * INNER,
    CY + Math.sin(a1) * INNER,
    CX + Math.cos(a1 - corner / INNER) * INNER,
    CY + Math.sin(a1 - corner / INNER) * INNER
  );
  path.arc(CX, CY, INNER, a1 - corner / INNER, a0 + corner / INNER, true);
  path.quadraticCurveTo(
    CX + Math.cos(a0) * INNER,
    CY + Math.sin(a0) * INNER,
    CX + Math.cos(a0) * midR,
    CY + Math.sin(a0) * midR
  );
  path.quadraticCurveTo(
    CX + Math.cos(a0) * OUTER,
    CY + Math.sin(a0) * OUTER,
    CX + Math.cos(a0 + corner / OUTER) * OUTER,
    CY + Math.sin(a0 + corner / OUTER) * OUTER
  );
  path.closePath();
  return path;
}

export function PlanDonutChart({ data }: { data: ProductPeriodData }) {
  const [periodId, setPeriodId] = useState<PeriodId>('year');
  const [hovered, setHovered] = useState<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const legendRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const totalSpring = useRef(new NumberSpring(0));
  const legendSprings = useRef<NumberSpring[]>([]);

  const period = PERIODS.find((p) => p.id === periodId)!;
  const slices = useMemo(() => toSlices(data?.[periodId] ?? []), [data, periodId]);
  const total = useMemo(() => slices.reduce((a, s) => a + s.value, 0), [slices]);

  const slicesRef = useRef<Slice[]>(slices);
  const displayed = useRef<number[]>(slices.map((s) => s.share));
  const from = useRef<number[]>([...displayed.current]);
  const target = useRef<number[]>([...displayed.current]);
  const morphStart = useRef(0);
  const morphing = useRef(false);
  const timeRef = useRef(0);
  const rafRef = useRef(0);
  const hoveredRef = useRef<number | null>(null);

  useEffect(() => {
    hoveredRef.current = hovered;
  }, [hovered]);

  useEffect(() => {
    slicesRef.current = slices;
  }, [slices]);

  useEffect(() => {
    while (legendSprings.current.length < slices.length) {
      legendSprings.current.push(new NumberSpring(0));
    }
    legendSprings.current.forEach((s, i) => s.attach(legendRefs.current[i]));
    totalSpring.current.attach(totalRef.current);
  }, [slices.length]);

  useEffect(() => {
    return () => {
      totalSpring.current.destroy();
      legendSprings.current.forEach((s) => s.destroy());
    };
  }, []);

  useEffect(() => {
    const nextShares = slices.length ? slices.map((s) => s.share) : [1];
    const prev = displayed.current;
    const fromArr = nextShares.map((_, i) => prev[i] ?? 0);
    const fromSum = fromArr.reduce((a, b) => a + b, 0) || 1;
    from.current = fromArr.map((v) => v / fromSum);
    target.current = nextShares;
    morphStart.current = performance.now();
    morphing.current = !prefersReducedMotion() && slices.length > 0;
    if (prefersReducedMotion() || !slices.length) {
      displayed.current = [...nextShares];
      morphing.current = false;
    } else {
      // Seed displayed so the RAF loop interpolates from the prior ring.
      displayed.current = [...from.current];
    }
    totalSpring.current.setTarget(total);
    slices.forEach((s, i) => {
      if (!legendSprings.current[i]) legendSprings.current[i] = new NumberSpring(0);
      legendSprings.current[i].attach(legendRefs.current[i]);
      legendSprings.current[i].setTarget(s.value);
    });
    // Clear springs for rows that disappeared this period.
    for (let i = slices.length; i < legendSprings.current.length; i++) {
      legendSprings.current[i]?.setTarget(0);
    }
    setHovered(null);
  }, [slices, total, periodId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = prefersReducedMotion();

    const resize = () => {
      const css = Math.min(host.clientWidth || 168, 168);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(css * dpr);
      canvas.height = Math.ceil(css * dpr);
      canvas.style.width = `${css}px`;
      canvas.style.height = `${css}px`;
      ctx.setTransform((css / LOGICAL) * dpr, 0, 0, (css / LOGICAL) * dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const hitTest = (mx: number, my: number): number | null => {
      const rect = canvas.getBoundingClientRect();
      const css = rect.width;
      const x = ((mx - rect.left) / css) * LOGICAL;
      const y = ((my - rect.top) / css) * LOGICAL;
      const dx = x - CX;
      const dy = y - CY;
      const dist = Math.hypot(dx, dy);
      if (dist < INNER || dist > OUTER) return null;
      let a = Math.atan2(dy, dx) + Math.PI / 2;
      if (a < 0) a += Math.PI * 2;
      let acc = 0;
      for (let i = 0; i < displayed.current.length; i++) {
        const next = acc + displayed.current[i] * Math.PI * 2;
        if (a >= acc && a < next) return i;
        acc = next;
      }
      return null;
    };

    const onMove = (e: PointerEvent) => setHovered(hitTest(e.clientX, e.clientY));
    const onLeave = () => setHovered(null);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);

    const paint = (now: number) => {
      if (!reduced) timeRef.current += 0.02;

      if (morphing.current) {
        const t = (now - morphStart.current) / 500;
        const e = expoOut(t);
        const n = target.current.length;
        displayed.current = Array.from({ length: n }, (_, i) => {
          const a = from.current[i] ?? 0;
          const b = target.current[i] ?? 0;
          return a + (b - a) * e;
        });
        if (t >= 1) {
          displayed.current = [...target.current];
          morphing.current = false;
        }
      }

      ctx.clearRect(0, 0, LOGICAL, LOGICAL);
      const current = slicesRef.current;
      if (!current.length) {
        ctx.beginPath();
        ctx.arc(CX, CY, OUTER, 0, Math.PI * 2);
        ctx.arc(CX, CY, INNER, 0, Math.PI * 2, true);
        ctx.fillStyle = 'rgba(0,119,230,0.08)';
        ctx.fill();
        return;
      }

      const hover = hoveredRef.current;
      let angle = -Math.PI / 2;
      const sliceGap = current.length === 1 ? 0 : GAP;

      for (let i = 0; i < current.length; i++) {
        const share = Math.max(0, displayed.current[i] || 0);
        const sweep = share * Math.PI * 2;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        if (sweep < 0.001) continue;

        const mid = (start + end) / 2;
        const path = slicePath(start, end, sliceGap);
        const color = current[i]?.color ?? BLUE_RAMP[0];

        ctx.save();
        if (hover === i) {
          ctx.translate(Math.cos(mid) * 4, Math.sin(mid) * 4);
        }
        ctx.beginPath();
        ctx.clip(path);

        ctx.globalAlpha = hover === null ? 0.78 : hover === i ? 1 : 0.28;
        ctx.fillStyle = color;

        const tiles = new Path2D();
        const minX = CX - OUTER;
        const minY = CY - OUTER;
        const cols = Math.ceil((OUTER * 2) / CELL);
        const rows = cols;
        const t = timeRef.current;
        const wave = smoothstep(
          -1,
          1,
          Math.sin(t * 0.9 + i) * 0.45 +
            Math.sin(t * 1.7 + i * 0.6) * 0.35 +
            Math.sin(t * 0.45 + 2) * 0.2
        );

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const tx = minX + c * CELL + CELL / 2;
            const ty = minY + r * CELL + CELL / 2;
            const dx = tx - CX;
            const dy = ty - CY;
            const dist = Math.hypot(dx, dy);
            if (dist < INNER - 1 || dist > OUTER + 1) continue;
            const ang = Math.atan2(dy, dx);
            let rel = ang - start;
            while (rel < 0) rel += Math.PI * 2;
            while (rel >= Math.PI * 2) rel -= Math.PI * 2;
            if (rel > sweep) continue;

            const fullness = 0.62 + 0.38 * smoothstep(INNER, OUTER, dist);
            const jitter = hash2(c + i * 17, r + i * 31);
            const hoverBoost = hover === i ? 0.42 : 0.32;
            const size =
              CELL * (hoverBoost + 0.34 * fullness + 0.22 * wave) * (0.78 + 0.42 * jitter);
            tiles.rect(tx - size / 2, ty - size / 2, size, size);
          }
        }
        ctx.fill(tiles);
        ctx.restore();
      }
    };

    const loop = (now: number) => {
      paint(now);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className="card flex h-full w-full min-w-0 flex-col gap-4" style={{ fontFamily: KV_FONT }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <PieChart className="h-3.5 w-3.5 text-[var(--kv-text-muted)]" strokeWidth={1.75} />
          <span className="kv-label">Projects by name</span>
        </div>
        <div className="relative h-4 overflow-hidden text-right">
          <AnimatePresence mode="wait">
            <motion.span
              key={period.caption}
              className="block text-[12px] text-[var(--kv-text-subtle)]"
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -6, opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              {period.caption}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-center gap-4 sm:flex-row sm:items-center">
        <div ref={hostRef} className="relative mx-auto h-[168px] w-[168px] shrink-0 sm:mx-0">
          <canvas ref={canvasRef} className="block" />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span
              ref={totalRef}
              className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--kv-text)]"
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              0
            </span>
            <span className="text-[11px] text-[var(--kv-text-subtle)]">total</span>
          </div>
        </div>

        <ul className="min-w-0 w-full flex-1 space-y-0.5">
          {slices.length === 0 ? (
            <li className="px-2 py-3 text-center text-[13px] text-[var(--kv-text-subtle)] sm:text-left">
              No licenses in this period
            </li>
          ) : (
            slices.map((slice, i) => {
              const active = hovered === i;
              const dimmed = hovered !== null && hovered !== i;
              return (
                <li
                  key={slice.name}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="kv-row flex cursor-default items-center gap-2 rounded-[8px] px-2 transition-colors duration-150"
                  style={{
                    minHeight: 36,
                    background: active ? 'var(--kv-accent-soft)' : 'transparent',
                    opacity: dimmed ? 0.45 : 1,
                  }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-[3px]"
                    style={{ background: slice.color }}
                  />
                  <span
                    className="min-w-0 flex-1 truncate text-[13px]"
                    style={{
                      color: active ? 'var(--kv-text)' : '#555',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {slice.name}
                  </span>
                  <span
                    ref={(el) => {
                      legendRefs.current[i] = el;
                      legendSprings.current[i]?.attach(el);
                    }}
                    className="text-[12px] text-[var(--kv-text-subtle)]"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatInt(slice.value)}
                  </span>
                </li>
              );
            })
          )}
        </ul>
      </div>

      <LayoutGroup>
        <div className="kv-segment">
          {PERIODS.map((p) => {
            const active = p.id === periodId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodId(p.id)}
                className="kv-segment-btn"
                data-active={active}
                aria-pressed={active}
              >
                {active && (
                  <motion.span
                    layoutId="donut-period-pill"
                    className="kv-segment-pill"
                    transition={
                      prefersReducedMotion()
                        ? { duration: 0 }
                        : { type: 'spring', duration: 0.28, bounce: 0.18 }
                    }
                  />
                )}
                {p.label}
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
