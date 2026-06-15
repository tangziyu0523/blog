"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  HOME_SCROLL_KEY,
  parseSavedScroll,
  decideHomeScroll,
} from "@/lib/scroll-restoration";
import { consumeNavType } from "@/lib/nav-history";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * ScrollSmoother base. Wraps the whole app in the #smooth-wrapper / #smooth-content
 * structure, but only *engages* smoothing on the home route ("/") with motion allowed.
 *
 * On the home route this component also restores the reader's prior scroll position
 * on back/forward navigation (and persists it as they scroll), so returning to the
 * home list lands them where they were. Other routes scroll natively and are reset to
 * the top by ScrollManager.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Smoothed home path: create the smoother, restore position, persist on scroll.
  useGSAP(
    () => {
      if (pathname !== "/") return;
      if (prefersReducedMotion()) return;
      if (!wrapperRef.current || !contentRef.current) return;

      const smoother = ScrollSmoother.create({
        wrapper: wrapperRef.current,
        content: contentRef.current,
        smooth: 1.2,
        effects: false,
        normalizeScroll: false,
      });

      const target = decideHomeScroll(
        consumeNavType(),
        parseSavedScroll(sessionStorage.getItem(HOME_SCROLL_KEY)),
      );
      // Defer one frame so ScrollTrigger has measured pinned sections.
      requestAnimationFrame(() => smoother.scrollTo(target, false));

      let raf = 0;
      const save = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          sessionStorage.setItem(
            HOME_SCROLL_KEY,
            String(Math.round(smoother.scrollTop())),
          );
        });
      };
      window.addEventListener("scroll", save, { passive: true });

      return () => {
        window.removeEventListener("scroll", save);
        cancelAnimationFrame(raf);
        smoother.kill();
      };
    },
    { dependencies: [pathname], scope: wrapperRef },
  );

  // Reduced-motion home path: native window scroll, same save/restore decision.
  useEffect(() => {
    if (pathname !== "/") return;
    if (!prefersReducedMotion()) return;

    const target = decideHomeScroll(
      consumeNavType(),
      parseSavedScroll(sessionStorage.getItem(HOME_SCROLL_KEY)),
    );
    window.scrollTo(0, target);

    let raf = 0;
    const save = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sessionStorage.setItem(
          HOME_SCROLL_KEY,
          String(Math.round(window.scrollY)),
        );
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
