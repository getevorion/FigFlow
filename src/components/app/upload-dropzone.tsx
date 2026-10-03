"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircleIcon, FileUpIcon, LoaderIcon, XIcon } from "lucide-react";
import { formatBytes } from "@/lib/app-format";
import type { UploadView } from "@/lib/app-types";
import { cn } from "@/lib/utils";
import { pollDelays } from "./use-poll";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; name: string; sent: number; total: number; rate: number }
  | { kind: "reading"; name: string; detail: string }
  | { kind: "error"; message: string };

const MAX_MB = 512;

export function UploadDropzone() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const xhr = useRef<XMLHttpRequest | null>(null);
  const abortUpload = useRef<AbortController | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [over, setOver] = useState(false);

  useEffect(
    () => () => {
      xhr.current?.abort();
      abortUpload.current?.abort();
    },
    [],
  );

  const waitForReading = useCallback(
    async (id: string, name: string) => {
      setPhase({ kind: "reading", name, detail: "Parsing the design file…" });
      const delays = pollDelays(500);
      let polls = 0;
      for (const delay of delays) {
        if (++polls > 120) return setPhase({ kind: "error", message: "This is taking too long. Try again or use a smaller .fig." });
        await new Promise((r) => setTimeout(r, delay));
        const res = await fetch(`/api/uploads/${id}`, { cache: "no-store" }).catch(() => null);
        if (!res) continue;
        const up = (await res.json()) as UploadView & { error?: string };
        if (!res.ok) return setPhase({ kind: "error", message: up.error ?? "The upload disappeared." });
        if (up.state === "failed") return setPhase({ kind: "error", message: up.error ?? "Figflow couldn't read this file." });
        if (up.state === "reading") continue;
        if (up.state === "ready") {
          const project = up.projects?.[0];
          setPhase({ kind: "reading", name, detail: project ? "Generating C++ project…" : "Opening converter…" });
          if (project) return router.push(`/convert/${id}/${project.id}`);
          return router.push(`/convert/${id}`);
        }
      }
    },
    [router],
  );

  const start = useCallback(
    async (file: File) => {
      if (!/\.fig$/i.test(file.name)) return setPhase({ kind: "error", message: "That isn't a .fig file. In Figma, use File → Save local copy… to get one." });
      if (file.size > MAX_MB * 1024 * 1024) return setPhase({ kind: "error", message: `The file is ${formatBytes(file.size)}; the limit is ${MAX_MB} MB.` });

      const healthRes = await fetch("/api/health", { cache: "no-store" }).catch(() => null);
      let storage: string = "disk";
      if (healthRes?.ok) {
        const health = (await healthRes.json()) as { storage?: string };
        storage = health.storage ?? "disk";
      }
      if (storage === "blob") {
        const t0 = performance.now();
        const ac = new AbortController();
        abortUpload.current = ac;
        setPhase({ kind: "uploading", name: file.name, sent: 0, total: file.size, rate: 0 });
        const init = await fetch("/api/uploads/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, declared: file.size }),
          signal: ac.signal,
        }).catch(() => null);
        if (!init?.ok) {
          abortUpload.current = null;
          const err = init ? ((await init.json().catch(() => ({}))) as { error?: string }).error : undefined;
          return setPhase({ kind: "error", message: err ?? "Couldn't start the upload." });
        }
        const { id, pathname } = (await init.json()) as { id: string; pathname: string };
        try {
          const { upload } = await import("@vercel/blob/client");
          await upload(pathname, file, {
            access: "private",
            handleUploadUrl: "/api/uploads/client",
            clientPayload: JSON.stringify({ id, fileName: file.name, declared: file.size }),
            multipart: file.size > 8 * 1024 * 1024,
            abortSignal: ac.signal,
            onUploadProgress: ({ loaded, total }) => {
              const secs = (performance.now() - t0) / 1000;
              setPhase({
                kind: "uploading",
                name: file.name,
                sent: loaded,
                total: total || file.size,
                rate: secs > 0.2 ? loaded / secs : 0,
              });
            },
          });
        } catch (e) {
          abortUpload.current = null;
          if (ac.signal.aborted) return setPhase({ kind: "idle" });
          return setPhase({ kind: "error", message: e instanceof Error ? e.message : "The upload failed." });
        }
        abortUpload.current = null;
        void waitForReading(id, file.name);
        return;
      }

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
          /* plain error body */
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
      className={cn("kv-card transition-colors", over && "ring-2 ring-[var(--kv-accent)]/25")}
    >
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
      <div className="flex min-h-[220px] flex-col items-center justify-center px-6 py-10 text-center">
        {phase.kind === "uploading" || phase.kind === "reading" ? (
          <div className="w-full max-w-md">
            <div className="mx-auto mb-4 grid size-10 place-items-center">
              <LoaderIcon className="size-5 animate-spin text-[var(--kv-accent)]" aria-hidden />
            </div>
            <p className="truncate text-[14px] font-medium">{phase.name}</p>
            {phase.kind === "uploading" ? (
              <>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--kv-border-subtle)]" role="progressbar" aria-valuenow={phase.sent} aria-valuemax={phase.total}>
                  <div className="h-full rounded-full bg-[var(--kv-accent)] transition-[width] duration-200" style={{ width: `${(100 * phase.sent) / Math.max(1, phase.total)}%` }} />
                </div>
                <div className="mt-2 flex justify-between font-mono text-[11px] text-[var(--kv-text-muted)]">
                  <span>
                    {formatBytes(phase.sent)} / {formatBytes(phase.total)}
                  </span>
                  <span>{phase.rate > 0 ? `${formatBytes(phase.rate)}/s` : "…"}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    xhr.current?.abort();
                    abortUpload.current?.abort();
                  }}
                  className="btn-secondary mt-4 gap-1"
                >
                  <XIcon className="size-3.5" aria-hidden /> Cancel
                </button>
              </>
            ) : (
              <p className="mt-2 text-[13px] text-[var(--kv-text-subtle)]">{phase.detail}</p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-4 grid size-11 place-items-center rounded-[10px] bg-[var(--kv-accent-soft)] text-[var(--kv-accent)]">
              <FileUpIcon className="size-5" strokeWidth={1.5} aria-hidden />
            </div>
            <p className="text-[15px] font-medium">Drop your .fig here</p>
            <p className="mt-1 text-[13px] text-[var(--kv-text-subtle)]">Figma → File → Save local copy…</p>
            <button type="button" onClick={() => input.current?.click()} className="btn-primary mt-5">
              Choose file
            </button>
            <p className="mt-4 font-mono text-[11px] text-[var(--kv-text-muted)]">Up to {MAX_MB} MB</p>
            {phase.kind === "error" && (
              <p role="alert" className="mt-4 flex max-w-md items-start gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2 text-left text-[13px] text-red-700">
                <AlertCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {phase.message}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
