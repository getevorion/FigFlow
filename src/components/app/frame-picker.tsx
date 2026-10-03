"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { AlertCircleIcon, LoaderIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { FigUploadIcon } from "@/components/app/workspace/file-icon";
import { toast } from "sonner";
import { formatBytes, plural, timeLeft } from "@/lib/app-format";
import type { FrameSummary, UploadView } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { ConvertPanel } from "./convert-panel";
import { FrameCard } from "./frame-card";
import { useNow } from "./use-now";
import { usePoll } from "./use-poll";

const fold = (s: string) => s.toLocaleLowerCase().normalize("NFKD").replace(/\p{Mn}/gu, "");

/**
 * Changing the frame an app starts on (Figflow picks one on its own): pages on
 * the left, their frames in the middle, the chosen frame's app on the right.
 * It opens on the frame the app starts on now.
 */
export function FramePicker({ upload: initial, current }: { upload: UploadView; current?: string }) {
  const router = useRouter();
  const { data: upload, error } = usePoll<UploadView>(`/api/uploads/${initial.id}`, initial, (u) => u.state === "reading", 800);
  const pages = useMemo(() => upload.design?.pages.filter((p) => p.frames.length) ?? [], [upload]);
  const all = useMemo(() => pages.flatMap((p) => p.frames), [pages]);
  const startId = current ?? upload.start?.frame;
  const [pageId, setPageId] = useState<string | null>(() => pages.find((p) => p.frames.some((f) => f.id === startId))?.id ?? null);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<FrameSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const now = useNow();
  const selected = chosen ?? all.find((f) => f.id === startId) ?? all[0] ?? null;

  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  const frames = useMemo(() => {
    const q = fold(query.trim());
    return (page?.frames ?? []).filter((f) => !q || fold(f.name).includes(q));
  }, [page, query]);

  const remove = async () => {
    setDeleting(true);
    const res = await fetch(`/api/uploads/${upload.id}`, { method: "DELETE" }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) {
      setDeleting(false);
      return toast.error("Couldn't delete the file. Try again.");
    }
    toast.success("Deleted, with everything made from it.");
    router.push("/convert");
  };

  if (upload.state !== "ready")
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="border border-[var(--kv-border)] bg-[var(--kv-surface)] w-full max-w-md rounded-card p-8 text-center">
          {upload.state === "failed" ? (
            <>
              <AlertCircleIcon className="mx-auto size-7 text-destructive" aria-hidden />
              <p className="mt-3 font-medium">This file couldn&apos;t be read</p>
              <p className="mt-2 text-[13px] text-muted-foreground">{upload.error}</p>
              <button type="button" onClick={remove} className="lf-btn lf-btn-ghost mt-6">
                Delete it and upload another
              </button>
            </>
          ) : (
            <>
              <LoaderIcon className="mx-auto size-6 animate-spin text-[var(--kv-text-muted)]" aria-hidden />
              <p className="mt-3 font-medium">Reading {upload.fileName}…</p>
              <p className="mt-2 text-[13px] text-muted-foreground">{error ?? "Pages, frames and components are being read."}</p>
            </>
          )}
        </div>
      </div>
    );

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)_340px]">
      {/* the file and its pages */}
      <aside className="hidden flex-col border-r border-[var(--kv-border)] bg-[var(--kv-surface)] lg:flex">
        <div className="border-b border-[var(--kv-border)] p-4">
          <div className="flex items-center gap-2.5">
            <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--kv-bg)] ring-1 ring-[var(--kv-border)]">
              <FigUploadIcon size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{upload.design?.name ?? upload.fileName}</p>
              <p className="truncate text-[11.5px] text-muted-foreground">{formatBytes(upload.size)}</p>
            </div>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Deleted {now ? timeLeft(upload.expiresAt, now) : "two hours after upload"}, with everything made from it.
          </p>
        </div>
        <nav aria-label="Pages" className="scroll-dark flex-1 overflow-y-auto p-2">
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPageId(p.id);
                setQuery("");
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
                p.id === page?.id ? "bg-[var(--kv-bg)] text-foreground" : "text-foreground/70 hover:bg-[var(--kv-bg)] hover:text-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{p.frames.length}</span>
            </button>
          ))}
        </nav>
        <div className="border-t border-[var(--kv-border)] p-2">
          <button
            type="button"
            onClick={remove}
            disabled={deleting}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            {deleting ? <LoaderIcon className="size-3.5 animate-spin" /> : <Trash2Icon className="size-3.5" />}
            Delete this file now
          </button>
        </div>
      </aside>

      {/* frames */}
      <section className="scroll-dark flex min-h-0 flex-col overflow-y-auto">
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-[var(--kv-border)] bg-[var(--kv-surface)] px-5 py-3">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{page?.name}</h1>
            <p className="text-[12px] text-muted-foreground">{plural(page?.frames.length ?? 0, "frame")} · choose the one your app starts on</p>
          </div>
          {pages.length > 1 && (
            <select
              value={page?.id}
              onChange={(e) => setPageId(e.target.value)}
              className="h-8 rounded-lg border border-[var(--kv-border)] bg-[var(--kv-surface)] px-2 text-[12.5px] lg:hidden"
              aria-label="Page"
            >
              {pages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <label className="relative block">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a frame"
              aria-label="Find a frame"
              className="h-8 w-52 rounded-lg border border-[var(--kv-border)] bg-[var(--kv-surface)] pr-3 pl-8 text-[12.5px] outline-none placeholder:text-muted-foreground/60 focus:border-[var(--kv-accent)]"
            />
          </label>
        </div>
        <motion.ul
          key={page?.id}
          initial="hidden"
          animate="shown"
          variants={{ shown: { transition: { staggerChildren: 0.025 } } }}
          className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] content-start gap-4 p-5"
        >
          {frames.map((f) => (
            <motion.li key={f.id} variants={{ hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0 } }}>
              <FrameCard upload={upload.id} frame={f} selected={selected?.id === f.id} picked={upload.start?.frame === f.id} onSelect={() => setChosen(f)} />
            </motion.li>
          ))}
          {!frames.length && <li className="col-span-full py-16 text-center text-[13px] text-muted-foreground">No frame on this page is called that.</li>}
        </motion.ul>
      </section>

      {/* the conversion */}
      <aside className="border-t border-[var(--kv-border)] bg-[var(--kv-surface)] lg:border-t-0 lg:border-l">
        {selected && <ConvertPanel key={selected.id} upload={upload.id} frame={selected} projects={upload.projects ?? []} pick={upload.start} />}
      </aside>
    </div>
  );
}
