import { FileCode2Icon, FolderDownIcon, SparklesIcon, WandSparklesIcon } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { UploadDropzone } from "@/components/app/upload-dropzone";
import { UploadList } from "@/components/app/upload-list";
import { ownerId } from "@/server/owner";
import { listProjects, listUploads } from "@/server/store";
import { uploadView } from "@/server/views";

export const metadata = { title: "Convert a Figma file" };

const steps = [
  { icon: FileCode2Icon, title: "Save a local copy", body: "In Figma, File → Save local copy… gives you the .fig with every layer, font and image." },
  { icon: WandSparklesIcon, title: "Figflow converts it", body: "It finds the frame your app starts on, and the screens, popups and toasts its buttons lead to." },
  { icon: FolderDownIcon, title: "Download the project", body: "A Visual Studio and CMake project for Dear ImGui 1.92, ready to build." },
];

export default async function ConvertPage() {
  const owner = await ownerId();
  const uploads = owner ? await listUploads(owner) : [];
  const views = await Promise.all(uploads.map(async (u) => uploadView(u, await listProjects(u.id))));

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pt-14 pb-24 sm:pt-20">
        <div className="text-center">
          <span className="eyebrow">
            <SparklesIcon aria-hidden /> Convert
          </span>
          <h1 className="mt-3.5 text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-[2.6rem]">
            From Figma to a <span className="text-brand-gradient font-serif font-normal tracking-[-0.01em] italic">working</span> Dear ImGui app.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[14.5px] leading-relaxed text-pretty text-muted-foreground">
            Drop in a .fig and download a C++ project that looks like the design and already works. Figflow does the rest.
          </p>
        </div>

        <div className="mt-10">
          <UploadDropzone />
        </div>

        <ol className="mt-6 grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="rounded-panel border border-[#1c1c1c] bg-[#0b0b0b] p-4">
              <div className="flex items-center gap-2 text-[12.5px] font-medium">
                <span className="grid size-5 place-items-center rounded-full bg-[#1a1a1a] font-mono text-[10.5px] text-neutral-400">{i + 1}</span>
                {s.title}
              </div>
              <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>

        <UploadList uploads={views} />
      </main>
    </>
  );
}
