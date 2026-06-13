"use client";

import type { ReactNode } from "react";
import { InkCanvas } from "./InkCanvasDynamic";

/**
 * Positions the ink overlay behind its hero content. The `position: relative`
 * wrapper is the anchor the absolutely-positioned <InkCanvas /> fills; children
 * (the masthead + headline) render on top untouched.
 */
export function HeroZone({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div style={{ position: "relative" }} className={className}>
      <InkCanvas />
      {children}
    </div>
  );
}
