# Pin-and-Fade Crossfade (Home Book Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the home book-page scroll transition with a canonical pin-and-fade crossfade — one pinned frame, one scrubbed timeline, `autoAlpha` + subtle scale, reading-paced ~260vh — and remove the now-dead `data-speed` parallax.

**Architecture:** `ChapterStage` already wraps the curated pages in a pinned, one-viewport frame with absolutely-stacked layers driven by a single scrubbed ScrollTrigger timeline (no per-layer triggers, no snap). This plan rewrites that timeline's internals to a clean `autoAlpha`+scale crossfade with explicit dwell gaps and overlapping fade tweens, drops the `.chapter-inner` wrapper and `data-speed` (which drifted under the pin), and reverts ScrollSmoother `effects` to off. Index section stays outside the pin, unchanged.

**Tech Stack:** Next.js (App Router) client components, GSAP 3.15 (`ScrollTrigger`, `ScrollSmoother`, `@gsap/react` `useGSAP`), Tailwind.

**Spec:** `docs/future/scroll-choreography-spec.md` (revised pin-and-fade version).

---

## Testing approach (read first)

There is **no unit-test-first loop** here: a scroll-scrubbed GSAP timeline depends on real layout, scroll position, and `requestAnimationFrame`, so jsdom assertions would be brittle and meaningless. Per `CLAUDE.md`, the test mandate targets P0 API/core-logic; this is a P2 presentational animation. Each task is therefore verified by:

1. **`pnpm verify`** (lint + typecheck + build) — must be green; the Stop hook enforces it. Run from the repo root `/Users/tangziyu/blog`.
2. **Browser frame capture** via headless Chrome + CDP (Node 25 has a built-in `WebSocket`), capturing the home page at several scroll offsets and visually confirming the crossfade envelope and that pages stay centered (no drift). The dev stack runs on `localhost:3000` (web) + `localhost:3001` (api); confirm with `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/` → `200` before capturing. If the dev server is not running, start it with `pnpm dev` from the repo root and wait for `200`.

### Shared capture helper (create once, reuse in every task)

- [ ] **Create the CDP capture script** `/tmp/cdp-shot.mjs`:

```js
// Drive headless Chrome over CDP (no deps) to capture scrolled frames.
const BASE = "http://localhost:9222";
const PAGE = "http://localhost:3000/";
// 260vh travel ≈ 2340px at 900px viewport; crossfades land ~0.30 and ~0.62.
const SHOTS = [
  [0, "/tmp/pf-0.png"],       // P1 alone
  [700, "/tmp/pf-700.png"],   // crossfade 1 (P1 -> P2)
  [1150, "/tmp/pf-1150.png"], // P2 alone, centered (no drift)
  [1500, "/tmp/pf-1500.png"], // crossfade 2 (P2 -> P3)
  [2050, "/tmp/pf-2050.png"], // P3 alone, centered, holding
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`${BASE}/json/list`)).json();
    target = list.find((t) => t.type === "page" && t.url.includes("localhost:3000")) ||
             list.find((t) => t.type === "page");
    if (target?.webSocketDebuggerUrl) break;
  } catch {}
  await sleep(250);
}
if (!target?.webSocketDebuggerUrl) { console.error("no page target"); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((resolve) => {
  const mid = ++id; pending.set(mid, resolve);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
};
await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: PAGE });
for (let i = 0; i < 40; i++) {
  const r = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
  if (r?.result?.value === "complete") break;
  await sleep(250);
}
await sleep(2500); // let GSAP / ScrollSmoother init
const fs = await import("node:fs");
for (const [y, path] of SHOTS) {
  await send("Runtime.evaluate", { expression: `window.scrollTo(0, ${y});` });
  await sleep(3200); // smoother lerp + scrub catch-up
  const shot = await send("Page.captureScreenshot", { format: "png" });
  if (shot?.data) { fs.writeFileSync(path, Buffer.from(shot.data, "base64")); console.log("wrote", path); }
  else console.error("no screenshot for y=", y);
}
ws.close(); process.exit(0);
```

- [ ] **Define the capture command** (used verbatim in each task's verify step):

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
pkill -f "remote-debugging-port=9222" 2>/dev/null; sleep 1
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --remote-debugging-port=9222 \
  --window-size=1440,900 "about:blank" >/tmp/chrome-debug.log 2>&1 &
sleep 2
node /tmp/cdp-shot.mjs
pkill -f "remote-debugging-port=9222" 2>/dev/null
```

Then `Read` each `/tmp/pf-*.png` to confirm the expected frame.

---

## File structure

| File | Responsibility | Change |
|------|----------------|--------|
| `apps/web/src/components/ChapterStage.tsx` | Pinned frame + stacked layers + the crossfade timeline | **Rewrite internals** (Task 1) |
| `apps/web/src/components/SmoothScroll.tsx` | ScrollSmoother base for `/` | `effects: true → false` (Task 2) |
| `apps/web/src/app/page.tsx` | Home composition + curated chapter markup | Remove dead `data-speed` attrs (Task 2) |
| `apps/web/src/components/RevealText.tsx` | Word-by-word reveal | **Unchanged** |
| `apps/web/src/components/Marquee.tsx` | Index seam | **Unchanged** |
| `apps/web/src/components/HeroZone.tsx` | `INK_ENABLED` switch + relative wrapper | **Unchanged** |

---

### Task 1: Rewrite ChapterStage to pin-and-fade crossfade

**Files:**
- Modify (full replace): `apps/web/src/components/ChapterStage.tsx`

- [ ] **Step 1: Replace the entire file contents**

```tsx
"use client";

import { Children, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// Total pinned scroll distance (≈260vh) over which the book pages cross-dissolve.
const TRAVEL = 2.6;
// Width of each crossfade window in normalised timeline time (0.10 ≈ 26vh).
const FADE = 0.1;
// Start of each crossfade window, in timeline progress (reading-paced, 3 pages).
// Index 1 = P1→P2 @0.30, index 2 = P2→P3 @0.62. Tuned for the curated pages.
const CROSSFADE_AT = [0, 0.3, 0.62];

/**
 * Pin-and-fade book stage. The curated pages stack as absolute layers in a
 * one-viewport pinned frame; a single scrubbed timeline cross-dissolves them
 * with autoAlpha + a subtle scale (depth, not slide). Reading-paced: each page
 * dwells clearly, then a short ~26vh crossfade bleeds into the next. No snap,
 * no per-layer triggers, no discrete switch.
 *
 * Pin is only a hold — and the ScrollSmoother-compatible one (native sticky
 * breaks under the smoother's transform). Under prefers-reduced-motion none of
 * this runs: positioning is applied only in the motion branch, so SSR / no-JS /
 * reduced-motion all read as a plain stacked long page.
 */
export function ChapterStage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const stage = stageRef.current;
      const frame = frameRef.current;
      if (!stage || !frame) return;

      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const layers = gsap.utils.toArray<HTMLElement>(
          frame.querySelectorAll(":scope > .chapter-layer"),
        );
        if (layers.length === 0) return;

        // Stack the pages on one pinned viewport.
        gsap.set(frame, { position: "relative", height: "100vh", overflow: "hidden" });
        layers.forEach((layer, i) => {
          gsap.set(layer, {
            position: "absolute",
            inset: 0,
            autoAlpha: i === 0 ? 1 : 0,
            scale: i === 0 ? 1 : 1.04,
          });
        });

        if (layers.length === 1) return;

        // One scrubbed timeline, duration normalised to 1 so each tween's
        // position equals scroll progress. Pin holds the frame; no snap.
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: frame,
            start: "top top",
            end: () => "+=" + window.innerHeight * TRAVEL,
            pin: true,
            scrub: 1.5,
            invalidateOnRefresh: true,
          },
        });

        // Adjacent fade-out / fade-in share each crossfade window → overlap bleed.
        for (let i = 1; i < layers.length; i++) {
          const at = CROSSFADE_AT[i] ?? CROSSFADE_AT[CROSSFADE_AT.length - 1];
          tl.to(layers[i - 1], { autoAlpha: 0, scale: 0.99, ease: "power1.inOut", duration: FADE }, at)
            .to(layers[i], { autoAlpha: 1, scale: 1, ease: "power1.inOut", duration: FADE }, at);
        }

        // Hold the last page from its crossfade end (≈0.72) to progress 1, which
        // also anchors the timeline duration to 1.0 so the page stays full until
        // the pin releases into the index.
        const lastAt = CROSSFADE_AT[layers.length - 1] ?? 0.62;
        tl.to(layers[layers.length - 1], { autoAlpha: 1, duration: 1 - (lastAt + FADE) }, lastAt + FADE);
      });

      // reduce branch: intentionally empty — layers remain in normal flow.
    },
    { scope: stageRef },
  );

  return (
    <div ref={stageRef}>
      <div ref={frameRef}>
        {Children.map(children, (child) => (
          <div className="chapter-layer">{child}</div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run `pnpm verify`**

Run: `pnpm -C /Users/tangziyu/blog verify`
Expected: `Tasks: 8 successful, 8 total`. The only lint message is the pre-existing `Avatar.tsx` `<img>` warning (0 errors). Any TypeScript error or new lint error = fix before continuing.

- [ ] **Step 3: Capture frames and verify the envelope**

Confirm the dev server: `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/` → `200` (start `pnpm dev` if not). Then run the capture command from the "Shared capture helper" section, and `Read` each file:
- `/tmp/pf-0.png` — Page 1 (masthead spread) alone, centered.
- `/tmp/pf-700.png` — Page 1 and Page 2 mid-dissolve (both partly visible).
- `/tmp/pf-1150.png` — Page 2 (editor's note) alone, **vertically centered (no downward drift)** — this confirms `data-speed` is gone.
- `/tmp/pf-1500.png` — Page 2 and Page 3 mid-dissolve.
- `/tmp/pf-2050.png` — Page 3 (pull-quote) alone, centered, holding.

If any page sits low/off-center, or a frame is blank, stop and investigate before committing.

- [ ] **Step 4: Commit**

```bash
cd /Users/tangziyu/blog
git add apps/web/src/components/ChapterStage.tsx
git commit -m "feat(web): pin-and-fade crossfade for home book pages

Single pinned frame + one scrubbed timeline, autoAlpha + subtle scale,
reading-paced ~260vh (3 pages, ~26vh crossfades). Drops the .chapter-inner
split and data-speed; adds invalidateOnRefresh. No snap, no per-layer
triggers — continuous cross-dissolve, no discrete switch.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Remove the now-dead data-speed parallax

`ChapterStage` no longer renders `data-speed`, so the ScrollSmoother effect scan and the `page.tsx` title/subtitle `data-speed` attributes are dead. Remove them so nothing stale lingers.

**Files:**
- Modify: `apps/web/src/components/SmoothScroll.tsx`
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Turn off ScrollSmoother effects**

In `apps/web/src/components/SmoothScroll.tsx`, replace:

```tsx
        smooth: 1.2,
        effects: true, // enable data-speed / data-lag parallax on the book layers
        normalizeScroll: false,
```

with:

```tsx
        smooth: 1.2,
        effects: false,
        normalizeScroll: false,
```

- [ ] **Step 2: Remove the data-speed attr from the Page 2 title (`h2`)**

In `apps/web/src/app/page.tsx`, replace:

```tsx
              <h2
                data-speed="0.6"
                className="mt-4"
```

with:

```tsx
              <h2
                className="mt-4"
```

- [ ] **Step 3: Remove the data-speed attr from the Page 2 subtitle (`p`)**

In `apps/web/src/app/page.tsx`, replace:

```tsx
              <p
                data-speed="0.9"
                className="mt-6"
                style={{ color: "var(--text-2)", lineHeight: 1.7 }}
              >
```

with:

```tsx
              <p
                className="mt-6"
                style={{ color: "var(--text-2)", lineHeight: 1.7 }}
              >
```

- [ ] **Step 4: Remove the data-speed attr from the Page 3 title (`blockquote`)**

In `apps/web/src/app/page.tsx`, replace:

```tsx
              <blockquote
                data-speed="0.6"
                className="relative"
```

with:

```tsx
              <blockquote
                className="relative"
```

- [ ] **Step 5: Remove the data-speed attr from the Page 3 attribution (`p`)**

In `apps/web/src/app/page.tsx`, replace:

```tsx
              <p
                data-speed="0.9"
                className={`${KICKER} mt-8`}
                style={{ color: "var(--text-3)" }}
              >
```

with:

```tsx
              <p
                className={`${KICKER} mt-8`}
                style={{ color: "var(--text-3)" }}
              >
```

- [ ] **Step 6: Confirm no stray `data-speed` remains**

Run: `grep -rn 'data-speed' /Users/tangziyu/blog/apps/web/src`
Expected: no output (exit code 1).

- [ ] **Step 7: Run `pnpm verify`**

Run: `pnpm -C /Users/tangziyu/blog verify`
Expected: `Tasks: 8 successful, 8 total` (only the pre-existing `Avatar.tsx` warning).

- [ ] **Step 8: Re-capture and confirm no regression**

Run the capture command again and `Read` `/tmp/pf-1150.png` and `/tmp/pf-2050.png`: pages 2 and 3 must still be centered and holding (turning effects off and removing the attrs must not change the now-correct framing).

- [ ] **Step 9: Commit**

```bash
cd /Users/tangziyu/blog
git add apps/web/src/components/SmoothScroll.tsx apps/web/src/app/page.tsx
git commit -m "chore(web): drop dead data-speed parallax from book pages

ChapterStage no longer uses data-speed, so disable ScrollSmoother effects
and remove the title/subtitle data-speed attrs. Smooth scrolling stays.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Final reduced-motion + index-handoff check

- [ ] **Step 1: Verify reduced-motion degrades to a plain long page**

Add `--force-prefers-reduced-motion` is not a stable Chrome flag; instead emulate it over CDP. Create `/tmp/rm-shot.mjs` identical to `/tmp/cdp-shot.mjs` but with `SHOTS = [[0, "/tmp/rm-0.png"], [900, "/tmp/rm-900.png"]]` and, immediately after `Page.enable`, add:

```js
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
```

Run the capture command but with `node /tmp/rm-shot.mjs`. `Read` `/tmp/rm-0.png` and `/tmp/rm-900.png`: the chapters must appear as ordinary stacked, fully-visible content in normal flow (no pin, no fade, all three pages readable by scrolling) — confirming the reduce branch leaves layers untouched.

- [ ] **Step 2: Verify the index takes over after the pin**

Using the main `/tmp/cdp-shot.mjs`, temporarily set `SHOTS = [[2600, "/tmp/pf-index.png"]]` (past the 260vh pin), run the capture command, and `Read` `/tmp/pf-index.png`: the `Marquee` seam and the article index (headline + list rows) must be scrolling as normal flow below the released pin.

- [ ] **Step 3: No commit**

This task is verification only; nothing to commit.

---

## Self-Review

**1. Spec coverage** — checked against `docs/future/scroll-choreography-spec.md`:
- 单 pin 容器 + 绝对叠层 + 单 timeline → Task 1 (`pin: true`, one `gsap.timeline`).
- autoAlpha + 轻微 scale（in 1.04→1, out 1→0.99）→ Task 1 set + tweens.
- reading-paced ≈260vh, crossfades @0.30/@0.62, FADE 0.10, P3 hold→1.0 → Task 1 `TRAVEL`, `CROSSFADE_AT`, hold tween.
- scrub 1.5, invalidateOnRefresh → Task 1.
- 去 data-speed（ChapterStage 渲染 + SmoothScroll effects + page.tsx 属性）→ Task 1 render (no attr) + Task 2.
- 死代码清理（.chapter-inner、data-speed 属性、y 初始化、effects、TRAVEL_VH→TRAVEL）→ Task 1 (rewrite drops inner/y, renames const) + Task 2 (attrs + effects).
- 索引干净脱离 → Task 3 Step 2 (index outside pin, unchanged).
- 降级（reduced-motion / SSR 普通长页）→ Task 1 motion-branch-only positioning + Task 3 Step 1.
- pin 安全（INK_ENABLED=false, 无 InkCanvas 兄弟）→ unchanged; HeroZone untouched.

**2. Placeholder scan** — no TBD/TODO; every code step shows full content; capture commands are concrete.

**3. Type/name consistency** — constants `TRAVEL`, `FADE`, `CROSSFADE_AT` are defined once and used consistently in Task 1; the hold-tween duration `1 - (lastAt + FADE)` keeps the timeline at duration 1.0 for any page count ≥2 (3 pages: `1 - 0.72 = 0.28`, matching the spec). `.chapter-layer` class name matches between the JSX (`Children.map`) and the `querySelectorAll(":scope > .chapter-layer")` selector. The `data-speed` removals in Task 2 match the exact attrs added in `page.tsx`.

**Edge note:** `CROSSFADE_AT` is tuned for the 3 curated pages; with 2 pages the loop runs once (@0.30) and the hold anchors duration — still valid. A 1-page stage early-returns. Adding a 4th curated page would need another `CROSSFADE_AT` entry (documented by the comment in Task 1).
