import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { owner, site } from "@/lib/site";

type FooterLink = { href: string; label: string; external?: boolean };

const columns: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Product",
    links: [
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#features", label: "Features" },
      { href: "/#open-source", label: "Open source" },
      { href: "/convert", label: "Convert a file" },
    ],
  },
  {
    title: "Guide",
    links: [
      { href: "/docs", label: "Getting started" },
      { href: "/docs/export", label: "Export a .fig file" },
      { href: "/docs/generated-code", label: "The generated code" },
      { href: "/docs/troubleshooting", label: "Troubleshooting" },
    ],
  },
  {
    title: "Community",
    links: [
      { href: site.sourceUrl, label: "Source code", external: true },
      { href: "/#team", label: "Team" },
      { href: owner.org.href, label: owner.org.name, external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative mt-24 overflow-hidden border-t border-white/[0.07]">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 pt-16 pb-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
            {site.description} Open source, and free for everyone.
          </p>
          <a
            href={owner.org.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-1 pr-3 pl-1.5 text-xs text-foreground/80 transition-colors hover:border-white/20 hover:text-white"
          >
            <Image src={owner.org.badge} alt="" width={18} height={18} className="size-[18px]" />A community project by Evorion
          </a>
        </div>
        {columns.map((col) => (
          <div key={col.title}>
            <h3 className="mb-3 text-[13px] font-medium text-foreground">{col.title}</h3>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 pb-8 text-xs text-muted-foreground/80 sm:flex-row sm:items-center sm:justify-between">
        <p>
          © {new Date().getFullYear()} {site.name} by {owner.name} at{" "}
          <a href={owner.org.href} target="_blank" rel="noreferrer" className="text-foreground/80 underline-offset-4 hover:underline">
            {owner.org.name}
          </a>
          . Not affiliated with Figma, Inc. or the Dear ImGui project.
        </p>
        <p className="font-mono">Dear ImGui 1.92 · C++20 · DirectX 11 · Win32</p>
      </div>
      <div
        aria-hidden
        className="pointer-events-none mx-auto -mb-[4vw] max-w-6xl px-5 text-center text-[17vw] leading-none font-semibold tracking-[-0.06em] select-none md:text-[180px]"
        style={{
          background: "linear-gradient(180deg, rgb(140 110 255 / 22%), transparent 80%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        figflow
      </div>
    </footer>
  );
}
