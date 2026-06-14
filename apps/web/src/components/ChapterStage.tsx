"use client";

import { Children, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Total pinned scroll distance (≈1310vh) over which the book pages cross-dissolve.
// The long crossfades (not the dwell) carry the flowing feel; dwell kept for reading.
const TRAVEL = 13.06;
// Width of each crossfade window in normalised timeline time (0.358 ≈ 468vh).
const FADE = 0.3584;
// Start of each crossfade window, in timeline progress (reading-paced, 3 pages).
// Index 1 = P1→P2 @0.11, index 2 = P2→P3 @0.54. Tuned for the curated pages.
const CROSSFADE_AT = [0, 0.1062, 0.5425];

/**
 * Pin-and-fade book stage. The curated pages stack as absolute layers in a
 * one-viewport pinned frame; a single scrubbed timeline cross-dissolves them
 * with autoAlpha + a subtle scale (depth, not slide). Slow-paced: each page
 * dwells at length, then a long ~468vh crossfade bleeds into the next. No snap,
 * no per-layer triggers, no discrete switch.
 *
 * Pin is only a hold — and the ScrollSmoother-compatible one (native sticky
 * breaks under the smoother's transform). Under prefers-reduced-motion none of
 * this runs: positioning is applied only in the motion branch, so SSR / no-JS /
 * reduced-motion all read as a plain stacked long page.
 */
export function ChapterStage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const stage = stageRef.current;
      const frame = frameRef.current;
      if (!stage || !frame) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const layers = gsap.utils.toArray<HTMLElement>(
          frame.querySelectorAll(":scope > .chapter-layer"),
        );
        if (layers.length === 0) return;

        // Stack the pages on one pinned viewport.
        gsap.set(frame, { position: "relative", height: "100vh", overflow: "hidden" });
        layers.forEach((layer, i) => {
          gsap.set(layer, {
            position: "absolute",
            inset: 0,
            autoAlpha: i === 0 ? 1 : 0,
            scale: i === 0 ? 1 : 1.04,
          });
        });

        if (layers.length === 1) return;

        // One scrubbed timeline, duration normalised to 1 so each tween's
        // position equals scroll progress. Pin holds the frame; no snap.
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: frame,
            start: "top top",
            end: () => "+=" + window.innerHeight * TRAVEL,
            pin: true,
            scrub: 1.5,
            invalidateOnRefresh: true,
          },
        });

        // Adjacent fade-out / fade-in share each crossfade window → overlap bleed.
        for (let i = 1; i < layers.length; i++) {
          const at = CROSSFADE_AT[i] ?? CROSSFADE_AT[CROSSFADE_AT.length - 1];
          tl.to(layers[i - 1], { autoAlpha: 0, scale: 0.99, ease: "power1.inOut", duration: FADE }, at)
            .to(layers[i], { autoAlpha: 1, scale: 1, ease: "power1.inOut", duration: FADE }, at);
        }

        // Hold the last page from its crossfade end (≈0.72) to progress 1, which
        // also anchors the timeline duration to 1.0 so the page stays full until
        // the pin releases into the index.
        const lastAt = CROSSFADE_AT[layers.length - 1] ?? 0.62;
        tl.to(layers[layers.length - 1], { autoAlpha: 1, duration: 1 - (lastAt + FADE) }, lastAt + FADE);
      });

      // reduce branch: intentionally empty — layers remain in normal flow.
    },
    { scope: stageRef },
  );

  return (
    <div ref={stageRef}>
      <div ref={frameRef}>
        {Children.map(children, (child) => (
          <div className="chapter-layer">{child}</div>
        ))}
      </div>
    </div>
  );
}
