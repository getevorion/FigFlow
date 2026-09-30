import Link from "next/link";
import { ArrowUpRightIcon } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { site } from "@/lib/site";

export function FinalCta() {
  return (
    <section className="relative px-5 py-10">
      <Reveal className="panel rounded-card relative mx-auto max-w-6xl overflow-hidden px-6 py-20 text-center">
        <h2 className="mx-auto max-w-3xl text-[2rem] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-[2.75rem]">
          Upload your design. <span className="text-brand-gradient font-serif font-normal italic">Download the app.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-[15px] text-muted-foreground">Free and open source, for everyone.</p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a href={site.sourceUrl} target="_blank" rel="noreferrer" className="lf-btn lf-btn-primary lf-btn-lg">
            Get the source <ArrowUpRightIcon className="size-4" />
          </a>
          <Link href="/docs" className="lf-btn lf-btn-ghost lf-btn-lg">
            Read the guide
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
