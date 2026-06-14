# 作者控制台 + 悬浮导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给已有的发布/编辑后端补齐前端：编辑器支持标签+摘要、文章删除入口、「我的文章」管理页，以及一个滚动后仍可达的悬浮小球导航。

**Architecture:** 纯 `apps/web` 改动，后端零改动（所有接口已存在并测试过）。新增一个 client 管理页 `/me/posts` 复用 `GET /posts?mine=1`；编辑器把已被后端接收的 `tags/summary` 传上；悬浮导航组件挂在 `SmoothScroll` 外层避开 ScrollSmoother 的 transform 坑，靠 `IntersectionObserver` 观察顶栏决定显隐。

**Tech Stack:** Next.js 16 (App Router) + React 19 + Tailwind v4 + Tiptap + GSAP/ScrollSmoother + `@blog/shared` 类型。

**测试约定（重要）：** `apps/web` 无测试运行器，本次不引入。每个任务的验证门禁是：`pnpm --filter @blog/web typecheck` 通过 + `pnpm --filter @blog/web lint` 通过 + 手动跑一遍。最终全量 `pnpm verify` 必须全绿（Stop hook 守门）。纯逻辑抽成函数/hook 靠 strict typecheck 兜底。TypeScript strict、禁止 `any`。

**分支：** `feat/author-console-and-floating-nav`（已创建，spec 已提交在此分支）。

---

## File Structure

新建：
- `apps/web/src/app/me/posts/page.tsx` — 「我的文章」管理页（client，含行内删除确认、加载更多）
- `apps/web/src/components/nav-icons.tsx` — 1px 线条 SVG 图标集（导航与编辑器复用）
- `apps/web/src/lib/use-unread-count.ts` — 轻量未读数 hook（小球红点用）
- `apps/web/src/components/FloatingNav.tsx` — 悬浮小球导航

修改：
- `apps/web/src/lib/posts.ts` — 加 `fetchMyPosts` + `deletePost`
- `apps/web/src/components/MarkdownEditor.tsx` — 加摘要输入 + 标签 chip，写进 create/update body
- `apps/web/src/app/editor/[slug]/page.tsx` — 把已加载文章的 `tags/summary` 传给编辑器
- `apps/web/src/app/layout.tsx` — 给 `<header>` 加 `id`；在 `SmoothScroll` 外层挂 `<FloatingNav />`

---

## Task 1: posts 客户端 lib — 我的文章列表 + 删除

**Files:**
- Modify: `apps/web/src/lib/posts.ts`

`fetchPublishedPosts`/`fetchPostBySlug` 用裸 `fetch`（SSR、无需认证）。我的文章列表与删除都需要认证 cookie，必须走 `api()`（`credentials: "include"`），且只在 client 调用。

- [ ] **Step 1: 加 `fetchMyPosts` 与 `deletePost`**

在文件末尾追加（保留顶部已有 import，新增 `api` 与 `PostStatus` import）：

```ts
import { api } from "./api";
```

并在文件末尾追加：

```ts
/** 我的文章（含草稿），按 updatedAt 倒序。需登录，走 cookie 认证，仅 client 调用。 */
export function fetchMyPosts(page = 1, pageSize = 10): Promise<Paginated<PostSummary>> {
  const qs = `?mine=1&page=${page}&pageSize=${pageSize}`;
  return api<Paginated<PostSummary>>(`/posts${qs}`);
}

/** 删除自己的文章（后端 204）。需登录。 */
export function deletePost(id: string): Promise<void> {
  return api<void>(`/posts/${id}`, { method: "DELETE" });
}
```

注意：顶部已有 `import type { Paginated, PostSummary, PostDetail } from "@blog/shared";`，无需重复。

- [ ] **Step 2: typecheck + lint**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint`
Expected: PASS（无类型/lint 错误）

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/posts.ts
git commit -m "feat(web): add fetchMyPosts and deletePost client helpers

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: 编辑器支持标签 + 摘要

**Files:**
- Modify: `apps/web/src/components/MarkdownEditor.tsx`
- Modify: `apps/web/src/app/editor/[slug]/page.tsx`

后端 `CreatePostDto`/`UpdatePostDto` 已接收 `summary`(≤150) 与 `tags`(≤5、每个≤30)。前端补控件并随 body 提交，空值不放进 body。

- [ ] **Step 1: 重写 `MarkdownEditor.tsx`**

完整替换文件内容：

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import type { MarkdownStorage } from "tiptap-markdown";
import { api, ApiClientError } from "@/lib/api";
import type { PostDetail } from "@blog/shared";

interface Props {
  postId?: string;
  initialTitle?: string;
  initialMarkdown?: string;
  initialSummary?: string;
  initialTags?: string[];
}

interface EditorWithMarkdown {
  storage: { markdown: MarkdownStorage };
}

const MAX_TAGS = 5;
const MAX_TAG_LEN = 30;
const MAX_SUMMARY = 150;

export function MarkdownEditor({
  postId,
  initialTitle = "",
  initialMarkdown = "",
  initialSummary = "",
  initialTags = [],
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [tags, setTags] = useState<string[]>(initialTags);
  const [tagInput, setTagInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    content: initialMarkdown,
    immediatelyRender: false,
  });

  function getMarkdown(): string {
    if (!editor) return "";
    return (editor as unknown as EditorWithMarkdown).storage.markdown.getMarkdown();
  }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (t.length > MAX_TAG_LEN) {
      setError(`标签最长 ${MAX_TAG_LEN} 字`);
      return;
    }
    if (tags.includes(t)) {
      setTagInput("");
      return;
    }
    if (tags.length >= MAX_TAGS) {
      setError(`最多 ${MAX_TAGS} 个标签`);
      return;
    }
    setError(null);
    setTags([...tags, t]);
    setTagInput("");
  }

  function onTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  }

  function buildBody(): { title: string; contentMd: string; tags?: string[]; summary?: string } {
    const md = getMarkdown();
    const body: { title: string; contentMd: string; tags?: string[]; summary?: string } = {
      title,
      contentMd: md,
    };
    if (tags.length > 0) body.tags = tags;
    const s = summary.trim();
    if (s) body.summary = s;
    return body;
  }

  async function save(status: "DRAFT" | "PUBLISHED") {
    if (busy) return;
    const md = getMarkdown();
    if (!title.trim()) {
      setError("请填写标题");
      return;
    }
    if (!md.trim()) {
      setError("请填写正文");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = buildBody();
      if (postId) {
        const post = await api<PostDetail>(`/posts/${postId}`, {
          method: "PATCH",
          body: JSON.stringify({ ...body, status }),
        });
        router.push(status === "PUBLISHED" ? `/posts/${post.slug}` : `/editor/${post.slug}`);
        return;
      }
      const created = await api<PostDetail>("/posts", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (status === "DRAFT") {
        router.push(`/editor/${created.slug}`);
        return;
      }
      try {
        const published = await api<PostDetail>(`/posts/${created.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        router.push(`/posts/${published.slug}`);
      } catch {
        // 草稿已建但发布失败 —— 落到它的编辑页，便于单次原子 PATCH 重试，避免变成不可见的孤儿。
        router.push(`/editor/${created.slug}`);
      }
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="标题"
        aria-label="标题"
        className="w-full text-3xl"
        style={{ fontFamily: "var(--font-display)" }}
      />

      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value.slice(0, MAX_SUMMARY))}
        placeholder="摘要（选填，显示在文章卡片上）"
        aria-label="摘要"
        rows={2}
        className="mt-4 w-full resize-none rounded border p-3 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
      />
      <div className="mt-1 text-right text-xs" style={{ color: "var(--text-3)" }}>
        {summary.length}/{MAX_SUMMARY}
      </div>

      <div
        className="mt-3 flex flex-wrap items-center gap-2 rounded border p-2"
        style={{ borderColor: "var(--border)" }}
      >
        {tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm"
            style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
          >
            {t}
            <button
              type="button"
              aria-label={`移除标签 ${t}`}
              onClick={() => setTags(tags.filter((x) => x !== t))}
              style={{ color: "var(--text-3)" }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={onTagKeyDown}
          onBlur={addTag}
          placeholder={tags.length >= MAX_TAGS ? "" : "标签，回车添加"}
          aria-label="添加标签"
          disabled={tags.length >= MAX_TAGS}
          className="flex-1 bg-transparent text-sm outline-none"
        />
      </div>

      <div className="mt-6 rounded border p-4" style={{ borderColor: "var(--border)" }}>
        <EditorContent editor={editor} />
      </div>
      {error && <p className="mt-3" style={{ color: "var(--accent)" }}>{error}</p>}
      <div className="mt-6 flex gap-3">
        <button
          onClick={() => void save("DRAFT")}
          disabled={busy}
          className="rounded-full border px-5 py-2 disabled:opacity-60"
          style={{ borderColor: "var(--border)" }}
        >
          存草稿
        </button>
        <button
          onClick={() => void save("PUBLISHED")}
          disabled={busy}
          className="rounded-full px-5 py-2 text-white disabled:opacity-60"
          style={{ background: "var(--accent)" }}
        >
          发布
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 编辑页把 `tags/summary` 传进编辑器**

修改 `apps/web/src/app/editor/[slug]/page.tsx` 最后的渲染行（约 45 行），从：

```tsx
    <MarkdownEditor postId={post.id} initialTitle={post.title} initialMarkdown={post.contentMd} />
```

改为：

```tsx
    <MarkdownEditor
      postId={post.id}
      initialTitle={post.title}
      initialMarkdown={post.contentMd}
      initialSummary={post.summary ?? ""}
      initialTags={post.tags}
    />
```

（`PostDetail` 已含 `summary: string | null` 与 `tags: string[]`。）

- [ ] **Step 3: typecheck + lint**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint`
Expected: PASS

- [ ] **Step 4: 手动验证**

启动 `pnpm dev`，登录后到 `/editor/new`：填标题/正文、加 2 个标签、写摘要 → 发布；到 `/posts/[slug]` 确认卡片/详情带摘要与标签；再进 `/editor/[slug]` 确认标签与摘要回填。
Expected: 标签与摘要正确保存并回填。

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/MarkdownEditor.tsx apps/web/src/app/editor/[slug]/page.tsx
git commit -m "feat(web): add tags and summary inputs to the editor

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 「我的文章」管理页 `/me/posts`（含行内删除）

**Files:**
- Create: `apps/web/src/app/me/posts/page.tsx`

复用 `fetchMyPosts`（Task 1）+ `deletePost`。状态标注用 Lora 斜体小字不上色（遵循 `nextjs` 设计规范）。删除走行内二次确认。分页用「加载更多」。

- [ ] **Step 1: 创建管理页**

```tsx
"use client";

import { startTransition, useEffect, useState } from "react";
import Link from "next/link";
import type { PostSummary } from "@blog/shared";
import { fetchMyPosts, deletePost } from "@/lib/posts";
import { useRequireAuth } from "@/lib/use-require-auth";

const PAGE_SIZE = 10;

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("zh-CN");
}

function DeleteControl({ onDelete }: { onDelete: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{ color: "var(--text-3)" }}
      >
        删除
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onDelete();
          } finally {
            setBusy(false);
          }
        }}
        style={{ color: "var(--accent)" }}
      >
        {busy ? "删除中…" : "确定"}
      </button>
      <button onClick={() => setConfirming(false)} style={{ color: "var(--text-3)" }}>
        取消
      </button>
    </span>
  );
}

export default function MyPostsPage() {
  const { ready } = useRequireAuth();
  const [items, setItems] = useState<PostSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    let active = true;
    setLoading(true);
    fetchMyPosts(page, PAGE_SIZE)
      .then((res) => {
        if (!active) return;
        startTransition(() => {
          setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
          setTotal(res.total);
        });
      })
      .catch(() => active && startTransition(() => setError("加载失败")))
      .finally(() => active && startTransition(() => setLoading(false)));
    return () => {
      active = false;
    };
  }, [ready, page]);

  async function onDelete(id: string) {
    await deletePost(id);
    startTransition(() => {
      setItems((prev) => prev.filter((p) => p.id !== id));
      setTotal((t) => Math.max(0, t - 1));
    });
  }

  if (!ready) return null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>
        我的文章
      </h1>
      <p className="mt-2 text-sm" style={{ color: "var(--text-3)" }}>
        共 {total} 篇
      </p>

      <hr className="my-8" style={{ borderColor: "var(--border)" }} />

      {error && <p style={{ color: "var(--accent)" }}>{error}</p>}

      {!error && items.length === 0 && !loading && (
        <p style={{ color: "var(--text-3)" }}>
          还没有文章。<Link href="/editor/new" style={{ color: "var(--accent)" }}>写一篇</Link>
        </p>
      )}

      <ul className="flex flex-col">
        {items.map((p) => (
          <li
            key={p.id}
            className="flex items-baseline justify-between gap-4 border-b py-4"
            style={{ borderColor: "var(--border)" }}
          >
            <div className="min-w-0">
              <div className="truncate text-lg" style={{ fontFamily: "var(--font-display)" }}>
                {p.title}
              </div>
              <div
                className="mt-1 text-sm"
                style={{ fontFamily: "var(--font-body)", fontStyle: "italic", color: "var(--text-3)" }}
              >
                {p.status === "PUBLISHED" ? "已发布" : "草稿"}
                {p.publishedAt ? ` · ${fmtDate(p.publishedAt)}` : ""} · {p.likeCount} 喜欢
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 text-sm">
              <Link href={`/editor/${p.slug}`} style={{ color: "var(--text-2)" }}>
                编辑
              </Link>
              {p.status === "PUBLISHED" && (
                <Link href={`/posts/${p.slug}`} style={{ color: "var(--text-2)" }}>
                  查看
                </Link>
              )}
              <DeleteControl onDelete={() => onDelete(p.id)} />
            </div>
          </li>
        ))}
      </ul>

      {items.length < total && (
        <div className="mt-8 flex justify-center">
          <button
            disabled={loading}
            onClick={() => setPage((n) => n + 1)}
            className="rounded-full border px-5 py-2 disabled:opacity-50"
            style={{ borderColor: "var(--border)" }}
          >
            {loading ? "加载中…" : "加载更多"}
          </button>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: typecheck + lint**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint`
Expected: PASS

- [ ] **Step 3: 手动验证**

登录后访问 `/me/posts`：能看到自己的已发布文章与草稿（草稿在公开首页不可见）；点「编辑」进编辑页、「查看」进详情（仅已发布有）；点「删除」→「确定」后该行消失、计数减一；草稿/已发布标注正确；篇数 > 10 时「加载更多」可用。未登录访问应跳 `/login`。
Expected: 全部符合。

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/me/posts/page.tsx
git commit -m "feat(web): add my-posts management page with inline delete

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 线条图标集

**Files:**
- Create: `apps/web/src/components/nav-icons.tsx`

统一的 1px 线条 SVG 图标，`stroke="currentColor"`、`fill="none"`，由父级 `color` 决定颜色，贴合单色/发丝线系统。供 `FloatingNav` 用。

- [ ] **Step 1: 创建图标集**

```tsx
type IconProps = { size?: number; className?: string };

function svg(path: React.ReactNode) {
  return function Icon({ size = 18, className }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className={className}
      >
        {path}
      </svg>
    );
  };
}

export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </>,
);

export const IconBell = svg(
  <>
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </>,
);

export const IconPencil = svg(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </>,
);

export const IconList = svg(
  <>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </>,
);

export const IconGear = svg(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H7a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </>,
);

export const IconExit = svg(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </>,
);

export const IconLogin = svg(
  <>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <polyline points="10 17 15 12 10 7" />
    <line x1="15" y1="12" x2="3" y2="12" />
  </>,
);

export const IconClose = svg(
  <>
    <line x1="6" y1="6" x2="18" y2="18" />
    <line x1="18" y1="6" x2="6" y2="18" />
  </>,
);

export const IconCompass = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <polygon points="16 8 11 11 8 16 13 13 16 8" />
  </>,
);
```

- [ ] **Step 2: typecheck + lint**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/nav-icons.tsx
git commit -m "feat(web): add hairline line-icon set for nav

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: 未读数 hook

**Files:**
- Create: `apps/web/src/lib/use-unread-count.ts`

轻量 hook：登录时拉一次未读数、窗口聚焦时刷新，给小球红点用。不开 SSE（顶栏 `NotificationBell` 已有一条），不重构 bell。

- [ ] **Step 1: 创建 hook**

```ts
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./auth-context";
import { fetchUnreadCount } from "./notifications";

/** 登录时返回未读通知数（挂载时 + 窗口聚焦时刷新）。未登录返回 0。 */
export function useUnreadCount(): number {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    let active = true;
    const load = () => {
      fetchUnreadCount()
        .then((r) => active && setCount(r.count))
        .catch(() => undefined);
    };
    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [user]);

  return count;
}
```

- [ ] **Step 2: typecheck + lint**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint`
Expected: PASS（`fetchUnreadCount` 已存在于 `lib/notifications.ts`，返回 `{ count }`）

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/use-unread-count.ts
git commit -m "feat(web): add useUnreadCount hook for the nav dot

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 悬浮小球导航 + 挂载

**Files:**
- Create: `apps/web/src/components/FloatingNav.tsx`
- Modify: `apps/web/src/app/layout.tsx`

挂在 `SmoothScroll` 外层（避开 ScrollSmoother 对 `#smooth-content` 的 transform 让 `position: fixed` 失效）；`IntersectionObserver` 观察顶栏 `#site-header`，顶栏滚出视口后才显形。

- [ ] **Step 1: 给顶栏加 id 并挂载组件**

修改 `apps/web/src/app/layout.tsx`：

1）顶部 import 区加：

```tsx
import { FloatingNav } from "@/components/FloatingNav";
```

2）`<header ...>` 加 `id="site-header"`：

```tsx
            <header
              id="site-header"
              className="flex justify-between px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
```

3）把 `<FloatingNav />` 放到 `</SmoothScroll>` 之后、仍在 `<AuthProvider>` 内：

```tsx
          </SmoothScroll>
          <FloatingNav />
        </AuthProvider>
```

- [ ] **Step 2: 创建 `FloatingNav.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { useAuth } from "@/lib/auth-context";
import { useUnreadCount } from "@/lib/use-unread-count";
import {
  IconSearch,
  IconBell,
  IconPencil,
  IconList,
  IconGear,
  IconExit,
  IconLogin,
  IconClose,
  IconCompass,
} from "./nav-icons";

type IconCmp = ({ size, className }: { size?: number; className?: string }) => React.ReactElement;

interface NavItem {
  key: string;
  label: string;
  Icon: IconCmp;
  href?: string;
  onClick?: () => void;
  dot?: boolean;
}

function scrollToTop() {
  const s = ScrollSmoother.get();
  if (s) s.scrollTo(0, true);
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

export function FloatingNav() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const unread = useUnreadCount();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 顶栏滚出视口后才显形。IntersectionObserver 在 ScrollSmoother transform 下仍按渲染位置判断。
  useEffect(() => {
    const header = document.getElementById("site-header");
    if (!header) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { threshold: 0 },
    );
    io.observe(header);
    return () => io.disconnect();
  }, []);

  // 点击外部 / Esc 收起
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: NavItem[] = user
    ? [
        { key: "search", label: "搜索", Icon: IconSearch, href: "/search" },
        { key: "notif", label: "通知", Icon: IconBell, onClick: scrollToTop, dot: unread > 0 },
        { key: "write", label: "写文章", Icon: IconPencil, href: "/editor/new" },
        { key: "mine", label: "我的文章", Icon: IconList, href: "/me/posts" },
        { key: "settings", label: "设置", Icon: IconGear, href: "/settings" },
        {
          key: "logout",
          label: "退出登录",
          Icon: IconExit,
          onClick: () => {
            void logout().then(() => router.push("/"));
          },
        },
      ]
    : [
        { key: "search", label: "搜索", Icon: IconSearch, href: "/search" },
        { key: "login", label: "登录", Icon: IconLogin, href: "/login" },
      ];

  if (!visible) return null;

  function renderItem(item: NavItem) {
    const inner = (
      <span
        className="relative flex h-11 w-11 items-center justify-center rounded-full border shadow-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
      >
        <item.Icon size={18} />
        {item.dot && (
          <span
            className="absolute right-2 top-2 h-2 w-2 rounded-full"
            style={{ background: "var(--accent)" }}
            aria-hidden="true"
          />
        )}
      </span>
    );
    const label = (
      <span
        className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 whitespace-nowrap rounded border px-2 py-1 text-xs opacity-0 transition-opacity group-hover:opacity-100"
        style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }}
      >
        {item.label}
      </span>
    );
    const common = "group relative block";
    if (item.href) {
      return (
        <Link
          key={item.key}
          href={item.href}
          aria-label={item.label}
          onClick={() => setOpen(false)}
          className={common}
        >
          {label}
          {inner}
        </Link>
      );
    }
    return (
      <button
        key={item.key}
        type="button"
        aria-label={item.label}
        onClick={() => {
          item.onClick?.();
          setOpen(false);
        }}
        className={common}
      >
        {label}
        {inner}
      </button>
    );
  }

  return (
    <div ref={ref} className="fixed bottom-6 right-6 z-50 flex flex-col items-center gap-3">
      {open && <div className="flex flex-col items-center gap-3">{items.map(renderItem)}</div>}
      <button
        type="button"
        aria-label="导航"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center rounded-full border shadow-md"
        style={{ height: 52, width: 52, borderColor: "var(--border)", background: "var(--surface)", color: "var(--text)" }}
      >
        {open ? <IconClose size={20} /> : <IconCompass size={22} />}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: typecheck + lint**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint`
Expected: PASS

- [ ] **Step 4: 手动验证**

`pnpm dev`，在首页向下滚动直到 Masthead/顶栏滚出 → 右下角出现小球；点开向上弹出图标列；悬停出文字标签；点「写文章/我的文章/设置/搜索」正确跳转、菜单收起；登录态有「退出登录」，点后登出回首页；未登录态只有「搜索/登录」；有未读通知时「通知」项带红点、点击滚回顶部；回到顶部后小球消失；点空白处 / 按 Esc 收起。在文章详情页（内页、原生滚动）向下滚也应出现小球。验证 `prefers-reduced-motion` 下无异常。
Expected: 全部符合。

- [ ] **Step 5: 全量 verify**

Run: `pnpm verify`
Expected: lint + typecheck + test 全绿（web 无 test，跑 lint+typecheck；后端 test 不受影响）

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/FloatingNav.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): add scroll-persistent floating nav orb

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review 结论

- **Spec 覆盖**：编辑器 tags/summary → Task 2；删除 → Task 1(lib)+Task 3(行内确认 UI)+Task 2 编辑器未加删除（见下方说明）；`/me/posts` → Task 3；悬浮小球（挂载位置/IntersectionObserver/竖向堆叠/悬停标签/外部点击+Esc/auth 两态/通知红点+回顶/退出登录/线条图标）→ Task 4+5+6。
  - **说明**：spec 第 2 节提到删除入口「放在管理页每一行 + 编辑页」。本计划在管理页实现了行内删除（Task 3）；**编辑页删除按钮未单列任务**——管理页已是删除的主入口，编辑页删除按 YAGNI 暂缓。若执行时仍需要，在 Task 2 的 `MarkdownEditor`（仅 `postId` 存在即编辑态）底部加一个复用同款行内确认的删除按钮，调用 `deletePost(postId)` 后 `router.push("/me/posts")`。
- **Placeholder 扫描**：无 TBD/TODO；每个改码步骤均有完整代码。
- **类型一致性**：`fetchMyPosts`/`deletePost`（Task 1）签名与 Task 3 调用一致；`MarkdownEditor` 新 props（Task 2）与编辑页传参一致；`nav-icons`（Task 4）导出名与 `FloatingNav`（Task 6）import 一致；`useUnreadCount`（Task 5）返回 `number` 与 Task 6 用法一致；`fetchUnreadCount` 返回 `{ count }` 已核对 `lib/notifications.ts`。
```
