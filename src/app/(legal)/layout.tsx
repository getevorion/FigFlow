import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="relative isolate mx-auto max-w-[720px] px-5 pt-28 pb-24 sm:pt-32">{children}</main>
      <SiteFooter />
    </>
  );
}
