import type { Metadata } from "next";
import { DocsNav } from "@/components/docs/docs-nav";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s · Figflow docs" },
  description: "How to turn a Figma file into a working Dear ImGui app with Figflow, and how the generated project fits together.",
};

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <>
      <SiteHeader />
      <div className="relative isolate">
        <div className="mx-auto flex max-w-6xl gap-12 px-5 pt-28 pb-24 sm:pt-32">
          <aside className="hidden w-52 shrink-0 lg:block">
            <div className="scroll-dark sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto pr-2">
              <DocsNav />
            </div>
          </aside>
          <main className="min-w-0 max-w-[720px] flex-1">
            <details className="group mb-8 rounded-panel border border-[#1c1c1c] bg-[#0b0b0b] lg:hidden">
              <summary className="cursor-pointer list-none px-4 py-3 text-[13.5px] font-medium marker:hidden">Docs menu</summary>
              <div className="border-t border-[#1c1c1c] px-4 py-4">
                <DocsNav />
              </div>
            </details>
            {children}
          </main>
        </div>
      </div>
      <SiteFooter />
    </>
  );
}
