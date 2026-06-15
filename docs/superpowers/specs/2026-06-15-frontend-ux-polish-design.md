# Frontend UX Polish — Design

**Date:** 2026-06-15
**Scope:** `apps/web` (Next.js App Router)
**Status:** Approved, ready for implementation planning

## Problem

Four distinct frontend UX issues degrade the reading experience:

1. **Articles don't open at the top.** Clicking a post from the home list lands the
   reader partway down the article instead of at its start.
2. **Illustrations are underused.** The `public/illustrations/` art appears in only a
   few places; much of it (Bird2, Butterfly1–5, Flower1, Foliage1/3/4) is unused, and
   the frontend feels under-decorated.
3. **Top header has no useful scroll behavior.** It is a plain in-flow bar that simply
   scrolls away. A separate floating round button (`FloatingNav`) appears once it
   leaves the viewport.
4. **No good "back" affordance, and returning home resets position.** Sub-pages
   (article/search/login) lack a back button. Clicking the masthead title returns to
   the home top and loses the reader's place in the article list.

## Approved behavior decisions

- **Header (issue 3):** classic auto-hiding sticky header — hide on scroll-down, reveal
  on scroll-up. Remove the `FloatingNav` floating ball; fold its entries into the header.
- **Back navigation (issue 4):** add a "← 返回" control that uses browser history
  (`router.back()`). The masthead title keeps its current job: go to home, **top**.
- **Return-home position (issue 4):** restoring the reader's place in the **article
  list** is the priority; the home intro page-flip animation does **not** need
  precise restoration.
- **Decoration (issue 2):** restrained and refined — stay within the existing design
  spec (monochrome UI, color carried by plates, low opacity, never crowd text).
  Target spots: article detail, empty/loading states, login/register, footer/divider
  areas. The animated `Butterfly5.gif` is **not** used by default.

## Architecture

### Shared foundation — scroll-position controller

Issues 1 and 4 are two halves of one problem and share one small client utility
(a `ScrollManager` mounted in the root layout, plus a hook). Logic is centralized
rather than scattered across pages.

- **Forward into a sub-page** (article/search/login/register): always land at the top
  (resets scroll to 0 on mount). This fixes issue 1.
- **Back to home:** restore the last saved home scroll position (the reader's place in
  the article list).
- **Pop vs. fresh-navigation detection:** distinguish "back" navigation from a fresh
  link click using the `popstate` event. `router.back()` (the 返回 button) and the
  browser back button both fire `popstate` → restore. Clicking the masthead title
  (`router.push('/')`) does not → go to top. This is what makes the title and the back
  button differ as specified.
- **Home uses GSAP ScrollSmoother**, so save/restore goes through
  `ScrollSmoother.get()?.scrollTop()` and `.scrollTo(pos, false)`, persisted in
  `sessionStorage` keyed by route. The pinned intro animation is intentionally not
  precisely restored — restore lands the reader at their list row.

The controller's pure decision logic (pop-detection, restore-vs-top) is testable and
will be unit-tested; the React glue stays thin.

### Issue 1 — Article opens at top

Resolved by the shared controller (sub-page mounts reset scroll to 0). The exact
present-day cause (likely ScrollSmoother transform residue or Next's default scroll
restoration conflicting with the smoother) will be confirmed via systematic debugging
during implementation rather than guessed now.

### Issue 3 — Auto-hiding sticky header

- Make `#site-header` sticky.
- Hide on scroll-down, reveal on scroll-up (classic pattern).
- Remove `FloatingNav` (the floating ball) entirely.
- To avoid losing entries, the header's `UserMenu` dropdown gains **写文章** and
  **我的文章** (logged-in only). 搜索 / 通知 (`NotificationBell`) / avatar stay in the
  top bar. Logged-out users keep 搜索 + 登录.
- Respect `prefers-reduced-motion`: no hide/show animation when reduced.
- Note: the home page drives scroll through ScrollSmoother (transform), so the header's
  scroll-direction detection must read scroll position from `ScrollSmoother.get()` when
  present and from the window otherwise.

### Issue 4 — Back button + return-home position

- Add a restrained "← 返回" control at the top-left of the content area on **article,
  search, login, register** pages, wired to `router.back()`.
- The masthead title keeps going to home, top.
- Return-to-home position restoration comes from the shared controller.

### Issue 2 — Restrained illustration decoration

Stay within the design spec. Wire up currently-unused art at low opacity, never
crowding text. Target spots:

- **Article detail** (`posts/[slug]`): a small plate near the title/byline; a
  section-divider motif accenting the `✦ Naturalis Historia ✦` rule; optional quiet
  tail piece at the foot.
- **Empty/loading states:** search-empty already has one; extend the same treatment to
  logged-out/empty lists, loading states, and a 404 page.
- **Login/register:** one quiet plate to soften the bare forms.
- **Footer/divider areas:** a hairline-rule motif between blocks.
- Draw from the unused set (Bird2, Butterfly1–4, Flower1, Foliage1/3/4). All decorative
  renders use `alt=""` + `aria-hidden` per the design spec. `Butterfly5.gif` is left out
  by default.

## Testing & guardrails

- `pnpm verify` (lint + typecheck + test) must stay green — the iron rule; the Stop hook
  enforces it.
- Unit-test the scroll controller's pure logic (pop-detection, save/restore decision).
- Header show/hide and the back button are thin client components; keep logic minimal
  and testable where practical.
- Decoration is visual-only — no tests.
- TypeScript strict, no `any`. Any new shared types go in `packages/shared`.
- `apps/web/AGENTS.md`: this Next.js version has breaking changes — consult
  `node_modules/next/dist/docs/` before writing route/navigation code.

## Out of scope

- The WebGL ink interaction layer (`docs/future/ink-interaction-spec.md`).
- Dark mode (the design is light-only by decision).
- Using the animated `Butterfly5.gif` (may revisit on request).
