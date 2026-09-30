"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertCircleIcon, FileUpIcon, LoaderIcon, XIcon } from "lucide-react";
import { formatBytes } from "@/lib/app-format";
import type { UploadView } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { pollDelays } from "./use-poll";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; name: string; sent: number; total: number; rate: number }
  | { kind: "reading"; name: string }
  | { kind: "error"; message: string };

const MAX_MB = 512;

/**
 * Drop a .fig (or pick one): it streams to the server with live progress,
 * then waits while the engine reads it, then opens the frame picker.
 */
export function UploadDropzone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [over, setOver] = useState(false);

  useEffect(() => () => xhr.current?.abort(), []);

  const waitForReading = useCallback(
    async (id: string, name: string) => {
      setPhase({ kind: "reading", name });
      for (const delay of pollDelays(700)) {
        await new Promise((r) => setTimeout(r, delay));
        const res = await fetch(`/api/uploads/${id}`, { cache: "no-store" }).catch(() => null);
        if (!res) continue;
        const up = (await res.json()) as UploadView & { error?: string };
        if (!res.ok) return setPhase({ kind: "error", message: up.error ?? "The upload disappeared." });
        if (up.state === "failed") return setPhase({ kind: "error", message: up.error ?? "Figflow couldn't read this file." });
        // Figflow picks the start frame and starts converting on its own; the project page shows the rest.
        const project = up.projects?.[0];
        if (project) return router.push(`/convert/${id}/${project.id}`);
        if (up.state === "ready" && !up.start) return router.push(`/convert/${id}?pick`);
      }
    },
    [router],
  );

  const start = useCallback(
    (file: File) => {
      if (!/\.fig$/i.test(file.name)) return setPhase({ kind: "error", message: "That isn't a .fig file. In Figma, use File → Save local copy… to get one." });
      if (file.size > MAX_MB * 1024 * 1024) return setPhase({ kind: "error", message: `The file is ${formatBytes(file.size)}; the limit is ${MAX_MB} MB.` });
      const req = new XMLHttpRequest();
      xhr.current = req;
      const t0 = performance.now();
      setPhase({ kind: "uploading", name: file.name, sent: 0, total: file.size, rate: 0 });
      req.upload.onprogress = (e) => {
        const secs = (performance.now() - t0) / 1000;
        setPhase({ kind: "uploading", name: file.name, sent: e.loaded, total: e.total || file.size, rate: secs > 0.2 ? e.loaded / secs : 0 });
      };
      req.onload = () => {
        xhr.current = null;
        let body: { id?: string; error?: string } = {};
        try {
          body = JSON.parse(req.responseText);
        } catch {
          // not JSON: fall through to the status text
        }
        if (req.status === 201 && body.id) void waitForReading(body.id, file.name);
        else setPhase({ kind: "error", message: body.error ?? `The upload failed (${req.status || "no response"}).` });
      };
      req.onerror = () => {
        xhr.current = null;
        setPhase({ kind: "error", message: "The connection dropped during the upload. Try again." });
      };
      req.onabort = () => setPhase({ kind: "idle" });
      req.open("POST", "/api/uploads");
      req.setRequestHeader("Content-Type", "application/octet-stream");
      req.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
      req.send(file);
    },
    [waitForReading],
  );

  const busy = phase.kind === "uploading" || phase.kind === "reading";
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !busy) start(file);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={onDrop}
      className={cn(
        "group relative overflow-hidden rounded-card border border-[#1c1c1c] bg-[#0b0b0b] transition-[background-color,border-color] duration-200",
        over && "border-[#3d3d3d] bg-[#0e0e0e]",
      )}
    >
      {/* the drop target's dashed inner edge */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-3 rounded-[calc(var(--radius-card)-6px)] border border-dashed transition-colors duration-300",
          over ? "border-[#4a4a4a] bg-[#111111]" : "border-[#262626]",
        )}
      />
      <input
        ref={input}
        type="file"
        accept=".fig"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) start(f);
        }}
      />
      <div className="relative flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center">
        <AnimatePresence mode="wait" initial={false}>
          {phase.kind === "uploading" || phase.kind === "reading" ? (
            <motion.div key="busy" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="w-full max-w-md">
              <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-[#161616] text-neutral-400 ring-1 ring-[#2a2a2a]">
                <LoaderIcon className="size-5 animate-spin" aria-hidden />
              </div>
              <p className="truncate text-[15px] font-medium">{phase.name}</p>
              {phase.kind === "uploading" ? (
                <>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#1a1a1a]" role="progressbar" aria-valuemin={0} aria-valuemax={phase.total} aria-valuenow={phase.sent} aria-label="Upload progress">
                    <div className="h-full rounded-full bg-neutral-200 transition-[width] duration-200" style={{ width: `${(100 * phase.sent) / Math.max(1, phase.total)}%` }} />
                  </div>
                  <div className="mt-2.5 flex items-center justify-between font-mono text-[11.5px] text-muted-foreground">
                    <span>
                      {formatBytes(phase.sent)} of {formatBytes(phase.total)}
                    </span>
                    <span>{phase.rate > 0 ? `${formatBytes(phase.rate)}/s` : "starting…"}</span>
                  </div>
                  <button type="button" onClick={() => xhr.current?.abort()} className="lf-btn lf-btn-ghost lf-btn-sm mt-5">
                    <XIcon className="size-3.5" aria-hidden /> Cancel
                  </button>
                </>
              ) : (
                <p className="mt-2 text-[13px] text-muted-foreground">Reading the design and finding where your app starts…</p>
              )}
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="flex flex-col items-center">
              <div className="mb-5 grid size-14 place-items-center rounded-2xl bg-[#141414] text-neutral-300 ring-1 ring-[#2a2a2a]">
                <FileUpIcon className="size-6" aria-hidden />
              </div>
              <p className="text-[17px] font-semibold tracking-[-0.01em]">Drop your .fig here</p>
              <p className="mt-1.5 text-[13.5px] text-muted-foreground">
                In Figma, use <span className="text-foreground/85">File → Save local copy…</span>
              </p>
              <button type="button" onClick={() => input.current?.click()} className="lf-btn lf-btn-primary mt-6">
                Choose a file
              </button>
              <p className="mt-5 font-mono text-[11px] text-muted-foreground/80">Up to {MAX_MB} MB · deleted two hours after upload</p>
              {phase.kind === "error" && (
                <p role="alert" className="mt-5 flex max-w-md items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-left text-[13px] text-destructive">
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {phase.message}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
