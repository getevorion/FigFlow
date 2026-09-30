"use client";

import { MousePointerClickIcon } from "lucide-react";
import { DemoProvider } from "./context";
import { DemoMenu } from "./demo-menu";
import { Desktop } from "./desktop";
import { FilesCard, LayersCard } from "./mapping-cards";

/** Figma layers → the working menu → the generated files, linked by hover, on a desktop. */
export function HeroDemo() {
  return (
    <DemoProvider>
      <div className="mx-auto w-full max-w-[1136px]">
        <Desktop className="px-3 py-8 sm:px-8 sm:py-10 xl:pt-12 xl:pb-14">
          {/* The side panels tuck over the window's edges, where it has only padding (about 22 px of its 668 on each side). */}
          <div className="relative mx-auto w-full max-w-[1072px]">
            <div className="relative mx-auto max-w-[680px]">
              <div className="bezel bezel-hero">
                <DemoMenu />
              </div>
            </div>
            <LayersCard className="absolute top-6 left-0 z-20 hidden w-[224px] -rotate-[2.5deg] xl:block" />
            <FilesCard className="absolute -top-6 right-0 z-20 hidden w-[224px] rotate-[2deg] xl:block" />
          </div>
        </Desktop>
        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-foreground/70">
          <MousePointerClickIcon className="size-3.5 text-brand-soft" />
          A generated menu. Every control works.
        </p>
      </div>
    </DemoProvider>
  );
}
