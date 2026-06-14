"use client";

import type { ReactNode } from "react";
import { InkCanvas } from "./InkCanvasDynamic";

// Master switch for the WebGL ink layer. Off while the scroll choreography is
// being tuned; flip back to true to re-enable. (ink/ engine code is untouched.)
const INK_ENABLED = false;

/**
 * Positions the ink overlay behind its hero content. The `position: relative`
 * wrapper is the anchor the absolutely-positioned <InkCanvas /> fills; children
 * (the masthead + headline) render on top untouched.
 *
 * Children get their own wrapper so they are NOT direct siblings of <InkCanvas />
 * in this React-owned div. ScrollTrigger's pin (inside ChapterStage) reparents
 * the pinned node into a pin-spacer; keeping that mutation one level down means
 * InkCanvas's stable sibling reference (the content wrapper) is never moved, so
 * the deferred ssr:false mount of InkCanvas can't hit an insertBefore against a
 * reparented node.
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
      {INK_ENABLED && <InkCanvas />}
      <div>{children}</div>
    </div>
  );
}
