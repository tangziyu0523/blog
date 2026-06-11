import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Foliage2(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/foliage2.png"
      intrinsicWidth={677}
      intrinsicHeight={800}
      {...props}
    />
  );
}
