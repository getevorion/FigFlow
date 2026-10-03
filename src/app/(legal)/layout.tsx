import { AppShell } from "@/components/app/app-shell";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <article className="mx-auto max-w-[720px] pb-16">{children}</article>
    </AppShell>
  );
}
