"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, SparklesIcon, BookOpenIcon, Settings2Icon } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboardIcon, exact: true },
  { href: "/convert", label: "Convert", icon: SparklesIcon },
  { href: "/docs", label: "Docs", icon: BookOpenIcon },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2Icon },
] as const;

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh bg-[var(--kv-surface)] text-foreground">
      <header className="sticky top-0 z-40 border-b border-[var(--kv-border)] bg-[var(--kv-surface)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/" className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Figflow home">
            <Logo />
          </Link>
          <span className="hidden text-[13px] text-muted-foreground sm:inline">Dashboard</span>
          <div className="flex-1" />
          <Link href="/convert" className="lf-btn lf-btn-primary lf-btn-sm">
            New conversion
          </Link>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[220px_1fr]">
        <nav aria-label="Dashboard" className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-0.5">
          {links.map(({ href, label, icon: Icon, ...rest }) => {
            const exact = "exact" in rest && rest.exact;
            const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2.5 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active ? "bg-[var(--kv-bg)] text-white" : "text-muted-foreground hover:bg-[var(--kv-bg)] hover:text-foreground",
                )}
              >
                <Icon className="size-4 opacity-80" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
