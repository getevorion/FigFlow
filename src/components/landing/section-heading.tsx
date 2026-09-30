import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Reveal } from "@/components/site/reveal";

export function SectionHeading({
  eyebrow,
  icon: Icon,
  title,
  children,
  align = "center",
}: {
  eyebrow: string;
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  align?: "center" | "left";
}) {
  return (
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <span className="eyebrow">
        <Icon aria-hidden strokeWidth={2} />
        {eyebrow}
      </span>
      <h2 className="mt-3.5 text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance sm:text-[2.25rem]">{title}</h2>
      {children && <p className="mt-3.5 text-[14px] leading-relaxed text-pretty text-muted-foreground sm:text-[15px]">{children}</p>}
    </Reveal>
  );
}
