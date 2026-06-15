# Reading Experience, Round 3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore plain article typography with real markdown rendering, stabilize 最新/最热 tab switching, and add a two-mode home (intro vs. list) so the article list is shown at a stable position with no entrance flash.

**Architecture:** Phase 1 (lower risk, independent): a pure markdown parser feeds a plain-styled `.prose-naturalist`; the feed reveal/tab-switch is reworked so switching never replays or collapses. Phase 2 (cautious, incremental): a `HomeMode` context (intro vs. list) decided from existing nav signals gates both `ChapterStage` rendering and ScrollSmoother engagement, so list mode is a short, stable, native-scroll page.

**Tech Stack:** Next.js 16 (App Router), React 19, GSAP ScrollSmoother/ScrollTrigger, Tailwind v4, Shiki, Node `node --test`.

---

## File Structure

**Phase 1**
- `apps/web/src/lib/markdown.ts` (new) — pure prose→HTML parser (escape, inline, block-level), unit-tested.
- `apps/web/src/components/MarkdownRenderer.tsx` (modify) — tokenize code vs. prose; prose via the parser.
- `apps/web/src/app/globals.css` (modify) — plain `.prose-naturalist`.
- `apps/web/src/components/ScrollReveal.tsx` (modify) — reveal once, never re-hide.
- `apps/web/src/components/PostList.tsx` (modify) — keep last-loaded content during fetch; no replay key.

**Phase 2**
- `apps/web/src/lib/home-mode.ts` (new) — pure `decideHomeMode`, unit-tested.
- `apps/web/src/components/HomeModeProvider.tsx` (new) — context: `{ mode, listOffset }`, decided on home mount.
- `apps/web/src/components/HomeView.tsx` (new) — renders intro+list or list-only by mode; list-mode scroll save/restore.
- `apps/web/src/app/layout.tsx` (modify) — wrap in `HomeModeProvider`.
- `apps/web/src/app/page.tsx` (modify) — pass `intro`/`list` to `HomeView`.
- `apps/web/src/components/SmoothScroll.tsx` (modify) — engage smoother only in intro mode; intro lands at top.

---

# Phase 1 — Typography, markdown, tab stability

## Task 1: Pure markdown parser

**Files:**
- Create: `apps/web/src/lib/markdown.ts`
- Test: `apps/web/src/lib/markdown.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/markdown.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderInline, renderProse } from './markdown.ts';

test('escapeHtml escapes the HTML specials', () => {
  assert.equal(escapeHtml('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
});

test('renderInline handles bold, italic, and inline code', () => {
  assert.equal(renderInline('a **b** c'), 'a <strong>b</strong> c');
  assert.equal(renderInline('a _b_ c'), 'a <em>b</em> c');
  assert.equal(renderInline('a `b` c'), 'a <code>b</code> c');
});

test('renderInline does not format inside inline code', () => {
  assert.equal(renderInline('`a *b* c`'), '<code>a *b* c</code>');
});

test('renderInline renders safe links and rejects unsafe schemes', () => {
  assert.equal(
    renderInline('[x](https://e.com)'),
    '<a href="https://e.com" rel="noopener noreferrer">x</a>',
  );
  assert.equal(renderInline('[x](/p)'), '<a href="/p" rel="noopener noreferrer">x</a>');
  assert.equal(renderInline('[x](javascript:alert(1))'), '[x](javascript:alert(1))');
});

test('renderProse renders headings h1..h3', () => {
  assert.equal(renderProse('# A'), '<h1>A</h1>');
  assert.equal(renderProse('## B'), '<h2>B</h2>');
  assert.equal(renderProse('### C'), '<h3>C</h3>');
});

test('renderProse groups an unordered list', () => {
  assert.equal(renderProse('- a\n- b'), '<ul><li>a</li><li>b</li></ul>');
});

test('renderProse groups an ordered list', () => {
  assert.equal(renderProse('1. a\n2. b'), '<ol><li>a</li><li>b</li></ol>');
});

test('renderProse renders a blockquote', () => {
  assert.equal(renderProse('> hi'), '<blockquote>hi</blockquote>');
});

test('renderProse wraps a paragraph and applies inline + escaping', () => {
  assert.equal(renderProse('a **b** <x>'), '<p>a <strong>b</strong> &lt;x&gt;</p>');
});

test('renderProse separates paragraphs on blank lines', () => {
  assert.equal(renderProse('a\n\nb'), '<p>a</p><p>b</p>');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @blog/web test`
Expected: FAIL — cannot resolve `./markdown.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/markdown.ts`:

```ts
/** Escape the HTML specials so authored text can never inject markup. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Allow only http(s)/mailto, root-relative, anchors, or scheme-less relative paths. */
function safeHref(url: string): string | null {
  const u = url.trim();
  if (/["'<>`\s]/.test(u)) return null;
  if (/^(https?:\/\/|mailto:)/i.test(u)) return u;
  if (/^[/#]/.test(u)) return u;
  if (/^[^:]+$/.test(u)) return u; // relative path, no scheme
  return null;
}

/**
 * Inline formatting on a single line. Input is raw (unescaped); this escapes it,
 * then applies code spans (which shield their contents), links, bold, and italic.
 */
export function renderInline(raw: string): string {
  let s = escapeHtml(raw);

  // Protect inline code first so * _ [ inside it are left literal.
  const codes: string[] = [];
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });

  // Links: [text](url) with href validation.
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text: string, url: string) => {
    const href = safeHref(url);
    return href ? `<a href="${href}" rel="noopener noreferrer">${text}</a>` : m;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  s = s.replace(/(^|[^a-zA-Z0-9])_([^_]+)_(?=[^a-zA-Z0-9]|$)/g, "$1<em>$2</em>");

  // Restore code spans.
  s = s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

const UL = /^[-*+]\s+(.*)$/;
const OL = /^\d+\.\s+(.*)$/;

/**
 * Block-level prose → HTML. Splits a prose chunk (everything between fenced code
 * blocks) into headings, unordered/ordered lists, blockquotes, and paragraphs,
 * applying inline formatting to text content. Pure and string-only.
 */
export function renderProse(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  const isBlank = (l: string): boolean => l.trim() === "";

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) { i++; continue; }

    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) {
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      i++;
      continue;
    }

    if (UL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL.test(lines[i])) {
        items.push(`<li>${renderInline(UL.exec(lines[i])![1])}</li>`);
        i++;
      }
      out.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (OL.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL.test(lines[i])) {
        items.push(`<li>${renderInline(OL.exec(lines[i])![1])}</li>`);
        i++;
      }
      out.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoted.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${renderInline(quoted.join(" "))}</blockquote>`);
      continue;
    }

    // Paragraph: gather until a blank line or a block starter.
    const para: string[] = [];
    while (
      i < lines.length &&
      !isBlank(lines[i]) &&
      !/^(#{1,3})\s+/.test(lines[i]) &&
      !UL.test(lines[i]) &&
      !OL.test(lines[i]) &&
      !/^>\s?/.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    out.push(`<p>${renderInline(para.join(" "))}</p>`);
  }

  return out.join("");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @blog/web test`
Expected: PASS (all markdown tests + existing).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/markdown.ts apps/web/src/lib/markdown.test.ts
git commit -m "feat(web): add pure markdown prose parser (inline + blocks, safe links)"
```

---

## Task 2: Wire the renderer + plain typography

**Files:**
- Modify: `apps/web/src/components/MarkdownRenderer.tsx`
- Modify: `apps/web/src/app/globals.css`

- [ ] **Step 1: Rewrite `MarkdownRenderer.tsx`** to keep code blocks for Shiki and route prose through the parser. Overwrite the file:

```tsx
import { codeToHtml } from "shiki";
import { renderProse } from "@/lib/markdown";

type Block =
  | { type: "code"; lang: string; code: string }
  | { type: "prose"; text: string };

// Split markdown into fenced code blocks (rendered by Shiki) and prose chunks
// (rendered by the pure parser). Fenced code is captured whole first so its
// contents are never parsed as prose.
function tokenize(markdown: string): Block[] {
  const lines = markdown.split("\n");
  const blocks: Block[] = [];
  let buf: string[] = [];

  const flushProse = (): void => {
    const text = buf.join("\n");
    if (text.trim()) blocks.push({ type: "prose", text });
    buf = [];
  };

  let i = 0;
  while (i < lines.length) {
    const open = /^```(\w+)?\s*$/.exec(lines[i]);
    if (open) {
      flushProse();
      const lang = open[1] ?? "text";
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence
      blocks.push({ type: "code", lang, code: code.join("\n") });
    } else {
      buf.push(lines[i]);
      i++;
    }
  }
  flushProse();
  return blocks;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function renderBlock(block: Block): Promise<string> {
  if (block.type === "code") {
    try {
      return await codeToHtml(block.code, { lang: block.lang, theme: "github-light" });
    } catch {
      return `<pre><code>${escapeHtml(block.code)}</code></pre>`;
    }
  }
  return renderProse(block.text);
}

export async function MarkdownRenderer({ markdown }: { markdown: string }) {
  const blocks = tokenize(markdown);
  const html = (await Promise.all(blocks.map(renderBlock))).join("\n");
  return <div className="prose-naturalist" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [ ] **Step 2: Replace the `.prose-naturalist` block in `apps/web/src/app/globals.css`** with a plain, full-width style. Find the existing `.prose-naturalist { ... }` rules (everything from `.prose-naturalist {` through the last `.prose-naturalist pre { ... }` rule) and replace them with:

```css
.prose-naturalist {
  font-family: var(--font-body), Georgia, serif;
  line-height: 1.7;
  color: var(--text);
}
.prose-naturalist > * + * { margin-top: 1em; }
.prose-naturalist h1 {
  font-family: var(--font-display), Georgia, serif;
  font-size: 1.8rem;
  line-height: 1.2;
  margin-top: 1.4em;
  margin-bottom: 0.2em;
}
.prose-naturalist h2 {
  font-family: var(--font-display), Georgia, serif;
  font-size: 1.5rem;
  line-height: 1.25;
  margin-top: 1.3em;
  margin-bottom: 0.2em;
}
.prose-naturalist h3 {
  font-family: var(--font-display), Georgia, serif;
  font-size: 1.25rem;
  margin-top: 1.2em;
  margin-bottom: 0.2em;
}
.prose-naturalist a {
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose-naturalist strong { font-weight: 600; }
.prose-naturalist em { font-style: italic; }
.prose-naturalist blockquote {
  border-left: 2px solid var(--border);
  padding-left: 1rem;
  color: var(--text-2);
}
.prose-naturalist ul { list-style: disc; padding-left: 1.5rem; }
.prose-naturalist ol { list-style: decimal; padding-left: 1.5rem; }
.prose-naturalist li + li { margin-top: 0.3em; }
.prose-naturalist :not(pre) > code {
  font-family: var(--font-mono), monospace;
  font-size: 0.9em;
  background: var(--surface-2);
  padding: 0.1em 0.35em;
  border-radius: 4px;
}
.prose-naturalist pre {
  margin-top: 1em;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow-x: auto;
  font-size: 0.9rem;
  line-height: 1.6;
}
```

- [ ] **Step 3: Verify lint + typecheck + test**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck && pnpm --filter @blog/web test`
Expected: no errors; tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/MarkdownRenderer.tsx apps/web/src/app/globals.css
git commit -m "feat(web): render full markdown in articles; plain full-width prose styling"
```

---

## Task 3: Stable tab switching

**Files:**
- Modify: `apps/web/src/components/ScrollReveal.tsx`
- Modify: `apps/web/src/components/PostList.tsx`

Two fixes: (a) the reveal hides + animates only the rows present at mount (via `gsap.set`, not persistent CSS) and is never re-keyed, so tab-switched rows render visible with no replay; (b) `PostList` keeps showing the last-loaded list while the next tab is fetching, so content never collapses to empty.

- [ ] **Step 1: Rewrite `ScrollReveal.tsx`** so it does not keep content hidden via CSS and only reveals the initial rows. Overwrite the file:

```tsx
"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

/**
 * Reveals the feed rows present at mount as they scroll into view: the lead article
 * rises first, then the index rows cascade. Hiding is applied imperatively with
 * gsap.set (only to the rows that exist at mount), so rows added later — e.g. after a
 * tab switch — render visible immediately with no replay and no flash. Skipped under
 * prefers-reduced-motion.
 */
export function ScrollReveal({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const container = containerRef.current;
      if (!container) return;

      const reveal = { y: 0, opacity: 1, duration: 1.0, ease: "power2.out" } as const;

      const headline = container.querySelector<HTMLElement>(":scope > article");
      if (headline) {
        gsap.set(headline, { opacity: 0, y: 60 });
        gsap.to(headline, { ...reveal, scrollTrigger: { trigger: headline, start: "top 95%" } });
      }

      const rows = gsap.utils.toArray<HTMLElement>(
        container.querySelectorAll(":scope > section > article"),
      );
      if (rows.length > 0) {
        gsap.set(rows, { opacity: 0, y: 60 });
        gsap.to(rows, {
          ...reveal,
          stagger: 0.1,
          scrollTrigger: { trigger: rows[0], start: "top 95%" },
        });
      }
    },
    { scope: containerRef },
  );

  return <div ref={containerRef} className="scroll-reveal">{children}</div>;
}
```

- [ ] **Step 2: Update `PostList.tsx`** to keep the last-loaded list during a fetch and stop re-keying the reveal. Open `apps/web/src/components/PostList.tsx` and make these three changes:

(a) Replace the two existing lines `const items = cache[tab] ?? [];` and `const [headline, ...rest] = items;` with a last-loaded fallback so switching never shows an empty list while loading:

```tsx
  const loaded = cache[tab];
  const lastShownRef = useRef<PostSummary[]>(initial.items);
  if (loaded) lastShownRef.current = loaded;
  const items = loaded ?? lastShownRef.current;
  const [headline, ...rest] = items;
```

(b) Add `useRef` to the React import at the top:

```tsx
import { startTransition, useRef, useState } from "react";
```

(c) Remove the remount key on `ScrollReveal` so a tab switch does not replay the animation. Change:

```tsx
        <ScrollReveal key={`${tab}-${items.length}`}>
```
to:
```tsx
        <ScrollReveal>
```

- [ ] **Step 3: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 4: Browser checkpoint (controller)**

Run `pnpm --filter @blog/web dev`. Scroll to the list, switch 最新/最热 a few times. Expected: rows do not replay the rise-in animation, the list never blanks to empty mid-fetch, and the page does not shake. Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ScrollReveal.tsx apps/web/src/components/PostList.tsx
git commit -m "feat(web): stop tab-switch jitter (reveal once, keep last-loaded list)"
```

---

# Phase 2 — Two home modes (cautious, incremental)

Each task ends with a browser checkpoint. **Intro mode (fresh load / clicking the logo) must stay identical after every task** before relying on list mode.

## Task 4: Pure home-mode decision

**Files:**
- Create: `apps/web/src/lib/home-mode.ts`
- Test: `apps/web/src/lib/home-mode.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/lib/home-mode.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideHomeMode } from './home-mode.ts';

test('explicit list intent → list mode', () => {
  assert.equal(decideHomeMode('push', true), 'list');
  assert.equal(decideHomeMode('pop', true), 'list');
});

test('back/forward (pop) → list mode', () => {
  assert.equal(decideHomeMode('pop', false), 'list');
});

test('fresh load / logo (push, no intent) → intro mode', () => {
  assert.equal(decideHomeMode('push', false), 'intro');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @blog/web test`
Expected: FAIL — cannot resolve `./home-mode.ts`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/lib/home-mode.ts`:

```ts
import type { NavType } from "./scroll-restoration";

export type HomeMode = "intro" | "list";

/**
 * Decide how the home route renders. Explicit "go to list" intent or a back/forward
 * navigation lands on the list; a fresh load or a logo click plays the intro.
 */
export function decideHomeMode(navType: NavType, toIndexIntent: boolean): HomeMode {
  if (toIndexIntent) return "list";
  if (navType === "pop") return "list";
  return "intro";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @blog/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/home-mode.ts apps/web/src/lib/home-mode.test.ts
git commit -m "feat(web): add home-mode decision logic"
```

---

## Task 5: HomeMode context; gate the smoother on mode

**Files:**
- Create: `apps/web/src/components/HomeModeProvider.tsx`
- Modify: `apps/web/src/app/layout.tsx`
- Modify: `apps/web/src/components/SmoothScroll.tsx`

The provider becomes the single consumer of the nav signals on the home route and exposes `{ mode, listOffset }`. `SmoothScroll` reads the mode and engages the smoother only in intro mode, landing at the top (list positioning moves to list mode in Task 7). This keeps intro mode identical; list mode temporarily still shows `ChapterStage` (gated in Task 6).

- [ ] **Step 1: Create `apps/web/src/components/HomeModeProvider.tsx`:**

```tsx
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { consumeNavType } from "@/lib/nav-history";
import {
  LIST_OFFSET_KEY,
  SCROLL_TO_INDEX_EVENT,
  consumeToIndexIntent,
} from "@/lib/home-landing";
import { parseSavedScroll } from "@/lib/scroll-restoration";
import { decideHomeMode, type HomeMode } from "@/lib/home-mode";

interface HomeModeState {
  mode: HomeMode;
  /** Native scroll offset to restore in list mode (px); null = top. */
  listOffset: number | null;
}

const HomeModeContext = createContext<HomeModeState>({ mode: "intro", listOffset: null });

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/** Provides the home render mode. Decided once per home mount from the nav signals. */
export function HomeModeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<HomeModeState>({ mode: "intro", listOffset: null });

  // Decide before paint so the intro never flashes when landing on the list.
  useIsoLayoutEffect(() => {
    if (pathname !== "/") {
      setState({ mode: "intro", listOffset: null });
      return;
    }
    const intent = consumeToIndexIntent();
    const mode = decideHomeMode(consumeNavType(), intent);
    const listOffset = intent ? 0 : parseSavedScroll(sessionStorage.getItem(LIST_OFFSET_KEY));
    setState({ mode, listOffset });
  }, [pathname]);

  // "文章列表" clicked while already on home → switch to list mode at the top.
  useEffect(() => {
    const onToIndex = (): void => setState({ mode: "list", listOffset: 0 });
    window.addEventListener(SCROLL_TO_INDEX_EVENT, onToIndex);
    return () => window.removeEventListener(SCROLL_TO_INDEX_EVENT, onToIndex);
  }, []);

  return <HomeModeContext.Provider value={state}>{children}</HomeModeContext.Provider>;
}

export function useHomeMode(): HomeModeState {
  return useContext(HomeModeContext);
}
```

- [ ] **Step 2: Wrap the app in the provider.** In `apps/web/src/app/layout.tsx`, add the import:

```tsx
import { HomeModeProvider } from "@/components/HomeModeProvider";
```

and wrap the existing children of `<AuthProvider>` so the structure becomes:

```tsx
        <AuthProvider>
          <HomeModeProvider>
            <SiteHeader />
            <ScrollManager />
            <SmoothScroll>{children}</SmoothScroll>
          </HomeModeProvider>
        </AuthProvider>
```

- [ ] **Step 3: Simplify `SmoothScroll.tsx` to engage only in intro mode and land at the top.** Overwrite the file:

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
import { useHomeMode } from "@/components/HomeModeProvider";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, ScrollSmoother);
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * ScrollSmoother base. Engages the smoother only on the home route in intro mode
 * with motion allowed; list mode and every other route scroll natively. Leaving the
 * smoothed view, it kills the smoother and resets scroll before paint so the next
 * view never shows a frame under the smoother's leftover transform.
 */
export function SmoothScroll({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const { mode } = useHomeMode();
  const smoothed = pathname === "/" && mode === "intro";

  useIsoLayoutEffect(() => {
    if (smoothed) return;
    ScrollSmoother.get()?.kill();
    window.scrollTo(0, 0);
  }, [smoothed]);

  useGSAP(
    () => {
      if (!smoothed) return;
      if (prefersReducedMotion()) return;
      if (!wrapperRef.current || !contentRef.current) return;

      const smoother = ScrollSmoother.create({
        wrapper: wrapperRef.current,
        content: contentRef.current,
        smooth: 1.2,
        effects: false,
        normalizeScroll: false,
      });
      ScrollTrigger.refresh();
      requestAnimationFrame(() => smoother.scrollTo(0, false));

      return () => {
        if (ScrollSmoother.get() === smoother) smoother.kill();
      };
    },
    { dependencies: [smoothed], scope: wrapperRef },
  );

  return (
    <div id="smooth-wrapper" ref={wrapperRef}>
      <div id="smooth-content" ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 5: Browser checkpoint (controller)**

Run `pnpm --filter @blog/web dev`. Expected: a fresh load of `/` and clicking the logo both play the intro choreography exactly as before (smoother engaged). List mode is not yet wired (clicking 文章列表 may not be correct yet — that's Task 6). Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/HomeModeProvider.tsx apps/web/src/app/layout.tsx apps/web/src/components/SmoothScroll.tsx
git commit -m "feat(web): add HomeMode context; engage smoother only in intro mode"
```

---

## Task 6: Gate the intro choreography; render list-only in list mode

**Files:**
- Create: `apps/web/src/components/HomeView.tsx`
- Modify: `apps/web/src/app/page.tsx`

`HomeView` (client) renders the intro block + list in intro mode, or the list alone (at the top) in list mode. `page.tsx` (server) composes the two halves and passes them in.

- [ ] **Step 1: Create `apps/web/src/components/HomeView.tsx`:**

```tsx
"use client";

import type { ReactNode } from "react";
import { useHomeMode } from "@/components/HomeModeProvider";

/**
 * Renders the home in its current mode: intro mode shows the entrance choreography
 * with the list below; list mode shows the list alone, at the top (no pinned intro),
 * so it sits at a small, stable scroll position.
 */
export function HomeView({ intro, list }: { intro: ReactNode; list: ReactNode }) {
  const { mode } = useHomeMode();
  if (mode === "list") return <>{list}</>;
  return (
    <>
      {intro}
      {list}
    </>
  );
}
```

- [ ] **Step 2: Restructure `apps/web/src/app/page.tsx`** to pass `intro` and `list` to `HomeView`. Overwrite the file:

```tsx
import { fetchPosts } from "@/lib/posts";
import { Masthead } from "@/components/Masthead";
import { RevealText } from "@/components/RevealText";
import { HeroZone } from "@/components/HeroZone";
import { ChapterStage } from "@/components/ChapterStage";
import { Marquee } from "@/components/Marquee";
import { PostList } from "@/components/PostList";
import { HomeView } from "@/components/HomeView";
import { Bird1, Flower2 } from "@/components/illustrations";

const PAGE = "flex min-h-screen flex-col justify-center";
const KICKER = "font-sans text-[10px] uppercase tracking-[0.25em]";

export default async function Home() {
  const initial = await fetchPosts("latest");

  const intro = (
    <HeroZone>
      {/* Curated book pages — fixed editorial content, not the article stream. */}
      <ChapterStage>
        {/* Page 1 — the masthead spread */}
        <section className={PAGE}>
          <Masthead issue={initial.total} />
          <RevealText
            className="mt-8 max-w-2xl"
            style={{
              fontStyle: "italic",
              color: "var(--text-2)",
              fontSize: "clamp(18px, 2.4vw, 24px)",
              lineHeight: 1.5,
            }}
          >
            Field notes from the edges of systems and software — observed
            slowly, drawn by hand, and pressed here like specimens between the
            pages.
          </RevealText>
        </section>

        {/* Page 2 — editor's note */}
        <section className={PAGE}>
          <div className="relative max-w-2xl">
            <Bird1 width={120} height={120} className="absolute -top-6 right-0 opacity-80" />
            <p className={KICKER} style={{ color: "var(--accent)" }}>
              From the Editor
            </p>
            <h2
              className="mt-4"
              style={{ fontFamily: "var(--font-display)", fontSize: "clamp(34px, 6vw, 60px)", lineHeight: 1.05 }}
            >
              On Slow
              <br />
              Observation
            </h2>
            <p className="mt-6" style={{ color: "var(--text-2)", lineHeight: 1.7 }}>
              This is a notebook kept in the old naturalist habit: look long
              before you name, draw before you classify, and let the specimen
              tell you what it is. The articles that follow are dated entries;
              these opening pages are the standing matter — the why.
            </p>
          </div>
        </section>

        {/* Page 3 — a pressed pull-quote */}
        <section className={PAGE}>
          <div className="relative max-w-3xl">
            <Flower2 width={140} height={140} className="absolute -top-10 -left-6 opacity-70" />
            <blockquote
              className="relative"
              style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontSize: "clamp(28px, 5vw, 52px)", lineHeight: 1.2 }}
            >
              Every system, observed closely enough, becomes natural history.
            </blockquote>
            <p className={`${KICKER} mt-8`} style={{ color: "var(--text-3)" }}>
              — Naturalis Historia
            </p>
          </div>
        </section>
      </ChapterStage>

      {/* 开书成索引 — the book opens into the running index. */}
      <Marquee className="my-12 border-y py-3" style={{ borderColor: "var(--border)" }} />
    </HeroZone>
  );

  const list = (
    <div id="article-index">
      <PostList initial={initial} />
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24">
      <HomeView intro={intro} list={list} />
    </main>
  );
}
```

- [ ] **Step 3: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 4: Browser checkpoint (controller)**

Run `pnpm --filter @blog/web dev`. Expected:
- Fresh load / logo → full intro choreography, list below (unchanged).
- Click 文章列表 (from an article, and from home) → the list renders alone at the top, no intro, no flash through the choreography.
- Back from an article → the list, not the intro top.
Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/HomeView.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): render list-only home view in list mode"
```

---

## Task 7: List-mode scroll restore

**Files:**
- Modify: `apps/web/src/components/HomeView.tsx`

In list mode, restore the saved native scroll offset on mount (back/forward) or start at the top (文章列表), and persist the offset as the reader scrolls so a later back returns to the same spot.

- [ ] **Step 1: Add list-mode scroll save/restore to `HomeView.tsx`.** Overwrite the file:

```tsx
"use client";

import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { useHomeMode } from "@/components/HomeModeProvider";
import { LIST_OFFSET_KEY } from "@/lib/home-landing";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Renders the home in its current mode: intro mode shows the entrance choreography
 * with the list below; list mode shows the list alone, at the top (no pinned intro).
 * In list mode it restores the saved native scroll offset (back/forward) or starts at
 * the top, and persists the offset as the reader scrolls.
 */
export function HomeView({ intro, list }: { intro: ReactNode; list: ReactNode }) {
  const { mode, listOffset } = useHomeMode();

  useIsoLayoutEffect(() => {
    if (mode !== "list") return;
    window.scrollTo(0, listOffset ?? 0);
  }, [mode, listOffset]);

  useEffect(() => {
    if (mode !== "list") return;
    let raf = 0;
    const save = (): void => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        sessionStorage.setItem(LIST_OFFSET_KEY, String(Math.max(0, Math.round(window.scrollY))));
      });
    };
    window.addEventListener("scroll", save, { passive: true });
    return () => {
      window.removeEventListener("scroll", save);
      cancelAnimationFrame(raf);
    };
  }, [mode]);

  if (mode === "list") return <>{list}</>;
  return (
    <>
      {intro}
      {list}
    </>
  );
}
```

- [ ] **Step 2: Verify lint + typecheck**

Run: `pnpm --filter @blog/web lint && pnpm --filter @blog/web typecheck`
Expected: no errors.

- [ ] **Step 3: Browser checkpoint (controller)**

Run `pnpm --filter @blog/web dev`. Scroll into the list (list mode via 文章列表), open an article, click ← 返回. Expected: you return to the list at your previous scroll spot (not the top, not the intro). Clicking 文章列表 lands at the list top. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/HomeView.tsx
git commit -m "feat(web): restore list-mode scroll position on back/forward"
```

---

## Task 8: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the workspace gate**

Run: `pnpm verify`
Expected: lint, typecheck, and test all green (the only lint warning is the pre-existing `Avatar.tsx` `<img>`).

- [ ] **Step 2: Fix any failure before finishing**

Use superpowers:systematic-debugging for any failure. Do not modify the Stop hook.

- [ ] **Step 3: Final browser smoke (controller)**

Run `pnpm --filter @blog/web dev` and confirm all three issues:
1. Article body reads as plain, full-width prose with real markdown (bold/italic/lists/links/inline code render; headings/code styled).
2. 文章列表 / back land on the list with no flash through the intro; logo / fresh load still play the intro.
3. Switching 最新/最热 does not shake, does not blank, and keeps the list at the top.

---

## Notes for the implementer

- **Phase 2 is the fragile area.** Do the tasks in order and confirm intro mode is unchanged at each browser checkpoint before depending on list mode. If a checkpoint regresses intro mode, stop and apply superpowers:systematic-debugging rather than pushing forward.
- **No-flash mode decision:** `HomeModeProvider` decides mode in a pre-paint layout effect; SSR/first render defaults to intro, then corrects to list before paint. If a brief intro flash is observed entering list mode, that's the place to investigate (e.g., gate `ChapterStage` mounting harder).
- **`home-landing.ts`:** `decideHomeLanding` is no longer used after this round (mode replaces it). Leave the still-used exports (`LIST_OFFSET_KEY`, `SCROLL_TO_INDEX_EVENT`, `setToIndexIntent`, `consumeToIndexIntent`, `parseSavedScroll` lives in `scroll-restoration.ts`). If `decideHomeLanding` and its test are now dead, remove them in Task 6's commit.
- **`apps/web/AGENTS.md`:** consult `node_modules/next/dist/docs/` before changing routing/navigation APIs.
```
