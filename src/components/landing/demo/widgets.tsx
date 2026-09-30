"use client";

/**
 * Tiny widget set for the landing-page demo menu. They mimic what the
 * generated Dear ImGui widgets do (eased state, hover, press, key capture),
 * styled from one accent variable the way the generated theme is.
 */
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACCENTS, useDemo, type DemoKind } from "./context";

function Row({ kind, children, className }: { kind: DemoKind; children: ReactNode; className?: string }) {
  const { setHover } = useDemo();
  return (
    <div
      className={cn("flex min-h-8 items-center justify-between gap-3", className)}
      onPointerEnter={() => setHover(kind)}
      onPointerLeave={() => setHover(null)}
    >
      {children}
    </div>
  );
}

export function Toggle({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <Row kind="toggle">
      <span className="text-[12.5px] text-[#d7d8e2]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => setOn((v) => !v)}
        className={cn(
          "relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors duration-300 outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc)]/60",
          on ? "bg-[var(--acc)]" : "bg-white/[0.09] hover:bg-white/[0.13]",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] left-[2px] size-[14px] rounded-full shadow-[0_1px_3px_rgba(0,0,0,.4)] transition-all duration-300 ease-[cubic-bezier(.3,1.4,.5,1)]",
            on ? "translate-x-[14px] bg-white" : "bg-[#c9cad6]",
          )}
        />
      </button>
    </Row>
  );
}

export function Checkbox({ label, defaultOn = false }: { label: string; defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <Row kind="checkbox" className="justify-start">
      <button
        type="button"
        role="checkbox"
        aria-checked={on}
        onClick={() => setOn((v) => !v)}
        className="group flex items-center gap-2.5 outline-none"
      >
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded-[5px] border transition-all duration-200 group-focus-visible:ring-2 group-focus-visible:ring-[var(--acc)]/60",
            on ? "border-transparent bg-[var(--acc)]" : "border-white/15 bg-white/[0.04] group-hover:border-white/25",
          )}
        >
          <CheckIcon className={cn("size-3 text-[var(--on-acc)] transition-all duration-200", on ? "scale-100 opacity-100" : "scale-50 opacity-0")} strokeWidth={3.5} />
        </span>
        <span className="text-[12.5px] text-[#d7d8e2]">{label}</span>
      </button>
    </Row>
  );
}

export function Slider({ label, min, max, defaultValue, unit = "" }: { label: string; min: number; max: number; defaultValue: number; unit?: string }) {
  const [value, setValue] = useState(defaultValue);
  const [dragging, setDragging] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const t = (value - min) / (max - min);
  const setFrom = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r) return;
    const k = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setValue(Math.round(min + k * (max - min)));
  };
  return (
    <Row kind="slider" className="flex-col items-stretch gap-1.5 py-1">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-[#d7d8e2]">{label}</span>
        <span className="font-mono text-[11px] text-[var(--acc)] tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="relative h-4 cursor-pointer touch-none outline-none"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDragging(true);
          setFrom(e.clientX);
        }}
        onPointerMove={(e) => dragging && setFrom(e.clientX)}
        onPointerUp={() => setDragging(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") setValue((v) => Math.min(max, v + 1));
          if (e.key === "ArrowLeft" || e.key === "ArrowDown") setValue((v) => Math.max(min, v - 1));
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-[5px] -translate-y-1/2 rounded-full bg-white/[0.08]" />
        <div className="absolute top-1/2 left-0 h-[5px] -translate-y-1/2 rounded-full bg-[var(--acc)]" style={{ width: `${t * 100}%` }} />
        <div
          className={cn(
            "absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--acc)] bg-[#0b0b0f] transition-transform duration-150",
            dragging && "scale-125",
          )}
          style={{ left: `${t * 100}%` }}
        />
      </div>
    </Row>
  );
}

export function Dropdown({ label, options, defaultIndex = 0 }: { label: string; options: string[]; defaultIndex?: number }) {
  const [index, setIndex] = useState(defaultIndex);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <Row kind="dropdown">
      <span className="text-[12.5px] text-[#d7d8e2]">{label}</span>
      <div ref={ref} className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex h-7 w-[104px] items-center justify-between rounded-[7px] border px-2.5 text-[12px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc)]/60",
            open ? "border-[var(--acc)]/60 bg-white/[0.07]" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]",
          )}
        >
          <span className="text-[#eeeef5]">{options[index]}</span>
          <ChevronDownIcon className={cn("size-3.5 text-[#8e90a0] transition-transform duration-200", open && "rotate-180")} />
        </button>
        <div
          role="listbox"
          className={cn(
            "absolute top-8 right-0 z-20 w-[104px] origin-top rounded-[9px] border border-white/10 bg-[#141419]/95 p-1 shadow-2xl backdrop-blur transition-all duration-200",
            open ? "scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0",
          )}
        >
          {options.map((o, i) => (
            <button
              key={o}
              type="button"
              role="option"
              aria-selected={i === index}
              onClick={() => {
                setIndex(i);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between rounded-[6px] px-2 py-1.5 text-left text-[12px] text-[#d7d8e2] hover:bg-white/[0.06]"
            >
              {o}
              {i === index && <CheckIcon className="size-3 text-[var(--acc)]" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>
    </Row>
  );
}

/** A readable name for a KeyboardEvent key: letters upper case, named keys in title case. */
function keyName(key: string): string {
  if (key === " ") return "Space";
  if (key.length === 1) return key.toUpperCase();
  const name = key.replace("Arrow", "");
  return (name.charAt(0).toUpperCase() + name.slice(1)).slice(0, 8);
}

export function Keybind({ label, defaultKey }: { label: string; defaultKey: string }) {
  const [key, setKey] = useState(defaultKey);
  const [listening, setListening] = useState(false);
  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.key !== "Escape") setKey(keyName(e.key));
      setListening(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listening]);
  return (
    <Row kind="keybind">
      <span className="text-[12.5px] text-[#d7d8e2]">{label}</span>
      <button
        type="button"
        onClick={() => setListening((v) => !v)}
        onBlur={() => setListening(false)}
        className={cn(
          "h-6 min-w-[52px] rounded-[6px] border px-2 font-mono text-[10.5px] transition-all outline-none",
          listening ? "animate-pulse border-[var(--acc)]/70 bg-[var(--acc)]/10 text-[var(--acc)]" : "border-white/10 bg-white/[0.04] text-[#cfd0dc] hover:bg-white/[0.08]",
        )}
      >
        {listening ? "Press a key" : key}
      </button>
    </Row>
  );
}

export function Swatches({ label }: { label: string }) {
  const { accent, setAccent } = useDemo();
  return (
    <Row kind="color">
      <span className="text-[12.5px] text-[#d7d8e2]">{label}</span>
      <div className="flex gap-1.5">
        {ACCENTS.map((a) => (
          <button
            key={a.color}
            type="button"
            aria-label={`Accent ${a.color}`}
            aria-pressed={accent.color === a.color}
            onClick={() => setAccent(a)}
            className={cn("size-4 rounded-full transition-transform duration-200 outline-none hover:scale-110", accent.color === a.color && "ring-2 ring-white/80 ring-offset-2 ring-offset-[#101014]")}
            style={{ background: a.color }}
          />
        ))}
      </div>
    </Row>
  );
}
