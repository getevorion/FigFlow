import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The Figflow mark: a lowercase f drawn as a vector path, its crossbar a
 * Bézier handle through an anchor point, on a glossy purple-to-blue tile.
 * It lives in public/brand as a file, so its gradient ids never collide when
 * the mark appears more than once on a page.
 */
export function LogoMark({ className, size = 28, title }: { className?: string; size?: number; title?: string }) {
  return <Image src="/brand/figflow-mark.svg" alt={title ?? ""} width={size} height={size} unoptimized className={cn("shrink-0", className)} />;
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">Figflow</span>
    </span>
  );
}
