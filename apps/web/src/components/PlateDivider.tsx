import type { ComponentType } from "react";
import type { IllustrationProps } from "@/components/illustrations";

/**
 * A centered section break: a small naturalist plate flanked by hairline rules.
 * Decorative-only; the plate component renders aria-hidden.
 */
export function PlateDivider({
  illustration: Illo,
  size = 48,
}: {
  illustration: ComponentType<IllustrationProps>;
  size?: number;
}) {
  return (
    <div className="my-12 flex items-center gap-4" aria-hidden>
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
      <Illo width={size} height={size} className="opacity-70" />
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
    </div>
  );
}
