"use client";

import { useCallback, useState } from "react";
import { ImageOffIcon } from "lucide-react";
import type { FrameSummary } from "@/lib/app-types";
import { frameParam } from "@/lib/app-types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Partial<Record<FrameSummary["kind"], string>> = {
  COMPONENT: "Component",
  COMPONENT_SET: "Variants",
  INSTANCE: "Instance",
  GROUP: "Group",
};

/** A frame's thumbnail (rendered on first request), sized to its proportions. */
export function FrameThumb({ upload, frame, className }: { upload: string; frame: FrameSummary; className?: string }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  // An image can finish before hydration, when onLoad isn't listening yet.
  const seen = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) setState(img.naturalWidth > 0 ? "ready" : "failed");
  }, []);
  return (
    <div className={cn("relative aspect-[16/10] w-full overflow-hidden bg-[repeating-conic-gradient(#101010_0%_25%,#0b0b0b_0%_50%)] bg-[length:14px_14px]", className)}>
      {state === "loading" && <div className="animate-shimmer absolute inset-0 bg-[linear-gradient(110deg,transparent_25%,rgb(255_255_255/0.06)_50%,transparent_75%)] bg-[length:200%_100%]" />}
      {state === "failed" ? (
        <div className="absolute inset-0 grid place-items-center text-muted-foreground">
          <ImageOffIcon className="size-5" aria-label="No preview" />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- rendered per upload, private: next/image can't cache it
        <img
          ref={seen}
          src={`/api/uploads/${upload}/frames/${frameParam(frame.id)}/thumb`}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setState("ready")}
          onError={() => setState("failed")}
          className={cn("absolute inset-0 size-full object-contain p-1.5 transition-opacity duration-500", state === "ready" ? "opacity-100" : "opacity-0")}
        />
      )}
    </div>
  );
}

export function FrameCard({ upload, frame, selected, picked, onSelect }: { upload: string; frame: FrameSummary; selected: boolean; picked?: boolean; onSelect: () => void }) {
  const kind = KIND_LABEL[frame.kind];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-panel border text-left transition-[border-color] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-[#5c5c5c] ring-1 ring-[#5c5c5c]"
          : "border-[#1c1c1c] hover:border-[#333333]",
      )}
    >
      <FrameThumb upload={upload} frame={frame} />
      <div className="flex items-center gap-2 border-t border-[#1c1c1c] bg-[#0b0b0b] px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{frame.name.trim() || "Untitled"}</p>
          <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
            {Math.round(frame.width)} × {Math.round(frame.height)}
            {frame.section ? ` · ${frame.section}` : ""}
          </p>
        </div>
        {picked ? (
          <span className="shrink-0 rounded-full border border-[#333333] bg-[#161616] px-2 py-0.5 text-[10.5px] text-foreground/80">Figflow&apos;s pick</span>
        ) : (
          kind && <span className="shrink-0 rounded-full border border-[#262626] bg-[#131313] px-2 py-0.5 text-[10.5px] text-muted-foreground">{kind}</span>
        )}
      </div>
    </button>
  );
}
