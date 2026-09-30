"use client";

import { Code2Icon, EyeIcon } from "lucide-react";
import type { AppElement, ProjectManifest } from "@/lib/app-types";
import { ELEMENT_KINDS, bare } from "./element-kinds";

/** Every control, grouped by the screen or popup that draws it, with the variable and function behind it. */
export function ElementsPane({ manifest, onShow, onCode }: { manifest: ProjectManifest; onShow: (index: number) => void; onCode: (el: AppElement) => void }) {
  const units = manifest.units.filter((u) => u.kind !== "toast");
  return (
    <div className="scroll-dark h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl p-5">
        <p className="mb-5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Controls are recognized by how they look. Each keeps its value in <code className="font-mono text-foreground/85">app::state()</code> and calls a function in{" "}
          <code className="font-mono text-foreground/85">src/app/actions.cpp</code>, where your logic goes.
        </p>
        {units.map((u) => {
          const rows = manifest.elements.map((e, i) => ({ e, i })).filter(({ e }) => e.unit.kind === u.kind && e.unit.ident === u.ident);
          if (!rows.length) return null;
          return (
            <section key={`${u.kind}-${u.ident}`} className="mb-6">
              <h3 className="mb-2 flex items-baseline gap-2 text-[13px] font-medium">
                {u.name}
                <span className="font-mono text-[11px] font-normal text-muted-foreground">
                  {u.kind} · {rows.length}
                </span>
              </h3>
              <div className="overflow-hidden rounded-panel border border-[#1c1c1c]">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="bg-[#101010] text-[11.5px] text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-normal">Control</th>
                      <th className="px-3 py-2 font-normal">Value</th>
                      <th className="px-3 py-2 font-normal">Calls</th>
                      <th className="hidden px-3 py-2 font-normal md:table-cell">Does</th>
                      <th className="w-20 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#181818]">
                    {rows.map(({ e, i }) => {
                      const K = ELEMENT_KINDS[e.kind];
                      return (
                        <tr key={i} className="group transition-colors hover:bg-[#0f0f0f]">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <K.icon className="size-3.5 shrink-0 text-neutral-400" aria-hidden />
                              <span className="min-w-0 truncate">{bare(e.name)}</span>
                              <span className="shrink-0 text-[11px] text-muted-foreground">{K.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-[11.5px] text-foreground/80">{e.state ? `state.${e.state}` : <span className="text-muted-foreground/60">none</span>}</td>
                          <td className="px-3 py-2 font-mono text-[11.5px] text-foreground/80">{e.action ? `${e.action}()` : <span className="text-muted-foreground/60">none</span>}</td>
                          <td className="hidden max-w-[280px] truncate px-3 py-2 text-muted-foreground md:table-cell">{e.does ?? (e.disabled ? "disabled in the design" : "")}</td>
                          <td className="px-2 py-1.5">
                            <div className="flex justify-end gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
                              <button type="button" onClick={() => onShow(i)} className="grid size-7 place-items-center rounded-md hover:bg-[#181818]" aria-label={`Show ${bare(e.name)} in the preview`}>
                                <EyeIcon className="size-3.5" />
                              </button>
                              <button type="button" onClick={() => onCode(e)} className="grid size-7 place-items-center rounded-md hover:bg-[#181818]" aria-label={`Show the code of ${bare(e.name)}`}>
                                <Code2Icon className="size-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
        {!manifest.elements.length && <p className="py-16 text-center text-[13px] text-muted-foreground">No controls were recognized in this design; everything is drawn as it looks.</p>}
      </div>
    </div>
  );
}
