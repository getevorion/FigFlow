"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircleIcon, ArrowLeftIcon, CheckIcon, Code2Icon, EyeIcon, ListTreeIcon, LoaderIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { plural, timeLeft } from "@/lib/app-format";
import type { AppElement, ProjectManifest, ProjectView } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { useNow } from "../use-now";
import { usePoll } from "../use-poll";
import { loader } from "@monaco-editor/react";
import { CodePane } from "./code-pane";
import { ElementsPane } from "./elements-pane";
import { PreviewPane } from "./preview-pane";
import { DownloadZipButton } from "./download-zip-button";
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
        <div className="border border-[var(--kv-border)] bg-[var(--kv-surface)] w-full max-w-lg rounded-card p-8 text-center">
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
      <div className="w-full max-w-md rounded-card border border-[var(--kv-border)] bg-[var(--kv-surface)] p-7">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-[var(--kv-bg)] ring-1 ring-[var(--kv-border)]">
            <LoaderIcon className="size-5 animate-spin text-[var(--kv-text-muted)]" aria-hidden />
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
              <span className={cn("grid size-4 place-items-center rounded-full", i < step ? "bg-emerald-100 text-emerald-600" : i === step ? "bg-[var(--kv-bg)]" : "bg-[var(--kv-bg)]")}>
                {i < step ? <CheckIcon className="size-2.5" strokeWidth={3} /> : i === step ? <span className="size-1.5 animate-pulse rounded-full bg-[var(--kv-accent)]" /> : null}
              </span>
              {s}
            </li>
          ))}
        </ol>
        {error && <p className="mt-5 text-[12px] text-amber-700">{error}</p>}
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

  useEffect(() => {
    void loader.init();
  }, []);

  const s = manifest.stats;
  const chips = [plural(s.screens, "screen"), s.popups ? plural(s.popups, "popup") : null, s.toasts ? plural(s.toasts, "toast") : null, plural(s.controls, "control"), plural(manifest.files.length, "file")].filter(Boolean);

  const tabCards: { value: Tab; label: string; icon: typeof EyeIcon; count?: number }[] = [
    { value: "preview", label: "Preview", icon: EyeIcon },
    { value: "code", label: "Code", icon: Code2Icon },
    { value: "elements", label: "Elements", icon: ListTreeIcon, count: manifest.elements.length },
    { value: "warnings", label: "Warnings", icon: TriangleAlertIcon, count: manifest.warnings.length },
  ];

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="kv-app flex min-h-0 flex-1 flex-col bg-[var(--kv-bg)]">
      <div className="flex shrink-0 flex-col gap-3 px-5 pt-3">
        <div className="rounded-[var(--kv-radius-card)] border border-[var(--kv-border)] bg-[var(--kv-surface)] px-5 py-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <h1 className="truncate font-mono text-[17px] font-semibold tracking-[-0.01em]">{manifest.name}</h1>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 ring-1 ring-emerald-200">
                  <CheckIcon className="size-3" strokeWidth={3} aria-hidden /> Ready
                </span>
              </div>
              <p className="mt-1 truncate text-[12.5px] text-[var(--kv-text-subtle)]">
                Starts on <span className="text-[var(--kv-text)]" title={startFrame.reason ? `Figflow picked it: ${startFrame.reason}` : undefined}>{start?.kind === "screen" ? start.name : startFrame.name}</span> · {chips.join(" · ")} ·
                converted in {(manifest.ms / 1000).toFixed(1)} s{now ? ` · deleted ${timeLeft(project.expiresAt, now)}` : ""}
              </p>
            </div>
            <Link href={change} className="lf-btn lf-btn-ghost lf-btn-sm">
              <RefreshCwIcon className="size-3.5" aria-hidden /> Change start frame
            </Link>
            <DownloadZipButton href={`${base}/zip`} name={manifest.zip.name} size={manifest.zip.size} />
          </div>
        </div>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2.5 bg-transparent p-0 lg:grid-cols-4">
          {tabCards.map(({ value, label, icon: Icon, count }) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "after:hidden !h-11 w-full flex-none flex-row items-center justify-start gap-2 rounded-[var(--kv-radius-card)] border border-[var(--kv-border)] bg-[var(--kv-surface)] px-4 py-0 text-left shadow-sm",
                "text-[var(--kv-text-subtle)] hover:border-[var(--kv-accent)]/35 hover:bg-white hover:text-[var(--kv-text)]",
                "data-active:border-[var(--kv-accent)] data-active:bg-[var(--kv-accent-soft)] data-active:text-[var(--kv-text)] data-active:shadow-[0_0_0_1px_var(--kv-accent)]",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              <span className="text-[13px] font-medium">{label}</span>
              {count !== undefined && <span className="ml-auto font-mono text-[11px] tabular-nums text-[var(--kv-text-muted)]">{count}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="min-h-0 flex-1 px-5 pb-5 pt-3">
        <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[var(--kv-radius-card)] border border-[var(--kv-border)] bg-[var(--kv-surface)] shadow-sm [&_[data-slot=tabs-content]]:min-h-0">
          <TabsContent value="preview" keepMounted className="mt-0 hidden h-full min-h-0 min-w-0 flex-1 data-active:flex">
            <PreviewPane base={base} manifest={manifest} unit={unit} onUnit={setUnit} selected={selected} onSelect={setSelected} onCode={showCode} />
          </TabsContent>
          <TabsContent value="code" keepMounted className="mt-0 hidden h-full min-h-0 min-w-0 flex-1 data-active:flex">
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
          <TabsContent value="elements" className="mt-0 hidden h-full min-h-0 min-w-0 flex-1 data-active:flex">
            <ElementsPane manifest={manifest} onShow={showElement} onCode={showCode} />
          </TabsContent>
          <TabsContent value="warnings" className="mt-0 hidden h-full min-h-0 min-w-0 flex-1 data-active:flex">
            <WarningsPane warnings={manifest.warnings} />
          </TabsContent>
        </div>
      </div>
    </Tabs>
  );
}
