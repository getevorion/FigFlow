import Image from "next/image";
import Link from "next/link";
import { ArrowRightIcon, CheckIcon } from "lucide-react";
import { HeroBackdrop } from "@/components/site/hero-backdrop";
import { HeroDemo } from "./demo/hero-demo";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-32 pb-20 sm:pt-40">
      <HeroBackdrop />

      <div className="relative mx-auto max-w-6xl px-5 text-center">
        <Link
          href="/#team"
          className="group mx-auto mb-8 inline-flex h-9 max-w-full items-center gap-2.5 rounded-full border border-[#262626] bg-[#0c0c0c] py-1 pr-3.5 pl-2 text-[13px] transition-colors hover:bg-[#141414]"
        >
          <Image src="/team/evorion.png" alt="" width={22} height={22} className="size-[22px] shrink-0" />
          <span className="truncate text-foreground/90">A community project by Evorion</span>
          <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
        </Link>

        <h1 className="mx-auto max-w-3xl text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.04em] text-balance sm:text-[3rem] md:text-[4rem]">
          Your Figma frame, <span className="text-brand-gradient font-serif font-normal tracking-[-0.02em] italic">running</span> in Dear ImGui.
        </h1>
        <p className="mx-auto mt-5 max-w-lg text-[15px] leading-relaxed text-pretty text-foreground/75">
          Upload a <span className="font-mono text-[0.92em] text-foreground">.fig</span> file and get a C++ project that matches the design, with working widgets,
          screens and popups.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/convert" className="lf-btn lf-btn-primary lf-btn-lg">
            Convert a design free
            <ArrowRightIcon className="size-4" />
          </Link>
          <Link href="/#how-it-works" className="lf-btn lf-btn-ghost lf-btn-lg">
            See how it works
          </Link>
        </div>
        <ul className="mx-auto mt-7 flex max-w-xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-foreground/70">
          {["Free and open source", "Builds in Visual Studio", "Deleted after 2 hours"].map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <CheckIcon className="size-3.5 text-brand-soft" strokeWidth={2.5} />
              {t}
            </li>
          ))}
        </ul>
      </div>

      <div className="relative mt-16 px-5">
        <HeroDemo />
      </div>
    </section>
  );
}
