"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AppElement, UnitManifest } from "@/lib/app-types";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { bare } from "./element-kinds";
import { PLAY_PAGE_KEY, parseSelectPage, parseSliderRange, targetUnitKey } from "./preview-play-state";

const COMBO_ITEMS = ["Option 1", "Option 2", "Option 3", "Option 4"];
const KEY_CYCLE = ["None", "Mouse 4", "Mouse 5", "Shift", "Ctrl", "Alt", "F1", "F2"];

export function InteractiveControls({
  elements,
  frameW,
  frameH,
  scale,
  state,
  setState,
  units,
  onNavigate,
  onPress,
}: {
  elements: Array<{ e: AppElement; i: number }>;
  frameW: number;
  frameH: number;
  scale: number;
  state: Record<string, string | number | boolean>;
  setState: Dispatch<SetStateAction<Record<string, string | number | boolean>>>;
  units: UnitManifest[];
  onNavigate: (unitKey: string) => void;
  onPress: (index: number) => void;
}) {
  return (
    <>
      {elements.map(({ e, i }) => {
        if (e.disabled) return null;
        const box = {
          left: (e.rect.x / frameW) * 100,
          top: (e.rect.y / frameH) * 100,
          width: (e.rect.w / frameW) * 100,
          height: (e.rect.h / frameH) * 100,
        };
        const field = e.state;
        const common = "absolute flex items-center justify-center p-0.5";

        if (e.kind === "slider" && field) {
          const { min, max } = parseSliderRange(e.call);
          const val = Number(state[field] ?? min);
          return (
            <div key={i} className={cn(common, "cursor-ew-resize")} style={box} onPointerDown={(ev) => ev.stopPropagation()}>
              <Slider
                className="w-full min-w-0 opacity-90"
                min={min}
                max={max}
                value={[val]}
                onValueChange={(v) => {
                  const n = Array.isArray(v) ? v[0] : v;
                  setState((s) => ({ ...s, [field]: n }));
                }}
                aria-label={bare(e.name)}
              />
            </div>
          );
        }

        if (e.kind === "toggle" && field) {
          return (
            <label key={i} className={cn(common, "cursor-pointer gap-1")} style={box} onPointerDown={(ev) => ev.stopPropagation()}>
              <Switch checked={Boolean(state[field])} onCheckedChange={(v) => setState((s) => ({ ...s, [field]: v }))} aria-label={bare(e.name)} />
            </label>
          );
        }

        if (e.kind === "checkbox" && field) {
          return (
            <label key={i} className={cn(common, "cursor-pointer")} style={box} onPointerDown={(ev) => ev.stopPropagation()}>
              <Checkbox checked={Boolean(state[field])} onCheckedChange={(v) => setState((s) => ({ ...s, [field]: Boolean(v) }))} aria-label={bare(e.name)} />
            </label>
          );
        }

        if (e.kind === "combo" && field) {
          const idx = Number(state[field] ?? 0);
          return (
            <div key={i} className={common} style={box} onPointerDown={(ev) => ev.stopPropagation()}>
              <Select value={String(idx)} onValueChange={(v) => setState((s) => ({ ...s, [field]: Number(v) }))}>
                <SelectTrigger className="h-full min-h-7 w-full border-[var(--kv-border)] bg-white/90 text-[11px] text-[var(--kv-text)] shadow-sm backdrop-blur-sm" aria-label={bare(e.name)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMBO_ITEMS.map((label, j) => (
                    <SelectItem key={label} value={String(j)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (e.kind === "text_field" && field) {
          return (
            <div key={i} className={common} style={box} onPointerDown={(ev) => ev.stopPropagation()}>
              <Input
                className="h-full min-h-7 w-full border-[var(--kv-border)] bg-white/90 text-[11px] text-[var(--kv-text)] shadow-sm placeholder:text-[var(--kv-text-muted)] backdrop-blur-sm"
                value={String(state[field] ?? "")}
                onChange={(ev) => setState((s) => ({ ...s, [field]: ev.target.value }))}
                placeholder={bare(e.name)}
                aria-label={bare(e.name)}
              />
            </div>
          );
        }

        if (e.kind === "keybind" && field) {
          return (
            <button
              key={i}
              type="button"
              className={cn(
                common,
                "rounded-md border border-[var(--kv-border)] bg-white/90 font-mono text-[10px] text-[var(--kv-text)] shadow-sm backdrop-blur-sm hover:bg-white",
              )}
              style={box}
              onClick={() => {
                const cur = String(state[field] ?? "None");
                const next = KEY_CYCLE[(KEY_CYCLE.indexOf(cur) + 1) % KEY_CYCLE.length];
                setState((s) => ({ ...s, [field]: next }));
                onPress(i);
              }}
            >
              {String(state[field] ?? "None")}
            </button>
          );
        }

        if (e.kind === "radio" && field) {
          return (
            <button
              key={i}
              type="button"
              className={cn(common, "rounded-full border-2 border-[var(--kv-accent)]/60 bg-white/80 hover:bg-[var(--kv-accent-soft)]")}
              style={box}
              aria-pressed={Number(state[field]) === i}
              onClick={() => {
                setState((s) => ({ ...s, [field]: i }));
                onPress(i);
              }}
              aria-label={bare(e.name)}
            />
          );
        }

        if (e.kind === "button" || e.kind === "hotspot" || e.kind === "nav") {
          const pageIdx = parseSelectPage(e.does);
          const tabActive = pageIdx !== null && Number(state[PLAY_PAGE_KEY] ?? 0) === pageIdx;
          return (
            <button
              key={i}
              type="button"
              className={cn(
                common,
                "rounded-md border transition-colors",
                tabActive
                  ? "border-[var(--kv-accent)]/70 bg-[var(--kv-accent-soft)] shadow-[inset_0_0_0_1px_rgba(0,119,230,0.25)]"
                  : "border-transparent bg-transparent hover:border-[var(--kv-accent)]/40 hover:bg-[var(--kv-accent-soft)]/60 active:bg-[var(--kv-accent-soft)]",
              )}
              style={box}
              aria-label={bare(e.name)}
              aria-pressed={pageIdx !== null ? tabActive : undefined}
              onClick={() => {
                onPress(i);
                if (pageIdx !== null) setState((s) => ({ ...s, [PLAY_PAGE_KEY]: pageIdx }));
                const next = targetUnitKey(e.does, units);
                if (next) onNavigate(next);
              }}
            />
          );
        }

        return null;
      })}
    </>
  );
}
