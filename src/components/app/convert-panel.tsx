"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AppWindowIcon, ArrowRightIcon, BellIcon, LoaderIcon, MonitorIcon, PanelTopIcon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { ago } from "@/lib/app-format";
import { frameParam, type FrameFlow, type FrameSummary, type ProjectSummary } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { FrameThumb } from "./frame-card";

type FlowState = { frame: string; flow: FrameFlow | null; error: string | null };

/** The chosen frame: what an app starting there holds, and the button that converts it. */
export function ConvertPanel({ upload, frame, projects, pick }: { upload: string; frame: FrameSummary; projects: ProjectSummary[]; pick?: { frame: string; reason: string } }) {
  const router = useRouter();
  const [flow, setFlow] = useState<FlowState | null>(null);
  const [busy, setBusy] = useState(false);

  // The picker remounts this panel per frame (key), so state starts fresh for each.
  useEffect(() => {
    let stale = false;
    fetch(`/api/uploads/${upload}/frames/${frameParam(frame.id)}/flow`, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!stale) setFlow({ frame: frame.id, flow: res.ok ? (body as FrameFlow) : null, error: res.ok ? null : (body.error ?? "Couldn't look at this frame.") });
      })
      .catch(() => !stale && setFlow({ frame: frame.id, flow: null, error: "Couldn't reach Figflow." }));
    return () => {
      stale = true;
    };
  }, [upload, frame]);

  const convert = async () => {
    setBusy(true);
    const res = await fetch(`/api/uploads/${upload}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frame: frame.id }),
    }).catch(() => null);
    const body = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      setBusy(false);
      return toast.error(body.error ?? "The conversion didn't start. Try again.");
    }
    router.push(`/convert/${upload}/${body.id}`);
  };

  const f = flow?.frame === frame.id ? flow : null;
  const earlier = projects.filter((p) => p.frame === frame.id);

  return (
    <div className="scroll-dark flex h-full flex-col overflow-y-auto">
      <div className="p-4">
        <div className="overflow-hidden rounded-panel border border-[#1c1c1c]">
          <FrameThumb upload={upload} frame={frame} />
        </div>
        <h2 className="mt-4 truncate text-[16px] font-semibold tracking-[-0.01em]">{frame.name.trim() || "Untitled"}</h2>
        <p className="mt-0.5 font-mono text-[11.5px] text-muted-foreground">
          {Math.round(frame.width)} × {Math.round(frame.height)} px
        </p>
        {pick?.frame === frame.id && (
          <p className="mt-3 flex gap-2 rounded-lg border border-[#1c1c1c] bg-[#0b0b0b] px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
            <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-neutral-400" aria-hidden />
            <span>Figflow picked this frame: {pick.reason}.</span>
          </p>
        )}
      </div>

      <div className="border-t border-[#1c1c1c] p-4">
        <p className="text-[12px] font-medium text-foreground/80">The app starting here</p>
        <AnimatePresence mode="wait" initial={false}>
          {!f || (!f.flow && !f.error) ? (
            <motion.div key="loading" exit={{ opacity: 0 }} className="mt-3 space-y-2">
              {[70, 55, 62].map((w) => (
                <div key={w} className="animate-shimmer h-4 rounded bg-[linear-gradient(110deg,rgb(255_255_255/0.04)_25%,rgb(255_255_255/0.1)_50%,rgb(255_255_255/0.04)_75%)] bg-[length:200%_100%]" style={{ width: `${w}%` }} />
              ))}
            </motion.div>
          ) : f.error ? (
            <motion.p key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-[12.5px] text-destructive">
              {f.error}
            </motion.p>
          ) : (
            <motion.ul key="flow" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 space-y-2.5 text-[12.5px]">
              <FlowRow icon={MonitorIcon} label="Screens" items={f.flow!.screens.map((s, i) => (i === 0 ? `${s.name} (start)` : s.name))} />
              <FlowRow icon={PanelTopIcon} label="Popups" items={f.flow!.popups.map((p) => p.name)} />
              <FlowRow icon={BellIcon} label="Toasts" items={f.flow!.toasts.map((t) => t.name)} />
            </motion.ul>
          )}
        </AnimatePresence>
        {f?.flow && f.flow.notes.length > 0 && (
          <details className="group mt-3 rounded-lg border border-[#1c1c1c] bg-[#0b0b0b] px-3 py-2 text-[12px] text-muted-foreground">
            <summary className="cursor-pointer list-none text-foreground/75 marker:hidden">How frames were matched ({f.flow.notes.length})</summary>
            <ul className="mt-2 space-y-1.5 leading-relaxed">
              {f.flow.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="border-t border-[#1c1c1c] p-4">
        <button type="button" onClick={convert} disabled={busy || !f?.flow} className={cn("lf-btn lf-btn-primary w-full justify-center", (busy || !f?.flow) && "pointer-events-none opacity-60")}>
          {busy ? <LoaderIcon className="size-4 animate-spin" aria-hidden /> : <AppWindowIcon className="size-4" aria-hidden />}
          {busy ? "Starting…" : "Convert from this frame"}
        </button>
      </div>

      {earlier.length > 0 && (
        <div className="border-t border-[#1c1c1c] p-4">
          <p className="text-[12px] font-medium text-foreground/80">Converted before</p>
          <ul className="mt-2 space-y-1">
            {earlier.map((p) => (
              <li key={p.id}>
                <Link href={`/convert/${upload}/${p.id}`} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 text-[12.5px] transition-colors hover:bg-[#131313]">
                  <span className="min-w-0 flex-1 truncate font-mono">{p.projectName ?? p.name ?? "Project"}</span>
                  <span className={cn("shrink-0 text-[11px]", p.state === "failed" ? "text-destructive" : "text-muted-foreground")}>{p.state === "working" ? "converting…" : p.state === "failed" ? "failed" : ago(p.createdAt)}</span>
                  <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FlowRow({ icon: Icon, label, items }: { icon: typeof MonitorIcon; label: string; items: string[] }) {
  return (
    <li className="flex gap-2.5">
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", items.length ? "text-neutral-400" : "text-muted-foreground/50")} aria-hidden />
      <div className="min-w-0">
        <span className={items.length ? "text-foreground/90" : "text-muted-foreground"}>
          {label} <span className="font-mono text-[11px] text-muted-foreground">{items.length}</span>
        </span>
        {items.length > 0 && <p className="mt-0.5 text-[12px] leading-relaxed break-words text-muted-foreground">{items.join(" · ")}</p>}
      </div>
    </li>
  );
}
