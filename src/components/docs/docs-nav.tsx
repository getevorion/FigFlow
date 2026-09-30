"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { docsNav } from "./nav";

export function DocsNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs" className="space-y-6 text-[13.5px]">
      {docsNav.map((section) => (
        <div key={section.title}>
          <p className="mb-2 font-mono text-[11px] text-[var(--brand-label)]">{section.title}</p>
          <ul className="space-y-0.5 border-l border-[#1c1c1c]">
            {section.pages.map((p) => {
              const active = pathname === p.href;
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "-ml-px block border-l py-1 pl-3.5 transition-colors",
                      active ? "border-neutral-300 text-foreground" : "border-transparent text-foreground/60 hover:border-[#3d3d3d] hover:text-foreground",
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
    </nav>
  );
}
