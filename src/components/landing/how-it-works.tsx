import { CheckIcon, DownloadIcon, FileArchiveIcon, FrameIcon, UploadCloudIcon, WorkflowIcon } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

/** A step: its UI shot on a stage, then the words. */
function StepCard({ n, title, body, children, delay, sky }: { n: string; title: string; body: string; children: React.ReactNode; delay: number; sky?: boolean }) {
  return (
    <Reveal delay={delay} className="panel rounded-card flex flex-col p-3">
      <div className={cn("stage rounded-panel flex h-52 items-center justify-center p-5", sky && "stage-sky")}>{children}</div>
      <div className="px-2.5 pt-4 pb-2">
        <span className="font-mono text-xs text-muted-foreground">{n}</span>
        <h3 className="mt-1.5 text-[15px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </Reveal>
  );
}

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative scroll-mt-10 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="How it works" icon={WorkflowIcon} title="From file to build in a minute.">
          Nothing to install, no API token, no layers to rename.
        </SectionHeading>

        <div className="mt-12 grid gap-5 md:grid-cols-3">
          <StepCard n="01" title="Grab the .fig" body="Figma's File → Save local copy… gives you one file with every layer, font and image in it." delay={0}>
            <div className="bezel bezel-sm w-[228px]">
              <div className="window p-1.5 text-[12px]">
                {["New design file", "Open…", "Save local copy…", "Save to version history", "Export…"].map((item) => (
                  <div
                    key={item}
                    className={
                      item === "Save local copy…"
                        ? "flex items-center justify-between rounded-md bg-brand px-2.5 py-1.5 font-medium text-white"
                        : "rounded-md px-2.5 py-1.5 text-[#c4c5d1]"
                    }
                  >
                    {item}
                    {item === "Save local copy…" && <span className="font-mono text-[10px] opacity-80">.fig</span>}
                  </div>
                ))}
              </div>
            </div>
          </StepCard>

          <StepCard n="02" title="Drop it in" body="Figflow finds the screen your app opens on, every other screen, and the popups and toasts they use." delay={0.08} sky>
            <div className="bezel bezel-sm w-full max-w-[272px]">
              <div className="window p-3">
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/[0.04] px-3 py-2">
                  <UploadCloudIcon className="size-4 text-brand-soft" />
                  <span className="min-w-0 truncate font-mono text-[11.5px] text-[#ececf3]">settings-menu.fig</span>
                  <span className="ml-auto shrink-0 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-[#d4d4dc]">Uploaded</span>
                </div>
                <div className="mt-2.5 space-y-1">
                  {[
                    ["Settings menu", "980 × 680", true],
                    ["Sign in", "804 × 590", false],
                    ["Loading", "420 × 260", false],
                  ].map(([name, size, on]) => (
                    <div key={name as string} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12px] ${on ? "bg-white/[0.08] text-foreground" : "text-muted-foreground"}`}>
                      <FrameIcon className="size-3.5" />
                      {name}
                      <span className="ml-auto font-mono text-[10.5px] text-muted-foreground">{size}</span>
                      {on && <CheckIcon className="size-3.5 text-brand-soft" />}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </StepCard>

          <StepCard n="03" title="Build and run" body="Look over the preview and the code, then build the ZIP in Visual Studio 2022 or with CMake." delay={0.16}>
            <div className="bezel bezel-sm w-full max-w-[260px]">
              <div className="window p-3">
                <div className="font-mono text-[11.5px] leading-6 text-[#b4b5c3]">
                  <div className="flex items-center gap-2 text-[#ececf3]">
                    <FileArchiveIcon className="size-3.5 text-brand-soft" /> SettingsMenu.zip
                  </div>
                  <div className="pl-5">├ SettingsMenu.sln</div>
                  <div className="pl-5">├ ui/components/ · 9 files</div>
                  <div className="pl-5">└ ui/screens/settings.cpp</div>
                </div>
                <div className="bg-brand-gradient mt-2.5 flex items-center justify-between rounded-lg px-3 py-2 text-[12px] font-semibold text-white">
                  Download project <DownloadIcon className="size-4" />
                </div>
              </div>
            </div>
          </StepCard>
        </div>
      </div>
    </section>
  );
}
