"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenIcon, HomeIcon, MenuIcon, Settings2Icon, SparklesIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { docsNav } from "@/components/docs/nav";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: HomeIcon },
  { href: "/convert", label: "Convert", icon: SparklesIcon },
  { href: "/docs", label: "Docs", icon: BookOpenIcon },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2Icon },
] as const;

function NavLink({ href, label, icon: Icon, pathname, onNavigate }: (typeof nav)[number] & { pathname: string; onNavigate?: () => void }) {
  const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`)) || (href === "/docs" && pathname === "/docs");
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] leading-4",
        active
          ? "bg-[var(--kv-surface)] font-medium text-[var(--kv-text)] shadow-sm"
          : "font-normal text-[var(--kv-text-subtle)] hover:bg-[var(--kv-surface)] hover:text-[var(--kv-text)]",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", active ? "text-[var(--kv-text)]" : "text-[var(--kv-text-muted)] group-hover:text-[var(--kv-text-subtle)]")}
        strokeWidth={1.5}
        aria-hidden
      />
      {label}
    </Link>
  );
}

function DocsSubnav({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  return (
    <div className="mt-1 mb-2 space-y-3 pl-[26px]">
      {docsNav.map((section) => (
        <div key={section.title}>
          <p className="py-1 text-[11px] font-medium text-[var(--kv-text-muted)]">{section.title}</p>
          <ul>
            {section.pages.map((p) => {
              const active = pathname === p.href;
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-2 py-1 text-[12.5px]",
                      active ? "bg-[var(--kv-surface)] font-medium text-[var(--kv-text)] shadow-sm" : "text-[var(--kv-text-subtle)] hover:bg-[var(--kv-surface)] hover:text-[var(--kv-text)]",
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const workspace = /^\/convert\/[^/]+/.test(pathname);

  const sidebar = (
    <div className="flex h-full grow flex-col overflow-y-auto border-r border-[var(--kv-border)] bg-[var(--kv-sidebar)] px-3 pb-3">
      <div className="flex h-12 shrink-0 items-center px-2.5">
        <Link href="/dashboard" className="text-[17px] font-semibold tracking-[-0.03em] text-[var(--kv-text)]" onClick={() => setOpen(false)}>
          Figflow
        </Link>
      </div>
      <nav className="flex flex-1 flex-col pt-0.5" aria-label="App">
        <ul className="space-y-0.5">
          {nav.map((item) => (
            <li key={item.href}>
              <NavLink {...item} pathname={pathname} onNavigate={() => setOpen(false)} />
              {item.href === "/docs" && pathname.startsWith("/docs") && <DocsSubnav pathname={pathname} onNavigate={() => setOpen(false)} />}
            </li>
          ))}
        </ul>
        <div className="mt-auto border-t border-[var(--kv-border)] pt-3 px-2.5">
          <p className="text-[12px] text-[var(--kv-text-muted)]">Uploads expire after 2 hours · no account</p>
        </div>
      </nav>
    </div>
  );

  return (
    <div className="kv-app min-h-dvh bg-[var(--kv-bg)] text-[var(--kv-text)]">
      {open && (
        <button type="button" className="fixed inset-0 z-40 bg-[var(--kv-text)]/40 lg:hidden" aria-label="Close menu" onClick={() => setOpen(false)} />
      )}
      <div
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(100%,260px)] transition-transform duration-200 lg:translate-x-0 lg:w-[240px]",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="relative flex h-full flex-col lg:fixed lg:inset-y-0 lg:w-[240px]">
          <button
            type="button"
            className="absolute right-2 top-3 grid size-8 place-items-center rounded-[10px] text-[var(--kv-text-subtle)] lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <XIcon className="size-5" strokeWidth={1.75} />
          </button>
          {sidebar}
        </div>
      </div>

      <div className="min-w-0 lg:pl-[240px]">
        <div className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-[var(--kv-border)] bg-[var(--kv-bg)] px-3 sm:px-6 lg:px-8">
          <button
            type="button"
            className="-m-2 rounded-[10px] p-2 text-[var(--kv-text-subtle)] hover:text-[var(--kv-text)] lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <MenuIcon className="size-5" strokeWidth={1.75} />
          </button>
          <span className="truncate text-[15px] font-medium tracking-[-0.03em] lg:hidden">Figflow</span>
          <div className="ml-auto">
            <Link href="/convert" className="btn-primary text-[13px]">
              New conversion
            </Link>
          </div>
        </div>
        <main className={cn("overflow-x-hidden", workspace ? "p-0" : "py-5 sm:py-6")}>
          <div className={cn(workspace ? "h-[calc(100dvh-3rem)] max-w-none" : "mx-auto max-w-5xl px-3 sm:px-6 lg:px-8")}>{children}</div>
        </main>
      </div>
    </div>
  );
}
