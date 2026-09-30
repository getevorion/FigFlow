import Link from "next/link";
import { ArrowLeftIcon, ArrowRightIcon, InfoIcon } from "lucide-react";
import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { docsPages } from "./nav";

/** Building blocks of a docs page: the site's type scale, sentence case, no markdown pipeline. */

export function DocHeader({ section, title, children }: { section: string; title: string; children?: React.ReactNode }) {
  return (
    <header className="mb-10">
      <p className="eyebrow">{section}</p>
      <h1 className="mt-3 text-[2rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance">{title}</h1>
      {children && <p className="mt-4 text-[16px] leading-relaxed text-pretty text-foreground/75">{children}</p>}
    </header>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function H2({ children }: { children: string }) {
  const id = slug(children);
  return (
    <h2 id={id} className="group mt-12 mb-4 scroll-mt-24 text-[1.3rem] font-semibold tracking-[-0.02em]">
      <a href={`#${id}`} className="outline-none">
        {children}
        <span className="ml-2 text-brand-soft/0 transition-colors group-hover:text-brand-soft/70" aria-hidden>
          #
        </span>
      </a>
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 mb-3 text-[15px] font-semibold">{children}</h3>;
}

export function P({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("my-4 text-[15px] leading-[1.75] text-foreground/80", className)}>{children}</p>;
}

export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded-[5px] border border-[#262626] bg-[#141414] px-1.5 py-px font-mono text-[0.86em] text-foreground/90">{children}</code>;
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-brand-soft underline decoration-brand-soft/30 underline-offset-[3px] transition-colors hover:decoration-brand-soft">
      {children}
    </Link>
  );
}

export function Ul({ children }: { children: React.ReactNode }) {
  return <ul className="my-4 space-y-2 pl-5 text-[15px] leading-[1.7] text-foreground/80 marker:text-neutral-400/60 [&>li]:list-disc [&>li]:pl-1">{children}</ul>;
}

export function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="my-6 space-y-5 border-l border-[#1c1c1c] pl-6 [counter-reset:step] [&>li]:relative [&>li]:[counter-increment:step] [&>li]:before:absolute [&>li]:before:top-0.5 [&>li]:before:-left-[35px] [&>li]:before:grid [&>li]:before:size-[22px] [&>li]:before:place-items-center [&>li]:before:rounded-full [&>li]:before:bg-[#141414] [&>li]:before:font-mono [&>li]:before:text-[11px] [&>li]:before:text-neutral-400 [&>li]:before:ring-1 [&>li]:before:ring-[#2a2a2a] [&>li]:before:content-[counter(step)]">{children}</ol>;
}

export function Step({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <p className="text-[15px] font-medium">{title}</p>
      <div className="mt-1 text-[14.5px] leading-[1.7] text-foreground/75 [&_p]:my-2">{children}</div>
    </li>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 flex gap-3 rounded-panel border border-[#222222] bg-[#0d0d0d] px-4 py-3.5 text-[14px] leading-relaxed text-foreground/85">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-neutral-400" aria-hidden />
      <div className="min-w-0 [&_p]:my-0">{children}</div>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-6 overflow-x-auto rounded-panel border border-[#1c1c1c]">
      <table className="w-full text-left text-[13.5px]">
        <thead className="bg-[#101010] text-[12px] text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1c1c1c]">
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((cell, j) => (
                <td key={j} className={cn("px-4 py-2.5 leading-relaxed", j === 0 ? "text-foreground/90" : "text-foreground/70")}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Highlighted code in the site's dark window, mounted on a stage like every code shot on the site, with an optional file name. */
export async function Code({ code, lang = "cpp", file }: { code: string; lang?: string; file?: string }) {
  const html = await highlight(code.trim(), lang);
  return (
    <div className="stage rounded-card my-6 p-2.5 sm:p-3.5">
      <div className="bezel bezel-sm">
        <div className="window">
          <div className="flex items-center gap-3 border-b border-white/[0.08] bg-[#0b0b0f] px-4 py-2">
            <span className="flex shrink-0 gap-1.5" aria-hidden>
              <span className="size-2 rounded-full bg-white/[0.14]" />
              <span className="size-2 rounded-full bg-white/[0.14]" />
              <span className="size-2 rounded-full bg-white/[0.14]" />
            </span>
            {file && <span className="truncate font-mono text-[11.5px] text-muted-foreground">{file}</span>}
          </div>
          <div className="scroll-dark overflow-x-auto px-4 py-3.5 font-mono text-[13px] leading-[1.65] [&_pre]:!bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

/** Previous and next pages, in the nav's order. */
export function Pager({ href }: { href: string }) {
  const i = docsPages.findIndex((p) => p.href === href);
  const prev = i > 0 ? docsPages[i - 1] : null;
  const next = i >= 0 && i < docsPages.length - 1 ? docsPages[i + 1] : null;
  return (
    <nav aria-label="More docs" className="mt-16 grid gap-3 border-t border-[#1c1c1c] pt-8 sm:grid-cols-2">
      {prev ? (
        <Link href={prev.href} className="group rounded-panel border border-[#1c1c1c] px-4 py-3 transition-colors hover:border-[#333333]">
          <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <ArrowLeftIcon className="size-3.5" aria-hidden /> Previous
          </span>
          <span className="mt-1 block text-[14px] font-medium">{prev.title}</span>
        </Link>
      ) : (
        <span />
      )}
      {next && (
        <Link href={next.href} className="group rounded-panel border border-[#1c1c1c] px-4 py-3 text-right transition-colors hover:border-[#333333]">
          <span className="flex items-center justify-end gap-1.5 text-[12px] text-muted-foreground">
            Next <ArrowRightIcon className="size-3.5" aria-hidden />
          </span>
          <span className="mt-1 block text-[14px] font-medium">{next.title}</span>
        </Link>
      )}
    </nav>
  );
}
