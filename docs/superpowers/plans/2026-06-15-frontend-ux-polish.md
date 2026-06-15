# Frontend UX Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four frontend UX issues in `apps/web` — articles must open at the top, returning home must restore the reader's place in the article list, the header must auto-hide on scroll-down and reveal on scroll-up, sub-pages need a back button, and the naturalist illustrations must decorate more of the site (restrained).

**Architecture:** A single small scroll-position controller backs issues 1 and 4: sub-pages reset to top on mount; the home page (driven by GSAP ScrollSmoother) saves its scroll position and restores it on back/forward navigation, detected via `popstate`. The header becomes a fixed, auto-hiding bar rendered outside the ScrollSmoother transform so it works on every route; the old floating-ball nav is removed and its entries fold into the header's user menu. A back button using browser history is added to sub-pages. Decoration reuses the existing `BaseIllustration` components at low opacity per the design spec.

**Tech Stack:** Next.js 16 (App Router), React 19, GSAP ScrollSmoother, Tailwind v4, Node's built-in `node --test` for pure-logic unit tests (matches `packages/shared`).

---

## File Structure

**Pure logic (unit-tested with `node --test`):**
- `apps/web/src/lib/scroll-restoration.ts` — home save/restore decision (pure, no DOM).
- `apps/web/src/lib/header-visibility.ts` — header show/hide decision (pure, no DOM).

**Client glue (no unit tests; thin):**
- `apps/web/src/lib/nav-history.ts` — `popstate` pop/push detection.
- `apps/web/src/components/ScrollManager.tsx` — installs the pop listener; resets sub-pages to top.
- `apps/web/src/components/SmoothScroll.tsx` — (modify) home save/restore through ScrollSmoother.
- `apps/web/src/components/SiteHeader.tsx` — fixed auto-hiding header.
- `apps/web/src/components/UserMenu.tsx` — (modify) add 写文章 / 我的文章.
- `apps/web/src/components/BackButton.tsx` — browser-history back control.
- `apps/web/src/components/PlateDivider.tsx` — illustrated divider.
- `apps/web/src/app/layout.tsx` — (modify) restructure header/controllers.
- `apps/web/src/app/not-found.tsx` — 404 with illustration.

**Removed:**
- `apps/web/src/components/FloatingNav.tsx`, `apps/web/src/components/nav-icons.tsx` (only consumer is FloatingNav).

**Decoration touch-ups:** `posts/[slug]/page.tsx`, `login/page.tsx`, `register/page.tsx`, `search/page.tsx`.

---

## Task 1: Web test runner + pure scroll-restoration logic

**Files:**
- Modify: `apps/web/package.json` (add `test` script)
- Modify: `apps/web/tsconfig.json` (exclude test files from typecheck)
- Create: `apps/web/src/lib/scroll-restoration.ts`
- Test: `apps/web/src/lib/scroll-restoration.test.ts`

The decision logic is pure so it can be tested without a DOM. Node 25 strips TypeScript types natively, so `node --test` runs `.test.ts` directly (same pattern as `packages/shared`). Test files are excluded from `tsc` typecheck because they import sibling modules with explicit `.ts` extensions (required by Node, rejected by the app's `bundler` resolution).

- [ ] **Step 1: Add the test script to `apps/web/package.json`**

In the `"scripts"` block, add a `test` entry (after `"typecheck"`):

```json
    "typecheck": "tsc --noEmit",
    "test": "node --test \"src/**/*.test.ts\""
```

- [ ] **Step 2: Exclude test files from the app typecheck**

In `apps/web/tsconfig.json`, change the `exclude` array:

```json
  "exclude": ["node_modules", "src/**/*.test.ts"]
```

- [ ] **Step 3: Write the failing test**

Create `apps/web/src/lib/scroll-restoration.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOME_SCROLL_KEY, parseSavedScroll, decideHomeScroll } from './scroll-restoration.ts';

test('HOME_SCROLL_KEY is a stable string', () => {
  assert.equal(typeof HOME_SCROLL_KEY, 'string');
  assert.ok(HOME_SCROLL_KEY.length > 0);
});

test('parseSavedScroll returns null for missing/invalid/negative values', () => {
  assert.equal(parseSavedScroll(null), null);
  assert.equal(parseSavedScroll(''), null);
  assert.equal(parseSavedScroll('abc'), null);
  assert.equal(parseSavedScroll('-5'), null);
});

test('parseSavedScroll parses a non-negative integer', () => {
  assert.equal(parseSavedScroll('0'), 0);
  assert.equal(parseSavedScroll('1234'), 1234);
  assert.equal(parseSavedScroll('1234.7'), 1234);
});

test('decideHomeScroll restores saved position on pop navigation', () => {
  assert.equal(decideHomeScroll('pop', 800), 800);
  assert.equal(decideHomeScroll('pop', 0), 0);
});

test('decideHomeScroll goes to top on push navigation', () => {
  assert.equal(decideHomeScroll('push', 800), 0);
});

test('decideHomeScroll goes to top on pop when nothing was saved', () => {
  assert.equal(decideHomeScroll('pop', null), 0);
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter @blog/web test`
Expected: FAIL — cannot resolve `./scroll-restoration.ts` (module does not exist yet).

- [ ] **Step 5: Write the minimal implementation**

Create `apps/web/src/lib/scroll-restoration.ts`:

```ts
/** Navigation kind used to decide whether to restore the home scroll position. */
export type NavType = 'pop' | 'push';

/** sessionStorage key holding the last home scrollTop (in px). */
export const HOME_SCROLL_KEY = 'home:scrollTop';

/**
 * Parse a stored scroll value. Returns a non-negative integer, or null when the
 * value is missing, non-numeric, or negative.
 */
export function parseSavedScroll(raw: string | null): number | null {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

/**
 * Decide the home scroll target. On back/forward ('pop') with a saved position,
 * restore it; otherwise (fresh link/push, or nothing saved) start at the top.
 */
export function decideHomeScroll(navType: NavType, saved: number | null): number {
  if (navType === 'pop' && saved !== null) return saved;
  return 0;
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @blog/web test`
Expected: PASS — 6 tests pass.

- [ ] **Step 7: Verify typecheck still passes**

Run: `pnpm --filter @blog/web typecheck`
Expected: no errors (test file is excluded; `scroll-restoration.ts` is clean).

- [ ] **Step 8: Commit**

```bash
git add apps/web/package.json apps/web/tsconfig.json apps/web/src/lib/scroll-restoration.ts apps/web/src/lib/scroll-restoration.test.ts
git commit -m "feat(web): add scroll-restoration decision logic and web test runner"
```

---

## Task 2: Pure header-visibility logic

**Files:**
- Create: `apps/web/src/lib/header-visibility.ts`
- Test: `apps/web/src/lib/header-visibility.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/header-visibility.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideHeaderVisible } from './header-visibility.ts';

test('always visible at or near the top', () => {
  assert.equal(decideHeaderVisible(50, 0, false), true);
  assert.equal(decideHeaderVisible(50, 8, false), true);
});

test('hides when scrolling down past the delta', () => {
  assert.equal(decideHeaderVisible(100, 120, true), false);
});

test('reveals when scrolling up past the delta', () => {
  assert.equal(decideHeaderVisible(200, 180, false), true);
});

test('keeps previous state on jitter below the delta', () => {
  assert.equal(decideHeaderVisible(200, 202, true), true);
  assert.equal(decideHeaderVisible(200, 198, false), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @blog/web test`
Expected: FAIL — cannot resolve `./header-visibility.ts`.

- [ ] **Step 3: Write the minimal implementation**

Create `apps/web/src/lib/header-visibility.ts`:

```ts
interface HeaderOpts {
  /** Always show when scrollTop is at or below this (px). */
  topThreshold?: number;
  /** Ignore movements smaller than this (px) to avoid jitter. */
  delta?: number;
}

/**
 * Decide whether the auto-hiding header should be visible.
 * Always visible near the top; hide on a downward move past `delta`; reveal on an
 * upward move past `delta`; otherwise keep the previous state.
 */
export function decideHeaderVisible(
  prevY: number,
  curY: number,
  prevVisible: boolean,
  opts: HeaderOpts = {},
): boolean {
  const topThreshold = opts.topThreshold ?? 8;
  const delta = opts.delta ?? 6;
  if (curY <= topThreshold) return true;
  if (curY - prevY > delta) return false;
  if (prevY - curY > delta) return true;
  return prevVisible;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @blog/web test`
Expected: PASS — all header-visibility tests pass (plus Task 1's).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/header-visibility.ts apps/web/src/lib/header-visibility.test.ts
git commit -m "feat(web): add auto-hiding header visibility logic"
```

---

## Task 3: Pop/push detection + ScrollManager (sub-pages open at top)

**Files:**
- Create: `apps/web/src/lib/nav-history.ts`
- Create: `apps/web/src/components/ScrollManager.tsx`
- Modify: `apps/web/src/app/layout.tsx`

This closes issue 1 (articles open at top) and supplies the pop/push signal home restore needs. `ScrollManager` is mounted once in the layout: it installs the global `popstate` listener and, on every navigation to a non-home route, scrolls the window to the top.

- [ ] **Step 1: Create the nav-history module**

Create `apps/web/src/lib/nav-history.ts`:

```ts
import type { NavType } from './scroll-restoration';

// Module-level flag: set true when the last navigation was a browser pop
// (back/forward, including router.back()). Consumed once by the home page.
let popped = false;

/**
 * Install the global popstate listener. Returns a cleanup function.
 * Safe to call on the server (no-op).
 */
export function installPopListener(): () => void {
  if (typeof window === 'undefined') return () => {};
  const onPop = () => {
    popped = true;
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}

/** Return the pending navigation type and reset the pop flag. */
export function consumeNavType(): NavType {
  const type: NavType = popped ? 'pop' : 'push';
  popped = false;
  return type;
}
```

- [ ] **Step 2: Create the ScrollManager component**

Create `apps/web/src/components/ScrollManager.tsx`:

```tsx
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { installPopListener } from '@/lib/nav-history';

/**
 * Mounted once in the root layout. Installs the popstate listener used for
 * scroll restoration, and forces every non-home route to open at the top.
 * The home route is handled by SmoothScroll (it owns the ScrollSmoother).
 */
export function ScrollManager() {
  const pathname = usePathname();

  useEffect(() => installPopListener(), []);

  useEffect(() => {
    if (pathname === '/') return;
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
```

- [ ] **Step 3: Mount ScrollManager in the layout**

In `apps/web/src/app/layout.tsx`, add the import near the other component imports:

```tsx
import { ScrollManager } from "@/components/ScrollManager";
```

Then render it just inside `<AuthProvider>`, before `<SmoothScroll>`:

```tsx
        <AuthProvider>
          <ScrollManager />
          <SmoothScroll>
```

(Leave the rest of the layout unchanged in this task — the header/FloatingNav restructure happens in Task 5.)

- [ ] **Step 4: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 5: Manual check**

Run: `pnpm --filter @blog/web dev`, open the home page, scroll down into the article list, click a post.
Expected: the article opens scrolled to the top (issue 1 fixed). Stop the dev server when done.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/nav-history.ts apps/web/src/components/ScrollManager.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): reset sub-pages to top on navigation"
```

---

## Task 4: Restore home scroll position on back/forward

**Files:**
- Modify: `apps/web/src/components/SmoothScroll.tsx`

`SmoothScroll` owns the ScrollSmoother singleton, so it handles home save/restore. On the home route it restores the saved position when the navigation was a pop (back/forward) and otherwise starts at the top, then persists the position as the reader scrolls. Two paths: the smoothed path (motion allowed) reads/writes through `ScrollSmoother`; the reduced-motion path uses the native window. Exactly one path runs per render, so `consumeNavType()` is called once.

- [ ] **Step 1: Replace the file contents**

Overwrite `apps/web/src/components/SmoothScroll.tsx`:

```tsx
"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  HOME_SCROLL_KEY,
  parseSavedScroll,
  decideHomeScroll,
} from "@/lib/scroll-restoration";
import { consumeNavType } from "@/lib/nav-history";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * ScrollSmoother base. Wraps the whole app in the #smooth-wrapper / #smooth-content
 * structure, but only *engages* smoothing on the home route ("/") with motion allowed.
 *
 * On the home route this component also restores the reader's prior scroll position
 * on back/forward navigation (and persists it as they scroll), so returning to the
 * home list lands them where they were. Other routes scroll natively and are reset to
 * the top by ScrollManager.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Smoothed home path: create the smoother, restore position, persist on scroll.
  useGSAP(
    () => {
      if (pathname !== "/") return;
      if (prefersReducedMotion()) return;
      if (!wrapperRef.current || !contentRef.current) return;

      const smoother = ScrollSmoother.create({
        wrapper: wrapperRef.current,
        content: contentRef.current,
        smooth: 1.2,
        effects: false,
        normalizeScroll: false,
      });

      const target = decideHomeScroll(
        consumeNavType(),
        parseSavedScroll(sessionStorage.getItem(HOME_SCROLL_KEY)),
      );
      // Defer one frame so ScrollTrigger has measured pinned sections.
      requestAnimationFrame(() => smoother.scrollTo(target, false));

      let raf = 0;
      const save = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          sessionStorage.setItem(
            HOME_SCROLL_KEY,
            String(Math.round(smoother.scrollTop())),
          );
        });
      };
      window.addEventListener("scroll", save, { passive: true });

      return () => {
        window.removeEventListener("scroll", save);
        cancelAnimationFrame(raf);
        smoother.kill();
      };
    },
    { dependencies: [pathname], scope: wrapperRef },
  );

  // Reduced-motion home path: native window scroll, same save/restore decision.
  useEffect(() => {
    if (pathname !== "/") return;
    if (!prefersReducedMotion()) return;

    const target = decideHomeScroll(
      consumeNavType(),
      parseSavedScroll(sessionStorage.getItem(HOME_SCROLL_KEY)),
    );
    window.scrollTo(0, target);

    let raf = 0;
    const save = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sessionStorage.setItem(
          HOME_SCROLL_KEY,
          String(Math.round(window.scrollY)),
        );
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      cancelAnimationFrame(raf);
    };
  }, [pathname]);

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 3: Manual check**

Run: `pnpm --filter @blog/web dev`. On the home page scroll into the article list, click a post, then use the browser back button.
Expected: home returns to the saved list position (not the top). Click the top-left title from an article instead — it returns to the top. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/SmoothScroll.tsx
git commit -m "feat(web): restore home scroll position on back/forward"
```

---

## Task 5: Auto-hiding header; remove floating-ball nav

**Files:**
- Create: `apps/web/src/components/SiteHeader.tsx`
- Modify: `apps/web/src/components/UserMenu.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Delete: `apps/web/src/components/FloatingNav.tsx`, `apps/web/src/components/nav-icons.tsx`

The header moves **out** of `SmoothScroll` and becomes `position: fixed`, so it is unaffected by the ScrollSmoother transform and works on every route. It reads scroll position from `ScrollSmoother.get()` on the home route and from the window elsewhere. The floating ball is removed; its only entries not already in the header — 写文章 and 我的文章 — move into the `UserMenu` dropdown.

- [ ] **Step 1: Add 写文章 / 我的文章 to UserMenu**

In `apps/web/src/components/UserMenu.tsx`, inside the dropdown `<div>` (the `open &&` block), add two links above the existing 设置 link:

```tsx
          <Link
            href="/editor/new"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            写文章
          </Link>
          <Link
            href="/me/posts"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            我的文章
          </Link>
          <Link
            href="/settings"
```

(The 设置 `<Link>` already exists — only the two new links are added before it.)

- [ ] **Step 2: Create the SiteHeader component**

Create `apps/web/src/components/SiteHeader.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { NotificationBell } from "./NotificationBell";
import { UserMenu } from "./UserMenu";
import { decideHeaderVisible } from "@/lib/header-visibility";

function currentScrollTop(): number {
  const s = ScrollSmoother.get();
  return s ? s.scrollTop() : window.scrollY;
}

/**
 * Fixed top bar, rendered outside the ScrollSmoother transform so it stays put on
 * every route. Hides on scroll-down, reveals on scroll-up; always shown near the top.
 * Honors prefers-reduced-motion (stays visible, no transform animation).
 */
export function SiteHeader() {
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
      className="fixed inset-x-0 top-0 z-40 flex justify-between border-b px-6 py-4 transition-transform duration-300"
      style={{
        borderColor: "var(--border)",
        background: "var(--bg)",
        transform: visible ? "translateY(0)" : "translateY(-100%)",
      }}
    >
      <Link href="/" style={{ fontFamily: "var(--font-display)" }}>
        Naturalist Journal
      </Link>
      <div className="flex items-center gap-4">
        <Link href="/search" style={{ color: "var(--text-2)" }}>
          搜索
        </Link>
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Restructure the layout**

Overwrite `apps/web/src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Playfair_Display, Lora, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { SmoothScroll } from "@/components/SmoothScroll";
import { ScrollManager } from "@/components/ScrollManager";
import { SiteHeader } from "@/components/SiteHeader";

const playfair = Playfair_Display({ subsets: ["latin"], weight: ["600"], variable: "--font-display" });
const lora = Lora({ subsets: ["latin"], weight: ["400"], variable: "--font-body" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-ui" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Naturalist Journal",
  description: "工程级个人博客",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh"
      className={`${playfair.variable} ${lora.variable} ${inter.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <AuthProvider>
          <SiteHeader />
          <ScrollManager />
          <SmoothScroll>{children}</SmoothScroll>
        </AuthProvider>
      </body>
    </html>
  );
}
```

Note: `NotificationBell` and `UserMenu` now render inside `SiteHeader`, so their imports leave the layout. The header is fixed; the home hero is vertically centered and sub-pages carry generous top padding, so the bar overlaps the very top without obscuring content, and it auto-hides on scroll-down.

- [ ] **Step 4: Delete the floating-ball nav and its icons**

```bash
git rm apps/web/src/components/FloatingNav.tsx apps/web/src/components/nav-icons.tsx
```

- [ ] **Step 5: Verify no dangling references**

Run: `grep -rn "FloatingNav\|nav-icons" apps/web/src`
Expected: no output.

- [ ] **Step 6: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 7: Manual check**

Run: `pnpm --filter @blog/web dev`. Scroll down — the header slides up and hides. Scroll up — it reappears. Confirm the avatar menu shows 写文章 / 我的文章 / 设置 / 退出登录 when logged in. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/SiteHeader.tsx apps/web/src/components/UserMenu.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): auto-hiding fixed header; fold nav into user menu; remove floating ball"
```

---

## Task 6: Back button on sub-pages

**Files:**
- Create: `apps/web/src/components/BackButton.tsx`
- Modify: `apps/web/src/app/posts/[slug]/page.tsx`
- Modify: `apps/web/src/app/search/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/register/page.tsx`

The back button uses `router.back()` so the browser restores the prior scroll position (including the home list, via Task 4). It sits at the top-left of each page's content.

- [ ] **Step 1: Create the BackButton component**

Create `apps/web/src/components/BackButton.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";

/**
 * Browser-history back control for sub-pages. Using router.back() lets the browser
 * restore the previous scroll position (e.g. the reader's place in the home list).
 */
export function BackButton({ className }: { className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="返回"
      className={`mb-6 inline-flex items-center gap-1 text-sm ${className ?? ""}`}
      style={{ color: "var(--text-2)" }}
    >
      ← 返回
    </button>
  );
}
```

- [ ] **Step 2: Add BackButton to the article page**

In `apps/web/src/app/posts/[slug]/page.tsx`, add the import:

```tsx
import { BackButton } from "@/components/BackButton";
```

Then render it as the first child inside `<main>`, before `<ViewPing ... />`:

```tsx
    <main className="mx-auto max-w-3xl px-6 py-16">
      <BackButton />
      <ViewPing postId={post.id} />
```

- [ ] **Step 3: Add BackButton to the search page**

In `apps/web/src/app/search/page.tsx`, add the import:

```tsx
import { BackButton } from "@/components/BackButton";
```

Then render it as the first child inside `<main>`, before the `<h1>搜索</h1>`:

```tsx
    <main className="mx-auto max-w-3xl px-6 py-16">
      <BackButton />
      <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>
        搜索
      </h1>
```

- [ ] **Step 4: Add BackButton to the login page**

In `apps/web/src/app/login/page.tsx`, add the import:

```tsx
import { BackButton } from "@/components/BackButton";
```

Then render it as the first child inside `<main>`, before the `<h1>登录</h1>`:

```tsx
    <main className="mx-auto max-w-sm px-6 py-24">
      <BackButton />
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        登录
      </h1>
```

- [ ] **Step 5: Add BackButton to the register page**

In `apps/web/src/app/register/page.tsx`, add the import:

```tsx
import { BackButton } from "@/components/BackButton";
```

Then render it as the first child inside `<main>`, before the `<h1>注册</h1>`:

```tsx
    <main className="mx-auto max-w-sm px-6 py-24">
      <BackButton />
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        注册
      </h1>
```

- [ ] **Step 6: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 7: Manual check**

Run: `pnpm --filter @blog/web dev`. From the home list open an article, click ← 返回 — you return to your place in the list. Repeat from search and login. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/components/BackButton.tsx apps/web/src/app/posts/[slug]/page.tsx apps/web/src/app/search/page.tsx apps/web/src/app/login/page.tsx apps/web/src/app/register/page.tsx
git commit -m "feat(web): add browser-history back button to sub-pages"
```

---

## Task 7: Decoration — illustrated divider + article detail plates

**Files:**
- Create: `apps/web/src/components/PlateDivider.tsx`
- Modify: `apps/web/src/app/posts/[slug]/page.tsx`

Restrained per the design spec: low opacity, decorative-only (the illustration components already render `alt=""` + `aria-hidden`).

- [ ] **Step 1: Create the PlateDivider component**

Create `apps/web/src/components/PlateDivider.tsx`:

```tsx
import type { ComponentType } from "react";
import type { IllustrationProps } from "@/components/illustrations";

/**
 * A centered section break: a small naturalist plate flanked by hairline rules.
 * Decorative-only; the plate component renders aria-hidden.
 */
export function PlateDivider({
  illustration: Illo,
  size = 48,
}: {
  illustration: ComponentType<IllustrationProps>;
  size?: number;
}) {
  return (
    <div className="my-12 flex items-center gap-4" aria-hidden>
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
      <Illo width={size} height={size} className="opacity-70" />
      <span className="h-px flex-1" style={{ background: "var(--border)" }} />
    </div>
  );
}
```

- [ ] **Step 2: Decorate the article page**

In `apps/web/src/app/posts/[slug]/page.tsx`, add imports:

```tsx
import { PlateDivider } from "@/components/PlateDivider";
import { Foliage3, Butterfly2, Bird2 } from "@/components/illustrations";
```

Add a small plate to the title block — wrap the title row so the plate floats at the top-right. Replace the existing `<h1>` line:

```tsx
      <div className="relative">
        <Foliage3
          width={96}
          height={96}
          className="absolute -top-4 right-0 opacity-70"
        />
        <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>{post.title}</h1>
      </div>
```

Replace the plain top rule (`<hr className="my-8" ... />`, the one before `<MarkdownRenderer />`) with an illustrated divider:

```tsx
      <PlateDivider illustration={Butterfly2} />
```

Replace the text tailpiece block (the `<p className="my-8 text-center italic" ...>✦ Naturalis Historia ✦</p>`) with a plate above the same text:

```tsx
      <div className="my-8 flex flex-col items-center gap-3">
        <Bird2 width={72} height={72} className="opacity-70" aria-hidden />
        <p className="text-center italic" style={{ color: "var(--text-3)" }}>
          ✦ Naturalis Historia ✦
        </p>
      </div>
```

- [ ] **Step 3: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 4: Manual check**

Run: `pnpm --filter @blog/web dev`, open any article. The plate sits by the title, the butterfly divider replaces the top rule, the bird sits above the tailpiece — all faint, not crowding text. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/PlateDivider.tsx apps/web/src/app/posts/[slug]/page.tsx
git commit -m "feat(web): decorate article detail with naturalist plates"
```

---

## Task 8: Decoration — 404 page, auth pages, search loading

**Files:**
- Create: `apps/web/src/app/not-found.tsx`
- Modify: `apps/web/src/app/login/page.tsx`
- Modify: `apps/web/src/app/register/page.tsx`
- Modify: `apps/web/src/app/search/page.tsx`

- [ ] **Step 1: Create the 404 page**

Create `apps/web/src/app/not-found.tsx`:

```tsx
import Link from "next/link";
import { Butterfly3 } from "@/components/illustrations";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-6 text-center">
      <Butterfly3 width={120} height={120} className="opacity-80" />
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        迷路了
      </h1>
      <p style={{ color: "var(--text-2)" }}>
        这一页不在这本笔记里。
      </p>
      <Link href="/" className="underline" style={{ color: "var(--text-2)" }}>
        回到首页
      </Link>
    </main>
  );
}
```

- [ ] **Step 2: Add a quiet plate to the login page**

In `apps/web/src/app/login/page.tsx`, add the import:

```tsx
import { Flower1 } from "@/components/illustrations";
```

Render the plate just after the `<h1>登录</h1>` element:

```tsx
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        登录
      </h1>
      <Flower1 width={72} height={72} className="mt-4 opacity-70" />
```

- [ ] **Step 3: Add a quiet plate to the register page**

In `apps/web/src/app/register/page.tsx`, add the import:

```tsx
import { Foliage1 } from "@/components/illustrations";
```

Render the plate just after the `<h1>注册</h1>` element:

```tsx
      <h1 className="text-3xl" style={{ fontFamily: "var(--font-display)" }}>
        注册
      </h1>
      <Foliage1 width={72} height={72} className="mt-4 opacity-70" />
```

- [ ] **Step 4: Add a plate to the search loading state**

In `apps/web/src/app/search/page.tsx`, add `Foliage4` to the existing illustrations import:

```tsx
import { Foliage2, Foliage4 } from "@/components/illustrations";
```

Replace the loading line (`{loading && <p ...>搜索中…</p>}`) with a plate + text:

```tsx
      {loading && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Foliage4 width={64} height={64} className="opacity-60" />
          <p style={{ color: "var(--text-3)" }}>搜索中…</p>
        </div>
      )}
```

- [ ] **Step 5: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 6: Manual check**

Run: `pnpm --filter @blog/web dev`. Visit a bad URL (e.g. `/nope`) to see the 404 plate; open login/register to see the quiet plates; run a search to see the loading plate. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/not-found.tsx apps/web/src/app/login/page.tsx apps/web/src/app/register/page.tsx apps/web/src/app/search/page.tsx
git commit -m "feat(web): decorate 404, auth pages, and search loading state"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full gate**

Run: `pnpm verify`
Expected: lint, typecheck, and test all green across the workspace (the Stop hook enforces this).

- [ ] **Step 2: If anything fails, fix it before finishing**

Use superpowers:systematic-debugging for any failure. Do not modify the Stop hook or skip the gate.

- [ ] **Step 3: Final manual smoke pass**

Run: `pnpm --filter @blog/web dev` and walk the four fixes end to end:
1. Home list → open article → opens at top.
2. Article → ← 返回 (and browser back) → home restores the list position; top-left title → home top.
3. Scroll down hides the header; scroll up reveals it.
4. Article, 404, login/register, search states show their plates.

Stop the dev server when done.

---

## Notes for the implementer

- **ScrollSmoother + sticky:** the header is `position: fixed` and rendered **outside** `#smooth-content` precisely because `position: sticky` does not work under the ScrollSmoother transform. Do not move it back inside `SmoothScroll`.
- **Reduced motion:** the home page does not engage ScrollSmoother under `prefers-reduced-motion`; that is why `SmoothScroll` has a separate native-scroll restore path and `SiteHeader` skips the hide/show animation.
- **`apps/web/AGENTS.md`:** this Next.js (16.2.9) has breaking changes vs. older docs — consult `node_modules/next/dist/docs/` before changing routing/navigation APIs.
- **No `any`, strict TS.** No new shared types are required for this plan.
