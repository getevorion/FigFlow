import { MotionProvider } from "@/components/site/reveal";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SmoothScroll } from "@/components/site/smooth-scroll";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <MotionProvider>
      <SmoothScroll />
      <SiteHeader />
      <main className="relative">{children}</main>
      <SiteFooter />
    </MotionProvider>
  );
}
