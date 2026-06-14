"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(SplitText, ScrollTrigger);
}

/**
 * Word-by-word "ink developing" reveal. As the text scrolls through view each
 * word fades from faint ink (opacity 0.18) to full ink (1), scrubbed to scroll
 * position so it tracks the reader rather than playing on a timer.
 *
 * Reduced-motion readers get the fully-inked text immediately with no split and
 * no animation. SplitText runs only inside useGSAP (client-only), so SSR emits
 * plain, readable text; SplitText's default accessibility behaviour is left
 * untouched (we never set aria attributes by hand).
 */
export function RevealText({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLParagraphElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();

      // Motion allowed: split into words and develop them on scroll.
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // SplitText is context-aware (GSAP 3.13+): useGSAP reverts both the
        // split DOM and the returned tween on cleanup / re-split (autoSplit).
        SplitText.create(el, {
          type: "words",
          autoSplit: true,
          onSplit: (self: SplitText) =>
            gsap.from(self.words, {
              opacity: 0.18, // 淡墨 → 浓墨
              ease: "none",
              stagger: 0.1,
              scrollTrigger: {
                trigger: el,
                start: "top 85%",
                end: "top 35%",
                scrub: true,
              },
            }),
        });
      });

      // Reduced motion: full ink straight away, no split, no animation.
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(el, { opacity: 1 });
      });
    },
    { scope: ref },
  );

  return (
    <p ref={ref} className={className} style={style}>
      {children}
    </p>
  );
}
