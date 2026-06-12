# M4a 评论核心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给文章加上两级楼中楼评论（顶层 + 回复，回复可引用并 @提及）、评论点赞、编辑、软删除墓碑，Markdown 子集渲染 + 全量 XSS 过滤。

**Architecture:** 后端新增 NestJS `comments` 模块（service + likes service + controller + DTO），完全复用既有 `LikesService` 的事务化去归一化计数模式与统一错误结构。纯函数 `renderCommentMarkdown` 放 `packages/shared`（白名单构造、转义一切），前端 `CommentSection` 客户端组件挂在文章页消费 API。限流复用已接好的 `@nestjs/throttler`。

**Tech Stack:** NestJS + Prisma(PostgreSQL) + class-validator + @nestjs/throttler；Next.js(App Router) + React 客户端组件；`packages/shared`（node:test）。

**设计依据：** `docs/superpowers/specs/2026-06-12-m4a-comments-core-design.md`

**与 spec 的两处务实偏差（均为对齐既有约定，DRY）：**
1. spec 列了 `COMMENT_TOO_LONG`；本计划改用 DTO `MaxLength(2000)` → `VALIDATION_ERROR`（与 `CreatePostDto` 一致），故 errors 只新增 `COMMENT_NOT_FOUND`。
2. spec 写 `COMMENT_FORBIDDEN`/per-user 限流；本计划复用既有 `FORBIDDEN` 错误码 + `@nestjs/throttler`（per-IP 10/min），不引入平行实现。

---

## 文件结构

**`packages/shared/`**
- `src/errors.ts` (改) — 新增 `COMMENT_NOT_FOUND`
- `src/comment.ts` (新) — `CommentStatus` / `CommentQuote` / `CommentView` / `CommentListResult` / `CommentRepliesResult`
- `src/comment.test.ts` (新) — 错误码 + 类型形状
- `src/comment-render.ts` (新) — `renderCommentMarkdown(md): string`
- `src/comment-render.test.ts` (新) — XSS + 子集
- `src/index.ts` (改) — 导出上面两个新文件

**`apps/api/`**
- `prisma/schema.prisma` (改) — `Comment` / `CommentStatus` / `CommentLike` / `Post.commentCount` / `User` 反向关系
- `src/comments/comment.mapper.ts` (新) — `toCommentView`
- `src/comments/comments.service.ts` (新) — create / list / listReplies / update / remove
- `src/comments/comment-likes.service.ts` (新) — toggle
- `src/comments/comments.controller.ts` (新)
- `src/comments/comments.module.ts` (新)
- `src/comments/dto/create-comment.dto.ts` / `update-comment.dto.ts` / `list-comments.query.ts` (新)
- `src/comments/comments.service.spec.ts` / `comment-likes.service.spec.ts` (新)
- `src/app.module.ts` (改) — import `CommentsModule`
- `test/setup.ts` (改) — `resetDb` 清理 commentLike + comment
- `test/comments.e2e-spec.ts` (新)

**`apps/web/`**
- `src/lib/comments.ts` (新) — API 客户端
- `src/components/CommentBody.tsx` / `CommentComposer.tsx` / `CommentThread.tsx` / `CommentSection.tsx` (新)
- `src/app/posts/[slug]/page.tsx` (改) — 挂载 `<CommentSection>`

---

## Task 1: Shared — 错误码与评论类型

**Files:**
- Modify: `packages/shared/src/errors.ts`
- Create: `packages/shared/src/comment.ts`
- Create: `packages/shared/src/comment.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: 写失败测试**

`packages/shared/src/comment.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode } from './errors.ts';
import type { CommentView, CommentListResult } from './comment.ts';

test('comment error codes exist', () => {
  assert.equal(ErrorCode.COMMENT_NOT_FOUND, 'COMMENT_NOT_FOUND');
});

test('CommentView shape compiles', () => {
  const v: CommentView = {
    id: 'c1',
    author: { id: 'u1', nickname: 'n', avatarUrl: null },
    contentMd: 'hi',
    status: 'VISIBLE',
    likeCount: 0,
    viewerLiked: false,
    editedAt: null,
    createdAt: 'x',
    quoted: null,
    replyCount: 0,
    replies: [],
  };
  const list: CommentListResult = { items: [v], nextCursor: null, commentCount: 1 };
  assert.equal(list.items[0].status, 'VISIBLE');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @blog/shared test`
Expected: FAIL —「Cannot find module './comment.ts'」+ `ErrorCode.COMMENT_NOT_FOUND` 类型错误。

- [ ] **Step 3: 加错误码**

`packages/shared/src/errors.ts` 在 `POST_NOT_FOUND: 'POST_NOT_FOUND',` 之后加一行：
```ts
  COMMENT_NOT_FOUND: 'COMMENT_NOT_FOUND',
```

- [ ] **Step 4: 写类型文件**

`packages/shared/src/comment.ts`:
```ts
import type { PostAuthor } from './post.ts';

export type CommentStatus = 'VISIBLE' | 'DELETED';

export interface CommentQuote {
  id: string;
  authorNickname: string;
  snippet: string; // 纯文本、截断
}

export interface CommentView {
  id: string;
  author: PostAuthor;
  contentMd: string;       // status==='DELETED' 时为 ''
  status: CommentStatus;
  likeCount: number;
  viewerLiked: boolean;
  editedAt: string | null; // ISO
  createdAt: string;       // ISO
  quoted: CommentQuote | null;
  replyCount: number;      // 回复条目恒为 0
  replies: CommentView[];  // 顶层带前 3 条；回复为 []
}

export interface CommentListResult {
  items: CommentView[];
  nextCursor: string | null;
  commentCount: number;    // Post.commentCount（所有可见评论）
}

export interface CommentRepliesResult {
  items: CommentView[];
  nextCursor: string | null;
}
```

- [ ] **Step 5: 导出**

`packages/shared/src/index.ts` 末尾在 `export * from './post.ts';` 后加：
```ts
export * from './comment.ts';
export * from './comment-render.ts';
```
（`comment-render.ts` 在 Task 2 创建；先写好导出，本任务结束前 Task 2 也会完成，但若单独跑本任务的 typecheck 会缺文件——所以本步与 Task 2 视为连续完成。若分开执行，本步只加 `comment.ts` 一行，Task 2 再加 `comment-render.ts`。）

- [ ] **Step 6: 运行确认通过**

Run: `pnpm --filter @blog/shared test`
Expected: PASS（若已含 comment-render 导出但文件未建会报错——先只导出 comment.ts，跑通后进 Task 2）。

- [ ] **Step 7: 提交**

```bash
git add packages/shared/src/errors.ts packages/shared/src/comment.ts packages/shared/src/comment.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): comment types and COMMENT_NOT_FOUND error code"
```

---

## Task 2: Shared — `renderCommentMarkdown` 与 XSS 测试

**Files:**
- Create: `packages/shared/src/comment-render.ts`
- Create: `packages/shared/src/comment-render.test.ts`
- Modify: `packages/shared/src/index.ts`（若 Task 1 未加 comment-render 导出，本任务补）

- [ ] **Step 1: 写失败测试**

`packages/shared/src/comment-render.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCommentMarkdown } from './comment-render.ts';

test('escapes script tags', () => {
  const out = renderCommentMarkdown('<script>alert(1)</script>');
  assert.ok(!out.includes('<script'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('escapes img onerror', () => {
  const out = renderCommentMarkdown('<img src=x onerror=alert(1)>');
  assert.ok(!out.includes('<img'));
  assert.ok(!out.toLowerCase().includes('onerror='));
});

test('javascript: link is NOT turned into an anchor', () => {
  const out = renderCommentMarkdown('[x](javascript:alert(1))');
  assert.ok(!out.includes('<a '));
  assert.ok(out.includes('[x]'));
});

test('http link becomes safe anchor', () => {
  const out = renderCommentMarkdown('[home](https://e.com/a)');
  assert.equal(
    out,
    '<a href="https://e.com/a" target="_blank" rel="noopener noreferrer nofollow">home</a>',
  );
});

test('bold and inline code render', () => {
  assert.equal(renderCommentMarkdown('**b**'), '<strong>b</strong>');
  assert.equal(renderCommentMarkdown('`<b>`'), '<code>&lt;b&gt;</code>');
});

test('newlines become <br>', () => {
  assert.equal(renderCommentMarkdown('a\nb'), 'a<br>b');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @blog/shared test`
Expected: FAIL —「Cannot find module './comment-render.ts'」。

- [ ] **Step 3: 实现**

`packages/shared/src/comment-render.ts`:
```ts
const ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPE[c]);
}

/**
 * 评论 Markdown 子集渲染：粗体 / 行内代码 / http(s) 链接 / 换行。
 * 先转义全部 HTML，再对白名单子集做结构化替换——用户原始 HTML 永不进入 DOM。
 * 顺序：先行内代码（保护反引号内文本不被后续规则改写），再粗体、链接、换行。
 */
export function renderCommentMarkdown(md: string): string {
  let s = escapeHtml(md);
  s = s.replace(/`([^`\n]+)`/g, (_m, c: string) => `<code>${c}</code>`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, (_m, c: string) => `<strong>${c}</strong>`);
  s = s.replace(
    /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, text: string, url: string) =>
      `<a href="${url}" target="_blank" rel="noopener noreferrer nofollow">${text}</a>`,
  );
  s = s.replace(/\n/g, '<br>');
  return s;
}
```

- [ ] **Step 4: 确保 index 导出 comment-render**

确认 `packages/shared/src/index.ts` 含 `export * from './comment-render.ts';`（Task 1 Step 5 若未加则此处补）。

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @blog/shared test`
Expected: PASS（全部用例）。

- [ ] **Step 6: 重新构建 shared 供 web/api 消费**

Run: `pnpm --filter @blog/shared build`
Expected: 生成 `dist/`，无报错。

- [ ] **Step 7: 提交**

```bash
git add packages/shared/src/comment-render.ts packages/shared/src/comment-render.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): renderCommentMarkdown with XSS-safe whitelist rendering"
```

---

## Task 3: Prisma schema + migration + resetDb

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/test/setup.ts`

- [ ] **Step 1: 改 schema**

`apps/api/prisma/schema.prisma`：

`User` 模型内，在 `likes Like[]` 后加：
```prisma
  comments     Comment[]
  commentLikes CommentLike[]
```

`Post` 模型内，在 `likeCount Int @default(0)` 后加：
```prisma
  commentCount Int @default(0)
```
并在 `likes Like[]` 后加：
```prisma
  comments  Comment[]
```

文件末尾追加：
```prisma
model Comment {
  id        String        @id @default(cuid())
  postId    String
  post      Post          @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId  String
  author    User          @relation(fields: [authorId], references: [id])
  parentId  String?
  parent    Comment?      @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[]     @relation("CommentReplies")
  quotedId  String?
  quoted    Comment?      @relation("CommentQuotes", fields: [quotedId], references: [id], onDelete: SetNull)
  quotedBy  Comment[]     @relation("CommentQuotes")
  contentMd String
  status    CommentStatus @default(VISIBLE)
  likeCount Int           @default(0)
  editedAt  DateTime?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
  likes     CommentLike[]

  @@index([postId, parentId, createdAt])
}

enum CommentStatus {
  VISIBLE
  DELETED
}

model CommentLike {
  userId    String
  commentId String
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
  comment   Comment  @relation(fields: [commentId], references: [id], onDelete: Cascade)

  @@id([userId, commentId])
}
```

- [ ] **Step 2: 生成并应用 migration**

Run: `pnpm --filter @blog/api exec prisma migrate dev --name m4a_comments`
Expected: 新建 migration 目录，`prisma generate` 重新生成 client，无报错。

- [ ] **Step 3: 更新 resetDb 清理顺序**

`apps/api/test/setup.ts` 的 `resetDb`，把 `await prisma.like.deleteMany();` 之前插入两行（先删依赖方）：
```ts
  await prisma.commentLike.deleteMany();
  await prisma.comment.deleteMany();
```
结果顺序为：commentLike → comment → like → post → user → redis.flushdb。

- [ ] **Step 4: 验证 client 可编译**

Run: `pnpm --filter @blog/api typecheck`
Expected: PASS（`prisma.comment` / `prisma.commentLike` 已存在）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/test/setup.ts
git commit -m "feat(api): comment & commentLike schema, migration, resetDb cleanup"
```

---

## Task 4: CommentsService.create（两级强制）+ mapper

**Files:**
- Create: `apps/api/src/comments/comment.mapper.ts`
- Create: `apps/api/src/comments/comments.service.ts`
- Create: `apps/api/src/comments/comments.service.spec.ts`

- [ ] **Step 1: 写失败测试**

`apps/api/src/comments/comments.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { CommentsService } from './comments.service';
import { PrismaService } from '../prisma/prisma.service';

const tx = {
  post: { findUnique: jest.fn(), update: jest.fn() },
  comment: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
};
const prismaMock = { $transaction: jest.fn() };

function authorRow(over: Record<string, unknown> = {}) {
  return {
    id: 'c-new',
    postId: 'p1',
    authorId: 'u1',
    parentId: null,
    quotedId: null,
    contentMd: 'hi',
    status: 'VISIBLE',
    likeCount: 0,
    editedAt: null,
    createdAt: new Date('2026-06-12T00:00:00Z'),
    author: { id: 'u1', nickname: 'N', avatarUrl: null },
    quoted: null,
    ...over,
  };
}

describe('CommentsService.create', () => {
  let service: CommentsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(tx));
    const ref = await Test.createTestingModule({
      providers: [CommentsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = ref.get(CommentsService);
  });

  it('creates top-level comment and increments commentCount', async () => {
    tx.post.findUnique.mockResolvedValue({ id: 'p1' });
    tx.comment.create.mockResolvedValue(authorRow());
    tx.post.update.mockResolvedValue({});
    const v = await service.create('u1', 'p1', { contentMd: 'hi' });
    expect(v.id).toBe('c-new');
    expect(v.replyCount).toBe(0);
    expect(tx.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ postId: 'p1', authorId: 'u1', parentId: null, quotedId: null }),
      }),
    );
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { commentCount: { increment: 1 } },
    });
  });

  it('replying to a reply re-parents to the top comment and quotes the target', async () => {
    tx.post.findUnique.mockResolvedValue({ id: 'p1' });
    // target is itself a reply (parentId = top)
    tx.comment.findUnique
      .mockResolvedValueOnce({ id: 'r1', postId: 'p1', parentId: 'top1', status: 'VISIBLE' }) // parent lookup
      .mockResolvedValueOnce({ id: 'r1', postId: 'p1', status: 'VISIBLE' }); // quoted validation
    tx.comment.create.mockResolvedValue(authorRow({ parentId: 'top1', quotedId: 'r1' }));
    tx.post.update.mockResolvedValue({});
    await service.create('u1', 'p1', { contentMd: 'hi', parentId: 'r1' });
    expect(tx.comment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: 'top1', quotedId: 'r1' }),
      }),
    );
  });

  it('rejects when post does not exist', async () => {
    tx.post.findUnique.mockResolvedValue(null);
    await expect(service.create('u1', 'pX', { contentMd: 'hi' })).rejects.toMatchObject({ code: 'POST_NOT_FOUND' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @blog/api test -- comments.service`
Expected: FAIL —「Cannot find module './comments.service'」。

- [ ] **Step 3: 写 mapper**

`apps/api/src/comments/comment.mapper.ts`:
```ts
import type { Comment, User, Prisma } from '@prisma/client';
import type { CommentView, CommentQuote, CommentStatus } from '@blog/shared';

const SNIPPET_MAX = 80;

type Author = Pick<User, 'id' | 'nickname' | 'avatarUrl'>;

export type CommentRow = Comment & {
  author: Author;
  quoted: (Comment & { author: Author }) | null;
};

export const COMMENT_INCLUDE = {
  author: { select: { id: true, nickname: true, avatarUrl: true } },
  quoted: { include: { author: { select: { id: true, nickname: true, avatarUrl: true } } } },
} satisfies Prisma.CommentInclude;

function toQuote(q: CommentRow['quoted']): CommentQuote | null {
  if (!q) return null;
  const text = q.status === 'DELETED' ? '[已删除]' : q.contentMd;
  const snippet = text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX)}…` : text;
  return { id: q.id, authorNickname: q.author.nickname, snippet };
}

export function toCommentView(
  row: CommentRow,
  viewerLiked: boolean,
  replyCount: number,
  replies: CommentView[],
): CommentView {
  const deleted = row.status === 'DELETED';
  return {
    id: row.id,
    author: { id: row.author.id, nickname: row.author.nickname, avatarUrl: row.author.avatarUrl },
    contentMd: deleted ? '' : row.contentMd,
    status: row.status as CommentStatus,
    likeCount: row.likeCount,
    viewerLiked,
    editedAt: row.editedAt ? row.editedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    quoted: toQuote(row.quoted),
    replyCount,
    replies,
  };
}
```

- [ ] **Step 4: 写 service（先只 create + 私有 helper 占位）**

`apps/api/src/comments/comments.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type { CommentView } from '@blog/shared';
import { COMMENT_INCLUDE, toCommentView, type CommentRow } from './comment.mapper';

interface CreateInput {
  contentMd: string;
  parentId?: string;
  quotedId?: string;
}

@Injectable()
export class CommentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, postId: string, input: CreateInput): Promise<CommentView> {
    return this.prisma.$transaction(async (tx): Promise<CommentView> => {
      const post = await tx.post.findUnique({ where: { id: postId }, select: { id: true } });
      if (!post) throw new AppError(ErrorCode.POST_NOT_FOUND, 404, 'Post not found');

      let parentId: string | null = null;
      let quotedId: string | null = input.quotedId ?? null;

      if (input.parentId) {
        const parent = await tx.comment.findUnique({
          where: { id: input.parentId },
          select: { id: true, postId: true, parentId: true, status: true },
        });
        if (!parent || parent.postId !== postId || parent.status === 'DELETED') {
          throw new AppError(ErrorCode.COMMENT_NOT_FOUND, 404, 'Parent comment not found');
        }
        if (parent.parentId === null) {
          parentId = parent.id; // 回复顶层
        } else {
          parentId = parent.parentId; // 回复一条回复 → 挂到顶层，引用该回复
          quotedId = quotedId ?? parent.id;
        }
      }

      if (quotedId) {
        const quoted = await tx.comment.findUnique({
          where: { id: quotedId },
          select: { id: true, postId: true, status: true },
        });
        if (!quoted || quoted.postId !== postId || quoted.status === 'DELETED') {
          throw new AppError(ErrorCode.COMMENT_NOT_FOUND, 404, 'Quoted comment not found');
        }
      }

      const created = (await tx.comment.create({
        data: { postId, authorId: userId, parentId, quotedId, contentMd: input.contentMd },
        include: COMMENT_INCLUDE,
      })) as CommentRow;

      await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });

      return toCommentView(created, false, 0, []);
    });
  }
}
```

- [ ] **Step 5: 运行确认通过**

Run: `pnpm --filter @blog/api test -- comments.service`
Expected: PASS（3 个 create 用例）。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/comments/comment.mapper.ts apps/api/src/comments/comments.service.ts apps/api/src/comments/comments.service.spec.ts
git commit -m "feat(api): CommentsService.create with two-level enforcement"
```

---

## Task 5: CommentsService.list + listReplies

**Files:**
- Modify: `apps/api/src/comments/comments.service.ts`

（list/listReplies 的完整路径由 Task 9 e2e 用真实库覆盖；此处实现并靠 typecheck + e2e 验证。）

- [ ] **Step 1: 在 service 内加私有 likedSet helper 与 list/listReplies**

`apps/api/src/comments/comments.service.ts`：在 import 增补类型：
```ts
import type { CommentListResult, CommentRepliesResult } from '@blog/shared';
```
在 `create(...)` 方法之后、类结束 `}` 之前，加入：
```ts
  private async likedSet(viewerId: string | undefined, ids: string[]): Promise<Set<string>> {
    if (!viewerId || ids.length === 0) return new Set();
    const rows = await this.prisma.commentLike.findMany({
      where: { userId: viewerId, commentId: { in: ids } },
      select: { commentId: true },
    });
    return new Set(rows.map((r) => r.commentId));
  }

  async list(
    postId: string,
    viewerId: string | undefined,
    cursor?: string,
    take = 20,
  ): Promise<CommentListResult> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { commentCount: true },
    });
    if (!post) throw new AppError(ErrorCode.POST_NOT_FOUND, 404, 'Post not found');

    const rows = (await this.prisma.comment.findMany({
      where: { postId, parentId: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: COMMENT_INCLUDE,
    })) as CommentRow[];

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const topIds = page.map((r) => r.id);

    const replyRows = topIds.length
      ? ((await this.prisma.comment.findMany({
          where: { parentId: { in: topIds } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: COMMENT_INCLUDE,
        })) as CommentRow[])
      : [];

    const repliesByParent = new Map<string, CommentRow[]>();
    for (const r of replyRows) {
      const list = repliesByParent.get(r.parentId as string) ?? [];
      list.push(r);
      repliesByParent.set(r.parentId as string, list);
    }

    const allIds = [...topIds, ...replyRows.map((r) => r.id)];
    const liked = await this.likedSet(viewerId, allIds);

    const items = page.map((top) => {
      const all = repliesByParent.get(top.id) ?? [];
      const first3 = all.slice(0, 3).map((r) => toCommentView(r, liked.has(r.id), 0, []));
      return toCommentView(top, liked.has(top.id), all.length, first3);
    });

    return {
      items,
      nextCursor: hasMore ? page[page.length - 1].id : null,
      commentCount: post.commentCount,
    };
  }

  async listReplies(
    commentId: string,
    viewerId: string | undefined,
    cursor?: string,
    take = 20,
  ): Promise<CommentRepliesResult> {
    const top = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, parentId: true },
    });
    if (!top || top.parentId !== null) {
      throw new AppError(ErrorCode.COMMENT_NOT_FOUND, 404, 'Comment not found');
    }

    const rows = (await this.prisma.comment.findMany({
      where: { parentId: commentId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: COMMENT_INCLUDE,
    })) as CommentRow[];

    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    const liked = await this.likedSet(viewerId, page.map((r) => r.id));
    const items = page.map((r) => toCommentView(r, liked.has(r.id), 0, []));

    return { items, nextCursor: hasMore ? page[page.length - 1].id : null };
  }
```

- [ ] **Step 2: 验证编译**

Run: `pnpm --filter @blog/api typecheck`
Expected: PASS。

- [ ] **Step 3: 运行既有单测确保未破坏**

Run: `pnpm --filter @blog/api test -- comments.service`
Expected: PASS（Task 4 的 3 个用例仍绿）。

- [ ] **Step 4: 提交**

```bash
git add apps/api/src/comments/comments.service.ts
git commit -m "feat(api): CommentsService.list and listReplies with cursor pagination"
```

---

## Task 6: CommentsService.update + remove（编辑 + 软删除墓碑）

**Files:**
- Modify: `apps/api/src/comments/comments.service.ts`
- Modify: `apps/api/src/comments/comments.service.spec.ts`

- [ ] **Step 1: 加失败测试**

`apps/api/src/comments/comments.service.spec.ts` 末尾追加（在最外层 describe 之外或新增 describe）：
```ts
describe('CommentsService.update & remove', () => {
  let service: CommentsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(tx));
    const ref = await Test.createTestingModule({
      providers: [CommentsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = ref.get(CommentsService);
  });

  it('edit by author sets editedAt', async () => {
    (prismaMock as any).comment = {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', authorId: 'u1', status: 'VISIBLE' }),
      update: jest.fn().mockResolvedValue(authorRow({ id: 'c1', contentMd: 'new', editedAt: new Date() })),
    };
    const v = await service.update('u1', 'c1', { contentMd: 'new' });
    expect(v.editedAt).not.toBeNull();
  });

  it('edit by non-author is forbidden', async () => {
    (prismaMock as any).comment = {
      findUnique: jest.fn().mockResolvedValue({ id: 'c1', authorId: 'u1', status: 'VISIBLE' }),
      update: jest.fn(),
    };
    await expect(service.update('uX', 'c1', { contentMd: 'x' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('delete by post author tombstones and decrements count', async () => {
    tx.comment.findUnique.mockResolvedValue({
      id: 'c1', authorId: 'u-other', status: 'VISIBLE', postId: 'p1', post: { authorId: 'u-post' },
    });
    tx.comment.update.mockResolvedValue({});
    tx.post.update.mockResolvedValue({});
    await service.remove('u-post', 'c1');
    expect(tx.comment.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'DELETED', contentMd: '' },
    });
    expect(tx.post.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { commentCount: { decrement: 1 } },
    });
  });

  it('delete by unrelated user is forbidden', async () => {
    tx.comment.findUnique.mockResolvedValue({
      id: 'c1', authorId: 'u-other', status: 'VISIBLE', postId: 'p1', post: { authorId: 'u-post' },
    });
    await expect(service.remove('u-rando', 'c1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('delete already-deleted is idempotent (no double decrement)', async () => {
    tx.comment.findUnique.mockResolvedValue({
      id: 'c1', authorId: 'u1', status: 'DELETED', postId: 'p1', post: { authorId: 'u-post' },
    });
    await service.remove('u1', 'c1');
    expect(tx.comment.update).not.toHaveBeenCalled();
    expect(tx.post.update).not.toHaveBeenCalled();
  });
});
```
（注：`update` 用顶层 `this.prisma.comment`，故测试给 `prismaMock.comment` 赋 mock；`remove` 用事务 `tx.comment`。）

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @blog/api test -- comments.service`
Expected: FAIL —「service.update is not a function」。

- [ ] **Step 3: 实现 update + remove**

`apps/api/src/comments/comments.service.ts`，权限错误统一复用已 import 的 `AppError` + `ErrorCode.FORBIDDEN`，无需新增 import。在类内 `listReplies` 之后加：
```ts
  async update(userId: string, commentId: string, input: { contentMd: string }): Promise<CommentView> {
    const existing = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true, status: true },
    });
    if (!existing || existing.status === 'DELETED') {
      throw new AppError(ErrorCode.COMMENT_NOT_FOUND, 404, 'Comment not found');
    }
    if (existing.authorId !== userId) {
      throw new AppError(ErrorCode.FORBIDDEN, 403, 'Not your comment');
    }
    const updated = (await this.prisma.comment.update({
      where: { id: commentId },
      data: { contentMd: input.contentMd, editedAt: new Date() },
      include: COMMENT_INCLUDE,
    })) as CommentRow;
    return toCommentView(updated, false, 0, []);
  }

  async remove(userId: string, commentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.comment.findUnique({
        where: { id: commentId },
        select: { id: true, authorId: true, status: true, postId: true, post: { select: { authorId: true } } },
      });
      if (!c) throw new AppError(ErrorCode.COMMENT_NOT_FOUND, 404, 'Comment not found');
      if (c.status === 'DELETED') return; // 幂等：已是墓碑，不二次减计数
      if (c.authorId !== userId && c.post.authorId !== userId) {
        throw new AppError(ErrorCode.FORBIDDEN, 403, 'Not allowed to delete this comment');
      }
      await tx.comment.update({ where: { id: commentId }, data: { status: 'DELETED', contentMd: '' } });
      await tx.post.update({ where: { id: c.postId }, data: { commentCount: { decrement: 1 } } });
    });
  }
```
- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @blog/api test -- comments.service`
Expected: PASS（create + update/remove 全部用例）。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/comments/comments.service.ts apps/api/src/comments/comments.service.spec.ts
git commit -m "feat(api): comment edit and soft-delete tombstone with permission matrix"
```

---

## Task 7: CommentLikesService.toggle

**Files:**
- Create: `apps/api/src/comments/comment-likes.service.ts`
- Create: `apps/api/src/comments/comment-likes.service.spec.ts`

- [ ] **Step 1: 写失败测试**

`apps/api/src/comments/comment-likes.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { CommentLikesService } from './comment-likes.service';
import { PrismaService } from '../prisma/prisma.service';

const tx = {
  comment: { findUnique: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
  commentLike: { createMany: jest.fn(), deleteMany: jest.fn() },
};
const prismaMock = { $transaction: jest.fn() };

describe('CommentLikesService.toggle', () => {
  let service: CommentLikesService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(tx));
    const ref = await Test.createTestingModule({
      providers: [CommentLikesService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = ref.get(CommentLikesService);
  });

  it('likes when not yet liked', async () => {
    tx.comment.findUnique.mockResolvedValue({ id: 'c1', status: 'VISIBLE' });
    tx.commentLike.createMany.mockResolvedValue({ count: 1 });
    tx.comment.update.mockResolvedValue({ likeCount: 1 });
    const r = await service.toggle('u1', 'c1');
    expect(r).toEqual({ liked: true, likeCount: 1 });
  });

  it('unlikes when already liked', async () => {
    tx.comment.findUnique.mockResolvedValue({ id: 'c1', status: 'VISIBLE' });
    tx.commentLike.createMany.mockResolvedValue({ count: 0 });
    tx.commentLike.deleteMany.mockResolvedValue({ count: 1 });
    tx.comment.update.mockResolvedValue({ likeCount: 0 });
    const r = await service.toggle('u1', 'c1');
    expect(r).toEqual({ liked: false, likeCount: 0 });
  });

  it('rejects liking a missing or deleted comment', async () => {
    tx.comment.findUnique.mockResolvedValue(null);
    await expect(service.toggle('u1', 'cX')).rejects.toMatchObject({ code: 'COMMENT_NOT_FOUND' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `pnpm --filter @blog/api test -- comment-likes.service`
Expected: FAIL —「Cannot find module './comment-likes.service'」。

- [ ] **Step 3: 实现（镜像 LikesService）**

`apps/api/src/comments/comment-likes.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type { LikeResult } from '@blog/shared';

@Injectable()
export class CommentLikesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 幂等点赞切换；事务内以 createMany/deleteMany 的 count 驱动计数增减，不漂移。 */
  async toggle(userId: string, commentId: string): Promise<LikeResult> {
    return this.prisma.$transaction(async (tx): Promise<LikeResult> => {
      const exists = await tx.comment.findUnique({
        where: { id: commentId },
        select: { id: true, status: true },
      });
      if (!exists || exists.status === 'DELETED') {
        throw new AppError(ErrorCode.COMMENT_NOT_FOUND, 404, 'Comment not found');
      }
      const inserted = await tx.commentLike.createMany({
        data: [{ userId, commentId }],
        skipDuplicates: true,
      });
      if (inserted.count === 1) {
        const c = await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true },
        });
        return { liked: true, likeCount: c.likeCount };
      }
      const removed = await tx.commentLike.deleteMany({ where: { userId, commentId } });
      if (removed.count === 0) {
        const c = await tx.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: { likeCount: true },
        });
        return { liked: false, likeCount: c.likeCount };
      }
      const c = await tx.comment.update({
        where: { id: commentId },
        data: { likeCount: { decrement: 1 } },
        select: { likeCount: true },
      });
      return { liked: false, likeCount: c.likeCount };
    });
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `pnpm --filter @blog/api test -- comment-likes.service`
Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/comments/comment-likes.service.ts apps/api/src/comments/comment-likes.service.spec.ts
git commit -m "feat(api): CommentLikesService idempotent toggle"
```

---

## Task 8: DTO + Controller + Module + 接线

**Files:**
- Create: `apps/api/src/comments/dto/create-comment.dto.ts`
- Create: `apps/api/src/comments/dto/update-comment.dto.ts`
- Create: `apps/api/src/comments/dto/list-comments.query.ts`
- Create: `apps/api/src/comments/comments.controller.ts`
- Create: `apps/api/src/comments/comments.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: DTOs**

`apps/api/src/comments/dto/create-comment.dto.ts`:
```ts
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  contentMd!: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  @IsString()
  quotedId?: string;
}
```

`apps/api/src/comments/dto/update-comment.dto.ts`:
```ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  contentMd!: string;
}
```

`apps/api/src/comments/dto/list-comments.query.ts`:
```ts
import { IsOptional, IsString } from 'class-validator';

export class ListCommentsQuery {
  @IsOptional()
  @IsString()
  cursor?: string;
}
```

- [ ] **Step 2: Controller**

`apps/api/src/comments/comments.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CommentsService } from './comments.service';
import { CommentLikesService } from './comment-likes.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ListCommentsQuery } from './dto/list-comments.query';

type Viewer = { userId: string } | undefined;

@Controller()
export class CommentsController {
  constructor(
    private readonly comments: CommentsService,
    private readonly commentLikes: CommentLikesService,
  ) {}

  @Post('posts/:postId/comments')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  create(
    @CurrentUser() user: { userId: string },
    @Param('postId') postId: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(user.userId, postId, dto);
  }

  @Get('posts/:postId/comments')
  @UseGuards(OptionalJwtGuard)
  list(
    @CurrentUser() user: Viewer,
    @Param('postId') postId: string,
    @Query() q: ListCommentsQuery,
  ) {
    return this.comments.list(postId, user?.userId, q.cursor);
  }

  @Get('comments/:id/replies')
  @UseGuards(OptionalJwtGuard)
  replies(@CurrentUser() user: Viewer, @Param('id') id: string, @Query() q: ListCommentsQuery) {
    return this.comments.listReplies(id, user?.userId, q.cursor);
  }

  @Patch('comments/:id')
  @UseGuards(JwtAuthGuard)
  update(
    @CurrentUser() user: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(user.userId, id, dto);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async remove(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    await this.comments.remove(user.userId, id);
  }

  @Post('comments/:id/like')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  like(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.commentLikes.toggle(user.userId, id);
  }
}
```

- [ ] **Step 3: Module**

`apps/api/src/comments/comments.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommentsService } from './comments.service';
import { CommentLikesService } from './comment-likes.service';
import { CommentsController } from './comments.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CommentsController],
  providers: [CommentsService, CommentLikesService],
})
export class CommentsModule {}
```

- [ ] **Step 4: 接入 app.module**

`apps/api/src/app.module.ts`：import 后加 `import { CommentsModule } from './comments/comments.module';`，并在 `imports` 数组 `BlogModule,` 后加一行 `CommentsModule,`。

- [ ] **Step 5: 验证编译**

Run: `pnpm --filter @blog/api typecheck`
Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/comments/dto apps/api/src/comments/comments.controller.ts apps/api/src/comments/comments.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): comments controller, DTOs, module wiring, throttle on create"
```

---

## Task 9: e2e —— 全路径

**Files:**
- Create: `apps/api/test/comments.e2e-spec.ts`

- [ ] **Step 1: 写 e2e**

`apps/api/test/comments.e2e-spec.ts`:
```ts
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';

describe('Comments (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  const author = { email: 'author@test.com', password: 'password123', nickname: 'Author' };
  const reader = { email: 'reader@test.com', password: 'password123', nickname: 'Reader' };

  async function newAgent(creds: typeof author) {
    const agent = request.agent(app.getHttpServer());
    await agent.post('/auth/register').send(creds).expect(201);
    return agent;
  }

  async function publishedPost(agent: request.SuperAgentTest) {
    const created = await agent
      .post('/posts')
      .send({ title: 'Topic', contentMd: '# Hi', tags: ['t'] })
      .expect(201);
    await agent.patch(`/posts/${created.body.id}`).send({ status: 'PUBLISHED' }).expect(200);
    return created.body.id as string;
  }

  it('create top-level, reply, and reply-to-reply re-parents + quotes', async () => {
    const a = await newAgent(author);
    const r = await newAgent(reader);
    const postId = await publishedPost(a);

    const top = await r.post(`/posts/${postId}/comments`).send({ contentMd: 'top' }).expect(201);
    const reply = await a
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'reply', parentId: top.body.id })
      .expect(201);
    // reply to the reply → must attach to top, quote the reply
    const deep = await r
      .post(`/posts/${postId}/comments`)
      .send({ contentMd: 'deep', parentId: reply.body.id })
      .expect(201);
    expect(deep.body.quoted.id).toBe(reply.body.id);

    const list = await request.agent(app.getHttpServer())
      .get(`/posts/${postId}/comments`).expect(200);
    expect(list.body.commentCount).toBe(3);
    expect(list.body.items).toHaveLength(1); // one top-level
    expect(list.body.items[0].replyCount).toBe(2);
    expect(list.body.items[0].replies).toHaveLength(2);
  });

  it('requires auth to create', async () => {
    const a = await newAgent(author);
    const postId = await publishedPost(a);
    await request.agent(app.getHttpServer())
      .post(`/posts/${postId}/comments`).send({ contentMd: 'x' }).expect(401);
  });

  it('rejects empty and over-long content', async () => {
    const a = await newAgent(author);
    const postId = await publishedPost(a);
    await a.post(`/posts/${postId}/comments`).send({ contentMd: '' }).expect(400);
    await a.post(`/posts/${postId}/comments`).send({ contentMd: 'x'.repeat(2001) }).expect(400);
  });

  it('like toggles count idempotently', async () => {
    const a = await newAgent(author);
    const r = await newAgent(reader);
    const postId = await publishedPost(a);
    const c = await r.post(`/posts/${postId}/comments`).send({ contentMd: 'c' }).expect(201);

    const liked = await a.post(`/comments/${c.body.id}/like`).expect(200);
    expect(liked.body).toEqual({ liked: true, likeCount: 1 });
    const unliked = await a.post(`/comments/${c.body.id}/like`).expect(200);
    expect(unliked.body).toEqual({ liked: false, likeCount: 0 });
  });

  it('edit by author sets edited; non-author forbidden', async () => {
    const a = await newAgent(author);
    const r = await newAgent(reader);
    const postId = await publishedPost(a);
    const c = await r.post(`/posts/${postId}/comments`).send({ contentMd: 'orig' }).expect(201);

    const edited = await r.patch(`/comments/${c.body.id}`).send({ contentMd: 'new' }).expect(200);
    expect(edited.body.editedAt).not.toBeNull();
    expect(edited.body.contentMd).toBe('new');
    await a.patch(`/comments/${c.body.id}`).send({ contentMd: 'hack' }).expect(403);
  });

  it('post author can delete any comment → tombstone, count drops', async () => {
    const a = await newAgent(author);
    const r = await newAgent(reader);
    const postId = await publishedPost(a);
    const c = await r.post(`/posts/${postId}/comments`).send({ contentMd: 'c' }).expect(201);

    await a.delete(`/comments/${c.body.id}`).expect(204);
    const list = await request.agent(app.getHttpServer())
      .get(`/posts/${postId}/comments`).expect(200);
    expect(list.body.commentCount).toBe(0);
    expect(list.body.items[0].status).toBe('DELETED');
    expect(list.body.items[0].contentMd).toBe('');
  });

  it('unrelated reader cannot delete', async () => {
    const a = await newAgent(author);
    const r = await newAgent(reader);
    const stranger = await newAgent({ email: 's@test.com', password: 'password123', nickname: 'S' });
    const postId = await publishedPost(a);
    const c = await r.post(`/posts/${postId}/comments`).send({ contentMd: 'c' }).expect(201);
    await stranger.delete(`/comments/${c.body.id}`).expect(403);
  });

  it('throttles rapid comment creation (429)', async () => {
    const a = await newAgent(author);
    const postId = await publishedPost(a);
    let got429 = false;
    for (let i = 0; i < 12; i++) {
      const res = await a.post(`/posts/${postId}/comments`).send({ contentMd: `c${i}` });
      if (res.status === 429) { got429 = true; break; }
    }
    expect(got429).toBe(true);
  });
});
```

- [ ] **Step 2: 运行 e2e**

Run: `pnpm --filter @blog/api test:e2e -- comments`
Expected: PASS（全部用例）。若节流用例因全局 ThrottlerGuard 与其它测试共享计数偶发失败，确认 `resetDb` 已 `redis.flushdb()`（Throttler 默认用内存存储则不受 redis 影响——此时该用例独立 agent 单测内 12 次足以触发 10/min 上限）。

- [ ] **Step 3: 提交**

```bash
git add apps/api/test/comments.e2e-spec.ts
git commit -m "test(api): comments e2e — threading, likes, edit, delete, throttle"
```

---

## Task 10: Web API 客户端

**Files:**
- Create: `apps/web/src/lib/comments.ts`

- [ ] **Step 1: 实现**

`apps/web/src/lib/comments.ts`:
```ts
import { api } from "./api";
import type {
  CommentListResult,
  CommentRepliesResult,
  CommentView,
  LikeResult,
} from "@blog/shared";

export function listComments(postId: string, cursor?: string): Promise<CommentListResult> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<CommentListResult>(`/posts/${postId}/comments${qs}`);
}

export function listReplies(commentId: string, cursor?: string): Promise<CommentRepliesResult> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<CommentRepliesResult>(`/comments/${commentId}/replies${qs}`);
}

export function createComment(
  postId: string,
  body: { contentMd: string; parentId?: string; quotedId?: string },
): Promise<CommentView> {
  return api<CommentView>(`/posts/${postId}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function editComment(id: string, contentMd: string): Promise<CommentView> {
  return api<CommentView>(`/comments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ contentMd }),
  });
}

export function deleteComment(id: string): Promise<void> {
  return api<void>(`/comments/${id}`, { method: "DELETE" });
}

export function likeComment(id: string): Promise<LikeResult> {
  return api<LikeResult>(`/comments/${id}/like`, { method: "POST" });
}
```

- [ ] **Step 2: 验证编译**

Run: `pnpm --filter @blog/web typecheck`
Expected: PASS。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/lib/comments.ts
git commit -m "feat(web): comments API client"
```

---

## Task 11: Web 组件 + 挂载

> ⚠️ 写前端前先读 `apps/web/AGENTS.md`：本仓库 Next.js 16 有破坏性变更，需要时查 `node_modules/next/dist/docs/`。`apps/web` 无测试 runner，本任务以 typecheck + lint + 手动浏览器验证收口。

**Files:**
- Create: `apps/web/src/components/CommentBody.tsx`
- Create: `apps/web/src/components/CommentComposer.tsx`
- Create: `apps/web/src/components/CommentThread.tsx`
- Create: `apps/web/src/components/CommentSection.tsx`
- Modify: `apps/web/src/app/posts/[slug]/page.tsx`

- [ ] **Step 1: CommentBody（渲染 Markdown 子集）**

`apps/web/src/components/CommentBody.tsx`:
```tsx
"use client";

import { renderCommentMarkdown } from "@blog/shared";

export function CommentBody({ markdown }: { markdown: string }) {
  return (
    <div
      className="leading-relaxed"
      style={{ fontFamily: "var(--font-body)", color: "var(--text-1)" }}
      dangerouslySetInnerHTML={{ __html: renderCommentMarkdown(markdown) }}
    />
  );
}
```

- [ ] **Step 2: CommentComposer（受控输入框）**

`apps/web/src/components/CommentComposer.tsx`:
```tsx
"use client";

import { useState } from "react";

export function CommentComposer({
  placeholder,
  initial = "",
  submitLabel,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  initial?: string;
  submitLabel: string;
  onSubmit: (text: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full rounded-md border p-3 text-sm"
        style={{ borderColor: "var(--border)", background: "var(--surface)", fontFamily: "var(--font-body)" }}
      />
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={submit}
          disabled={busy || !text.trim()}
          className="rounded-full border px-4 py-1.5 text-sm disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--text-2)" }}
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button onClick={onCancel} className="text-sm" style={{ color: "var(--text-3)" }}>
            取消
          </button>
        )}
        <span className="text-xs italic" style={{ color: "var(--text-3)" }}>
          支持 **粗体** · `代码` · [链接](https://…)
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: CommentThread（一条顶层 + 回复 + 操作）**

`apps/web/src/components/CommentThread.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CommentView } from "@blog/shared";
import { ApiClientError } from "@/lib/api";
import {
  createComment,
  deleteComment,
  editComment,
  likeComment,
  listReplies,
} from "@/lib/comments";
import { CommentBody } from "./CommentBody";
import { CommentComposer } from "./CommentComposer";

function relTime(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

function CommentRow({
  c,
  postId,
  currentUserId,
  postAuthorId,
  onReplyCreated,
  onRemoved,
}: {
  c: CommentView;
  postId: string;
  currentUserId: string | null;
  postAuthorId: string;
  onReplyCreated?: (reply: CommentView) => void;
  onRemoved: (id: string) => void;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(c.viewerLiked);
  const [count, setCount] = useState(c.likeCount);
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [content, setContent] = useState(c.contentMd);
  const [status, setStatus] = useState(c.status);

  const canEdit = currentUserId === c.author.id && status === "VISIBLE";
  const canDelete =
    status === "VISIBLE" && (currentUserId === c.author.id || currentUserId === postAuthorId);

  function authGuard(e: unknown): boolean {
    if (e instanceof ApiClientError && (e.code === "TOKEN_INVALID" || e.code === "TOKEN_EXPIRED")) {
      router.push("/login");
      return true;
    }
    return false;
  }

  async function toggleLike() {
    if (!currentUserId) return router.push("/login");
    const pl = liked;
    const pc = count;
    setLiked(!pl);
    setCount(pc + (pl ? -1 : 1));
    try {
      const r = await likeComment(c.id);
      setLiked(r.liked);
      setCount(r.likeCount);
    } catch (e) {
      setLiked(pl);
      setCount(pc);
      if (!authGuard(e)) throw e;
    }
  }

  if (status === "DELETED") {
    return <p className="py-2 text-sm italic" style={{ color: "var(--text-3)" }}>[已删除]</p>;
  }

  return (
    <div className="py-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{c.author.nickname}</span>
        <span className="text-xs italic" style={{ color: "var(--text-3)" }}>
          {relTime(c.createdAt)}{c.editedAt ? " · 已编辑" : ""}
        </span>
      </div>

      {c.quoted && (
        <div className="mt-1 border-l-2 pl-2 text-xs italic" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
          {c.quoted.authorNickname}：{c.quoted.snippet}
        </div>
      )}

      {editing ? (
        <CommentComposer
          placeholder="编辑评论…"
          initial={content}
          submitLabel="保存"
          onCancel={() => setEditing(false)}
          onSubmit={async (text) => {
            try {
              const u = await editComment(c.id, text);
              setContent(u.contentMd);
              setEditing(false);
            } catch (e) {
              if (!authGuard(e)) throw e;
            }
          }}
        />
      ) : (
        <div className="mt-1"><CommentBody markdown={content} /></div>
      )}

      <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: "var(--text-2)" }}>
        <button onClick={toggleLike}>{liked ? "♥" : "♡"} {count}</button>
        {onReplyCreated && (
          <button onClick={() => (currentUserId ? setReplying((v) => !v) : router.push("/login"))}>回复</button>
        )}
        {canEdit && <button onClick={() => setEditing((v) => !v)}>编辑</button>}
        {canDelete && (
          <button
            onClick={async () => {
              try {
                await deleteComment(c.id);
                setStatus("DELETED");
                onRemoved(c.id);
              } catch (e) {
                if (!authGuard(e)) throw e;
              }
            }}
          >
            删除
          </button>
        )}
      </div>

      {replying && onReplyCreated && (
        <CommentComposer
          placeholder={`回复 ${c.author.nickname}…`}
          submitLabel="发表回复"
          onCancel={() => setReplying(false)}
          onSubmit={async (text) => {
            try {
              const reply = await createComment(postId, { contentMd: text, parentId: c.id });
              onReplyCreated(reply);
              setReplying(false);
            } catch (e) {
              if (!authGuard(e)) throw e;
            }
          }}
        />
      )}
    </div>
  );
}

export function CommentThread({
  top,
  postId,
  currentUserId,
  postAuthorId,
}: {
  top: CommentView;
  postId: string;
  currentUserId: string | null;
  postAuthorId: string;
}) {
  const [replies, setReplies] = useState<CommentView[]>(top.replies);
  const [loadedAll, setLoadedAll] = useState(top.replies.length >= top.replyCount);

  async function loadMore() {
    let cursor: string | null = replies.length ? replies[replies.length - 1].id : undefined ?? null;
    const acc: CommentView[] = [];
    // 简单起见：一次性翻完剩余回复页
    do {
      const res = await listReplies(top.id, cursor ?? undefined);
      acc.push(...res.items);
      cursor = res.nextCursor;
    } while (cursor);
    setReplies((prev) => {
      const seen = new Set(prev.map((r) => r.id));
      return [...prev, ...acc.filter((r) => !seen.has(r.id))];
    });
    setLoadedAll(true);
  }

  return (
    <div className="border-b py-2" style={{ borderColor: "var(--border)" }}>
      <CommentRow
        c={top}
        postId={postId}
        currentUserId={currentUserId}
        postAuthorId={postAuthorId}
        onReplyCreated={(reply) => setReplies((prev) => [...prev, reply])}
        onRemoved={() => undefined}
      />
      {replies.length > 0 && (
        <div className="ml-6 border-l pl-4" style={{ borderColor: "var(--border)" }}>
          {replies.map((r) => (
            <CommentRow
              key={r.id}
              c={r}
              postId={postId}
              currentUserId={currentUserId}
              postAuthorId={postAuthorId}
              onRemoved={() => undefined}
            />
          ))}
        </div>
      )}
      {!loadedAll && (
        <button onClick={loadMore} className="ml-6 mt-1 text-xs" style={{ color: "var(--text-2)" }}>
          查看全部 {top.replyCount} 条回复
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: CommentSection（容器：列表 + 顶层 composer + 翻页）**

`apps/web/src/components/CommentSection.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { CommentView } from "@blog/shared";
import { useAuth } from "@/lib/auth-context";
import { ApiClientError } from "@/lib/api";
import { createComment, listComments } from "@/lib/comments";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";

export function CommentSection({ postId, postAuthorId }: { postId: string; postAuthorId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<CommentView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    listComments(postId)
      .then((res) => {
        if (!active) return;
        setItems(res.items);
        setCursor(res.nextCursor);
        setTotal(res.commentCount);
        setLoading(false);
      })
      .catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [postId]);

  async function loadMore() {
    if (!cursor) return;
    const res = await listComments(postId, cursor);
    setItems((prev) => [...prev, ...res.items]);
    setCursor(res.nextCursor);
  }

  async function addTop(text: string) {
    try {
      const c = await createComment(postId, { contentMd: text });
      setItems((prev) => [c, ...prev]);
      setTotal((n) => n + 1);
    } catch (e) {
      if (e instanceof ApiClientError && (e.code === "TOKEN_INVALID" || e.code === "TOKEN_EXPIRED")) {
        router.push("/login");
        return;
      }
      throw e;
    }
  }

  return (
    <section className="mt-12">
      <h2 className="text-2xl" style={{ fontFamily: "var(--font-display)" }}>评论 {total > 0 ? `· ${total}` : ""}</h2>
      <hr className="my-4" style={{ borderColor: "var(--border)" }} />

      {user ? (
        <CommentComposer placeholder="写下你的评论…" submitLabel="发表评论" onSubmit={addTop} />
      ) : (
        <p className="text-sm italic" style={{ color: "var(--text-2)" }}>
          <button className="underline" onClick={() => router.push("/login")}>登录</button> 后参与评论。
        </p>
      )}

      <div className="mt-6">
        {loading ? (
          <p className="text-sm italic" style={{ color: "var(--text-3)" }}>加载中…</p>
        ) : items.length === 0 ? (
          <p className="text-sm italic" style={{ color: "var(--text-3)" }}>还没有评论，来做第一个。</p>
        ) : (
          items.map((top) => (
            <CommentThread
              key={top.id}
              top={top}
              postId={postId}
              currentUserId={user?.id ?? null}
              postAuthorId={postAuthorId}
            />
          ))
        )}
      </div>

      {cursor && (
        <button onClick={loadMore} className="mt-4 text-sm" style={{ color: "var(--text-2)" }}>
          加载更多评论
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 5: 挂载到文章页**

`apps/web/src/app/posts/[slug]/page.tsx`：顶部 import 加 `import { CommentSection } from "@/components/CommentSection";`，在 `<LikeButton .../>` 之后、`</main>` 之前加：
```tsx
      <CommentSection postId={post.id} postAuthorId={post.author.id} />
```

- [ ] **Step 6: typecheck + lint**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint`
Expected: PASS。若 lint 报 `loadMore` 中 `undefined ?? null` 冗余，改为 `replies.length ? replies[replies.length - 1].id : null`。

- [ ] **Step 7: 手动验证（dev）**

Run: `pnpm dev`，浏览器打开一篇已发布文章页：
- 未登录：评论区显示「登录后参与评论」。
- 登录后：发表顶层评论 → 立即出现在最前、计数 +1。
- 回复评论、回复回复（应带引用块）。
- 点赞/取消、编辑（显示「已编辑」）、删除（变「[已删除]」、计数下降）。
- 文章作者可删他人评论。
- 输入 `<script>alert(1)</script>` 与 `[x](javascript:alert(1))` 提交后只显示纯文本，无脚本执行。

- [ ] **Step 8: 提交**

```bash
git add apps/web/src/components/CommentBody.tsx apps/web/src/components/CommentComposer.tsx apps/web/src/components/CommentThread.tsx apps/web/src/components/CommentSection.tsx "apps/web/src/app/posts/[slug]/page.tsx"
git commit -m "feat(web): comment section UI — threads, replies, likes, edit, delete"
```

---

## Task 12: 全量校验

- [ ] **Step 1: 重建 shared（确保 web/api 用到最新 dist）**

Run: `pnpm --filter @blog/shared build`
Expected: 无报错。

- [ ] **Step 2: 跑 verify 门禁**

Run: `pnpm verify`
Expected: lint + typecheck + test 全绿（含 shared comment 测试、api 单测、不含 e2e——e2e 用 `test:e2e` 单独跑过）。

- [ ] **Step 3: 跑 e2e**

Run: `pnpm --filter @blog/api test:e2e -- comments`
Expected: PASS。

- [ ] **Step 4: 最终提交（若有零散改动）**

```bash
git add -A
git commit -m "chore(m4a): finalize comments core" || echo "nothing to commit"
```

---

## Self-Review 记录

**Spec 覆盖：**
- 楼中楼两级 + 引用 → Task 4（create 改写 parentId/quotedId）、Task 9（e2e 验证）。
- Markdown 子集 + XSS → Task 2（renderCommentMarkdown + 测试）、Task 11（CommentBody）。
- 评论点赞幂等不漂移 → Task 7 + e2e。
- 编辑（已编辑标注）/ 软删除墓碑 / 权限矩阵（评论作者 + 文章作者）→ Task 6 + e2e。
- commentCount 只计可见、不漂移 → Task 4/6 事务内增减 + Task 9 断言。
- 登录门控 + 参数校验 + 限流 + 统一错误 → Task 8（guards/DTO/@Throttle）+ Task 9（401/400/403/429）。
- 前端 UI（composer/线程/回复/操作，Naturalist 视觉）→ Task 11。
- 测试三件套 → Task 2/4/6/7（单测）+ Task 9（e2e）。

**与 spec 的偏差**已在文首列明（COMMENT_TOO_LONG→VALIDATION_ERROR；COMMENT_FORBIDDEN→复用 FORBIDDEN；per-user 限流→throttler per-IP）。

**类型一致性：** `CommentView`/`CommentListResult`/`CommentRepliesResult`/`LikeResult` 在 shared 定义，service、mapper、controller、web client 全程引用同名；`toCommentView(row, viewerLiked, replyCount, replies)` 四参签名在 create/list/listReplies/update 调用一致。

**无占位符：** 每个 code step 均含完整代码与确切命令/预期。
