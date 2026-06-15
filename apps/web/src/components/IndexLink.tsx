"use client";

import type { CSSProperties, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { setToIndexIntent, SCROLL_TO_INDEX_EVENT } from "@/lib/home-landing";

/**
 * Links to the home article index. From another route it flags the intent and
 * navigates home (SmoothScroll lands on the list on mount); already on home it
 * dispatches an event SmoothScroll listens for, scrolling to the list directly.
 * Either way it bypasses the entrance choreography.
 */
export function IndexLink({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const router = useRouter();
  const pathname = usePathname();

  function onClick(e: React.MouseEvent): void {
    e.preventDefault();
    if (pathname === "/") {
      window.dispatchEvent(new Event(SCROLL_TO_INDEX_EVENT));
    } else {
      setToIndexIntent();
      router.push("/");
    }
  }

  return (
    // eslint-disable-next-line @next/next/no-html-link-for-pages
    <a href="/" onClick={onClick} className={className} style={style}>
      {children}
    </a>
  );
}
