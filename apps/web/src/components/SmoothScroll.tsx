"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useHomeMode } from "@/components/HomeModeProvider";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * ScrollSmoother base. Engages the smoother only on the home route in intro mode
 * with motion allowed; list mode and every other route scroll natively. Leaving the
 * smoothed view, it kills the smoother and resets scroll before paint so the next
 * view never shows a frame under the smoother's leftover transform.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { mode } = useHomeMode();
  const smoothed = pathname === "/" && mode === "intro";

  useIsoLayoutEffect(() => {
    if (smoothed) return;
    ScrollSmoother.get()?.kill();
    window.scrollTo(0, 0);
  }, [smoothed]);

  useGSAP(
    () => {
      if (!smoothed) return;
      if (prefersReducedMotion()) return;
      if (!wrapperRef.current || !contentRef.current) return;

      const smoother = ScrollSmoother.create({
        wrapper: wrapperRef.current,
        content: contentRef.current,
        smooth: 1.2,
        effects: false,
        normalizeScroll: false,
      });
      ScrollTrigger.refresh();
      requestAnimationFrame(() => smoother.scrollTo(0, false));

      return () => {
        if (ScrollSmoother.get() === smoother) smoother.kill();
      };
    },
    { dependencies: [smoothed], scope: wrapperRef },
  );

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      {/* Clear the fixed header on every natively-scrolled view; the smoothed intro
          needs no clearance (its hero is centered and the header overlays empty top). */}
      <div id="smooth-content" ref={contentRef} className={smoothed ? undefined : "pt-20"}>
        {children}
      </div>
    </div>
  );
}
