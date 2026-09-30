import { CodeXmlIcon } from "lucide-react";
import { highlight } from "@/lib/highlight";
import { Reveal } from "@/components/site/reveal";
import { CodeTabs } from "./code-tabs";
import { samples } from "./samples";
import { SectionHeading } from "./section-heading";

export async function CodeShowcase() {
  const tabs = await Promise.all(samples.map(async (s) => ({ ...s, html: await highlight(s.code, "cpp") })));
  return (
    <section id="code" className="relative scroll-mt-10 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="The output" icon={CodeXmlIcon} title={<>Read it like <span className="text-brand-gradient font-serif font-normal italic">your own</span> code.</>}>
          Widgets written like Dear ImGui&apos;s own, screens as plain functions, one theme to restyle. Builds in Visual Studio or with CMake.
        </SectionHeading>
        <Reveal className="stage mt-10 p-3 sm:p-8 lg:p-12">
          <div className="bezel">
            <CodeTabs tabs={tabs} />
          </div>
        </Reveal>
        <p className="mt-4 text-center text-[12.5px] text-muted-foreground">
          Real output, from the Log In form of Figma&apos;s{" "}
          <a href="https://www.figma.com/community/file/1380235722331273046" className="underline decoration-white/20 underline-offset-4 hover:text-foreground" target="_blank" rel="noreferrer">
            Simple Design System
          </a>{" "}
          (CC BY 4.0).
        </p>
      </div>
    </section>
  );
}
