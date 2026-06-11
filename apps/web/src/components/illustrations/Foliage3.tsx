import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Foliage3(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/foliage3.png"
      intrinsicWidth={800}
      intrinsicHeight={800}
      {...props}
    />
  );
}
