"use client";

import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { useHomeMode } from "@/components/HomeModeProvider";
import { LIST_OFFSET_KEY } from "@/lib/home-landing";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Renders the home in its current mode: intro mode shows the entrance choreography
 * with the list below; list mode shows the list alone, at the top (no pinned intro).
 * In list mode it restores the saved native scroll offset (back/forward) or starts at
 * the top, and persists the offset as the reader scrolls.
 */
export function HomeView({ intro, list }: { intro: ReactNode; list: ReactNode }) {
  const { mode, listOffset } = useHomeMode();

  useIsoLayoutEffect(() => {
    if (mode !== "list") return;
    window.scrollTo(0, listOffset ?? 0);
  }, [mode, listOffset]);

  useEffect(() => {
    if (mode !== "list") return;
    let raf = 0;
    const save = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sessionStorage.setItem(LIST_OFFSET_KEY, String(Math.max(0, Math.round(window.scrollY))));
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      cancelAnimationFrame(raf);
    };
  }, [mode]);

  if (mode === "list") return <>{list}</>;
  return (
    <>
      {intro}
      {list}
    </>
  );
}
