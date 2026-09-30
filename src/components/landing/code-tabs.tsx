"use client";

import { CheckIcon, CopyIcon, FileCode2Icon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export type CodeTab = { path: string; note: string; html: string; code: string };

/** An editor-style window of generated files. Meant to sit inside a `.bezel`. */
export function CodeTabs({ tabs }: { tabs: CodeTab[] }) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const tab = tabs[active];
  return (
    <div className="window">
      <div className="flex items-end gap-1 border-b border-white/[0.08] bg-[#0b0b0f] pr-2 pl-4">
        <div className="mr-3 flex shrink-0 gap-1.5 self-center" aria-hidden>
          <span className="size-2.5 rounded-full bg-white/[0.14]" />
          <span className="size-2.5 rounded-full bg-white/[0.14]" />
          <span className="size-2.5 rounded-full bg-white/[0.14]" />
        </div>
        <div className="scroll-dark flex min-w-0 flex-1 items-end gap-0.5 overflow-x-auto overflow-y-hidden pt-2" role="tablist" data-lenis-prevent>
          {tabs.map((t, i) => (
            <button
              key={t.path}
              role="tab"
              aria-selected={i === active}
              onClick={() => setActive(i)}
              className={cn(
                "relative -mb-px flex items-center gap-2 rounded-t-lg border border-b-0 px-3.5 py-2.5 font-mono text-[12px] whitespace-nowrap transition-colors",
                i === active ? "border-white/[0.1] bg-[#050507] text-white" : "border-transparent text-foreground/55 hover:text-foreground",
              )}
            >
              <FileCode2Icon className={cn("size-3.5", i === active ? "text-brand-soft" : "")} />
              {t.path}
              {i === active && <span className="bg-brand-gradient absolute inset-x-2 -top-px h-[2px] rounded-full" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(tab.code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          className="mb-1.5 ml-2 flex shrink-0 items-center gap-1.5 self-center rounded-lg border border-white/[0.08] bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-foreground/75 transition-colors hover:bg-white/[0.08] hover:text-white"
          aria-label="Copy code"
        >
          {copied ? <CheckIcon className="size-3.5 text-brand-soft" /> : <CopyIcon className="size-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="border-b border-white/[0.06] px-5 py-3 text-[12.5px] text-foreground/65">{tab.note}</p>
      <div
        data-lenis-prevent
        className="scroll-dark max-h-[440px] overflow-auto px-5 py-4 font-mono text-[12px] leading-[1.7] [&_pre]:!bg-transparent [&_code]:[counter-reset:line] [&_.line]:before:mr-5 [&_.line]:before:inline-block [&_.line]:before:w-6 [&_.line]:before:text-right [&_.line]:before:text-[#3f4152] [&_.line]:before:content-[counter(line)] [&_.line]:before:[counter-increment:line]"
        dangerouslySetInnerHTML={{ __html: tab.html }}
      />
    </div>
  );
}
