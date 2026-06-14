"use client";

import { useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

/**
 * ScrollSmoother base. Wraps the whole app (header + page) in the
 * #smooth-wrapper / #smooth-content structure ScrollSmoother needs, but only
 * *engages* smoothing on the home route ("/") and only when motion is allowed.
 *
 * On every other route, and under prefers-reduced-motion, the wrapper/content
 * are inert plain divs and the browser scrolls natively — so the choreographed
 * home degrades to an ordinary long page elsewhere.
 *
 * The created smoother is the ScrollSmoother singleton; other layers (the ink
 * canvas) read scroll position via `ScrollSmoother.get().scrollTop()` rather
 * than `window.scrollY`, which is meaningless once content is transformed.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      if (pathname !== "/") return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      if (!wrapperRef.current || !contentRef.current) return;

      const smoother = ScrollSmoother.create({
        wrapper: wrapperRef.current,
        content: contentRef.current,
        smooth: 1.2,
        effects: false,
        normalizeScroll: false,
      });

      return () => {
        smoother.kill();
      };
    },
    { dependencies: [pathname], scope: wrapperRef },
  );

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
