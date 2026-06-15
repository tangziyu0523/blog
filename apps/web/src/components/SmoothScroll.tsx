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
import { parseSavedScroll } from "@/lib/scroll-restoration";
import { consumeNavType } from "@/lib/nav-history";
import {
  LIST_OFFSET_KEY,
  SCROLL_TO_INDEX_EVENT,
  decideHomeLanding,
  consumeToIndexIntent,
  type HomeLanding,
} from "@/lib/home-landing";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

// useLayoutEffect on the client, useEffect on the server (avoids the SSR warning).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function indexAnchor(): HTMLElement | null {
  return document.getElementById("article-index");
}

/**
 * ScrollSmoother base + home scroll positioning. On the home route it lands at the
 * intro top, at the article-list top (explicit "文章列表" intent), or back into the
 * list at the reader's saved offset (back/forward) — always resolved against the
 * #article-index anchor *after* the pinned layout is measured. Leaving home, it
 * kills the smoother and resets scroll before paint so the next route never shows a
 * frame under the smoother's leftover transform.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Pre-paint teardown when leaving home.
  useIsoLayoutEffect(() => {
    if (pathname === "/") return;
    ScrollSmoother.get()?.kill();
    window.scrollTo(0, 0);
  }, [pathname]);

  // Smoothed home path.
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

      const baseOffset = (): number => {
        const el = indexAnchor();
        return el ? smoother.offset(el, "top top") : 0;
      };

      let stopIndexReassert: (() => void) | null = null;

      const land = (l: HomeLanding): void => {
        smoother.scrollTo(l.mode === "top" ? 0 : baseOffset() + l.offset, false);
      };

      const landing = decideHomeLanding(
        consumeNavType(),
        consumeToIndexIntent(),
        parseSavedScroll(sessionStorage.getItem(LIST_OFFSET_KEY)),
      );

      ScrollTrigger.refresh();

      // Re-assert a list landing across the post-mount settling window. The home
      // layout keeps shifting briefly after mount — ScrollSmoother fires a deferred
      // refresh and ScrollTrigger re-runs on "load"/"resize" plus a 0.2s delayed
      // refresh, each recomputing the pinned-intro height. A single rAF scrollTo can
      // land before the final settle and leave the reader partway through the intro,
      // so for the list we re-apply on every refresh until they scroll (or a short
      // backstop elapses). The intro-top landing needs no re-assertion (0 stays 0).
      if (landing.mode !== "index") {
        requestAnimationFrame(() => land(landing));
      } else {
        let stopped = false;
        let settleTimer = 0;
        const reassert = (): void => {
          if (!stopped) land(landing);
        };
        const stop = (): void => {
          if (stopped) return;
          stopped = true;
          ScrollTrigger.removeEventListener("refresh", reassert);
          window.removeEventListener("wheel", stop);
          window.removeEventListener("touchstart", stop);
          window.removeEventListener("keydown", stop);
          window.clearTimeout(settleTimer);
        };
        requestAnimationFrame(reassert);
        ScrollTrigger.addEventListener("refresh", reassert);
        window.addEventListener("wheel", stop, { passive: true });
        window.addEventListener("touchstart", stop, { passive: true });
        window.addEventListener("keydown", stop);
        settleTimer = window.setTimeout(stop, 1200);
        stopIndexReassert = stop;
      }

      let raf = 0;
      const save = (): void => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          sessionStorage.setItem(
            LIST_OFFSET_KEY,
            String(Math.max(0, Math.round(smoother.scrollTop() - baseOffset()))),
          );
        });
      };
      window.addEventListener("scroll", save, { passive: true });

      const onScrollToIndex = (): void => land({ mode: "index", offset: 0 });
      window.addEventListener(SCROLL_TO_INDEX_EVENT, onScrollToIndex);

      return () => {
        stopIndexReassert?.();
        window.removeEventListener("scroll", save);
        window.removeEventListener(SCROLL_TO_INDEX_EVENT, onScrollToIndex);
        cancelAnimationFrame(raf);
        sessionStorage.setItem(
          LIST_OFFSET_KEY,
          String(Math.max(0, Math.round(smoother.scrollTop() - baseOffset()))),
        );
        if (ScrollSmoother.get() === smoother) smoother.kill();
      };
    },
    { dependencies: [pathname], scope: wrapperRef },
  );

  // Reduced-motion home path: native window scroll, same decision.
  useEffect(() => {
    if (pathname !== "/") return;
    if (!prefersReducedMotion()) return;

    const baseOffset = (): number => {
      const el = indexAnchor();
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    };

    const land = (l: HomeLanding): void => {
      window.scrollTo(0, l.mode === "top" ? 0 : baseOffset() + l.offset);
    };

    const landing = decideHomeLanding(
      consumeNavType(),
      consumeToIndexIntent(),
      parseSavedScroll(sessionStorage.getItem(LIST_OFFSET_KEY)),
    );
    requestAnimationFrame(() => land(landing));

    let raf = 0;
    const save = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sessionStorage.setItem(
          LIST_OFFSET_KEY,
          String(Math.max(0, Math.round(window.scrollY - baseOffset()))),
        );
      });
    };
    window.addEventListener("scroll", save, { passive: true });

    const onScrollToIndex = (): void => land({ mode: "index", offset: 0 });
    window.addEventListener(SCROLL_TO_INDEX_EVENT, onScrollToIndex);

    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener(SCROLL_TO_INDEX_EVENT, onScrollToIndex);
      cancelAnimationFrame(raf);
      sessionStorage.setItem(
        LIST_OFFSET_KEY,
        String(Math.max(0, Math.round(window.scrollY - baseOffset()))),
      );
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
