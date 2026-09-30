"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRightIcon, FileIcon, LoaderIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { ago, formatBytes, plural, timeLeft } from "@/lib/app-format";
import type { UploadView } from "@/lib/app-types";
import { useNow } from "./use-now";

/** This browser's uploads from the last two hours, each with the time it has left. */
export function UploadList({ uploads }: { uploads: UploadView[] }) {
  const router = useRouter();
  const now = useNow();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());

  const remove = async (id: string) => {
    setDeleting(id);
    const res = await fetch(`/api/uploads/${id}`, { method: "DELETE" }).catch(() => null);
    setDeleting(null);
    if (!res || (!res.ok && res.status !== 404)) return toast.error("Couldn't delete the file. Try again.");
    setRemoved((r) => new Set(r).add(id));
    toast.success("Deleted, with everything made from it.");
    router.refresh();
  };

  // Rendered once the clock is known (after hydration): every line here is relative to it.
  if (now === null) return null;
  const live = uploads.filter((u) => u.expiresAt > now && !removed.has(u.id));
  if (!live.length) return null;
  return (
    <section aria-labelledby="your-files" className="mt-12">
      <div className="mb-3 flex items-baseline justify-between px-1">
        <h2 id="your-files" className="text-[14px] font-medium">
          Your files
        </h2>
        <span className="text-[12px] text-muted-foreground">Only this browser can see them</span>
      </div>
      <ul className="border border-[#1c1c1c] bg-[#0b0b0b] divide-y divide-[#1c1c1c] overflow-hidden rounded-card">
        <AnimatePresence initial={false}>
          {live.map((u) => {
            const frames = u.design?.pages.reduce((n, p) => n + p.frames.length, 0) ?? 0;
            return (
              <motion.li key={u.id} layout exit={{ opacity: 0, height: 0 }} className="flex items-center gap-3.5 px-4 py-3.5">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#141414] ring-1 ring-[#262626]">
                  <FileIcon className="size-4 text-neutral-400" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{u.design?.name ?? u.fileName}</p>
                  <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                    {formatBytes(u.size)} · {u.state === "ready" ? plural(frames, "frame") : u.state === "reading" ? "reading…" : "couldn't be read"}
                    {u.projects?.length ? ` · ${plural(u.projects.length, "project")}` : ""} · uploaded {ago(u.createdAt, now)} · deleted {timeLeft(u.expiresAt, now)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(u.id)}
                  disabled={deleting === u.id}
                  className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
                  aria-label={`Delete ${u.fileName}`}
                >
                  {deleting === u.id ? <LoaderIcon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
                </button>
                {u.state === "ready" && (
                  <Link href={`/convert/${u.id}`} className="lf-btn lf-btn-ghost lf-btn-sm">
                    Open <ArrowRightIcon className="size-3.5" aria-hidden />
                  </Link>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}
