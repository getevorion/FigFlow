import Image from "next/image";
import Link from "next/link";
import { ArrowUpRightIcon, UsersRoundIcon } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { owner } from "@/lib/site";

/** The maintainer's profile in a row, set straight on the page. */
export function Team() {
  return (
    <section id="team" className="relative scroll-mt-10 py-24">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal className="grid items-center gap-10 sm:grid-cols-[auto_1fr] sm:gap-14">
          <div className="relative size-44 shrink-0 sm:size-52">
            <div aria-hidden className="absolute -inset-8 rounded-full bg-[radial-gradient(closest-side,rgb(109_77_255/0.5),rgb(168_85_255/0.16)_60%,transparent)] blur-2xl" />
            <Image src={owner.avatar} alt={owner.name} width={208} height={208} className="relative size-full rounded-full object-cover ring-1 ring-white/20" />
            <a
              href={owner.org.href}
              target="_blank"
              rel="noreferrer"
              title={owner.org.name}
              aria-label={`${owner.org.name} (evora.cx)`}
              className="absolute -right-3 -bottom-2 size-[76px] transition-transform duration-200 hover:scale-105"
            >
              <Image src={owner.org.badge} alt="" width={76} height={76} className="size-full drop-shadow-[0_6px_14px_rgb(0_0_0/0.9)]" />
            </a>
          </div>

          <div className="min-w-0">
            <span className="eyebrow">
              <UsersRoundIcon aria-hidden strokeWidth={2} />
              Team
            </span>
            <h3 className="text-brand-gradient mt-3 pb-1 font-serif text-6xl leading-none italic sm:text-7xl">{owner.name}</h3>
            <p className="mt-3 text-[15px] text-foreground/85">
              {owner.role} at{" "}
              <a href={owner.org.href} target="_blank" rel="noreferrer" className="font-medium text-white underline-offset-4 hover:underline">
                {owner.org.name}
              </a>
            </p>
            <div className="mt-5 max-w-xl space-y-3 text-[15px] leading-relaxed text-foreground/75">
              {owner.body.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href={owner.org.href} target="_blank" rel="noreferrer" className="lf-btn lf-btn-primary">
                Visit evora.cx
                <ArrowUpRightIcon className="size-4" />
              </a>
              <Link href="/#open-source" className="lf-btn lf-btn-ghost">
                Contribute
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
