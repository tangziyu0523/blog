# Reading Experience + Nav, Round 2 — Design

**Date:** 2026-06-15
**Scope:** `apps/web` (Next.js 16 App Router)
**Status:** Approved, ready for implementation planning
**Builds on:** `2026-06-15-frontend-ux-polish-design.md` (already merged)

## Problem

Four follow-up issues from using the merged round-1 work:

1. **Header lacks quick entries.** 写文章 / 我的文章 are buried in the avatar dropdown, and there is no quick way to reach the home article list without going home and scrolling through the entrance choreography.
2. **Article entry animates.** Clicking into an article plays a brief bottom-to-top motion before settling; the article should paint at the title immediately, then the reader scrolls manually.
3. **Back from an article lands on the home intro, not the list.** The reader ends up at the top of the home page (the pinned book-flip intro) and must scroll down to find the list. They expect to return to the article list where they were.
4. **Article detail is over-decorated and under-designed.** Too many scattered illustrations, and the body has no real typographic styling (the `prose-naturalist` class is referenced in `MarkdownRenderer` but never defined in CSS, so prose renders with Tailwind reset defaults). Wants an editorial-grade redesign with at most one illustration per article.

## Approved decisions

- **Header (Part 1):** promote 文章列表 / 写文章 / 我的文章 to visible bar links; fold notifications into the avatar menu.
- **Article entry (Part 2):** no entry animation; paint at the title instantly.
- **List landing (Part 3):** clicking 文章列表 locates to the list (top of list, bypassing the intro); back-from-article restores the reader's spot within the list.
- **Redesign (Part 4):** editorial reading-first with a light naturalist accent; exactly one illustration per article, placed at the end (footer close); plate chosen by a **stable hash of the post slug** (no schema change — strict publish-order would need a stored ordinal we do not have).

## Part 1 — Header entries

Header (`SiteHeader.tsx`) and the avatar menu (`UserMenu.tsx`) change:

- **Logged-in bar:** `标题 | 文章列表 · 写文章 · 我的文章 · 搜索 · 头像`.
- **Logged-out bar:** `标题 | 文章列表 · 搜索 · 登录`.
- **Avatar dropdown:** `通知 · 设置 · 退出登录`. Notifications move out of the standalone bar 🔔 into the dropdown; an unread dot appears on the avatar when `unread > 0`. The existing `NotificationBell` behavior (fetching unread + listing notifications) is preserved, relocated under the avatar.
- 文章列表 is always visible (logged in or out). 写文章 / 我的文章 are hidden when logged out.
- 文章列表 links to the home article index and **locates to the list** (see Part 3), bypassing the entrance choreography.

## Part 2 — Article opens at the title, no entry animation

Clicking into an article must paint at the title immediately, with no bottom-to-top reveal or animated scroll.

The exact cause is confirmed during implementation via systematic debugging. Leading hypothesis: navigating away from the home route, the article page momentarily inherits the home's large scroll height (pinned ScrollTrigger spacers / tall body) before `SmoothScroll` tears the smoother down, so the initial paint is scrolled into the article body, then `ScrollManager`'s `window.scrollTo(0, 0)` snaps it to the top — read as a quick upward motion. Fix ensures the article route lands at the top instantly (no animated/smooth scroll, no visible mid-article first paint).

## Part 3 — "文章列表" link and back-from-article both land in the list

Both share one reliable primitive — **jump to the article index** — that is immune to the pinned intro's measurement timing (the current restore fails because it scrolls to a saved pixel offset before the pinned `ChapterStage` layout is measured, so the target clamps near the top).

- The home article list (`PostList`) gets a **stable anchor** (an `id` on its wrapper).
- **文章列表 link (from any page):** navigate home and land at the **top of the list**, bypassing the entrance choreography.
- **Back from an article (pop navigation):** land at the reader's **saved spot within the list**; fall back to list-top if a precise offset is not available.
- **Logo / title click (push navigation):** unchanged — plays the intro from the top.

Mechanism: reuse the existing pop-vs-push detection (`nav-history.ts`). Back = pop → restore-into-list. Logo = push → intro from top. 文章列表 link = an explicit "skip to list" intent (e.g. a flag consumed on the home route). In every list-landing case the scroll is performed **after** the pinned layout is refreshed (`ScrollTrigger.refresh()` / after the smoother and `ChapterStage` triggers are registered), resolving the list anchor's real position rather than a stale pixel value. Honors `prefers-reduced-motion` (native positioning when the smoother is not engaged).

## Part 4 — Article page redesign

Editorial, reading-first, with a light naturalist touch. File: `apps/web/src/app/posts/[slug]/page.tsx`, plus prose CSS in `globals.css` and a slug→plate helper.

- **Define real prose styling** for `.prose-naturalist` (currently undefined): a measured column (~680px), comfortable line-height and type scale, styled `h2`/`h3` hierarchy, paragraphs with proper rhythm, lists, blockquotes, links, inline code, and code blocks (Shiki output already present). Optional drop-cap on the first paragraph.
- **Refined header block:** category kicker (Lora italic), large Playfair title, an `作者 · 日期 · views` meta line, and a hairline rule. No top illustration.
- **One illustration only, at the end:** remove the current top plate (`Foliage3`) and the mid-content butterfly `PlateDivider`; a single slug-stable plate sits with the `✦ Naturalis Historia ✦` close, above the like/comment section.
- **Mid-article breaks become typographic** (spacing / a small centered rule), not illustrations.
- Keep `BackButton`, `ViewPing`, `FollowButton`, `LikeButton`, `CommentSection` intact.

### Slug → plate selection
A small pure helper maps a post slug to one illustration component via a stable hash modulo the illustration set, so a given article always shows the same plate and different articles vary across the set. Pure and unit-tested.

## Testing & guardrails

- `pnpm verify` (lint + typecheck + test) stays green — the iron rule (Stop hook enforced).
- Unit-test the pure logic with `node --test`: the slug→plate selection (deterministic, stable, in-range) and any list-offset math.
- The redesign/CSS and scroll timing are visual/runtime — verified by a browser smoke pass, not unit tests.
- TypeScript strict, no `any`; follow existing inline `var(--…)` + Tailwind conventions and `apps/web/AGENTS.md` (consult `node_modules/next/dist/docs/` before touching routing/navigation APIs).

## Out of scope

- Removing or rebuilding the home entrance choreography (`ChapterStage`) — it stays; this work only adds a reliable way to bypass/land past it.
- Schema changes for a publish-order ordinal (slug-hash selection avoids it).
- Dark mode; the WebGL ink layer.
