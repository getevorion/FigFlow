"use client";

import { Code2Icon, EyeIcon } from "lucide-react";
import type { AppElement, ProjectManifest } from "@/lib/app-types";
import { ELEMENT_KINDS, bare } from "./element-kinds";

export function ElementsPane({ manifest, onShow, onCode }: { manifest: ProjectManifest; onShow: (index: number) => void; onCode: (el: AppElement) => void }) {
  const units = manifest.units.filter((u) => u.kind !== "toast");
  return (
    <div className="h-full overflow-y-auto bg-[var(--kv-bg,#f4f5f7)]">
      <div className="mx-auto max-w-5xl p-5">
        <p className="mb-5 max-w-2xl text-[13px] leading-relaxed text-[var(--kv-text-subtle,#777)]">
          Controls are recognized by how they look. Each keeps its value in{" "}
          <span className="rounded-md bg-[var(--kv-accent-soft,#e8f3fc)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--kv-text,#333)]">app::state()</span> and calls a
          function in{" "}
          <span className="rounded-md bg-[var(--kv-accent-soft,#e8f3fc)] px-1.5 py-0.5 font-mono text-[12px] text-[var(--kv-text,#333)]">src/app/actions.cpp</span>, where your
          logic goes.
        </p>
        {units.map((u) => {
          const rows = manifest.elements.map((e, i) => ({ e, i })).filter(({ e }) => e.unit.kind === u.kind && e.unit.ident === u.ident);
          if (!rows.length) return null;
          return (
            <section key={`${u.kind}-${u.ident}`} className="mb-6">
              <h3 className="mb-2 flex items-baseline gap-2 text-[13px] font-medium text-[var(--kv-text)]">
                {u.name}
                <span className="font-mono text-[11px] font-normal text-[var(--kv-text-muted)]">
                  {u.kind} · {rows.length}
                </span>
              </h3>
              <div className="overflow-hidden rounded-[14px] border border-[var(--kv-border)] bg-[var(--kv-surface)] shadow-sm">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="border-b border-[var(--kv-border)] bg-[var(--kv-sidebar,#f7f8fa)] text-[11.5px] text-[var(--kv-text-muted)]">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Control</th>
                      <th className="px-3 py-2.5 font-medium">Value</th>
                      <th className="px-3 py-2.5 font-medium">Calls</th>
                      <th className="hidden px-3 py-2.5 font-medium md:table-cell">Does</th>
                      <th className="w-20 px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--kv-border-subtle,#eceef2)]">
                    {rows.map(({ e, i }) => {
                      const K = ELEMENT_KINDS[e.kind];
                      return (
                        <tr key={i} className="group transition-colors hover:bg-[var(--kv-bg)]">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <K.icon className="size-3.5 shrink-0 text-[var(--kv-text-muted)]" aria-hidden />
                              <span className="min-w-0 truncate text-[var(--kv-text)]">{bare(e.name)}</span>
                              <span className="shrink-0 text-[11px] text-[var(--kv-text-muted)]">{K.label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11.5px] text-[var(--kv-text-subtle)]">
                            {e.state ? (
                              <span className="text-[var(--kv-text)]">state.{e.state}</span>
                            ) : (
                              <span className="text-[var(--kv-text-muted)]">none</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-[11.5px]">
                            {e.action ? (
                              <span className="text-[var(--kv-text)]">{e.action}()</span>
                            ) : (
                              <span className="text-[var(--kv-text-muted)]">none</span>
                            )}
                          </td>
                          <td className="hidden max-w-[280px] truncate px-3 py-2.5 text-[var(--kv-text-subtle)] md:table-cell">
                            {e.does ?? (e.disabled ? "disabled in the design" : "—")}
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="flex justify-end gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => onShow(i)}
                                className="grid size-7 place-items-center rounded-md text-[var(--kv-text-subtle)] hover:bg-[var(--kv-accent-soft)] hover:text-[var(--kv-accent)]"
                                aria-label={`Show ${bare(e.name)} in the preview`}
                              >
                                <EyeIcon className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onCode(e)}
                                className="grid size-7 place-items-center rounded-md text-[var(--kv-text-subtle)] hover:bg-[var(--kv-accent-soft)] hover:text-[var(--kv-accent)]"
                                aria-label={`Show the code of ${bare(e.name)}`}
                              >
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
        {!manifest.elements.length && (
          <p className="py-16 text-center text-[13px] text-[var(--kv-text-muted)]">No controls were recognized in this design; everything is drawn as it looks.</p>
        )}
      </div>
    </div>
  );
}
