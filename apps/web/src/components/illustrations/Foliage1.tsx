import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Foliage1(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/foliage1.png"
      intrinsicWidth={450}
      intrinsicHeight={800}
      {...props}
    />
  );
}
