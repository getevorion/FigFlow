import { ArrowRightIcon, BlocksIcon, FileCode2Icon, LockIcon, MousePointerClickIcon, ShieldCheckIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/site/reveal";
import { cn } from "@/lib/utils";
import { SectionHeading } from "./section-heading";

/**
 * A feature: a matte panel whose visual is a product shot on a stage (UI and
 * code) or, for specimens (type, effects), drawn on the panel itself.
 */
function Cell({
  className,
  title,
  body,
  children,
  stage,
  footer,
  delay = 0,
}: {
  className?: string;
  title: string;
  body: ReactNode;
  children?: ReactNode;
  stage?: "violet" | "sky";
  footer?: ReactNode;
  delay?: number;
}) {
  return (
    <Reveal delay={delay} className={cn("panel rounded-card relative flex flex-col overflow-hidden", className)}>
      {children &&
        (stage ? (
          <div className="flex flex-1 flex-col p-3 pb-0">
            <div className={cn("stage rounded-panel flex flex-1 items-center justify-center", stage === "sky" && "stage-sky")}>{children}</div>
          </div>
        ) : (
          <div className="relative flex-1 overflow-hidden">{children}</div>
        ))}
      <div className="relative p-5 pt-4">
        <h3 className="text-[15px] font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
        {footer}
      </div>
    </Reveal>
  );
}

const TREE: Array<[string, string[]]> = [
  ["ui/components/", ["button.cpp", "toggle.cpp", "checkbox.cpp", "slider.cpp", "combo.cpp", "keybind.cpp", "profile_card.cpp"]],
  ["ui/screens/", ["sign_in.cpp", "settings.cpp"]],
  ["ui/theme/", ["palette.h", "styles.cpp", "fonts.cpp"]],
  ["ui/assets/", ["fonts.cpp", "images.cpp"]],
];

function CodeVisual() {
  const k = "text-[#bb9af7]";
  const t = "text-[#7dcfff]";
  const s = "text-[#e0af68]";
  const c = "text-[#5c6080]";
  const n = "text-[#ff9e64]";
  const fn = "text-[#7aa2f7]";
  return (
    <div className="w-full p-6 sm:p-8">
      <div className="bezel">
        <div className="window grid font-mono text-[11.5px] leading-[1.65] md:grid-cols-[0.72fr_1.28fr]">
          <div className="border-b border-white/[0.08] p-4 md:border-r md:border-b-0">
            {TREE.map(([dir, files]) => (
              <div key={dir} className="mb-2 last:mb-0">
                <div className="text-brand-soft">{dir}</div>
                {files.map((f) => (
                  <div key={f} className="pl-3 text-[#b4b5c3]">
                    {f}
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            <div className="overflow-hidden border-b border-white/[0.08] p-4 leading-[1.7] whitespace-nowrap text-[#d4d6e4]">
              <div className={c}>{"// ui/screens/settings.cpp"}</div>
              <div>
                <span className={k}>if</span> (ui::<span className={fn}>toggle</span>(<span className={s}>&quot;V-Sync&quot;</span>, &amp;s.vsync, {"{ "}
                <span className={n}>44.f</span>, <span className={n}>24.f</span>
                {" }"}, styles::toggle))
              </div>
              <div className="pl-4">
                actions::<span className={fn}>vsync</span>();
              </div>
              <div>
                components::<span className={fn}>profile_card</span>(dl, f.<span className={fn}>at</span>({"{ "}
                <span className={n}>40.f</span>, <span className={n}>120.f</span>
                {" }"}), <span className={s}>&quot;Ada&quot;</span>, <span className={s}>&quot;Designer&quot;</span>);
              </div>
            </div>
            <div className="flex-1 overflow-hidden p-4 leading-[1.7] text-[#d4d6e4]">
              <div className={c}>{"// ui/theme/palette.h, from your variables"}</div>
              {[
                ["surface_background", "10, 10, 14, 255"],
                ["surface_panel", "18, 18, 24, 255"],
                ["brand_violet_500", "109, 77, 255, 255"],
                ["text_primary", "243, 243, 248, 255"],
                ["text_muted", "124, 127, 143, 255"],
              ].map(([name, rgba]) => (
                <div key={name} className="truncate">
                  <span className={k}>constexpr</span> <span className={t}>ImU32</span> {name} = IM_COL32(<span className={n}>{rgba}</span>);
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PixelVisual() {
  return (
    <div className="relative flex h-44 items-center justify-center">
      <div className="relative pr-[104px]">
        <span className="block font-serif text-[88px] leading-none tracking-tight text-foreground">Ag</span>
        <span className="absolute top-[70px] right-[98px] -left-[14px] h-px bg-brand-soft/80" />
        <span className="absolute top-[14px] right-[98px] -left-[14px] h-px border-t border-dashed border-white/30" />
        <span className="absolute top-[63px] right-0 font-mono text-[10px] text-brand-soft">baseline 15.32</span>
        <span className="absolute top-[7px] right-[28px] font-mono text-[10px] text-muted-foreground">cap 0.727</span>
      </div>
    </div>
  );
}

function EffectsVisual() {
  return (
    <div className="grid h-44 grid-cols-4 items-center gap-3 px-6">
      <div className="rounded-panel aspect-square bg-[#1d1d1d] shadow-[0_14px_30px_-6px_rgba(0,0,0,.9)]" title="Drop shadow" />
      <div className="rounded-panel aspect-square bg-[#1d1d1d] shadow-[inset_0_4px_14px_rgba(0,0,0,.8)]" title="Inner shadow" />
      <div className="bg-brand-gradient rounded-panel aspect-square shadow-[0_0_34px_2px_rgb(109_77_255/0.6)]" title="Glow" />
      <div className="rounded-panel relative aspect-square overflow-hidden" title="Gradient">
        <div className="absolute inset-0 bg-[conic-gradient(from_90deg,#b35cff,#6446ff,#2f62ff,#22d3ee,#b35cff)]" />
      </div>
    </div>
  );
}

function StatesVisual() {
  const states = [
    ["Default", "bg-[#6d4dff] text-white"],
    ["Hover", "bg-[#8065ff] text-white"],
    ["Pressed", "bg-[#5a3be6] text-white scale-[0.97]"],
    ["Disabled", "bg-white/10 text-white/40"],
  ];
  return (
    <div className="w-full px-5 py-6">
      <div className="bezel bezel-sm">
        <div className="window flex flex-col gap-2 px-4 py-3.5">
          {states.map(([label, cls]) => (
            <div key={label} className="flex items-center gap-3">
              <span className="w-14 font-mono text-[10.5px] text-muted-foreground">{label}</span>
              <span className={cn("rounded-lg px-3 py-1 text-[11.5px] font-semibold", cls)}>Launch</span>
              <span className="ml-auto font-mono text-[10px] text-muted-foreground/70">State={label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FlowVisual() {
  const frames = ["Sign in", "Loading", "Main"];
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-9">
      {frames.map((f, i) => (
        <div key={f} className="flex items-center gap-2">
          <div className="bezel bezel-sm">
            <div className="window flex h-20 w-[68px] flex-col p-1.5">
              <span className="text-[9px] text-foreground/75">{f}</span>
              <span className="mt-auto h-2 rounded-sm bg-brand/80" />
            </div>
          </div>
          {i < frames.length - 1 && <ArrowRightIcon className="size-4 text-[var(--stage-ink)]" />}
        </div>
      ))}
    </div>
  );
}

function PopupVisual() {
  return (
    <div className="relative h-44 w-full">
      <div className="bezel bezel-sm absolute top-5 left-5 w-44">
        <div className="window p-3">
          <div className="text-[11px] font-medium">Activate serial</div>
          <div className="mt-2 h-5 rounded-md border border-white/10 bg-white/[0.04]" />
          <div className="mt-2 flex justify-end gap-1.5">
            <span className="rounded-md px-2 py-0.5 text-[9.5px] text-muted-foreground">Cancel</span>
            <span className="rounded-md bg-brand px-2 py-0.5 text-[9.5px] font-semibold text-white">Activate</span>
          </div>
        </div>
      </div>
      <div className="bezel bezel-sm absolute right-5 bottom-5 w-40">
        <div className="window">
          <div className="px-2.5 py-2 text-[10px]">
            <div className="font-medium">Config saved</div>
            <div className="text-muted-foreground">legit.cfg is active</div>
          </div>
          <div className="bg-brand-gradient h-[2px] w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="relative scroll-mt-10 py-24">
      <div className="mx-auto max-w-6xl px-5">
        <SectionHeading
          eyebrow="Features"
          icon={BlocksIcon}
          title={
            <>
              Everything in the frame <span className="text-brand-gradient font-serif font-normal italic">comes along</span>.
            </>
          }
        >
          Layout, type, icons, effects, components and states carry over, and every control ends up as state your code can read and write.
        </SectionHeading>

        <div className="mt-12 grid gap-4 lg:grid-cols-6">
          <Cell
            className="lg:col-span-4 lg:row-span-2"
            stage="violet"
            title="Organised like a hand-built project."
            body="Widgets live in ui/components, each screen is a function, and the theme is generated from your styles and variables. Figma components stay components."
            footer={
              <div className="mt-3 flex flex-wrap gap-2">
                {["No wall of draw calls", "Components kept intact", "Named colour constants"].map((label) => (
                  <span key={label} className="rounded-full border border-[#262626] bg-[#121212] px-2.5 py-1 text-[11px] text-foreground/75">
                    {label}
                  </span>
                ))}
              </div>
            }
          >
            <CodeVisual />
          </Cell>
          <Cell className="lg:col-span-2" title="Down to the glyph." body="Text is drawn from the design's own glyph outlines on Figma's baselines, and every corner keeps its radius." delay={0.05}>
            <PixelVisual />
          </Cell>
          <Cell className="lg:col-span-2" title="Shadows, glows, masks." body="Drop and inner shadows, glows, gradients, blurs and masks, using the values in your file." delay={0.1}>
            <EffectsVisual />
          </Cell>
          <Cell className="lg:col-span-2" stage="sky" title="States from your variants." body="Default, hover, pressed and disabled variants drive animated states." delay={0.05}>
            <StatesVisual />
          </Cell>
          <Cell className="lg:col-span-2" stage="violet" title="Your prototype is the navigation." body="Prototype links become screens with transitions." delay={0.1}>
            <FlowVisual />
          </Cell>
          <Cell className="lg:col-span-2" stage="sky" title="Popups and toasts." body="Dialogs become popups and notifications become toasts, with fades, Esc and click-outside to close." delay={0.15}>
            <PopupVisual />
          </Cell>
          <Cell className="lg:col-span-3" title="Real widgets, ImGui's way." body="Each widget kind is its own file, built on ImGui's own ItemAdd and ButtonBehavior, so hover, press and focus work like any ImGui control.">
            <div className="flex h-28 items-center gap-3 px-6">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#161616] text-brand-soft ring-1 ring-[#262626]">
                <MousePointerClickIcon className="size-5" />
              </span>
              <div className="flex flex-wrap gap-1.5">
                {["button", "toggle", "checkbox", "slider", "text_field", "combo", "keybind"].map((t) => (
                  <span key={t} className="rounded-md border border-[#262626] bg-[#121212] px-2 py-0.5 font-mono text-[10.5px] text-foreground/85">
                    {t}.cpp
                  </span>
                ))}
              </div>
            </div>
          </Cell>
          <Cell className="lg:col-span-3" title="Yours, privately." body="No Figma login. Files are deleted two hours after upload, and the code has no license checks." delay={0.05}>
            <div className="flex h-28 flex-wrap items-center gap-x-5 gap-y-2 px-6">
              {[
                [LockIcon, "No Figma login"],
                [ShieldCheckIcon, "Deleted in 2 h"],
                [FileCode2Icon, "Plain C++20"],
              ].map(([Icon, label]) => {
                const I = Icon as typeof LockIcon;
                return (
                  <div key={label as string} className="flex items-center gap-2 text-[12px] text-foreground/80">
                    <I className="size-4 text-brand-soft" />
                    {label as string}
                  </div>
                );
              })}
            </div>
          </Cell>
        </div>
      </div>
    </section>
  );
}
