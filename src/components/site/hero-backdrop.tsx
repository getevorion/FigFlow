"use client";

import dynamic from "next/dynamic";

const MoltenMetal = dynamic(() => import("@/components/backgrounds/molten-metal"), { ssr: false });

/** Molten Metal glow behind the hero, fading into the black page below. */
export function HeroBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1080px] overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          maskImage: "linear-gradient(180deg, #000 0%, #000 50%, transparent 96%)",
          WebkitMaskImage: "linear-gradient(180deg, #000 0%, #000 50%, transparent 96%)",
        }}
      >
        <MoltenMetal
          color1="#3300ff"
          color2="#FF9FFC"
          color3="#1000ff"
          colorMode="molten"
          speed={0.35}
          scale={3.5}
          detail={3}
          glow={2.25}
          coreSize={0.08}
          swirl={0}
          fold={-0.2}
          blackPoint={0.05}
          brightness={1.4}
          opacity={1}
          grain
          grainIntensity={0.05}
          mouseInteraction={false}
        />
      </div>
      {/* Darkens the glow behind the headline so it stays readable. */}
      <div className="absolute inset-0 bg-[radial-gradient(46%_30%_at_50%_27%,rgb(0_0_0/0.6),transparent_80%)]" />
    </div>
  );
}
