import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { Workspace } from "@/components/app/workspace/workspace";
import { ownedProject } from "@/server/convert";
import { projectView } from "@/server/views";

export const metadata = { title: "Project" };

export default async function ProjectPage({ params }: PageProps<"/convert/[upload]/[project]">) {
  const { upload, project } = await params;
  const found = await ownedProject(upload, project);
  if (!found) notFound();
  const view = projectView(found.project, found.upload);
  const frame = found.upload.design?.pages.flatMap((p) => p.frames).find((f) => f.id === view.frame);
  const start = { name: frame?.name.trim() || "the chosen frame", ...(found.upload.start?.frame === view.frame ? { reason: found.upload.start.reason } : {}) };
  return (
    <div className="flex h-full flex-col bg-[var(--kv-bg)]">
      <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-[var(--kv-border)] bg-[var(--kv-surface)] px-5 text-[12px] text-[var(--kv-text-subtle)]">
        <Link href="/convert" className="hover:text-[var(--kv-text)]">
          Convert
        </Link>
        <ChevronRightIcon className="size-3 opacity-50" aria-hidden />
        <Link href={`/convert/${upload}`} className="truncate hover:text-[var(--kv-text)]">
          {found.upload.design?.name ?? found.upload.fileName}
        </Link>
        <ChevronRightIcon className="size-3 opacity-50" aria-hidden />
        <span className="truncate font-medium text-[var(--kv-text)]">{view.manifest?.name ?? view.name ?? "Generating…"}</span>
      </div>
      <Workspace initial={view} upload={upload} start={start} />
    </div>
  );
}
