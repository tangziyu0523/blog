"use client";

import { useRef, type CSSProperties } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

const TINY = "font-sans text-[10px] uppercase tracking-[0.25em]";

/**
 * Inter-chapter marquee band — a seamless horizontal scroll of a repeated
 * editorial slug. The track holds two copies of the text and animates by -50%,
 * so the loop is gap-free. Decorative, so it's hidden from assistive tech.
 *
 * Under prefers-reduced-motion the animation is skipped and the band sits
 * static.
 */
export function Marquee({
  text = "— NATURALIST JOURNAL — MMXXVI —",
  className,
  style,
}: {
  text?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        if (!trackRef.current) return;
        gsap.to(trackRef.current, {
          xPercent: -50,
          duration: 24,
          ease: "none",
          repeat: -1,
        });
      });
    },
    { scope: trackRef },
  );

  return (
    <div
      aria-hidden
      className={`overflow-hidden whitespace-nowrap ${className ?? ""}`}
      style={style}
    >
      <div ref={trackRef} className="inline-flex will-change-transform">
        <span className={`${TINY} pr-8`} style={{ color: "var(--text-2)" }}>
          {text}
        </span>
        <span className={`${TINY} pr-8`} style={{ color: "var(--text-2)" }}>
          {text}
        </span>
      </div>
    </div>
  );
}
