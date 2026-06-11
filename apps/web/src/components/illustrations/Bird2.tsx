import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Bird2(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/Bird2.png"
      intrinsicWidth={800}
      intrinsicHeight={800}
      {...props}
    />
  );
}
