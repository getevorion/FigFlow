import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { FramePicker } from "@/components/app/frame-picker";
import { ownedUpload } from "@/server/convert";
import { listProjects } from "@/server/store";
import { uploadView } from "@/server/views";

export const metadata = { title: "Start frame" };

/**
 * An upload opens on its latest project: Figflow picks the start frame and
 * converts on its own. With ?pick (or when it couldn't pick), the frames are
 * shown to choose another start from.
 */
export default async function UploadPage({ params, searchParams }: PageProps<"/convert/[upload]">) {
  const { upload } = await params;
  const query = await searchParams;
  const rec = await ownedUpload(upload);
  if (!rec) notFound();
  const projects = await listProjects(upload);
  if (projects[0] && !("pick" in query)) redirect(`/convert/${upload}/${projects[0].id}`);
  const view = uploadView(rec, projects);
  const current = typeof query.from === "string" ? projects.find((p) => p.id === query.from)?.frame : undefined;
  return (
    <div className="flex h-dvh flex-col">
      <AppHeader>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-50" aria-hidden />
          <Link href="/convert" className="hover:text-foreground">
            Convert
          </Link>
          <ChevronRightIcon className="size-3.5 shrink-0 opacity-50" aria-hidden />
          <span className="truncate text-foreground/90">{view.design?.name ?? view.fileName}</span>
        </nav>
      </AppHeader>
      <FramePicker upload={view} current={current} />
    </div>
  );
}
