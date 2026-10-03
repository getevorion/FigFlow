import { useEffect, useRef } from 'react';

const SILK_OPTIONS = {
  waves: [
    { amp: 0.4, freq: 0.008, speed: 0.22, phase: 0.2 },
    { amp: 0.26, freq: 0.014, speed: -0.14, phase: 1.1 },
  ],
  buckets: 5,
  pointerRadius: 18,
  maxPointerAlpha: 0.55,
  maxFieldAlpha: 0.18,
} as const;

function getCanvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  return canvas.getContext('2d');
}

/**
 * Login backdrop: CSS grid + diagonal light bands (compositor-friendly) with an
 * optional canvas dither overlay. Only `prefers-reduced-motion` disables motion.
 */
export function SilkBackdrop({ accentVar = '--login-accent' }: { accentVar?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;
    const ctx = getCanvasContext(canvas);
    if (!ctx) return;

    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = motionMq.matches;

    const onMotionChange = () => {
      reduced = motionMq.matches;
      root.classList.toggle('silk-backdrop--reduced', reduced);
      if (!reduced && !raf) {
        raf = requestAnimationFrame(frame);
      }
      dirty.full = true;
      paint(true);
    };
    root.classList.toggle('silk-backdrop--reduced', reduced);
    motionMq.addEventListener('change', onMotionChange);

    let w = 0;
    let h = 0;
    let cell = 8;
    let cols = 0;
    let rows = 0;
    let time = 0;
    let raf = 0;
    let lastPaint = 0;
    let accent = { r: 37, g: 99, b: 235 };
    let pointer = { x: -9999, y: -9999 };
    let dirty = { x: 0, y: 0, w: 0, h: 0, full: true };
    let cosKX!: Float32Array;
    let sinKX!: Float32Array;
    let cosKY!: Float32Array;
    let sinKY!: Float32Array;
    let visible = true;

    const readAccent = () => {
      const raw = getComputedStyle(root).getPropertyValue(accentVar).trim();
      const m = raw.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
      if (m) accent = { r: +m[1], g: +m[2], b: +m[3] };
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, reduced ? 1 : 1.25);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cell = Math.max(8, Math.min(14, w / 120));
      cols = Math.ceil(w / cell) + 1;
      rows = Math.ceil(h / cell) + 1;

      const waves = SILK_OPTIONS.waves.length;
      cosKX = new Float32Array(cols * waves);
      sinKX = new Float32Array(cols * waves);
      cosKY = new Float32Array(rows * waves);
      sinKY = new Float32Array(rows * waves);

      for (let wi = 0; wi < waves; wi++) {
        const { freq, phase } = SILK_OPTIONS.waves[wi];
        for (let c = 0; c < cols; c++) {
          const a = freq * (c * cell + cell * 0.5) + phase;
          cosKX[wi * cols + c] = Math.cos(a);
          sinKX[wi * cols + c] = Math.sin(a);
        }
        for (let r = 0; r < rows; r++) {
          const a = freq * (r * cell + cell * 0.5) * 0.85;
          cosKY[wi * rows + r] = Math.cos(a);
          sinKY[wi * rows + r] = Math.sin(a);
        }
      }

      dirty.full = true;
      readAccent();
      paint(true);
    };

    const clearRegion = (x: number, y: number, width: number, height: number) => {
      ctx.clearRect(x, y, width, height);
    };

    const paint = (forceFull = false) => {
      const opts = SILK_OPTIONS;
      const full = forceFull || dirty.full;
      const c0 = full ? 0 : Math.max(0, Math.floor(dirty.x / cell) - 1);
      const c1 = full ? cols : Math.min(cols, Math.ceil((dirty.x + dirty.w) / cell) + 1);
      const r0 = full ? 0 : Math.max(0, Math.floor(dirty.y / cell) - 1);
      const r1 = full ? rows : Math.min(rows, Math.ceil((dirty.y + dirty.h) / cell) + 1);

      if (full) {
        clearRegion(0, 0, w, h);
      } else {
        clearRegion(dirty.x, dirty.y, dirty.w, dirty.h);
      }

      const paths: Path2D[] = Array.from({ length: opts.buckets }, () => new Path2D());
      const pointerPaths: Path2D[] = Array.from({ length: opts.buckets }, () => new Path2D());
      const px = pointer.x;
      const py = pointer.y;
      const pr = opts.pointerRadius;
      const t = reduced ? 0 : time;

      for (let r = r0; r < r1; r++) {
        for (let c = c0; c < c1; c++) {
          let height = 0;
          for (let wi = 0; wi < opts.waves.length; wi++) {
            const wave = opts.waves[wi];
            const wt = wave.speed * t;
            const cosWT = Math.cos(wt);
            const sinWT = Math.sin(wt);
            const cosX = cosKX[wi * cols + c];
            const sinX = sinKX[wi * cols + c];
            const cosY = cosKY[wi * rows + r];
            const sinY = sinKY[wi * rows + r];
            const sinSpat = sinX * cosY + cosX * sinY;
            const cosSpat = cosX * cosY - sinX * sinY;
            height += wave.amp * (sinSpat * cosWT + cosSpat * sinWT);
          }

          const light = 0.55 + 0.45 * Math.max(-1, Math.min(1, height));
          const bucket = Math.min(
            opts.buckets - 1,
            Math.max(0, Math.floor((light * opts.maxFieldAlpha) / opts.maxFieldAlpha * (opts.buckets - 1)))
          );
          const size = cell * (0.4 + 0.55 * light);
          const x = c * cell + (cell - size) * 0.5;
          const y = r * cell + (cell - size) * 0.5;
          paths[bucket].rect(x, y, size, size);

          if (!reduced && px > -1000) {
            const dx = c * cell + cell * 0.5 - px;
            const dy = r * cell + cell * 0.5 - py;
            const dist2 = dx * dx + dy * dy;
            if (dist2 < pr * pr) {
              const falloff = 1 - Math.sqrt(dist2) / pr;
              const pAlpha = falloff * falloff * opts.maxPointerAlpha;
              const pb = Math.min(
                opts.buckets - 1,
                Math.max(0, Math.floor(pAlpha * (opts.buckets - 1)))
              );
              const ps = cell * (0.45 + 0.45 * falloff);
              pointerPaths[pb].rect(
                c * cell + (cell - ps) * 0.5,
                r * cell + (cell - ps) * 0.5,
                ps,
                ps
              );
            }
          }
        }
      }

      for (let b = 0; b < opts.buckets; b++) {
        const a = ((b + 1) / opts.buckets) * opts.maxFieldAlpha;
        ctx.fillStyle = `rgba(${accent.r},${accent.g},${accent.b},${a})`;
        ctx.fill(paths[b]);
      }
      if (!reduced) {
        for (let b = 0; b < opts.buckets; b++) {
          const a = ((b + 1) / opts.buckets) * opts.maxPointerAlpha;
          ctx.fillStyle = `rgba(${accent.r},${accent.g},${accent.b},${a})`;
          ctx.fill(pointerPaths[b]);
        }
      }

      dirty.full = false;
      dirty.w = 0;
    };

    const frame = (now: number) => {
      if (!visible || reduced) {
        raf = 0;
        return;
      }
      if (now - lastPaint >= 125) {
        time = now * 0.001;
        paint(true);
        lastPaint = now;
      } else if (dirty.w > 0) {
        paint(false);
      }
      raf = requestAnimationFrame(frame);
    };

    let moveRaf = 0;
    const onMove = (e: PointerEvent) => {
      if (reduced) return;
      pointer = { x: e.clientX, y: e.clientY };
      if (moveRaf) return;
      moveRaf = requestAnimationFrame(() => {
        moveRaf = 0;
        const pad = SILK_OPTIONS.pointerRadius + cell * 2;
        dirty = {
          x: Math.max(0, e.clientX - pad),
          y: Math.max(0, e.clientY - pad),
          w: pad * 2,
          h: pad * 2,
          full: false,
        };
        if (!raf) raf = requestAnimationFrame(frame);
      });
    };

    const onLeave = () => {
      pointer = { x: -9999, y: -9999 };
      dirty.full = true;
      if (!reduced && !raf) raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
      if (visible) {
        dirty.full = true;
        if (!reduced && !raf) raf = requestAnimationFrame(frame);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerleave', onLeave);
    document.addEventListener('visibilitychange', onVisibility);
    if (!reduced) raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      if (moveRaf) cancelAnimationFrame(moveRaf);
      motionMq.removeEventListener('change', onMotionChange);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [accentVar]);

  return (
    <div
      ref={rootRef}
      className="silk-backdrop pointer-events-none absolute inset-0 h-full w-full"
      style={{ ['--silk-accent' as string]: `var(${accentVar}, rgb(37, 99, 235))` }}
      aria-hidden
    >
      <style>{`
        .silk-backdrop {
          --silk-accent: rgb(37, 99, 235);
          background: #f4f5f7;
          isolation: isolate;
        }

        .silk-backdrop__grid {
          position: absolute;
          inset: 0;
          opacity: 0.5;
          background-image:
            linear-gradient(color-mix(in srgb, var(--silk-accent) 8%, transparent) 1px, transparent 1px),
            linear-gradient(90deg, color-mix(in srgb, var(--silk-accent) 8%, transparent) 1px, transparent 1px);
          background-size: 22px 22px;
          transform: translate3d(0, 0, 0);
        }

        @supports not (background: color-mix(in srgb, red, blue)) {
          .silk-backdrop__grid {
            background-image:
              linear-gradient(rgba(37, 99, 235, 0.07) 1px, transparent 1px),
              linear-gradient(90deg, rgba(37, 99, 235, 0.07) 1px, transparent 1px);
          }
        }

        .silk-backdrop__band {
          position: absolute;
          width: 130vmax;
          height: 42vmax;
          pointer-events: none;
          will-change: transform, opacity;
          transform: translate3d(0, 0, 0);
        }

        .silk-backdrop__band--a {
          top: -18vmax;
          left: -28vmax;
          background: linear-gradient(
            128deg,
            color-mix(in srgb, var(--silk-accent) 22%, transparent) 0%,
            transparent 58%
          );
          transform: rotate(-16deg) translate3d(-3%, -2%, 0);
          opacity: 0.65;
          animation: silk-band-a 32s ease-in-out infinite alternate;
        }

        .silk-backdrop__band--b {
          bottom: -22vmax;
          right: -32vmax;
          background: linear-gradient(
            -52deg,
            color-mix(in srgb, var(--silk-accent) 16%, transparent) 0%,
            transparent 62%
          );
          transform: rotate(11deg) translate3d(4%, 3%, 0);
          opacity: 0.55;
          animation: silk-band-b 26s ease-in-out infinite alternate;
        }

        @supports not (background: color-mix(in srgb, red, blue)) {
          .silk-backdrop__band--a {
            background: linear-gradient(128deg, rgba(37, 99, 235, 0.14) 0%, transparent 58%);
          }
          .silk-backdrop__band--b {
            background: linear-gradient(-52deg, rgba(37, 99, 235, 0.1) 0%, transparent 62%);
          }
        }

        @keyframes silk-band-a {
          0% {
            transform: rotate(-16deg) translate3d(-6%, -4%, 0);
            opacity: 0.5;
          }
          100% {
            transform: rotate(-16deg) translate3d(8%, 5%, 0);
            opacity: 0.78;
          }
        }

        @keyframes silk-band-b {
          0% {
            transform: rotate(11deg) translate3d(7%, 5%, 0);
            opacity: 0.42;
          }
          100% {
            transform: rotate(11deg) translate3d(-5%, -4%, 0);
            opacity: 0.68;
          }
        }

        .silk-backdrop--reduced .silk-backdrop__band--a,
        .silk-backdrop--reduced .silk-backdrop__band--b {
          animation: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .silk-backdrop__band--a,
          .silk-backdrop__band--b {
            animation: none;
          }
        }

        .silk-backdrop__canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }
      `}</style>
      <div className="silk-backdrop__grid" />
      <div className="silk-backdrop__band silk-backdrop__band--a" />
      <div className="silk-backdrop__band silk-backdrop__band--b" />
      <canvas ref={canvasRef} className="silk-backdrop__canvas" />
    </div>
  );
}
