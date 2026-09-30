import { CheckIcon, GitCompareArrowsIcon, XIcon } from "lucide-react";
import { Reveal } from "@/components/site/reveal";
import { SectionHeading } from "./section-heading";

const dump = `void draw_frame(ImDrawList* d, ImVec2 o) {
  d->AddRectFilled(o+ImVec2{0,0},o+ImVec2{980,680},0xFF100C0C,18.f);
  d->AddRectFilled(o+ImVec2{0,0},o+ImVec2{220,680},0xFF161212,18.f);
  d->AddText(f3,14.f,o+ImVec2{52.f,31.8f},0xFFF8F3F3,"Nova");
  d->AddRectFilled(o+ImVec2{16,96},o+ImVec2{204,128},0x21FF4D6D,9.f);
  d->AddText(f1,13.f,o+ImVec2{50.f,107.2f},0xFFF8F3F3,"Visuals");
  d->AddRectFilled(o+ImVec2{552,118},o+ImVec2{584,136},0xFFFF4D6D,9.f);
  d->AddCircleFilled(o+ImVec2{575,127},7.f,0xFFFFFFFF);
  // … 2,400 more lines
}`;

const structured = `src/
  app/          state.h  actions.cpp  navigation.h
  ui/
    components/ button.cpp  slider.cpp  text_field.cpp …
    screens/    form_log_in.cpp
    theme/      palette.h  styles.cpp  fonts.cpp
    assets/     fonts.cpp  icons.cpp  images.cpp

// src/ui/screens/form_log_in.cpp
if (ui::button("Sign In##sign_in", { 272.f, 40.f }, styles::sign_in))
    actions::sign_in();`;

export function Comparison() {
  return (
    <section className="relative py-20">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading eyebrow="Why it's different" icon={GitCompareArrowsIcon} title="Not a picture of your UI. Your UI.">
          Most converters flatten a design into draw calls with magic numbers. You can run that, but you can&apos;t work in it.
        </SectionHeading>
        <div className="mt-12 grid gap-5 md:grid-cols-2">
          <Reveal className="panel rounded-card min-w-0 p-3">
            <div className="stage stage-gray rounded-panel p-4 sm:p-6">
              <div className="bezel bezel-sm">
                <div className="window p-4">
                  <pre className="overflow-hidden font-mono text-[11px] leading-[1.75] text-[#7c7e8f] [mask-image:linear-gradient(180deg,#000_70%,transparent)]">{dump}</pre>
                </div>
              </div>
            </div>
            <div className="mt-5 mb-4 flex items-center gap-2 px-3 text-sm font-medium text-muted-foreground">
              <span className="grid size-6 place-items-center rounded-full bg-[#161616] ring-1 ring-[#262626]">
                <XIcon className="size-3.5" />
              </span>
              A draw-call dump
            </div>
            <ul className="space-y-2 px-3 pb-3 text-[13px] text-muted-foreground">
              {["Absolute coordinates everywhere", "Hex colors, repeated", "Everything in one function"].map((t) => (
                <li key={t} className="flex gap-2">
                  <XIcon className="mt-0.5 size-4 shrink-0 text-white/30" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.08} className="panel rounded-card min-w-0 p-3">
            <div className="stage rounded-panel p-4 sm:p-6">
              <div className="bezel bezel-sm">
                <div className="window p-4">
                  <pre className="overflow-x-auto font-mono text-[11px] leading-[1.75] text-[#c9cad8]">{structured}</pre>
                </div>
              </div>
            </div>
            <div className="mt-5 mb-4 flex items-center gap-2 px-3 text-sm font-medium">
              <span className="bg-brand-gradient grid size-6 place-items-center rounded-full text-white">
                <CheckIcon className="size-3.5" strokeWidth={3} />
              </span>
              Figflow
            </div>
            <ul className="space-y-2 px-3 pb-3 text-[13px] text-foreground/80">
              {[
                "Reusable widgets, styled from your variants",
                "A theme named after your variables",
                "Screens, popups and toasts, state in plain variables",
              ].map((t) => (
                <li key={t} className="flex gap-2">
                  <CheckIcon className="mt-0.5 size-4 shrink-0 text-brand-soft" />
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
