/** Shared helpers for canvas chart cards. */

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function hash2(x: number, y: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/** Manual exponential-out: 1 - 2^(-10t) */
export function expoOut(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(2, -10 * x);
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/**
 * Lightweight spring that writes into a DOM text node each tick.
 * Retargets from the current value; jumps instantly under reduced motion.
 */
export class NumberSpring {
  value: number;
  velocity = 0;
  target: number;
  private raf = 0;
  private last = 0;
  private el: HTMLElement | null = null;
  private format: (n: number) => string;
  private stiffness: number;
  private damping: number;
  private mass: number;
  private onTick?: (n: number) => void;

  constructor(
    initial: number,
    opts: {
      stiffness?: number;
      damping?: number;
      mass?: number;
      format?: (n: number) => string;
      onTick?: (n: number) => void;
    } = {}
  ) {
    this.value = initial;
    this.target = initial;
    this.stiffness = opts.stiffness ?? 190;
    this.damping = opts.damping ?? 27;
    this.mass = opts.mass ?? 0.7;
    this.format = opts.format ?? formatInt;
    this.onTick = opts.onTick;
  }

  attach(el: HTMLElement | null) {
    this.el = el;
    this.write();
  }

  setTarget(next: number) {
    this.target = next;
    if (prefersReducedMotion()) {
      this.value = next;
      this.velocity = 0;
      this.write();
      return;
    }
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.step);
    }
  }

  private write() {
    const text = this.format(this.value);
    if (this.el) this.el.textContent = text;
    this.onTick?.(this.value);
  }

  private step = (now: number) => {
    const dt = Math.min(0.032, (now - this.last) / 1000);
    this.last = now;
    const force = -this.stiffness * (this.value - this.target);
    const damp = -this.damping * this.velocity;
    this.velocity += ((force + damp) / this.mass) * dt;
    this.value += this.velocity * dt;
    this.write();

    if (Math.abs(this.value - this.target) < 0.05 && Math.abs(this.velocity) < 0.05) {
      this.value = this.target;
      this.velocity = 0;
      this.write();
      this.raf = 0;
      return;
    }
    this.raf = requestAnimationFrame(this.step);
  };

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}

/** Chart plot accent - matches --kv-accent */
export const CHART_ACCENT = '#0077E6';
export const CHART_ACCENT_SOFT = '#3B9AEF';
export const CHART_GRID_DOT = 'oklch(0.88 0.01 250)';

export const KV_FONT =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
