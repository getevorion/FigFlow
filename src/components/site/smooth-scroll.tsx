"use client";

import "lenis/dist/lenis.css";
import { ReactLenis } from "lenis/react";
import { useEffect } from "react";

/**
 * Eased scrolling for the whole page (Lenis). Same-page links such as
 * /#features glide to their section: Next's <Link> would navigate and jump
 * first, so its default is cancelled here in the capture phase, and Lenis'
 * own anchor handler (listening on the window) does the scroll. Lenis honours
 * each section's CSS scroll-margin-top, which keeps headings clear of the
 * fixed header. It runs even when the OS asks for reduced motion, as the
 * site owner wants.
 */
export function SmoothScroll() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!link || (link.target && link.target !== "_self")) return;
      const url = new URL(link.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || !url.hash) return;
      e.preventDefault();
      history.replaceState(history.state, "", url.hash);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return <ReactLenis root options={{ lerp: 0.1, anchors: true, respectReducedMotion: false }} />;
}
