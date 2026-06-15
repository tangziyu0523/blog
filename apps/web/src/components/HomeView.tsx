"use client";

import type { ReactNode } from "react";
import { useHomeMode } from "@/components/HomeModeProvider";

/**
 * Renders the home in its current mode: intro mode shows the entrance choreography
 * with the list below; list mode shows the list alone, at the top (no pinned intro),
 * so it sits at a small, stable scroll position.
 */
export function HomeView({ intro, list }: { intro: ReactNode; list: ReactNode }) {
  const { mode } = useHomeMode();
  if (mode === "list") return <>{list}</>;
  return (
    <>
      {intro}
      {list}
    </>
  );
}
