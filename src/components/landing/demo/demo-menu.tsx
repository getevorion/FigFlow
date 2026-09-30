"use client";

import { motion } from "motion/react";
import { Gamepad2Icon, GaugeIcon, EyeIcon, Volume2Icon, UserRoundIcon, SaveIcon, XIcon, MinusIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useDemo } from "./context";
import { Checkbox, Dropdown, Keybind, Slider, Swatches, Toggle } from "./widgets";

const PAGES = [
  { id: "general", label: "General", icon: GaugeIcon },
  { id: "visuals", label: "Visuals", icon: EyeIcon },
  { id: "audio", label: "Audio", icon: Volume2Icon },
  { id: "controls", label: "Controls", icon: Gamepad2Icon },
  { id: "profile", label: "Profile", icon: UserRoundIcon },
] as const;
type PageId = (typeof PAGES)[number]["id"];

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[12px] border border-white/[0.06] bg-white/[0.025] p-3">
      <h4 className="mb-1.5 text-[11px] font-medium text-[#7c7f8f]">{title}</h4>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function PageContent({ page }: { page: PageId }) {
  switch (page) {
    case "general":
      return (
        <>
          <Panel title="Application">
            <Toggle label="Start with Windows" />
            <Toggle label="Check for updates" defaultOn />
            <Dropdown label="Language" options={["English", "Deutsch", "Español", "日本語"]} />
          </Panel>
          <Panel title="Performance">
            <Slider label="Frame limit" min={30} max={240} defaultValue={144} unit=" fps" />
            <Checkbox label="Low latency mode" defaultOn />
            <Checkbox label="Pause when unfocused" />
          </Panel>
        </>
      );
    case "visuals":
      return (
        <>
          <Panel title="Display">
            <Toggle label="V-Sync" defaultOn />
            <Toggle label="HDR" />
            <Slider label="Field of view" min={60} max={120} defaultValue={90} unit="°" />
            <Dropdown label="Quality" options={["Low", "Medium", "High", "Ultra"]} defaultIndex={2} />
          </Panel>
          <Panel title="Overlay">
            <Checkbox label="Show FPS" defaultOn />
            <Checkbox label="Show ping" />
            <Keybind label="Toggle menu" defaultKey="Insert" />
            <Swatches label="Accent" />
          </Panel>
        </>
      );
    case "audio":
      return (
        <>
          <Panel title="Mix">
            <Slider label="Master" min={0} max={100} defaultValue={80} unit="%" />
            <Slider label="Effects" min={0} max={100} defaultValue={65} unit="%" />
            <Slider label="Voice" min={0} max={100} defaultValue={100} unit="%" />
          </Panel>
          <Panel title="Device">
            <Dropdown label="Output" options={["Speakers", "Headset", "HDMI"]} defaultIndex={1} />
            <Toggle label="Spatial audio" defaultOn />
            <Checkbox label="Mute in background" defaultOn />
          </Panel>
        </>
      );
    case "controls":
      return (
        <>
          <Panel title="Bindings">
            <Keybind label="Toggle menu" defaultKey="Insert" />
            <Keybind label="Screenshot" defaultKey="F12" />
            <Keybind label="Push to talk" defaultKey="V" />
          </Panel>
          <Panel title="Mouse">
            <Slider label="Sensitivity" min={1} max={100} defaultValue={42} />
            <Toggle label="Raw input" defaultOn />
            <Checkbox label="Invert Y" />
          </Panel>
        </>
      );
    case "profile":
      return (
        <>
          <Panel title="Account">
            <Dropdown label="Region" options={["Europe", "N. America", "Asia"]} />
            <Toggle label="Show online status" defaultOn />
            <Swatches label="Accent" />
          </Panel>
          <Panel title="Privacy">
            <Checkbox label="Share crash reports" defaultOn />
            <Checkbox label="Allow friend requests" defaultOn />
            <Toggle label="Streamer mode" />
          </Panel>
        </>
      );
  }
}

export function DemoMenu() {
  const { accent, setHover } = useDemo();
  const [page, setPage] = useState<PageId>("visuals");
  const [toasts, setToasts] = useState<number[]>([]);
  const toastId = useRef(0);

  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((list) => list.slice(1)), 3200);
    return () => clearTimeout(t);
  }, [toasts]);

  return (
    <div
      className="window w-full text-left"
      style={{ ["--acc" as string]: accent.color, ["--on-acc" as string]: accent.on }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_20%_0%,color-mix(in_oklab,var(--acc)_9%,transparent),transparent_70%)]" />
      <div className="relative flex min-h-[420px]">
        {/* Sidebar */}
        <aside className="flex w-[58px] shrink-0 flex-col border-r border-white/[0.05] bg-black/20 p-2.5 sm:w-[168px] sm:p-3">
          <div className="mb-5 flex items-center justify-center gap-2 pt-1 sm:justify-start sm:px-1.5">
            <span className="grid size-6 place-items-center rounded-[7px] bg-[var(--acc)] text-[11px] font-bold text-[var(--on-acc)]">N</span>
            <span className="hidden text-[13px] font-semibold text-[#eeeef5] sm:inline">Nova</span>
          </div>
          <nav className="relative flex flex-col gap-0.5" onPointerEnter={() => setHover("nav")} onPointerLeave={() => setHover(null)}>
            {PAGES.map((p) => {
              const active = p.id === page;
              const Icon = p.icon;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPage(p.id)}
                  className={cn(
                    "relative flex h-8 items-center justify-center gap-2.5 rounded-[9px] px-2.5 text-[12.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--acc)]/50 sm:justify-start",
                    active ? "text-[#f3f3f8]" : "text-[#8a8c9c] hover:text-[#c8c9d6]",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="demo-nav-pill"
                      className="absolute inset-0 rounded-[9px] bg-[color-mix(in_oklab,var(--acc)_13%,transparent)]"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                    >
                      <span className="absolute top-2 bottom-2 -left-3 w-[3px] rounded-r-full bg-[var(--acc)]" />
                    </motion.span>
                  )}
                  <Icon className={cn("relative size-[15px]", active ? "text-[var(--acc)]" : "")} strokeWidth={2} />
                  <span className="relative hidden sm:inline">{p.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="mt-auto flex items-center justify-center gap-2 rounded-[10px] border-white/[0.05] bg-white/[0.02] p-1.5 sm:justify-start sm:border sm:p-2">
            <span className="size-6 rounded-full bg-gradient-to-br from-[var(--acc)] to-white/30" />
            <div className="hidden min-w-0 leading-tight sm:block">
              <div className="truncate text-[11.5px] text-[#e6e6ef]">player_01</div>
              <div className="text-[10px] text-[#7c7f8f]">Pro · 212 days</div>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <div>
              <h3 className="text-[15px] font-semibold text-[#f3f3f8]">{PAGES.find((p) => p.id === page)?.label}</h3>
              <p className="text-[11px] text-[#7c7f8f]">Changes apply instantly</p>
            </div>
            <div className="flex items-center gap-1">
              <span className="grid size-6 place-items-center rounded-md text-[#7c7f8f] hover:bg-white/5">
                <MinusIcon className="size-3.5" />
              </span>
              <span className="grid size-6 place-items-center rounded-md text-[#7c7f8f] hover:bg-white/5">
                <XIcon className="size-3.5" />
              </span>
            </div>
          </header>
          <motion.div
            key={page}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="grid flex-1 gap-2.5 px-4 pb-3 sm:grid-cols-2"
          >
            <PageContent page={page} />
          </motion.div>
          <footer className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2.5">
            <span className="hidden font-mono text-[10px] text-[#7c7f8f] sm:inline">nova.cfg · saved 2m ago</span>
            <button
              type="button"
              onPointerEnter={() => setHover("button")}
              onPointerLeave={() => setHover(null)}
              onClick={() => setToasts((list) => [...list.slice(-2), ++toastId.current])}
              className="ml-auto flex h-7 items-center gap-1.5 rounded-[8px] bg-[var(--acc)] px-3 text-[11.5px] font-semibold whitespace-nowrap text-[var(--on-acc)] transition-transform hover:brightness-110 active:scale-[0.97]"
            >
              <SaveIcon className="size-3.5" />
              Save config
            </button>
          </footer>
        </div>
      </div>

      {/* Toasts */}
      <div className="pointer-events-none absolute right-3 bottom-14 flex w-[210px] flex-col gap-2">
        {toasts.map((id) => (
          <motion.div
            key={id}
            layout
            initial={{ opacity: 0, x: 24, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            className="overflow-hidden rounded-[10px] border border-white/10 bg-[#16161c]/95 shadow-xl backdrop-blur"
            onPointerEnter={() => setHover("toast")}
          >
            <div className="px-3 pt-2.5 pb-2">
              <div className="text-[11.5px] font-medium text-[#eeeef5]">Config saved</div>
              <div className="text-[10.5px] text-[#7c7f8f]">nova.cfg is active</div>
            </div>
            <motion.div className="h-[2px] bg-[var(--acc)]" initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: 3.2, ease: "linear" }} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
