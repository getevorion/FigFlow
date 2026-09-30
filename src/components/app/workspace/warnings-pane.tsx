import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import type { ProjectManifest } from "@/lib/app-types";

const TOPIC: Record<string, string> = {
  flow: "Screens and popups",
  control: "Controls",
  font: "Fonts",
  "shadows-limit": "Effects",
};

/** What may not look or behave exactly like the design, grouped by topic. */
export function WarningsPane({ warnings }: { warnings: ProjectManifest["warnings"] }) {
  if (!warnings.length)
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <CheckCircle2Icon className="size-7 text-emerald-300/80" aria-hidden />
        <p className="mt-3 text-[14px] font-medium">Nothing to report</p>
        <p className="mt-1 text-[12.5px] text-muted-foreground">Every layer was converted as designed.</p>
      </div>
    );
  const groups = new Map<string, ProjectManifest["warnings"]>();
  for (const w of warnings) {
    const topic = TOPIC[w.code] ?? "Layers";
    groups.set(topic, [...(groups.get(topic) ?? []), w]);
  }
  return (
    <div className="scroll-dark h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-5">
        {[...groups].map(([topic, list]) => (
          <section key={topic}>
            <h3 className="mb-2 text-[13px] font-medium">
              {topic} <span className="font-mono text-[11px] font-normal text-muted-foreground">{list.length}</span>
            </h3>
            <ul className="space-y-2">
              {list.map((w, i) => (
                <li key={i} className="flex gap-2.5 rounded-panel border border-[#1c1c1c] bg-[#0b0b0b] px-3.5 py-2.5 text-[12.5px] leading-relaxed">
                  <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-300/80" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-foreground/90">{w.message}</p>
                    {w.node && <p className="mt-0.5 text-[11.5px] text-muted-foreground">Layer: {w.node}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
