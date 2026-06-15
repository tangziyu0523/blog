"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Reveals the feed rows present at mount as they scroll into view: the lead article
 * rises first, then the index rows cascade. Hiding is applied imperatively with
 * gsap.set (only to the rows that exist at mount), so rows added later — e.g. after a
 * tab switch — render visible immediately with no replay and no flash. Skipped under
 * prefers-reduced-motion.
 */
export function ScrollReveal({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const container = containerRef.current;
      if (!container) return;

      const reveal = { y: 0, opacity: 1, duration: 1.0, ease: "power2.out" } as const;

      const headline = container.querySelector<HTMLElement>(":scope > article");
      if (headline) {
        gsap.set(headline, { opacity: 0, y: 60 });
        gsap.to(headline, { ...reveal, scrollTrigger: { trigger: headline, start: "top 95%" } });
      }

      const rows = gsap.utils.toArray<HTMLElement>(
        container.querySelectorAll(":scope > section > article"),
      );
      if (rows.length > 0) {
        gsap.set(rows, { opacity: 0, y: 60 });
        gsap.to(rows, {
          ...reveal,
          stagger: 0.1,
          scrollTrigger: { trigger: rows[0], start: "top 95%" },
        });
      }
    },
    { scope: containerRef },
  );

  return <div ref={containerRef} className="scroll-reveal">{children}</div>;
}
