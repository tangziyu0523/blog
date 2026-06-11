import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Bird1(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/Bird1.png"
      intrinsicWidth={800}
      intrinsicHeight={640}
      {...props}
    />
  );
}
