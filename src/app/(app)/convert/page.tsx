import { FileCode2Icon, FolderDownIcon, SparklesIcon, WandSparklesIcon } from "lucide-react";
import { AppHeader } from "@/components/app/app-header";
import { UploadDropzone } from "@/components/app/upload-dropzone";
import { UploadList } from "@/components/app/upload-list";
import { ownerId } from "@/server/owner";
import { listProjects, listUploads } from "@/server/store";
import { uploadView } from "@/server/views";

export const metadata = { title: "Convert a Figma file" };

const steps = [
  { icon: FileCode2Icon, title: "Grab the .fig", body: "Figma's File → Save local copy… gives you one file with every layer, font and image in it." },
  { icon: WandSparklesIcon, title: "Drop it in", body: "Figflow finds the screen your app opens on, every other screen, and the popups and toasts they use." },
  { icon: FolderDownIcon, title: "Build and run", body: "The ZIP opens in Visual Studio 2022 or builds with CMake. Dear ImGui 1.92 is included." },
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
            Turn a <span className="text-brand-gradient font-serif font-normal tracking-[-0.01em] italic">.fig</span> into Dear ImGui.
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[14.5px] leading-relaxed text-pretty text-muted-foreground">
            Give Figflow your design file and it writes the C++: widgets, screens, popups and toasts, ready to build.
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
