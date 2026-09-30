import { MessageCircleQuestionMarkIcon } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Reveal } from "@/components/site/reveal";
import { faq } from "@/lib/site";
import { SectionHeading } from "./section-heading";

export function Faq() {
  return (
    <section id="faq" className="relative scroll-mt-10 py-24">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 lg:grid-cols-[1fr_1.4fr]">
        <SectionHeading align="left" eyebrow="Questions" icon={MessageCircleQuestionMarkIcon} title="Good to know.">
          Anything else is in the guide: exporting, the generated code and recipes.
        </SectionHeading>
        <Reveal>
          <Accordion className="panel rounded-card px-2">
            {faq.map((item) => (
              <AccordionItem key={item.q} value={item.q} className="border-[#1c1c1c] px-4 last:border-b-0">
                <AccordionTrigger className="py-4 text-[14px] hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="pb-4 text-[13px] leading-relaxed text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Reveal>
      </div>
    </section>
  );
}
