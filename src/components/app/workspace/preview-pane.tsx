"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BellIcon,
  Code2Icon,
  EyeIcon,
  EyeOffIcon,
  Gamepad2Icon,
  LoaderIcon,
  MaximizeIcon,
  MonitorIcon,
  PanelTopIcon,
  ScanIcon,
  ScanSearchIcon,
  XIcon,
} from "lucide-react";
import type { AppElement, ProjectManifest, UnitManifest } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { ELEMENT_KINDS, bare } from "./element-kinds";
import { InteractiveControls } from "./interactive-controls";
import { PLAY_PAGE_KEY, buildPlayState, unitKey as uKey } from "./preview-play-state";

const UNIT_ICON = { screen: MonitorIcon, popup: PanelTopIcon, toast: BellIcon } as const;
const unitKey = (u: UnitManifest) => uKey(u);

/**
 * Design preview with **Play** mode (real widgets) and **Inspect** mode (control outlines).
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
  const [mode, setMode] = useState<"play" | "inspect">("play");
  const [loaded, setLoaded] = useState<Record<string, "ready" | "failed">>({});
  const [outlines, setOutlines] = useState(true);
  const [actual, setActual] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [flash, setFlash] = useState<number | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState({ w: 0, h: 0 });

  const seen = useCallback((img: HTMLImageElement | null) => {
    if (!img?.complete) return;
    const k = img.dataset.unit!;
    setLoaded((m) => (m[k] ? m : { ...m, [k]: img.naturalWidth > 0 ? "ready" : "failed" }));
  }, []);

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

  const [playState, setPlayState] = useState<Record<string, string | number | boolean>>(() => buildPlayState(elements.map(({ e }) => e)));
  const [playFor, setPlayFor] = useState(elements);
  if (playFor !== elements) {
    setPlayFor(elements);
    setPlayState(buildPlayState(elements.map(({ e }) => e)));
  }

  const sel = selected !== null ? manifest.elements[selected] : null;

  if (!current) return null;
  const key = unitKey(current);
  const fit = room.w > 0 ? Math.max(0.05, Math.min(2, (room.w - 48) / current.rect.w, (room.h - 48) / current.rect.h)) : 0;
  const scale = actual ? 1 : fit;
  const state = loaded[key];
  const groups = (["screen", "popup", "toast"] as const).map((k) => ({ kind: k, units: manifest.units.filter((u) => u.kind === k) })).filter((g) => g.units.length);

  const showOutlines = mode === "inspect" && outlines;
  const stateEntries = Object.entries(playState).filter(([k]) => k !== PLAY_PAGE_KEY);
  const activePage = Number(playState[PLAY_PAGE_KEY] ?? 0) + 1;

  return (
    <div className="grid h-full min-h-0 grid-cols-[210px_minmax(0,1fr)] bg-[var(--kv-surface,#fff)]">
      <nav aria-label="Screens, popups and toasts" className="overflow-y-auto border-r border-[var(--kv-border,#e6e8ec)] bg-[var(--kv-sidebar,#f7f8fa)] p-2">
        {groups.map((g) => (
          <div key={g.kind} className="mb-3">
            <p className="px-2 pt-1 pb-1.5 font-mono text-[10.5px] text-[var(--kv-text-muted)]">{g.kind === "screen" ? "Screens" : g.kind === "popup" ? "Popups" : "Toasts"}</p>
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
                    active ? "bg-white text-[var(--kv-text)] shadow-sm" : "text-[var(--kv-text-subtle)] hover:bg-white/70",
                  )}
                >
                  <Icon className="size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{u.name}</span>
                  {u.start && <span className="rounded-full bg-[var(--kv-accent-soft)] px-1.5 text-[10px] text-[var(--kv-accent)]">start</span>}
                  {count > 0 && <span className="font-mono text-[10.5px] text-[var(--kv-text-muted)]">{count}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="relative flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--kv-border)] px-4 py-2">
          <p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--kv-text-subtle)]">
            <span className="font-medium text-[var(--kv-text)]">{current.name}</span> · {Math.round(current.rect.w)} × {Math.round(current.rect.h)}
          </p>
          <div className="flex rounded-lg border border-[var(--kv-border)] p-0.5">
            <button
              type="button"
              onClick={() => setMode("play")}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px]",
                mode === "play" ? "bg-[var(--kv-accent-soft)] text-[var(--kv-accent)]" : "text-[var(--kv-text-subtle)]",
              )}
            >
              <Gamepad2Icon className="size-3.5" /> Play
            </button>
            <button
              type="button"
              onClick={() => setMode("inspect")}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px]",
                mode === "inspect" ? "bg-[var(--kv-accent-soft)] text-[var(--kv-accent)]" : "text-[var(--kv-text-subtle)]",
              )}
            >
              <ScanSearchIcon className="size-3.5" /> Inspect
            </button>
          </div>
          {mode === "inspect" && current.kind !== "toast" && (
            <button
              type="button"
              onClick={() => setOutlines((v) => !v)}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px]", outlines ? "bg-[var(--kv-bg)]" : "text-[var(--kv-text-subtle)]")}
              aria-pressed={outlines}
            >
              {outlines ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />} Outlines
            </button>
          )}
          <button type="button" onClick={() => setActual((v) => !v)} className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--kv-text-subtle)] hover:bg-[var(--kv-bg)]" aria-pressed={actual}>
            {actual ? <MaximizeIcon className="size-3.5" /> : <ScanIcon className="size-3.5" />} {actual ? "Fit" : "Actual size"}
          </button>
        </div>

        {mode === "play" && (stateEntries.length > 0 || PLAY_PAGE_KEY in playState) && (
          <div className="flex flex-wrap gap-2 border-b border-[var(--kv-border-subtle)] bg-[var(--kv-bg)] px-4 py-2 text-[11px]">
            {PLAY_PAGE_KEY in playState && (
              <span className="rounded-md border border-[var(--kv-border)] bg-white px-2 py-0.5 font-mono text-[var(--kv-text-subtle)]">
                <span className="text-[var(--kv-text)]">page</span>={activePage}
              </span>
            )}
            {stateEntries.map(([k, v]) => (
              <span key={k} className="rounded-md border border-[var(--kv-border)] bg-white px-2 py-0.5 font-mono text-[var(--kv-text-subtle)]">
                <span className="text-[var(--kv-text)]">{k}</span>={String(v)}
              </span>
            ))}
          </div>
        )}

        <div
          ref={stage}
          className={cn(
            "relative min-h-0 flex-1 bg-[var(--kv-bg)] bg-[radial-gradient(circle_at_1px_1px,var(--kv-border)_1px,transparent_0)] bg-[length:18px_18px]",
            actual ? "overflow-auto" : "overflow-hidden",
          )}
        >
          <div className={cn("flex min-h-full items-center justify-center", actual ? "w-max min-w-full p-8" : "h-full")}>
            <div
              className={cn("relative overflow-hidden rounded-md shadow-md ring-1 ring-[var(--kv-border)]", !scale && "invisible")}
              style={{ width: current.rect.w * scale, height: current.rect.h * scale }}
            >
              {state !== "ready" && (
                <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--kv-surface)]">
                  {state === "failed" ? (
                    <p className="px-6 text-center text-[12.5px] text-red-600">The preview couldn&apos;t be drawn.</p>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-[12px] text-[var(--kv-text-subtle)]">
                      <LoaderIcon className="size-4 animate-spin text-[var(--kv-text-muted)]" aria-hidden />
                      Drawing {current.name}…
                    </div>
                  )}
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={key}
                ref={seen}
                data-unit={key}
                src={`${base}/units/${key}`}
                alt=""
                onLoad={() => setLoaded((m) => ({ ...m, [key]: "ready" }))}
                onError={() => setLoaded((m) => ({ ...m, [key]: "failed" }))}
                className={cn("block size-full select-none", state === "ready" ? "opacity-100" : "opacity-0", mode === "play" && "pointer-events-none")}
                draggable={false}
              />
              {state === "ready" && mode === "play" && (
                <div className="absolute inset-0 z-20">
                  <InteractiveControls
                    elements={elements}
                    frameW={current.rect.w}
                    frameH={current.rect.h}
                    scale={scale}
                    state={playState}
                    setState={setPlayState}
                    units={manifest.units}
                    onNavigate={(next) => {
                      onUnit(next);
                      onSelect(null);
                    }}
                    onPress={(i) => {
                      setFlash(i);
                      window.setTimeout(() => setFlash((f) => (f === i ? null : f)), 180);
                    }}
                  />
                  {flash !== null && (() => {
                    const hit = elements.find(({ i }) => i === flash);
                    if (!hit) return null;
                    const r = hit.e.rect;
                    return (
                      <div
                        className="pointer-events-none absolute rounded-md ring-2 ring-[var(--kv-accent)]/70"
                        style={{
                          left: `${(r.x / current.rect.w) * 100}%`,
                          top: `${(r.y / current.rect.h) * 100}%`,
                          width: `${(r.w / current.rect.w) * 100}%`,
                          height: `${(r.h / current.rect.h) * 100}%`,
                        }}
                      />
                    );
                  })()}
                </div>
              )}
              {state === "ready" && showOutlines && (
                <div className="absolute inset-0 z-10">
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
                            ? "border-[var(--kv-accent)] bg-[var(--kv-accent)]/25 shadow-[0_0_0_3px_rgba(0,119,230,0.25)]"
                            : active
                              ? "border-[var(--kv-accent)]/90 bg-[var(--kv-accent)]/15"
                              : "border-[var(--kv-accent)]/50 bg-[var(--kv-accent)]/[0.07] hover:border-[var(--kv-accent)]",
                        )}
                        style={{
                          left: `${(e.rect.x / current.rect.w) * 100}%`,
                          top: `${(e.rect.y / current.rect.h) * 100}%`,
                          width: `${(e.rect.w / current.rect.w) * 100}%`,
                          height: `${(e.rect.h / current.rect.h) * 100}%`,
                        }}
                      >
                        {active && (
                          <span className="pointer-events-none absolute bottom-full left-0 z-10 mb-1 truncate rounded-md border border-[var(--kv-border)] bg-[var(--kv-surface)] px-1.5 py-0.5 text-[11px] text-[var(--kv-text)] shadow-sm">
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
          {sel && mode === "inspect" && sel.unit.kind === current.kind && sel.unit.ident === current.ident && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="absolute right-4 bottom-4 z-30 w-[320px] rounded-[14px] border border-[var(--kv-border)] bg-white p-4 shadow-lg"
            >
              <div className="flex items-start gap-2.5">
                <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--kv-bg)] text-[var(--kv-text-subtle)]">
                  {(() => {
                    const Icon = ELEMENT_KINDS[sel.kind].icon;
                    return <Icon className="size-4" aria-hidden />;
                  })()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{bare(sel.name)}</p>
                  <p className="text-[12px] text-[var(--kv-text-subtle)]">
                    {ELEMENT_KINDS[sel.kind].label}
                    {sel.disabled ? " · disabled" : ""}
                  </p>
                </div>
                <button type="button" onClick={() => onSelect(null)} className="grid size-6 place-items-center rounded-md hover:bg-[var(--kv-bg)]" aria-label="Close">
                  <XIcon className="size-3.5" />
                </button>
              </div>
              <dl className="mt-3 space-y-1.5 text-[12px]">
                {sel.does && <Row label="Does">{sel.does}</Row>}
                {sel.state && (
                  <Row label="State">
                    <code className="font-mono">app::state().{sel.state}</code>
                  </Row>
                )}
                {sel.action && (
                  <Row label="Calls">
                    <code className="font-mono">actions::{sel.action}()</code>
                  </Row>
                )}
              </dl>
              <button type="button" onClick={() => onCode(sel)} className="btn-secondary mt-3.5 w-full justify-center">
                <Code2Icon className="size-3.5" aria-hidden /> Show code
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
      <dt className="w-12 shrink-0 text-[var(--kv-text-muted)]">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
