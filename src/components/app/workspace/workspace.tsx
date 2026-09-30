"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircleIcon, ArrowLeftIcon, CheckIcon, Code2Icon, DownloadIcon, EyeIcon, ListTreeIcon, LoaderIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBytes, plural, timeLeft } from "@/lib/app-format";
import type { AppElement, ProjectManifest, ProjectView } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";
import { CodePane } from "./code-pane";
import { ElementsPane } from "./elements-pane";
import { PreviewPane } from "./preview-pane";
import { WarningsPane } from "./warnings-pane";

/** The frame the app starts on, and why Figflow picked it (when it did). */
export type StartInfo = { name: string; reason?: string };

/** A converted project: working on it, what went wrong, or the project itself. */
export function Workspace({ initial, upload, start }: { initial: ProjectView; upload: string; start: StartInfo }) {
  const base = `/api/uploads/${upload}/projects/${initial.id}`;
  const { data: project, error } = usePoll<ProjectView>(base, initial, (p) => p.state === "working", 900);
  const change = `/convert/${upload}?pick&from=${initial.id}`;

  if (project.state === "working") return <Converting since={project.createdAt} error={error} start={start} />;
  if (project.state === "failed" || !project.manifest)
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="border border-[#1c1c1c] bg-[#0b0b0b] w-full max-w-lg rounded-card p-8 text-center">
          <AlertCircleIcon className="mx-auto size-7 text-destructive" aria-hidden />
          <p className="mt-3 font-medium">This frame couldn&apos;t be converted</p>
          <p className="mt-2 text-[13px] break-words text-muted-foreground">{project.error ?? "Something went wrong."}</p>
          <Link href={change} className="lf-btn lf-btn-ghost mt-6">
            <ArrowLeftIcon className="size-4" aria-hidden /> Start from another frame
          </Link>
        </div>
      </div>
    );
  return <Project base={base} change={change} start={start} project={project} manifest={project.manifest} />;
}

const STEPS = ["Reading the design", "Finding screens, popups and toasts", "Recognizing controls", "Writing the C++", "Baking images and fonts", "Packing the ZIP"];

function Converting({ since, error, start }: { since: number; error: string | null; start: StartInfo }) {
  const now = useNow(250);
  const secs = now === null ? 0 : Math.max(0, (now - since) / 1000);
  // The engine doesn't report its steps; they're paced on its usual timings (a second or two in all).
  const step = Math.min(STEPS.length - 1, Math.floor(secs / 0.4));
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="w-full max-w-md rounded-card border border-[#1c1c1c] bg-[#0b0b0b] p-7">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[#161616] ring-1 ring-[#2a2a2a]">
            <LoaderIcon className="size-5 animate-spin text-neutral-400" aria-hidden />
          </div>
          <div>
            <p className="font-medium">Converting</p>
            <p className="font-mono text-[11.5px] text-muted-foreground">{now === null ? "starting" : `${secs.toFixed(0)} s`}</p>
          </div>
        </div>
        <p className="mt-5 text-[12.5px] leading-relaxed text-muted-foreground">
          Starting from <span className="text-foreground/90">{start.name}</span>
          {start.reason ? `: ${start.reason}.` : "."}
        </p>
        <ol className="mt-6 space-y-2.5">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("flex items-center gap-2.5 text-[13px] transition-colors duration-300", i < step ? "text-foreground/70" : i === step ? "text-foreground" : "text-muted-foreground/50")}>
              <span className={cn("grid size-4 place-items-center rounded-full", i < step ? "bg-emerald-400/20 text-emerald-300" : i === step ? "bg-[#1f1f1f]" : "bg-[#141414]")}>
                {i < step ? <CheckIcon className="size-2.5" strokeWidth={3} /> : i === step ? <span className="size-1.5 animate-pulse rounded-full bg-neutral-300" /> : null}
              </span>
              {s}
            </li>
          ))}
        </ol>
        {error && <p className="mt-5 text-[12px] text-amber-300/80">{error}</p>}
      </div>
    </div>
  );
}

type Tab = "preview" | "code" | "elements" | "warnings";

function Project({ base, change, start: startFrame, project, manifest }: { base: string; change: string; start: StartInfo; project: ProjectView; manifest: ProjectManifest }) {
  const start = manifest.units.find((u) => u.start) ?? manifest.units[0];
  const [tab, setTab] = useState<Tab>("preview");
  const [unit, setUnit] = useState(start ? `${start.kind}-${start.ident}` : "");
  const [selected, setSelected] = useState<number | null>(null);
  const [path, setPath] = useState(() => (start ? `src/ui/screens/${start.ident}.cpp` : manifest.files[0]?.path) ?? "");
  const [target, setTarget] = useState<string | null>(null);
  const now = useNow();

  const showCode = (el: AppElement) => {
    setPath(el.file);
    setTarget(el.call.slice(0, 80));
    setTab("code");
  };
  const showElement = (index: number) => {
    const el = manifest.elements[index];
    setUnit(`${el.unit.kind}-${el.unit.ident}`);
    setSelected(index);
    setTab("preview");
  };

  const s = manifest.stats;
  const chips = [plural(s.screens, "screen"), s.popups ? plural(s.popups, "popup") : null, s.toasts ? plural(s.toasts, "toast") : null, plural(s.controls, "control"), plural(manifest.files.length, "file")].filter(Boolean);

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="border-b border-[#1c1c1c] bg-[#080808]">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-5 pt-4 pb-3">
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <h1 className="truncate font-mono text-[17px] font-semibold tracking-[-0.01em]">{manifest.name}</h1>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-300 ring-1 ring-emerald-400/20">
                <CheckIcon className="size-3" strokeWidth={3} aria-hidden /> Ready
              </span>
            </div>
            <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
              Starts on <span className="text-foreground/85" title={startFrame.reason ? `Figflow picked it: ${startFrame.reason}` : undefined}>{start?.kind === "screen" ? start.name : startFrame.name}</span> · {chips.join(" · ")} ·
              converted in {(manifest.ms / 1000).toFixed(1)} s{now ? ` · deleted ${timeLeft(project.expiresAt, now)}` : ""}
            </p>
          </motion.div>
          <Link href={change} className="lf-btn lf-btn-ghost lf-btn-sm">
            <RefreshCwIcon className="size-3.5" aria-hidden /> Change start frame
          </Link>
          <a href={`${base}/zip`} download className="lf-btn lf-btn-primary">
            <DownloadIcon className="size-4" aria-hidden /> Download ZIP <span className="font-mono text-[11px] opacity-75">{formatBytes(manifest.zip.size)}</span>
          </a>
        </div>
        <TabsList variant="line" className="h-10 gap-4 px-5">
          <TabsTrigger value="preview" className="px-0">
            <EyeIcon aria-hidden /> Preview
          </TabsTrigger>
          <TabsTrigger value="code" className="px-0">
            <Code2Icon aria-hidden /> Code
          </TabsTrigger>
          <TabsTrigger value="elements" className="px-0">
            <ListTreeIcon aria-hidden /> Elements <span className="font-mono text-[11px] text-muted-foreground">{manifest.elements.length}</span>
          </TabsTrigger>
          <TabsTrigger value="warnings" className="px-0">
            <TriangleAlertIcon aria-hidden /> Warnings <span className="font-mono text-[11px] text-muted-foreground">{manifest.warnings.length}</span>
          </TabsTrigger>
        </TabsList>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="min-h-0 flex-1">
          <TabsContent value="preview" className="h-full">
            <PreviewPane base={base} manifest={manifest} unit={unit} onUnit={setUnit} selected={selected} onSelect={setSelected} onCode={showCode} />
          </TabsContent>
          <TabsContent value="code" className="h-full">
            <CodePane
              base={base}
              files={manifest.files}
              path={path}
              onPath={(p) => {
                setPath(p);
                setTarget(null);
              }}
              target={target}
            />
          </TabsContent>
          <TabsContent value="elements" className="h-full">
            <ElementsPane manifest={manifest} onShow={showElement} onCode={showCode} />
          </TabsContent>
          <TabsContent value="warnings" className="h-full">
            <WarningsPane warnings={manifest.warnings} />
          </TabsContent>
        </motion.div>
      </AnimatePresence>
    </Tabs>
  );
}
