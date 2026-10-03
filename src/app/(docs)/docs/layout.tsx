import type { Metadata } from "next";
import { AppShell } from "@/components/app/app-shell";

export const metadata: Metadata = {
  title: { default: "Docs", template: "%s · Figflow docs" },
  description: "Figflow's documentation: getting a .fig out of Figma, converting it, and finding your way around the Dear ImGui project it writes.",
};

export default function DocsLayout({ children }: LayoutProps<"/docs">) {
  return (
    <AppShell>
      <article className="mx-auto max-w-[720px] pb-16">{children}</article>
    </AppShell>
  );
}
