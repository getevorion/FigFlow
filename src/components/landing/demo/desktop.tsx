import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The hero's stage: a container like the site's other stages, with a desktop
 * wallpaper behind the product shot instead of the pastel dots. The photo is
 * by Leandra Rieger on Unsplash (Unsplash License), cropped around its peak.
 */
export function Desktop({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative isolate overflow-hidden rounded-[calc(var(--radius-card)+4px)]", className)}>
      <Image src="/landing/snowy-peak.webp" alt="" fill priority sizes="(min-width: 1200px) 1136px, 100vw" className="-z-10 object-cover object-[50%_60%]" />
      {children}
    </div>
  );
}
