import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Flower1(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/Flower1.png"
      intrinsicWidth={567}
      intrinsicHeight={801}
      {...props}
    />
  );
}
