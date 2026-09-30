"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { BellIcon, Code2Icon, EyeIcon, EyeOffIcon, LoaderIcon, MaximizeIcon, MonitorIcon, PanelTopIcon, ScanIcon, XIcon } from "lucide-react";
import type { AppElement, ProjectManifest, UnitManifest } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { ELEMENT_KINDS, bare } from "./element-kinds";

const UNIT_ICON = { screen: MonitorIcon, popup: PanelTopIcon, toast: BellIcon } as const;
const unitKey = (u: UnitManifest) => `${u.kind}-${u.ident}`;

/**
 * The app's screens, popups and toasts as the design draws them, with the
 * controls Figflow found outlined on top: hover one to see what it is, click
 * it for its variable and code.
 */
export function PreviewPane({
  base,
  manifest,
  unit,
  onUnit,
  selected,
  onSelect,
  onCode,
}: {
  base: string;
  manifest: ProjectManifest;
  unit: string;
  onUnit: (key: string) => void;
  selected: number | null;
  onSelect: (index: number | null) => void;
  onCode: (el: AppElement) => void;
}) {
  const current = manifest.units.find((u) => unitKey(u) === unit) ?? manifest.units[0];
  const [loaded, setLoaded] = useState<Record<string, "ready" | "failed">>({});
  const [outlines, setOutlines] = useState(true);
  const [actual, setActual] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });
  // An image can finish before hydration, when onLoad isn't listening yet.
  const seen = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return;
    const k = img.dataset.unit!;
    setLoaded((m) => (m[k] ? m : { ...m, [k]: img.naturalWidth > 0 ? "ready" : "failed" }));
  }, []);

  // The stage's size, to fit the frame in it whole (up to 2x for small ones).
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setRoom({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const elements = useMemo(
    () => manifest.elements.map((e, i) => ({ e, i })).filter(({ e }) => current && current.kind !== "toast" && e.unit.kind === current.kind && e.unit.ident === current.ident),
    [manifest, current],
  );
  const sel = selected !== null ? manifest.elements[selected] : null;


  if (!current) return null;
  const key = unitKey(current);
  const fit = room.w > 0 ? Math.max(0.05, Math.min(2, (room.w - 48) / current.rect.w, (room.h - 48) / current.rect.h)) : 0;
  const scale = actual ? 1 : fit;
  const state = loaded[key];
  const groups = (["screen", "popup", "toast"] as const).map((k) => ({ kind: k, units: manifest.units.filter((u) => u.kind === k) })).filter((g) => g.units.length);

  return (
    <div className="grid h-full min-h-0 grid-cols-[210px_minmax(0,1fr)]">
      <nav aria-label="Screens, popups and toasts" className="scroll-dark overflow-y-auto border-r border-[#1c1c1c] p-2">
        {groups.map((g) => (
          <div key={g.kind} className="mb-3">
            <p className="px-2 pt-1 pb-1.5 font-mono text-[10.5px] text-muted-foreground">{g.kind === "screen" ? "Screens" : g.kind === "popup" ? "Popups" : "Toasts"}</p>
            {g.units.map((u) => {
              const Icon = UNIT_ICON[u.kind];
              const active = unitKey(u) === key;
              const count = u.kind === "toast" ? 0 : manifest.elements.filter((e) => e.unit.kind === u.kind && e.unit.ident === u.ident).length;
              return (
                <button
                  key={unitKey(u)}
                  type="button"
                  onClick={() => {
                    onUnit(unitKey(u));
                    onSelect(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] transition-colors",
                    active ? "bg-[#1a1a1a] text-foreground" : "text-foreground/70 hover:bg-[#131313] hover:text-foreground",
                  )}
                >
                  <Icon className={cn("size-3.5 shrink-0", active ? "text-neutral-400" : "text-muted-foreground")} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {u.start && <span className="rounded-full bg-[#1a1a1a] px-1.5 text-[10px] text-neutral-400">start</span>}
                  {count > 0 && <span className="font-mono text-[10.5px] text-muted-foreground">{count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="relative flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-[#1c1c1c] px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
            <span className="text-foreground/90">{current.name}</span> · {Math.round(current.rect.w)} × {Math.round(current.rect.h)}
            {current.over ? ` · opens over ${manifest.units.find((u) => u.kind === "screen" && u.ident === current.over)?.name ?? "its screen"}` : ""}
          </p>
          {current.kind !== "toast" && (
            <button
              type="button"
              onClick={() => setOutlines((v) => !v)}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] transition-colors", outlines ? "bg-[#161616] text-neutral-400" : "text-muted-foreground hover:bg-[#141414]")}
              aria-pressed={outlines}
            >
              {outlines ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />} Controls
            </button>
          )}
          <button
            type="button"
            onClick={() => setActual((v) => !v)}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-[#141414]"
            aria-pressed={actual}
          >
            {actual ? <MaximizeIcon className="size-3.5" /> : <ScanIcon className="size-3.5" />} {actual ? "Fit" : "Actual size"}
          </button>
        </div>

        <div ref={stage} className={cn("scroll-dark relative min-h-0 flex-1 bg-[#050505] bg-[radial-gradient(rgb(255_255_255/0.05)_1px,transparent_1px)] bg-[length:18px_18px]", actual ? "overflow-auto" : "overflow-hidden")}>
          <div className={cn("flex min-h-full items-center justify-center", actual ? "w-max min-w-full p-8" : "h-full")}>
            <div
              className={cn("relative ring-1 ring-[#262626]", !scale && "invisible")}
              style={{ width: current.rect.w * scale, height: current.rect.h * scale }}
            >
              {state !== "ready" && (
                <div className="absolute inset-0 grid place-items-center bg-[#0b0b0b]">
                  {state === "failed" ? (
                    <p className="px-6 text-center text-[12.5px] text-destructive">The preview couldn&apos;t be drawn.</p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[12px] text-muted-foreground">
                      <LoaderIcon className="size-4 animate-spin text-neutral-400" aria-hidden />
                      Drawing {current.name}…
                    </div>
                  )}
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element -- private, per-project render */}
              <img
                key={key}
                ref={seen}
                data-unit={key}
                src={`${base}/units/${key}`}
                alt={`${current.name}, as the design draws it`}
                onLoad={() => setLoaded((m) => ({ ...m, [key]: "ready" }))}
                onError={() => setLoaded((m) => ({ ...m, [key]: "failed" }))}
                className={cn("block size-full select-none transition-opacity duration-500", state === "ready" ? "opacity-100" : "opacity-0")}
                draggable={false}
              />
              {state === "ready" && outlines && (
                <div className="absolute inset-0">
                  {elements.map(({ e, i }) => {
                    const active = selected === i || hover === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onMouseEnter={() => setHover(i)}
                        onMouseLeave={() => setHover((h) => (h === i ? null : h))}
                        onClick={() => onSelect(selected === i ? null : i)}
                        aria-label={`${ELEMENT_KINDS[e.kind].label} ${bare(e.name)}`}
                        className={cn(
                          "absolute rounded-[3px] border outline-none transition-[background-color,border-color,box-shadow] duration-150",
                          selected === i
                            ? "border-brand-soft bg-brand/25 shadow-[0_0_0_3px_rgb(109_77_255/0.35)]"
                            : active
                              ? "border-brand-soft/90 bg-brand/15"
                              : "border-brand-soft/60 bg-brand/[0.07] hover:border-brand-soft",
                        )}
                        style={{
                          left: `${(e.rect.x / current.rect.w) * 100}%`,
                          top: `${(e.rect.y / current.rect.h) * 100}%`,
                          width: `${(e.rect.w / current.rect.w) * 100}%`,
                          height: `${(e.rect.h / current.rect.h) * 100}%`,
                        }}
                      >
                        {active && (
                          <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 flex max-w-[260px] items-center gap-1 truncate rounded-md bg-[#111111] px-1.5 py-0.5 text-[11px] whitespace-nowrap text-foreground ring-1 ring-[#2a2a2a]">
                            {ELEMENT_KINDS[e.kind].label} · {bare(e.name)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {sel && sel.unit.kind === current.kind && sel.unit.ident === current.ident && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="absolute right-4 bottom-4 w-[320px] rounded-panel border border-[#222222] bg-[#0b0b0b] p-4"
            >
              <div className="flex items-start gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#161616] text-neutral-400">
                  {(() => {
                    const Icon = ELEMENT_KINDS[sel.kind].icon;
                    return <Icon className="size-4" aria-hidden />;
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{bare(sel.name)}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {ELEMENT_KINDS[sel.kind].label}
                    {sel.disabled ? " · disabled in the design" : ""}
                  </p>
                </div>
                <button type="button" onClick={() => onSelect(null)} className="grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-[#171717]" aria-label="Close">
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <dl className="mt-3 space-y-1.5 text-[12px]">
                {sel.does && <Row label="Does">{sel.does}</Row>}
                {sel.state && <Row label="State">
                    <code className="font-mono text-neutral-400">app::state().{sel.state}</code>
                  </Row>}
                {sel.action && <Row label="Calls">
                    <code className="font-mono text-neutral-400">actions::{sel.action}()</code>
                  </Row>}
                <Row label="Where">
                  {Math.round(sel.rect.x)}, {Math.round(sel.rect.y)} · {Math.round(sel.rect.w)} × {Math.round(sel.rect.h)}
                </Row>
              </dl>
              <button type="button" onClick={() => onCode(sel)} className="lf-btn lf-btn-ghost lf-btn-sm mt-3.5 w-full justify-center">
                <Code2Icon className="size-3.5" aria-hidden /> Show its code
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-12 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground/90">{children}</dd>
    </div>
  );
}
