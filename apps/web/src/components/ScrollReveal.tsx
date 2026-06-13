"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Reveals the home feed as it scrolls into focus: the headline rises into place
 * first, then the demoted list rows cascade in one after another. Pure
 * transform + opacity so it never reflows the layout.
 *
 * The targets ship hidden via the scoped CSS below — gsap.to() animates them
 * back to their resting state, so there's no flash of visible content before
 * the tween runs. The hiding lives inside `prefers-reduced-motion:
 * no-preference`, so readers who opt out of motion (and skip the JS animation
 * via the early return) still see everything at full opacity.
 *
 * The component leaves its children untouched — it only animates the lead
 * `<article>` and the rows inside the `<section>` it wraps.
 */
export function ScrollReveal({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      const container = containerRef.current;
      if (!container) return;

      // Targets start hidden in CSS; animate them home.
      const reveal = {
        y: 0,
        opacity: 1,
        duration: 1.0,
        ease: "power2.out",
      } as const;

      // The lead article rises into place as it enters the viewport.
      const headline = container.querySelector(":scope > article");
      if (headline) {
        gsap.to(headline, {
          ...reveal,
          scrollTrigger: { trigger: headline, start: "top 95%" },
        });
      }

      // The demoted index rows arrive in a staggered cascade.
      const rows = gsap.utils.toArray<HTMLElement>(
        container.querySelectorAll(":scope > section > article"),
      );
      if (rows.length > 0) {
        gsap.to(rows, {
          ...reveal,
          stagger: 0.1,
          scrollTrigger: { trigger: rows[0], start: "top 95%" },
        });
      }
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className="scroll-reveal">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .scroll-reveal > article,
          .scroll-reveal > section > article {
            opacity: 0;
            transform: translateY(60px);
          }
        }
      `}</style>
      {children}
    </div>
  );
}
