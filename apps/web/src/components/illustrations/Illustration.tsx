import Image from "next/image";

export interface IllustrationProps {
  /** Display width in px. Defaults to the illustration's intrinsic width. */
  width?: number;
  /** Display height in px. Defaults to the illustration's intrinsic height. */
  height?: number;
  className?: string;
}

interface BaseIllustrationProps extends IllustrationProps {
  src: string;
  intrinsicWidth: number;
  intrinsicHeight: number;
}

/**
 * Shared wrapper for the naturalist decorative illustrations.
 * These are decorative-only: rendered with an empty alt and aria-hidden so
 * assistive technology skips them. Passing only `width` (or only `height`)
 * keeps the other axis at the intrinsic value, preserving aspect ratio.
 */
export function BaseIllustration({
  src,
  intrinsicWidth,
  intrinsicHeight,
  width,
  height,
  className,
}: BaseIllustrationProps) {
  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      width={width ?? intrinsicWidth}
      height={height ?? intrinsicHeight}
      className={className}
    />
  );
}
