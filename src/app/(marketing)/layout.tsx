import { MotionProvider } from "@/components/site/reveal";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <MotionProvider>
      <SiteHeader />
      <main className="relative">{children}</main>
      <SiteFooter />
    </MotionProvider>
  );
}
