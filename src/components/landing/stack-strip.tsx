import { AppWindowIcon, GpuIcon, type LucideIcon } from "lucide-react";
import { marks, type BrandMark } from "@/components/brand/marks";

/**
 * What the generated projects are built with, each with its real logo where
 * one exists. Dear ImGui and DirectX publish no emblem, so they get a neutral
 * icon rather than a made-up mark.
 */
const items: Array<{ label: string; mark?: BrandMark; icon?: LucideIcon }> = [
  { label: "Dear ImGui 1.92", icon: AppWindowIcon },
  { label: "C++20", mark: marks.cplusplus },
  { label: "Visual Studio 2022", mark: marks.visualStudio },
  { label: "CMake", mark: marks.cmake },
  { label: "DirectX 11", icon: GpuIcon },
  { label: "Win32", mark: marks.windows },
  { label: "Figma .fig", mark: marks.figma },
];

function ItemIcon({ mark, icon: Icon }: { mark?: BrandMark; icon?: LucideIcon }) {
  if (mark) {
    return (
      <svg viewBox={mark.viewBox} className="size-[18px] shrink-0" fill="currentColor" aria-hidden>
        <path d={mark.path} />
      </svg>
    );
  }
  return Icon ? <Icon className="size-[18px] shrink-0" strokeWidth={1.75} aria-hidden /> : null;
}

/** Slides past on the page itself; hover pauses it. */
export function StackStrip() {
  const row = [...items, ...items];
  return (
    <section aria-label="Generates projects for" className="relative py-7">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5">
        <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:block">Generates</span>
        <div className="fade-x group relative flex-1 overflow-hidden">
          <div className="flex w-max animate-marquee gap-12 group-hover:[animation-play-state:paused]">
            {row.map((t, i) => (
              <span
                key={`${t.label}-${i}`}
                aria-hidden={i >= items.length || undefined}
                className="flex items-center gap-2.5 text-[14px] font-medium whitespace-nowrap text-foreground/80"
              >
                <span className="text-white">
                  <ItemIcon mark={t.mark} icon={t.icon} />
                </span>
                {t.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
