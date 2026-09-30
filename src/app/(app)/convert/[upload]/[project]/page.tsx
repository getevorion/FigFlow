import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
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
    <div className="flex h-dvh flex-col">
      <AppHeader>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-50" aria-hidden />
          <Link href="/convert" className="hover:text-foreground">
            Convert
          </Link>
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-50" aria-hidden />
          <Link href={`/convert/${upload}`} className="truncate hover:text-foreground">
            {found.upload.design?.name ?? found.upload.fileName}
          </Link>
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-50" aria-hidden />
          <span className="truncate font-mono text-foreground/90">{view.manifest?.name ?? view.name ?? "Converting…"}</span>
        </nav>
      </AppHeader>
      <Workspace initial={view} upload={upload} start={start} />
    </div>
  );
}
