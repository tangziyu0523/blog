import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Butterfly1(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/Butterfly_1.png"
      intrinsicWidth={800}
      intrinsicHeight={800}
      {...props}
    />
  );
}
