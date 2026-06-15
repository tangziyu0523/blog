"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { HOME_INTRO_EVENT } from "@/lib/home-landing";

/**
 * The masthead logo. From another route it navigates home normally (intro mode at
 * the top). Already on home it returns to the intro at the top — a plain
 * <Link href="/"> is a no-op on the current route, so this handles it explicitly:
 * switch to intro mode and scroll to the top (through the smoother when present).
 */
export function BrandLink({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  const pathname = usePathname();

  function onClick(e: React.MouseEvent): void {
    if (pathname !== "/") return; // let Link navigate home
    e.preventDefault();
    window.dispatchEvent(new Event(HOME_INTRO_EVENT));
    const s = ScrollSmoother.get();
    if (s) s.scrollTo(0, true);
    else {
      window.scrollTo({ top: 0, behavior: "smooth" });
      // If switching list→intro just engaged a smoother, settle it at the top too.
      requestAnimationFrame(() => ScrollSmoother.get()?.scrollTo(0, false));
    }
  }

  return (
    <Link href="/" onClick={onClick} style={style}>
      {children}
    </Link>
  );
}
