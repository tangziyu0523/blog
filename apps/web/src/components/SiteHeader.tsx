"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { useAuth } from "@/lib/auth-context";
import { UserMenu } from "./UserMenu";
import { IndexLink } from "./IndexLink";
import { decideHeaderVisible } from "@/lib/header-visibility";

function currentScrollTop(): number {
  const s = ScrollSmoother.get();
  return s ? s.scrollTop() : window.scrollY;
}

const LINK: React.CSSProperties = { color: "var(--text-2)" };

/**
 * Fixed top bar, rendered outside the ScrollSmoother transform so it stays put on
 * every route. Hides on scroll-down, reveals on scroll-up; always shown near the top.
 * Honors prefers-reduced-motion (stays visible, no transform animation).
 */
export function SiteHeader() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(true);
  const prevY = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    prevY.current = currentScrollTop();
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const cur = currentScrollTop();
        setVisible((v) => decideHeaderVisible(prevY.current, cur, v));
        prevY.current = cur;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header
      id="site-header"
      className="fixed inset-x-0 top-0 z-40 flex items-center justify-between border-b px-6 py-4 transition-transform duration-300"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg)",
        transform: visible ? "translateY(0)" : "translateY(-100%)",
      }}
    >
      <Link href="/" style={{ fontFamily: "var(--font-display)" }}>
        Naturalist Journal
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <IndexLink style={LINK}>文章列表</IndexLink>
        {user && (
          <Link href="/editor/new" style={LINK}>
            写文章
          </Link>
        )}
        {user && (
          <Link href="/me/posts" style={LINK}>
            我的文章
          </Link>
        )}
        <Link href="/search" style={LINK}>
          搜索
        </Link>
        <UserMenu />
      </nav>
    </header>
  );
}
