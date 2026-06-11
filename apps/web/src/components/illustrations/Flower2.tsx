import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Flower2(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/flower2.png"
      intrinsicWidth={600}
      intrinsicHeight={800}
      {...props}
    />
  );
}
