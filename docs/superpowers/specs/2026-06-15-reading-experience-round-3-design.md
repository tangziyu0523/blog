# Reading Experience, Round 3 — Design

**Date:** 2026-06-15
**Scope:** `apps/web` (Next.js 16 App Router)
**Status:** Approved, ready for implementation planning
**Builds on:** `2026-06-15-reading-experience-round-2-design.md` (merged)

## Problem

Three issues remain after round 2:

1. **Article body typography still feels wrong.** The reader wants the plain, pre-redesign look back — normal body font, full container width, no designed narrow column / drop cap / custom scale. Additionally, the markdown renderer only parses headings, code blocks, and paragraphs; **bold, italic, lists, links, and inline code render as raw text**, and the reader wants real markdown rendering.
2. **The 文章列表 landing flashes through the intro.** The round-2 re-assertion fix lands correctly *eventually*, but the first frame shows the middle of the home entrance animation before snapping to the list — a visible flash.
3. **Switching 最新/最热 jitters and loses position.** Switching tabs shakes the page (re-animation + reflow) and does not reliably leave the tab bar / list at a consistent top position. The reader wants the post-switch position to match a 文章列表 landing.

## Approved decisions

- **Part 1:** Restore plain article typography (full-width Lora in the existing `max-w-3xl` container, left-aligned, no narrow column / drop cap / custom heading scale) with only minimal readable spacing. **Upgrade the markdown renderer** to render bold, italic, inline code, links, unordered/ordered lists, blockquotes, and `h3` (in addition to today's `h1`/`h2`/fenced code).
- **Part 2:** Root-cause fix via **two home render modes** (intro vs. list); list mode skips the entrance choreography so the list is stable. **Implement cautiously and incrementally**, one small, verifiable step at a time.
- **Part 3:** Stabilize tab switching in list mode (no replay, reserved height, anchored to the list top).

## Part 1 — Plain typography + real markdown rendering

### Typography
Replace the round-2 `.prose-naturalist` CSS with a plain, conventional style:
- Body inherits the site Lora serif at the normal/default size, left-aligned, **full width inside `max-w-3xl`** (no `max-width`/`margin-inline` narrowing, no drop cap, no oversized custom heading scale beyond sensible defaults).
- Add only **minimal readable spacing**: paragraph spacing, list indentation/markers, blockquote treatment, code styling — enough to read normally (the literal pre-change state had zero paragraph spacing, which is the one thing not restored).

### Markdown renderer upgrade (`MarkdownRenderer.tsx` + a pure parser module)
Extend rendering, keeping the existing **escape-first, no-raw-HTML** safety model (do not introduce an HTML-allowing markdown engine). Supported additions:
- **Headings:** `#`→`h1`, `##`→`h2`, `###`→`h3`.
- **Inline:** `**bold**`/`__bold__`, `*italic*`/`_italic_`, `` `inline code` ``, links `[text](url)`.
- **Blocks:** unordered lists (`-`/`*`/`+`), ordered lists (`1.`), blockquotes (`>`), in addition to fenced code blocks (Shiki, unchanged).
- **Safety:** escape `& < >` first; apply inline formatting on escaped text with inline code extracted first so formatting inside code is not processed; **validate link hrefs** (allow `http`/`https`/`mailto`/relative `/`/`#`; reject `javascript:`/`data:` etc.), and emit `rel="noopener noreferrer"`.

The parsing is pure and string-based, so the block/inline logic lives in a dedicated module unit-tested with `node --test` (escaping, each inline form, list/blockquote blocks, link sanitization, code-span isolation). `MarkdownRenderer` stays the async wrapper that calls Shiki for code and the pure parser for prose.

## Part 2 — Two home render modes (intro vs. list)

The home page renders in one of two modes, decided on arrival from the existing navigation signals (the 文章列表 intent flag + back/pop detection):

- **Intro mode** — fresh load or clicking the logo/title. Unchanged from today: ScrollSmoother engaged, `ChapterStage` book choreography, Marquee, then the list below.
- **List mode** — clicking 文章列表, or back-from-article. Renders the **list only, at the top** (below the fixed header), with **ScrollSmoother not engaged and `ChapterStage` not rendered/pinned**. With no giant pinned page above it, the list sits at a small, stable, native-scroll position — eliminating the flash (issue 2) by construction (no intro frame to show, nothing to re-assert), and making back-restore a trivial small native offset.

Mode is decided **before first paint** so the intro never appears in list mode. Because the mode affects both the page content (render `ChapterStage` or not) and `SmoothScroll` (engage the smoother or not), the two read a single shared source of truth for the current home mode, set once per home mount from the nav signals.

**Decision rules:**
- 文章列表 intent → list mode.
- back/forward (pop) into home → list mode (restore the small in-list offset).
- fresh load / logo / other push → intro mode.

**Cautious, incremental implementation.** This touches the most fragile part of the app (the home GSAP/scroll path), so the plan must proceed in small, independently verifiable steps with browser checkpoints between them — e.g., introduce the mode source of truth without behavior change, then gate `ChapterStage`, then gate the smoother, then wire the nav signals — verifying at each step that intro mode is unchanged before relying on list mode.

## Part 3 — Stable tab switching (list mode)

Switching 最新/最热 must not shake the page and must leave the list anchored at the top (matching a 文章列表 landing):
- **No replay:** the list entrance animation runs on first appearance only, not on tab change.
- **Reserved height:** hold the list region's height during the fetch so swapping content does not reflow/jump.
- **Anchored:** after switching, the tab bar / list top stays at the top of the content area.

## Testing & guardrails

- `pnpm verify` stays green — the iron rule.
- Unit-test the pure markdown parser thoroughly with `node --test` (escaping, inline forms, lists, blockquotes, link sanitization). Unit-test any pure mode-decision logic (`decideHomeMode`).
- Typography, the two-mode behavior, the flash, and tab-switch stability are visual/runtime — verified by browser checkpoints (especially for Part 2's incremental steps).
- TypeScript strict, no `any`; follow existing patterns and `apps/web/AGENTS.md` (consult `node_modules/next/dist/docs/` before touching routing/navigation APIs).

## Out of scope

- Removing the intro choreography (it stays for intro mode).
- Switching to a third-party markdown/HTML engine (the custom escape-first renderer is extended instead).
- Dark mode; the WebGL ink layer.
