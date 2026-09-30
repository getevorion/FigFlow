import { CodeShowcase } from "@/components/landing/code-showcase";
import { Comparison } from "@/components/landing/comparison";
import { Faq } from "@/components/landing/faq";
import { Features } from "@/components/landing/features";
import { FinalCta } from "@/components/landing/final-cta";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { OpenSource } from "@/components/landing/open-source";
import { StackStrip } from "@/components/landing/stack-strip";
import { Team } from "@/components/landing/team";

export default function HomePage() {
  return (
    <>
      <Hero />
      <StackStrip />
      <HowItWorks />
      <Features />
      <CodeShowcase />
      <Comparison />
      <OpenSource />
      <Team />
      <Faq />
      <FinalCta />
    </>
  );
}
