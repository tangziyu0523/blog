import { BaseIllustration, type IllustrationProps } from "./Illustration";

export function Butterfly3(props: IllustrationProps) {
  return (
    <BaseIllustration
      src="/illustrations/Butterfly3.png"
      intrinsicWidth={800}
      intrinsicHeight={800}
      {...props}
    />
  );
}
