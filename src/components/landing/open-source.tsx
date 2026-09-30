import Link from "next/link";
import { ArrowUpRightIcon, GitForkIcon, HeartHandshakeIcon, InfinityIcon, ServerIcon, type LucideIcon } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { site } from "@/lib/site";
import { SectionHeading } from "./section-heading";

const points: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: InfinityIcon, title: "Free for everyone", body: "Every feature and every export, for everyone. There is nothing to upgrade to." },
  { icon: ServerIcon, title: "Run it yourself", body: "The converter is a Next.js app and a small C++ runtime. Host it on your own machine if you like." },
  { icon: HeartHandshakeIcon, title: "Shaped by its users", body: "Send a design that converts badly, ask for a widget, or open a pull request." },
];

export function OpenSource() {
  return (
    <section id="open-source" className="relative scroll-mt-10 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Open source"
          icon={GitForkIcon}
          title={
            <>
              Free, open source, <span className="text-brand-gradient font-serif font-normal italic">built in the open</span>.
            </>
          }
        >
          Figflow is a community project. No plans, no license keys, no limits on what you build with it.
        </SectionHeading>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {points.map((p, i) => (
            <Reveal key={p.title} delay={i * 0.06} className="panel rounded-card p-6">
              <span className="grid size-10 place-items-center rounded-lg bg-[#161616] text-brand-soft ring-1 ring-[#262626]">
                <p.icon className="size-[18px]" />
              </span>
              <h3 className="mt-5 text-[15px] font-semibold tracking-tight">{p.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{p.body}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={site.sourceUrl} target="_blank" rel="noreferrer" className="lf-btn lf-btn-primary">
            Get the source
            <ArrowUpRightIcon className="size-4" />
          </a>
          <Link href="/docs" className="lf-btn lf-btn-ghost">
            Read the guide
          </Link>
        </Reveal>
      </div>
    </section>
  );
}
