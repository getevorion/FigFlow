"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRightIcon, LoaderIcon, Trash2Icon } from "lucide-react";
import { FigUploadIcon } from "@/components/app/workspace/file-icon";
import { toast } from "sonner";
import { ago, formatBytes, plural, timeLeft } from "@/lib/app-format";
import type { UploadView } from "@/lib/app-types";
import { useNow } from "./use-now";

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
    toast.success("Deleted.");
    router.refresh();
  };

  if (now === null) return null;
  const live = uploads.filter((u) => u.expiresAt > now && !removed.has(u.id));
  if (!live.length) return null;

  return (
    <section aria-labelledby="your-files" className="space-y-2">
      <div className="flex items-baseline justify-between px-0.5">
        <h2 id="your-files" className="kv-label">
          Recent uploads
        </h2>
        <span className="text-[12px] text-[var(--kv-text-muted)]">This browser only</span>
      </div>
      <div className="kv-card !p-0 overflow-hidden">
        <ul className="divide-y divide-[var(--kv-border-subtle)]">
          {live.map((u) => {
            const frames = u.design?.pages.reduce((n, p) => n + p.frames.length, 0) ?? 0;
            return (
              <li key={u.id} className="flex items-center gap-3 px-4 py-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[var(--kv-bg)] ring-1 ring-[var(--kv-border-subtle)]">
                  <FigUploadIcon size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{u.design?.name ?? u.fileName}</p>
                  <p className="mt-0.5 truncate text-[12px] text-[var(--kv-text-subtle)]">
                    {formatBytes(u.size)} · {u.state === "ready" ? plural(frames, "frame") : u.state === "reading" ? "reading…" : "failed"}
                    {u.projects?.length ? ` · ${plural(u.projects.length, "project")}` : ""} · {ago(u.createdAt, now)} · expires {timeLeft(u.expiresAt, now)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(u.id)}
                  disabled={deleting === u.id}
                  className="grid size-8 place-items-center rounded-[10px] text-[var(--kv-text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                  aria-label={`Delete ${u.fileName}`}
                >
                  {deleting === u.id ? <LoaderIcon className="size-4 animate-spin" /> : <Trash2Icon className="size-4" />}
                </button>
                {u.state === "ready" && (
                  <Link href={u.projects?.[0] ? `/convert/${u.id}/${u.projects[0].id}` : `/convert/${u.id}`} className="btn-secondary !h-8 !px-2.5 text-[12px]">
                    Open <ArrowRightIcon className="size-3" aria-hidden />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
