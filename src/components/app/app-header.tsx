import Link from "next/link";
import { BookOpenIcon } from "lucide-react";
import { Logo } from "@/components/brand/logo";

/** The converter's header: the logo home and the docs, nothing else competing with the work. */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-40 h-14 border-b border-[var(--kv-border)] bg-[var(--kv-surface)]">
      <div className="mx-auto flex h-full max-w-[1600px] items-center gap-4 px-4 sm:px-5">
        <Link href="/" className="flex items-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Figflow home">
          <Logo />
        </Link>
        <div className="min-w-0 flex-1">{children}</div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-foreground/65 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          Dashboard
        </Link>
        <Link
          href="/docs"
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-foreground/65 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BookOpenIcon className="size-3.5" aria-hidden />
          Docs
        </Link>
      </div>
    </header>
  );
}
