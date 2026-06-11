import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Butterfly2(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/Butterfly2.png"
      intrinsicWidth={800}
      intrinsicHeight={800}
      {...props}
    />
  );
}
