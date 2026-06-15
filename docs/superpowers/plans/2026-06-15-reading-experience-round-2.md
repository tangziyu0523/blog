# Reading Experience + Nav, Round 2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote nav entries into the header, make articles open at the title with no entry animation, make "文章列表" and back-from-article both land in the home article list reliably, and redesign the article page (real prose styling + a single end-of-article illustration).

**Architecture:** A pure `home-landing` decision module drives where the home route positions itself (intro-top vs. into-the-list-at-an-offset), resolved against a stable `#article-index` anchor *after* the pinned ScrollSmoother/ScrollTrigger layout is measured — fixing the unreliable pixel restore. Leaving home kills the smoother and resets scroll *before paint* to kill the entry animation. The article page gets defined `.prose-naturalist` CSS and an editorial layout with one slug-stable plate at the end.

**Tech Stack:** Next.js 16 (App Router), React 19, GSAP ScrollSmoother/ScrollTrigger, Tailwind v4, Node `node --test` for pure-logic units.

---

## File Structure

**New pure logic (unit-tested):**
- `apps/web/src/lib/home-landing.ts` — landing decision + sessionStorage keys + intent flag + event name.
- `apps/web/src/lib/article-plate.ts` — stable slug → plate index.

**New components / hooks:**
- `apps/web/src/components/IndexLink.tsx` — "文章列表" link (sets intent / dispatches scroll event).
- `apps/web/src/lib/use-notifications.ts` — notification data hook (extracted from `NotificationBell`).

**Modified:**
- `apps/web/src/lib/scroll-restoration.ts` (+ its test) — drop now-unused `HOME_SCROLL_KEY`/`decideHomeScroll`, keep `NavType`/`parseSavedScroll`.
- `apps/web/src/components/SmoothScroll.tsx` — landing/save/event + pre-paint smoother kill.
- `apps/web/src/components/ScrollManager.tsx` — reduce to the popstate installer.
- `apps/web/src/app/page.tsx` — wrap `PostList` in `#article-index`.
- `apps/web/src/components/SiteHeader.tsx` — bar nav links; drop standalone bell.
- `apps/web/src/components/UserMenu.tsx` — absorb notifications; keep 设置/退出.
- `apps/web/src/app/globals.css` — `.prose-naturalist` styles.
- `apps/web/src/app/posts/[slug]/page.tsx` — editorial redesign + single end plate.

**Deleted:**
- `apps/web/src/components/NotificationBell.tsx` (absorbed into `UserMenu` via the hook).

---

## Task 1: Pure home-landing decision logic

**Files:**
- Create: `apps/web/src/lib/home-landing.ts`
- Test: `apps/web/src/lib/home-landing.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/home-landing.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIST_OFFSET_KEY, SCROLL_TO_INDEX_EVENT, decideHomeLanding } from './home-landing.ts';

test('keys/event names are stable non-empty strings', () => {
  assert.ok(LIST_OFFSET_KEY.length > 0);
  assert.ok(SCROLL_TO_INDEX_EVENT.length > 0);
});

test('explicit index intent always lands at list top', () => {
  assert.deepEqual(decideHomeLanding('push', true, null), { mode: 'index', offset: 0 });
  assert.deepEqual(decideHomeLanding('pop', true, 900), { mode: 'index', offset: 0 });
});

test('pop with a saved offset restores into the list', () => {
  assert.deepEqual(decideHomeLanding('pop', false, 900), { mode: 'index', offset: 900 });
  assert.deepEqual(decideHomeLanding('pop', false, 0), { mode: 'index', offset: 0 });
});

test('pop without a saved offset goes to intro top', () => {
  assert.deepEqual(decideHomeLanding('pop', false, null), { mode: 'top' });
});

test('plain push goes to intro top', () => {
  assert.deepEqual(decideHomeLanding('push', false, 900), { mode: 'top' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @blog/web test`
Expected: FAIL — cannot resolve `./home-landing.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/home-landing.ts`:

```ts
import type { NavType } from './scroll-restoration';

/** sessionStorage key: the reader's scroll offset *within* the article list (px). */
export const LIST_OFFSET_KEY = 'home:listOffset';
/** sessionStorage key: a one-shot intent to land on the list (set by "文章列表"). */
export const TO_INDEX_KEY = 'home:toIndex';
/** window event: "文章列表" was clicked while already on the home route. */
export const SCROLL_TO_INDEX_EVENT = 'home:scroll-to-index';

/** Where the home route should position itself on mount. */
export type HomeLanding = { mode: 'top' } | { mode: 'index'; offset: number };

/**
 * Decide the home landing. Explicit "go to list" intent wins (list top). Otherwise
 * a back/forward ('pop') with a saved in-list offset restores into the list; every
 * other case (plain push, or nothing saved) shows the intro from the top.
 */
export function decideHomeLanding(
  navType: NavType,
  toIndexIntent: boolean,
  savedOffset: number | null,
): HomeLanding {
  if (toIndexIntent) return { mode: 'index', offset: 0 };
  if (navType === 'pop' && savedOffset !== null) return { mode: 'index', offset: savedOffset };
  return { mode: 'top' };
}

/** Set the one-shot "land on the list" intent (consumed on the next home mount). */
export function setToIndexIntent(): void {
  if (typeof window !== 'undefined') sessionStorage.setItem(TO_INDEX_KEY, '1');
}

/** Read and clear the "land on the list" intent. */
export function consumeToIndexIntent(): boolean {
  if (typeof window === 'undefined') return false;
  const v = sessionStorage.getItem(TO_INDEX_KEY) === '1';
  sessionStorage.removeItem(TO_INDEX_KEY);
  return v;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @blog/web test`
Expected: PASS (new tests + existing pass).

- [ ] **Step 5: Verify typecheck**

Run: `pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/home-landing.ts apps/web/src/lib/home-landing.test.ts
git commit -m "feat(web): add home-landing decision logic"
```

---

## Task 2: Pure slug → plate selection

**Files:**
- Create: `apps/web/src/lib/article-plate.ts`
- Test: `apps/web/src/lib/article-plate.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/article-plate.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashSlug, pickPlateIndex } from './article-plate.ts';

test('hashSlug is deterministic and non-negative', () => {
  assert.equal(hashSlug('hello-world'), hashSlug('hello-world'));
  assert.ok(hashSlug('hello-world') >= 0);
  assert.ok(hashSlug('') >= 0);
});

test('pickPlateIndex is stable for a slug and within range', () => {
  for (const slug of ['a', 'naturalist', 'systems-and-software', 'b-2', '中文']) {
    const i = pickPlateIndex(slug, 12);
    assert.ok(Number.isInteger(i));
    assert.ok(i >= 0 && i < 12);
    assert.equal(i, pickPlateIndex(slug, 12)); // stable
  }
});

test('pickPlateIndex guards a non-positive count', () => {
  assert.equal(pickPlateIndex('a', 0), 0);
  assert.equal(pickPlateIndex('a', -3), 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @blog/web test`
Expected: FAIL — cannot resolve `./article-plate.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/article-plate.ts`:

```ts
/** Stable 32-bit-ish string hash (non-negative). */
export function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) {
    h = (Math.imul(h, 31) + slug.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Pick a stable plate index in [0, count) for a slug. The same article always
 * maps to the same plate; different slugs spread across the set. Guards count<=0.
 */
export function pickPlateIndex(slug: string, count: number): number {
  if (count <= 0) return 0;
  return hashSlug(slug) % count;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @blog/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/article-plate.ts apps/web/src/lib/article-plate.test.ts
git commit -m "feat(web): add stable slug-to-plate selection"
```

---

## Task 3: Reliable home landing + no article entry animation

**Files:**
- Modify: `apps/web/src/components/SmoothScroll.tsx`
- Modify: `apps/web/src/components/ScrollManager.tsx`
- Modify: `apps/web/src/lib/scroll-restoration.ts`
- Modify: `apps/web/src/lib/scroll-restoration.test.ts`
- Modify: `apps/web/src/app/page.tsx`

This is one cohesive change (the pieces must land together to keep the build green). It (a) adds the `#article-index` anchor, (b) makes `SmoothScroll` land via `decideHomeLanding` resolved against that anchor after refresh and persist the in-list offset, (c) kills the smoother + resets scroll *before paint* when leaving home (removes the bottom-to-top entry motion), (d) reduces `ScrollManager` to the popstate installer, and (e) drops the now-unused `HOME_SCROLL_KEY`/`decideHomeScroll`.

IMPORTANT: `apps/web/AGENTS.md` warns this Next.js (16.2.9) differs from older docs. The GSAP/React code below is written for the project's setup — implement it as given.

- [ ] **Step 1: Add the list anchor in `apps/web/src/app/page.tsx`**

Replace the line `        <PostList initial={initial} />` with:

```tsx
        <div id="article-index">
          <PostList initial={initial} />
        </div>
```

- [ ] **Step 2: Trim `apps/web/src/lib/scroll-restoration.ts`**

Open the file and remove the `HOME_SCROLL_KEY` constant and the `decideHomeScroll` function entirely, leaving only `NavType` and `parseSavedScroll`. The full file becomes:

```ts
/** Navigation kind used to decide whether to restore the home scroll position. */
export type NavType = 'pop' | 'push';

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
```

- [ ] **Step 3: Update `apps/web/src/lib/scroll-restoration.test.ts`**

Replace the whole file with (drops the `HOME_SCROLL_KEY`/`decideHomeScroll` tests, keeps `parseSavedScroll`):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSavedScroll } from './scroll-restoration.ts';

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
```

- [ ] **Step 4: Rewrite `apps/web/src/components/SmoothScroll.tsx`**

Overwrite with:

```tsx
"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { parseSavedScroll } from "@/lib/scroll-restoration";
import { consumeNavType } from "@/lib/nav-history";
import {
  LIST_OFFSET_KEY,
  SCROLL_TO_INDEX_EVENT,
  decideHomeLanding,
  consumeToIndexIntent,
  type HomeLanding,
} from "@/lib/home-landing";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

// useLayoutEffect on the client, useEffect on the server (avoids the SSR warning).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function indexAnchor(): HTMLElement | null {
  return document.getElementById("article-index");
}

/**
 * ScrollSmoother base + home scroll positioning. On the home route it lands at the
 * intro top, at the article-list top (explicit "文章列表" intent), or back into the
 * list at the reader's saved offset (back/forward) — always resolved against the
 * #article-index anchor *after* the pinned layout is measured. Leaving home, it
 * kills the smoother and resets scroll before paint so the next route never shows a
 * frame under the smoother's leftover transform.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Pre-paint teardown when leaving home.
  useIsoLayoutEffect(() => {
    if (pathname === "/") return;
    ScrollSmoother.get()?.kill();
    window.scrollTo(0, 0);
  }, [pathname]);

  // Smoothed home path.
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

      const baseOffset = (): number => {
        const el = indexAnchor();
        return el ? smoother.offset(el, "top top") : 0;
      };

      const land = (l: HomeLanding): void => {
        smoother.scrollTo(l.mode === "top" ? 0 : baseOffset() + l.offset, false);
      };

      const landing = decideHomeLanding(
        consumeNavType(),
        consumeToIndexIntent(),
        parseSavedScroll(sessionStorage.getItem(LIST_OFFSET_KEY)),
      );
      ScrollTrigger.refresh();
      requestAnimationFrame(() => land(landing));

      let raf = 0;
      const save = (): void => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          sessionStorage.setItem(
            LIST_OFFSET_KEY,
            String(Math.max(0, Math.round(smoother.scrollTop() - baseOffset()))),
          );
        });
      };
      window.addEventListener("scroll", save, { passive: true });

      const onScrollToIndex = (): void => land({ mode: "index", offset: 0 });
      window.addEventListener(SCROLL_TO_INDEX_EVENT, onScrollToIndex);

      return () => {
        window.removeEventListener("scroll", save);
        window.removeEventListener(SCROLL_TO_INDEX_EVENT, onScrollToIndex);
        cancelAnimationFrame(raf);
        sessionStorage.setItem(
          LIST_OFFSET_KEY,
          String(Math.max(0, Math.round(smoother.scrollTop() - baseOffset()))),
        );
        if (ScrollSmoother.get() === smoother) smoother.kill();
      };
    },
    { dependencies: [pathname], scope: wrapperRef },
  );

  // Reduced-motion home path: native window scroll, same decision.
  useEffect(() => {
    if (pathname !== "/") return;
    if (!prefersReducedMotion()) return;

    const baseOffset = (): number => {
      const el = indexAnchor();
      return el ? el.getBoundingClientRect().top + window.scrollY : 0;
    };

    const land = (l: HomeLanding): void => {
      window.scrollTo(0, l.mode === "top" ? 0 : baseOffset() + l.offset);
    };

    const landing = decideHomeLanding(
      consumeNavType(),
      consumeToIndexIntent(),
      parseSavedScroll(sessionStorage.getItem(LIST_OFFSET_KEY)),
    );
    requestAnimationFrame(() => land(landing));

    let raf = 0;
    const save = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sessionStorage.setItem(
          LIST_OFFSET_KEY,
          String(Math.max(0, Math.round(window.scrollY - baseOffset()))),
        );
      });
    };
    window.addEventListener("scroll", save, { passive: true });

    const onScrollToIndex = (): void => land({ mode: "index", offset: 0 });
    window.addEventListener(SCROLL_TO_INDEX_EVENT, onScrollToIndex);

    return () => {
      window.removeEventListener("scroll", save);
      window.removeEventListener(SCROLL_TO_INDEX_EVENT, onScrollToIndex);
      cancelAnimationFrame(raf);
      sessionStorage.setItem(
        LIST_OFFSET_KEY,
        String(Math.max(0, Math.round(window.scrollY - baseOffset()))),
      );
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

- [ ] **Step 5: Reduce `apps/web/src/components/ScrollManager.tsx`**

Overwrite with (the sub-page reset now lives in `SmoothScroll`; this only installs the popstate listener):

```tsx
'use client';

import { useEffect } from 'react';
import { installPopListener } from '@/lib/nav-history';

/**
 * Mounted once in the root layout. Installs the popstate listener used to detect
 * back/forward navigation for scroll restoration. (Sub-page scroll reset and home
 * positioning live in SmoothScroll, which owns the ScrollSmoother.)
 */
export function ScrollManager() {
  useEffect(() => installPopListener(), []);
  return null;
}
```

- [ ] **Step 6: Verify lint + typecheck + test**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck && pnpm --filter @blog/web test`
Expected: no errors; tests pass (a pre-existing `<img>` warning in `Avatar.tsx` is fine).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/SmoothScroll.tsx apps/web/src/components/ScrollManager.tsx apps/web/src/lib/scroll-restoration.ts apps/web/src/lib/scroll-restoration.test.ts apps/web/src/app/page.tsx
git commit -m "feat(web): reliable home-list landing; kill article entry animation"
```

---

## Task 4: "文章列表" link component

**Files:**
- Create: `apps/web/src/components/IndexLink.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/src/components/IndexLink.tsx`:

```tsx
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
    <a href="/" onClick={onClick} className={className} style={style}>
      {children}
    </a>
  );
}
```

- [ ] **Step 2: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/IndexLink.tsx
git commit -m "feat(web): add 文章列表 index link"
```

---

## Task 5: Header nav entries; notifications under the avatar

**Files:**
- Create: `apps/web/src/lib/use-notifications.ts`
- Modify: `apps/web/src/components/UserMenu.tsx`
- Modify: `apps/web/src/components/SiteHeader.tsx`
- Delete: `apps/web/src/components/NotificationBell.tsx`

Bar becomes `标题 | 文章列表 · 写文章 · 我的文章 · 搜索 · 头像` (写文章/我的文章 hidden when logged out). The standalone 🔔 is removed; notifications move into the avatar dropdown via a shared `useNotifications` hook, with an unread dot on the avatar.

- [ ] **Step 1: Extract the notifications hook**

Create `apps/web/src/lib/use-notifications.ts`:

```ts
"use client";

import { useEffect, useState, startTransition } from "react";
import type { NotificationView } from "@blog/shared";
import { useAuth } from "@/lib/auth-context";
import {
  NOTIFICATIONS_STREAM_URL,
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications";

export interface NotificationsState {
  unread: number;
  items: NotificationView[];
  markAll: () => Promise<void>;
}

/** Live notifications for the signed-in user (initial fetch + SSE stream). */
export function useNotifications(): NotificationsState {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationView[]>([]);

  useEffect(() => {
    if (!user) {
      startTransition(() => {
        setUnread(0);
        setItems([]);
      });
      return;
    }
    let active = true;
    fetchUnreadCount().then((r) => active && setUnread(r.count)).catch(() => undefined);
    listNotifications().then((r) => active && setItems(r.items)).catch(() => undefined);

    const es = new EventSource(NOTIFICATIONS_STREAM_URL, { withCredentials: true });
    es.onmessage = (ev) => {
      try {
        const view = JSON.parse(ev.data as string) as NotificationView;
        setItems((prev) => [view, ...prev]);
        setUnread((n) => n + 1);
      } catch {
        // ignore malformed event
      }
    };
    return () => {
      active = false;
      es.close();
    };
  }, [user]);

  async function markAll(): Promise<void> {
    await markAllNotificationsRead();
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return { unread, items, markAll };
}
```

- [ ] **Step 2: Rewrite `apps/web/src/components/UserMenu.tsx`**

Overwrite with (adds the notifications section + unread dot; keeps 设置/退出; 写文章/我的文章 are no longer here — they move to the bar):

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationView } from "@blog/shared";
import { useAuth } from "@/lib/auth-context";
import { useNotifications } from "@/lib/use-notifications";
import { Avatar } from "./Avatar";

function messageOf(n: NotificationView): string {
  const who = n.actor?.nickname ?? "有人";
  const title = n.post?.title ?? "";
  if (n.type === "POST_COMMENT") return `${who} 评论了你的文章《${title}》`;
  if (n.type === "COMMENT_REPLY") return `${who} 回复了你的评论`;
  return `${who} 发布了新文章《${title}》`;
}

function hrefOf(n: NotificationView): string {
  if (!n.post) return "#";
  return n.commentId ? `/posts/${n.post.slug}#comment-${n.commentId}` : `/posts/${n.post.slug}`;
}

export function UserMenu() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const { unread, items, markAll } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  if (loading) return <span style={{ width: 32, height: 32 }} aria-hidden="true" />;

  if (!user) {
    return (
      <Link href="/login" style={{ color: "var(--text-2)" }}>
        登录
      </Link>
    );
  }

  async function onLogout() {
    await logout();
    setOpen(false);
    router.push("/");
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} aria-label="用户菜单" className="flex">
        <span className="relative inline-flex">
          <Avatar nickname={user.nickname} avatarUrl={user.avatarUrl} size={32} />
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full"
              style={{ background: "var(--accent)" }}
              aria-hidden="true"
            />
          )}
        </span>
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-72 rounded-md border py-1 z-20"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-medium" style={{ color: "var(--text)" }}>通知</span>
            {items.length > 0 && (
              <button onClick={markAll} className="text-xs" style={{ color: "var(--text-2)" }}>
                全部已读
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-auto px-1">
            {items.length === 0 ? (
              <p className="px-2 py-2 text-xs italic" style={{ color: "var(--text-3)" }}>
                暂无通知
              </p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={hrefOf(n)}
                  onClick={() => setOpen(false)}
                  className="block rounded px-2 py-2 text-sm"
                  style={{ color: n.read ? "var(--text-3)" : "var(--text)" }}
                >
                  {messageOf(n)}
                </Link>
              ))
            )}
          </div>
          <div className="my-1 border-t" style={{ borderColor: "var(--border)" }} />
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-sm"
            style={{ color: "var(--text)" }}
          >
            设置
          </Link>
          <button
            onClick={onLogout}
            className="block w-full px-3 py-2 text-left text-sm"
            style={{ color: "var(--text-2)" }}
          >
            退出登录
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `apps/web/src/components/SiteHeader.tsx`**

Overwrite with (adds the bar nav links via `IndexLink` + auth-gated 写文章/我的文章; drops `NotificationBell`):

```tsx
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
```

- [ ] **Step 4: Delete `NotificationBell` and confirm no other importers**

```bash
grep -rn "NotificationBell" apps/web/src
```
Expected: only `apps/web/src/components/NotificationBell.tsx` itself (no importers after Step 3). Then:

```bash
git rm apps/web/src/components/NotificationBell.tsx
```

- [ ] **Step 5: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors (pre-existing `Avatar.tsx` `<img>` warning is fine).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/use-notifications.ts apps/web/src/components/UserMenu.tsx apps/web/src/components/SiteHeader.tsx
git commit -m "feat(web): header nav entries; fold notifications under the avatar"
```

---

## Task 6: Article page redesign

**Files:**
- Modify: `apps/web/src/app/globals.css`
- Modify: `apps/web/src/app/posts/[slug]/page.tsx`

Editorial, reading-first: real `.prose-naturalist` typography, a refined header block, and exactly one slug-stable plate at the end (top/mid illustrations removed).

- [ ] **Step 1: Add prose styles to `apps/web/src/app/globals.css`**

Append to the end of the file:

```css
.prose-naturalist {
  max-width: 38rem;
  margin-inline: auto;
  font-family: var(--font-body), Georgia, serif;
  font-size: 1.125rem;
  line-height: 1.8;
  color: var(--text);
}
.prose-naturalist > * + * { margin-top: 1.4em; }
.prose-naturalist h2 {
  font-family: var(--font-display), Georgia, serif;
  font-size: 1.6rem;
  line-height: 1.2;
  margin-top: 2.2em;
  margin-bottom: 0.2em;
}
.prose-naturalist h3 {
  font-family: var(--font-display), Georgia, serif;
  font-size: 1.3rem;
  margin-top: 1.8em;
}
.prose-naturalist p { text-wrap: pretty; }
.prose-naturalist a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose-naturalist blockquote {
  border-left: 2px solid var(--border);
  padding-left: 1rem;
  font-style: italic;
  color: var(--text-2);
}
.prose-naturalist ul { list-style: disc; padding-left: 1.4rem; }
.prose-naturalist ol { list-style: decimal; padding-left: 1.4rem; }
.prose-naturalist li + li { margin-top: 0.4em; }
.prose-naturalist :not(pre) > code {
  font-family: var(--font-mono), monospace;
  font-size: 0.9em;
  background: var(--surface-2);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
.prose-naturalist pre {
  margin-top: 1.4em;
  padding: 1rem 1.15rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.9rem;
  line-height: 1.6;
}
.prose-naturalist > p:first-of-type::first-letter {
  float: left;
  font-family: var(--font-display), Georgia, serif;
  font-size: 3.2rem;
  line-height: 0.8;
  padding-right: 0.5rem;
  padding-top: 0.2rem;
}
```

- [ ] **Step 2: Rewrite `apps/web/src/app/posts/[slug]/page.tsx`**

Overwrite with:

```tsx
import { notFound } from "next/navigation";
import { fetchPostBySlug } from "@/lib/posts";
import { MarkdownRenderer } from "@/components/MarkdownRenderer";
import { LikeButton } from "@/components/LikeButton";
import { CommentSection } from "@/components/CommentSection";
import { FollowButton } from "@/components/FollowButton";
import { ViewPing } from "@/components/ViewPing";
import { BackButton } from "@/components/BackButton";
import { pickPlateIndex } from "@/lib/article-plate";
import {
  Bird1, Bird2, Butterfly1, Butterfly2, Butterfly3, Butterfly4,
  Flower1, Flower2, Foliage1, Foliage2, Foliage3, Foliage4,
} from "@/components/illustrations";

const PLATES = [
  Bird1, Bird2, Butterfly1, Butterfly2, Butterfly3, Butterfly4,
  Flower1, Flower2, Foliage1, Foliage2, Foliage3, Foliage4,
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function fmtDate(iso: string | null): string {
  if (!iso) return "Undated";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await fetchPostBySlug(slug);
  if (!post) notFound();

  const Plate = PLATES[pickPlateIndex(post.slug, PLATES.length)];

  return (
    <main className="mx-auto max-w-3xl px-6 pb-24 pt-16">
      <BackButton />
      <ViewPing postId={post.id} />

      <header>
        <p
          className="font-sans text-[11px] uppercase tracking-[0.25em]"
          style={{ color: "var(--accent)" }}
        >
          {post.tags[0] ?? "Field Notes"}
        </p>
        <h1
          className="mt-3"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(34px, 5vw, 52px)",
            lineHeight: 1.08,
          }}
        >
          {post.title}
        </h1>
        <p className="mt-4 text-sm italic" style={{ color: "var(--text-2)" }}>
          {post.author.nickname} · {fmtDate(post.publishedAt)} · {post.viewCount} views
        </p>
        <div className="mt-3">
          <FollowButton authorId={post.author.id} />
        </div>
      </header>

      <hr className="mt-8 mb-10" style={{ borderColor: "var(--border)" }} />

      <MarkdownRenderer markdown={post.contentMd} />

      <div className="mt-16 flex flex-col items-center gap-4">
        <Plate width={88} height={88} className="opacity-80" />
        <p className="text-center italic" style={{ color: "var(--text-3)" }}>
          ✦ Naturalis Historia ✦
        </p>
      </div>

      <div className="mt-8">
        <LikeButton postId={post.id} initialLiked={post.viewerLiked} initialCount={post.likeCount} />
      </div>
      <CommentSection postId={post.id} postAuthorId={post.author.id} />
    </main>
  );
}
```

- [ ] **Step 3: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/globals.css apps/web/src/app/posts/[slug]/page.tsx
git commit -m "feat(web): editorial article redesign with prose styling and single end plate"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the workspace gate**

Run: `pnpm verify`
Expected: lint, typecheck, and test all green (the only lint warning is the pre-existing `Avatar.tsx` `<img>`).

- [ ] **Step 2: Fix any failure before finishing**

Use superpowers:systematic-debugging for any failure. Do not modify the Stop hook.

- [ ] **Step 3: Browser smoke pass (controller-run)**

Run `pnpm --filter @blog/web dev` and verify the runtime behaviors that unit tests can't cover:
1. Top bar shows 文章列表 · 写文章 · 我的文章 · 搜索 · avatar; the avatar dropdown shows 通知 + 设置 + 退出 with an unread dot.
2. Click 文章列表 from a sub-page and from home → lands on the article list, skipping the intro.
3. Open an article → it paints at the title with no bottom-to-top motion.
4. ← 返回 (and browser back) from an article → returns into the article list at your spot, not the intro top. The masthead title still goes to the intro top.
5. Article page reads as a designed editorial layout (styled headings/paragraphs/lists/quotes/code, drop cap) with exactly one illustration at the end.

If issue 3 (entry motion) or issue 4 (list landing) still misbehaves, apply superpowers:systematic-debugging — likely areas: the pre-paint `useIsoLayoutEffect` teardown timing, and the `ScrollTrigger.refresh()` + `requestAnimationFrame` ordering before `land()`.

---

## Notes for the implementer

- **Why the anchor + refresh:** the previous round restored a saved *pixel* offset, which clamped near the top because the pinned `ChapterStage` height wasn't measured yet. Resolving `#article-index` via `smoother.offset(el)` *after* `ScrollTrigger.refresh()` is what makes list landing reliable.
- **Two home paths are intentional** (smoothed vs. reduced-motion); they are mutually exclusive so `consumeNavType()`/`consumeToIndexIntent()` run exactly once per home mount.
- **Do not move the header back inside `SmoothScroll`** — it must stay `position: fixed` outside the transform.
- **`apps/web/AGENTS.md`:** consult `node_modules/next/dist/docs/` before changing routing/navigation APIs.
