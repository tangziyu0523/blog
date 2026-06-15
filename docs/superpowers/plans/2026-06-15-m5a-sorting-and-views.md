# M5a 排序与浏览量 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给博客加浏览量统计（客户端触发、Redis IP+UA 去重、fail-open）和「最新/最热」排序（HN 式重力衰减、Postgres 实时计算），并在首页加排序切换。

**Architecture:** 后端沿用反范式计数列模式新增 `Post.viewCount`；浏览计数走新端点 `POST /posts/:id/view`，由详情页客户端组件触发，服务端用 Redis `SET NX EX` 去重；「最热」在 `PostsService.list` 内用 `$queryRaw` 实时算分排序（与 search retriever 同套路）。前端列表抽成客户端组件原地切换，不重跑 hero 动画。后端测试为 mock Prisma/Redis 单测；前端无测试运行器，门禁为 typecheck + lint + build。

**Tech Stack:** NestJS + Prisma + PostgreSQL + ioredis（后端）；Next.js 16 App Router + React 19 + Tailwind（前端）；`@blog/shared` 共享类型。

**分支：** 实现前先从最新 `main` 切出 `feat/m5a-sorting-and-views`。

**Spec：** `docs/superpowers/specs/2026-06-15-m5a-sorting-and-views-design.md`

---

## File Structure

新建：
- `apps/api/src/blog/viewer-key.ts` — 纯函数：从 userId/ip/ua 推导去重键
- `apps/api/src/blog/viewer-key.spec.ts` — 上面的单测
- `apps/api/src/blog/view-count.service.ts` — 浏览去重 + 计数服务（+ TTL 常量）
- `apps/api/src/blog/view-count.service.spec.ts` — 服务单测（mock redis + prisma）
- `apps/api/src/blog/hotness.ts` — 热度公式常量 + ORDER BY SQL 片段构造
- `apps/web/src/components/ViewPing.tsx` — 详情页客户端组件，挂载时 fire-and-forget 计一次浏览
- `apps/web/src/components/PostList.tsx` — 首页文章列表客户端组件（含最新/最热切换）

修改：
- `packages/shared/src/post.ts` — `PostSummary` 加 `viewCount`
- `packages/shared/src/post.test.ts` — 字面量补 `viewCount`
- `apps/api/prisma/schema.prisma` — `Post` 加 `viewCount Int @default(0)`（+ migration）
- `apps/api/src/blog/post.mapper.ts` — `toSummary` 映射 `viewCount`
- `apps/api/src/blog/posts.service.ts` — `list` 加 `sort` 分支（hot 走 `$queryRaw`）
- `apps/api/src/blog/posts.service.spec.ts` — 补 hot/latest 分支测试 + mock 补 `viewCount`/`$queryRaw`
- `apps/api/src/blog/dto/list-posts.query.ts` — 加 `sort`
- `apps/api/src/blog/posts.controller.ts` — `list` 透传 `sort`；新增 `POST :id/view`
- `apps/api/src/blog/blog.module.ts` — 注册 `ViewCountService`
- `apps/api/src/main.ts` — 开启 `trust proxy`
- `apps/web/src/lib/posts.ts` — 加 `fetchPosts(sort, page, pageSize)`
- `apps/web/src/app/posts/[slug]/page.tsx` — 渲染 `<ViewPing>` + 显示 viewCount
- `apps/web/src/components/PostCard.tsx` / `HeadlinePost.tsx` — 显示 viewCount
- `apps/web/src/app/page.tsx` — 列表区替换为 `<PostList>`

---

## Task 0: 切分支

- [ ] **Step 1: 从最新 main 建分支**

```bash
git checkout main && git pull --ff-only 2>/dev/null; git checkout -b feat/m5a-sorting-and-views
git branch --show-current
```
Expected: `feat/m5a-sorting-and-views`

---

## Task 1: 数据层 — viewCount 列 + 共享类型 + mapper

**Files:**
- Modify: `packages/shared/src/post.ts`
- Modify: `packages/shared/src/post.test.ts`
- Modify: `apps/api/prisma/schema.prisma:45-46`
- Create: migration（由 prisma 生成）
- Modify: `apps/api/src/blog/post.mapper.ts:8-24`
- Modify: `apps/api/src/blog/posts.service.spec.ts`（mock 字面量补 viewCount）

- [ ] **Step 1: 共享类型加 viewCount**

`packages/shared/src/post.ts` 的 `PostSummary` 在 `likeCount` 下加一行：

```ts
export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  tags: string[];
  status: PostStatus;
  likeCount: number;
  viewCount: number;
  publishedAt: string | null; // ISO string over the wire
  author: PostAuthor;
  highlight?: string; // server-built snippet (only <b> tags); present on search results
}
```

- [ ] **Step 2: 更新共享类型测试**

`packages/shared/src/post.test.ts` 里构造 `PostDetail` 的字面量补 `viewCount: 0`（紧挨 `likeCount: 0`）。例如该测试当前含 `status: 'DRAFT', likeCount: 0, publishedAt: null,` —— 改成 `status: 'DRAFT', likeCount: 0, viewCount: 0, publishedAt: null,`。

- [ ] **Step 3: 运行共享测试确认通过**

Run: `pnpm --filter @blog/shared test`
Expected: PASS（类型/断言通过）

- [ ] **Step 4: schema 加列**

`apps/api/prisma/schema.prisma` 的 `Post` 模型，在 `likeCount Int @default(0)` 下加：

```prisma
  likeCount    Int        @default(0)
  viewCount    Int        @default(0)
  commentCount Int        @default(0)
```

- [ ] **Step 5: 确认数据库在跑并生成 migration**

确保本地 Postgres 已起（仓库用 docker compose）。若未起：`docker compose up -d db`。然后：

Run: `pnpm --filter @blog/api exec prisma migrate dev --name m5a_add_view_count`
Expected: 生成 `apps/api/prisma/migrations/<ts>_m5a_add_view_count/migration.sql`（含 `ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0`），Prisma Client 重新生成。
若数据库连不上：报告 BLOCKED，不要伪造 migration。

- [ ] **Step 6: mapper 映射 viewCount**

`apps/api/src/blog/post.mapper.ts` 的 `toSummary` 在 `likeCount: p.likeCount,` 下加 `viewCount: p.viewCount,`：

```ts
export function toSummary(p: PostWithAuthor): PostSummary {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: p.summary,
    tags: p.tags,
    status: p.status,
    likeCount: p.likeCount,
    viewCount: p.viewCount,
    publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
    author: {
      id: p.author.id,
      nickname: p.author.nickname,
      avatarUrl: p.author.avatarUrl,
    },
  };
}
```

- [ ] **Step 7: 修复 posts.service.spec mock 字面量**

`apps/api/src/blog/posts.service.spec.ts` 中每个 `prismaMock.post.create`/`update`/`findUnique`/`findMany` 用 `mockResolvedValue` 返回的 post 字面量，补 `viewCount: 0`（放在 `likeCount` 旁）。这样 `toSummary` 映射后类型与值齐全。逐个 `mockResolvedValue({ ... likeCount: 0, ... })` 加上 `viewCount: 0`。

- [ ] **Step 8: 跑后端单测 + typecheck**

Run: `pnpm --filter @blog/api test && pnpm --filter @blog/api typecheck`
Expected: PASS（全部既有测试仍绿）

- [ ] **Step 9: Commit**

```bash
git add packages/shared apps/api/prisma apps/api/src/blog/post.mapper.ts apps/api/src/blog/posts.service.spec.ts
git commit -m "feat(api): add Post.viewCount column and shared type

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: viewerKey 纯函数（TDD）

**Files:**
- Create: `apps/api/src/blog/viewer-key.ts`
- Create: `apps/api/src/blog/viewer-key.spec.ts`

去重身份：登录用 `userId`；匿名用 `sha256(ip + '|' + ua)`，再带前缀区分两类，避免某个 userId 恰好等于某个哈希。

- [ ] **Step 1: 写失败测试**

`apps/api/src/blog/viewer-key.spec.ts`：

```ts
import { viewerKeyFor } from './viewer-key';

describe('viewerKeyFor', () => {
  it('uses the userId when authenticated', () => {
    expect(viewerKeyFor('user-123', '1.2.3.4', 'UA')).toBe('u:user-123');
  });

  it('hashes ip+ua for anonymous viewers', () => {
    const k = viewerKeyFor(undefined, '1.2.3.4', 'Mozilla/5.0');
    expect(k.startsWith('a:')).toBe(true);
    expect(k).not.toContain('1.2.3.4');
  });

  it('is stable for the same anonymous input', () => {
    const a = viewerKeyFor(undefined, '1.2.3.4', 'UA');
    const b = viewerKeyFor(undefined, '1.2.3.4', 'UA');
    expect(a).toBe(b);
  });

  it('differs when ip or ua differ', () => {
    const a = viewerKeyFor(undefined, '1.2.3.4', 'UA');
    const b = viewerKeyFor(undefined, '9.9.9.9', 'UA');
    const c = viewerKeyFor(undefined, '1.2.3.4', 'OTHER');
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it('treats missing ip/ua as empty but stays anonymous', () => {
    const k = viewerKeyFor(undefined, undefined, undefined);
    expect(k.startsWith('a:')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @blog/api test viewer-key`
Expected: FAIL（`viewerKeyFor` 未定义 / 模块不存在）

- [ ] **Step 3: 实现**

`apps/api/src/blog/viewer-key.ts`：

```ts
import { createHash } from 'node:crypto';

/**
 * Stable per-viewer dedup key. Logged-in viewers key on their userId;
 * anonymous viewers key on a salted hash of ip+ua. Prefixes (`u:` / `a:`)
 * keep the two namespaces from ever colliding.
 */
export function viewerKeyFor(
  userId: string | undefined,
  ip: string | undefined,
  ua: string | undefined,
): string {
  if (userId) return `u:${userId}`;
  const hash = createHash('sha256')
    .update(`${ip ?? ''}|${ua ?? ''}`)
    .digest('hex');
  return `a:${hash}`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @blog/api test viewer-key`
Expected: PASS（5 个用例全过）

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/blog/viewer-key.ts apps/api/src/blog/viewer-key.spec.ts
git commit -m "feat(api): add viewerKeyFor dedup-key helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: ViewCountService（TDD）

**Files:**
- Create: `apps/api/src/blog/view-count.service.ts`
- Create: `apps/api/src/blog/view-count.service.spec.ts`
- Modify: `apps/api/src/blog/blog.module.ts`

- [ ] **Step 1: 写失败测试**

`apps/api/src/blog/view-count.service.spec.ts`：

```ts
import { Test } from '@nestjs/testing';
import { ViewCountService } from './view-count.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

const redisMock = { set: jest.fn() };
const prismaMock = { post: { updateMany: jest.fn() } };

describe('ViewCountService', () => {
  let service: ViewCountService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ViewCountService,
        { provide: RedisService, useValue: redisMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();
    service = moduleRef.get(ViewCountService);
  });

  it('counts a new viewer (NX wins) and increments a published post', async () => {
    redisMock.set.mockResolvedValue('OK');
    prismaMock.post.updateMany.mockResolvedValue({ count: 1 });

    await service.record('post-1', 'a:hash');

    expect(redisMock.set).toHaveBeenCalledWith(
      'view:post-1:a:hash',
      '1',
      'EX',
      43200,
      'NX',
    );
    expect(prismaMock.post.updateMany).toHaveBeenCalledWith({
      where: { id: 'post-1', status: 'PUBLISHED' },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('does not increment when the viewer is within the dedup window', async () => {
    redisMock.set.mockResolvedValue(null); // NX lost

    await service.record('post-1', 'a:hash');

    expect(prismaMock.post.updateMany).not.toHaveBeenCalled();
  });

  it('is a no-op for drafts / missing posts (updateMany count 0, no throw)', async () => {
    redisMock.set.mockResolvedValue('OK');
    prismaMock.post.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.record('draft-1', 'a:hash')).resolves.toBeUndefined();
  });

  it('fails open when redis throws (no increment, no throw)', async () => {
    redisMock.set.mockRejectedValue(new Error('redis down'));

    await expect(service.record('post-1', 'a:hash')).resolves.toBeUndefined();
    expect(prismaMock.post.updateMany).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @blog/api test view-count`
Expected: FAIL（`ViewCountService` 不存在）

- [ ] **Step 3: 实现服务**

`apps/api/src/blog/view-count.service.ts`：

```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export const VIEW_DEDUP_TTL_SECONDS = 43200; // 12h

@Injectable()
export class ViewCountService {
  private readonly logger = new Logger(ViewCountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Record one view for a post, deduped per viewer within a 12h window.
   * View counting is best-effort: if Redis is unavailable we skip counting
   * rather than fail the request (fail-open). Drafts / missing posts are a
   * no-op because updateMany matches zero rows.
   */
  async record(postId: string, viewerKey: string): Promise<void> {
    let isNew = false;
    try {
      const res = await this.redis.set(
        `view:${postId}:${viewerKey}`,
        '1',
        'EX',
        VIEW_DEDUP_TTL_SECONDS,
        'NX',
      );
      isNew = res === 'OK';
    } catch (err) {
      this.logger.warn(`view dedup skipped: ${String(err)}`);
      return; // fail-open
    }
    if (!isNew) return;
    await this.prisma.post.updateMany({
      where: { id: postId, status: 'PUBLISHED' },
      data: { viewCount: { increment: 1 } },
    });
  }
}
```

- [ ] **Step 4: 注册到 BlogModule**

`apps/api/src/blog/blog.module.ts` 的 `providers` 加入 `ViewCountService`（RedisService 由 `@Global` RedisModule 提供，无需 import）：

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PostsService } from './posts.service';
import { LikesService } from './likes.service';
import { ViewCountService } from './view-count.service';
import { PostsController } from './posts.controller';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [PostsController],
  providers: [PostsService, LikesService, ViewCountService],
})
export class BlogModule {}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @blog/api test view-count && pnpm --filter @blog/api typecheck`
Expected: PASS（4 个用例全过）

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/blog/view-count.service.ts apps/api/src/blog/view-count.service.spec.ts apps/api/src/blog/blog.module.ts
git commit -m "feat(api): add ViewCountService with redis dedup and fail-open

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: 热度公式 + PostsService.list sort 分支（TDD）

**Files:**
- Create: `apps/api/src/blog/hotness.ts`
- Modify: `apps/api/src/blog/posts.service.ts:65-94`
- Modify: `apps/api/src/blog/posts.service.spec.ts`

- [ ] **Step 1: 写热度常量 + SQL 构造**

`apps/api/src/blog/hotness.ts`：

```ts
import { Prisma } from '@prisma/client';

// 热度权重与重力（集中定义；改这里即改公式）。
export const W_LIKE = 10;
export const W_COMMENT = 4;
export const W_VIEW = 1;
export const GRAVITY = 1.5;

/**
 * HN 式重力衰减打分的 ORDER BY 表达式（DESC 由调用方加）。
 * score = (10*likeCount + 4*commentCount + 1*viewCount)
 *         / power(ageDays + 2, 1.5)
 * 权重以参数注入，绝不拼接用户输入。
 */
export function hotScoreSql(): Prisma.Sql {
  return Prisma.sql`(
    ${W_LIKE} * "likeCount" + ${W_COMMENT} * "commentCount" + ${W_VIEW} * "viewCount"
  ) / power(EXTRACT(EPOCH FROM (now() - "publishedAt")) / 86400 + 2, ${GRAVITY})`;
}
```

- [ ] **Step 2: 写失败测试**

在 `apps/api/src/blog/posts.service.spec.ts` 增加一个 `describe('PostsService.list sort')`。先确保该文件顶部 `prismaMock` 含 `$queryRaw: jest.fn()` 与 `post.count`/`post.findMany`（已有 count/findMany；补 `$queryRaw`）。新增：

```ts
describe('PostsService.list sort', () => {
  // 复用文件已有的 moduleRef/service/prismaMock 搭建方式；若它们是局部的，
  // 在本 describe 内用相同 Test.createTestingModule 方式重建 service。
  it('hot: orders by raw hot-score query then reorders rows by returned ids', async () => {
    prismaMock.$queryRaw.mockResolvedValue([{ id: 'p2' }, { id: 'p1' }]);
    prismaMock.post.count.mockResolvedValue(2);
    prismaMock.post.findMany.mockResolvedValue([
      { id: 'p1', slug: 's1', title: 'T1', summary: null, tags: [], status: 'PUBLISHED', likeCount: 0, viewCount: 0, commentCount: 0, publishedAt: new Date(), author },
      { id: 'p2', slug: 's2', title: 'T2', summary: null, tags: [], status: 'PUBLISHED', likeCount: 0, viewCount: 0, commentCount: 0, publishedAt: new Date(), author },
    ]);

    const res = await service.list({ page: 1, pageSize: 10, mine: false, sort: 'hot' });

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    // 公式常量被钉死：权重/重力以参数注入
    const sql = prismaMock.$queryRaw.mock.calls[0][0];
    expect(sql.values).toEqual(expect.arrayContaining([10, 4, 1, 1.5]));
    // 结果按 raw 返回的 id 顺序重排
    expect(res.items.map((i) => i.id)).toEqual(['p2', 'p1']);
    expect(res.total).toBe(2);
  });

  it('latest (default): uses findMany, not the raw query', async () => {
    prismaMock.post.findMany.mockResolvedValue([]);
    prismaMock.post.count.mockResolvedValue(0);

    await service.list({ page: 1, pageSize: 10, mine: false });

    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.post.findMany).toHaveBeenCalled();
  });
});
```

注意：`author` 常量在文件顶部已定义（`const author = { id: 'u1', nickname: 'Al', avatarUrl: null }`）。`sort` 字段在 `list` 入参里新增（下一步）。

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @blog/api test posts.service`
Expected: FAIL（`sort` 未识别 / `$queryRaw` 未被调用 / 顺序不符）

- [ ] **Step 4: 实现 list 分支**

`apps/api/src/blog/posts.service.ts`：顶部 import 加 `Prisma`（已 import `type { Prisma }`，改为同时拿值）与 hotness、加 `$queryRaw` 用法。把 `list` 改为：

```ts
import { Prisma } from '@prisma/client';
// ...（保留其余 import）
import { hotScoreSql } from './hotness';
```

将 `list` 方法替换为：

```ts
  async list(opts: {
    page: number;
    pageSize: number;
    mine: boolean;
    userId?: string;
    sort?: 'latest' | 'hot';
  }): Promise<Paginated<PostSummary>> {
    // 「我的文章」永远按最近更新倒序，与热度无关。
    if (!opts.mine && opts.sort === 'hot') {
      return this.listHot(opts.page, opts.pageSize);
    }
    const where: Prisma.PostWhereInput =
      opts.mine && opts.userId
        ? { authorId: opts.userId }
        : { status: 'PUBLISHED' };
    const orderBy: Prisma.PostOrderByWithRelationInput = opts.mine
      ? { updatedAt: 'desc' }
      : { publishedAt: 'desc' };
    const [rows, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        orderBy,
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
        include: { author: true },
      }),
      this.prisma.post.count({ where }),
    ]);
    return {
      items: (rows as PostWithAuthor[]).map(toSummary),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }

  /** 「最热」：Postgres 实时按重力衰减分排序，再按 id 顺序取回带 author 的行。 */
  private async listHot(
    page: number,
    pageSize: number,
  ): Promise<Paginated<PostSummary>> {
    const offset = (page - 1) * pageSize;
    const ranked = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT "id"
      FROM "Post"
      WHERE "status" = 'PUBLISHED'
      ORDER BY ${hotScoreSql()} DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `);
    const ids = ranked.map((r) => r.id);
    const [rows, total] = await Promise.all([
      ids.length
        ? this.prisma.post.findMany({
            where: { id: { in: ids } },
            include: { author: true },
          })
        : Promise.resolve([] as PostWithAuthor[]),
      this.prisma.post.count({ where: { status: 'PUBLISHED' } }),
    ]);
    const byId = new Map((rows as PostWithAuthor[]).map((r) => [r.id, r]));
    const items = ids
      .map((id) => byId.get(id))
      .filter((r): r is PostWithAuthor => r !== undefined)
      .map(toSummary);
    return { items, total, page, pageSize };
  }
```

（`toSummary` / `PostWithAuthor` / `Paginated` / `PostSummary` 均已在文件顶部 import。）

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @blog/api test posts.service && pnpm --filter @blog/api typecheck`
Expected: PASS（新旧用例全过）

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/blog/hotness.ts apps/api/src/blog/posts.service.ts apps/api/src/blog/posts.service.spec.ts
git commit -m "feat(api): add hot sort with gravity-decay scoring in list

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: API 接线 — sort DTO + view 端点 + trust proxy（TDD where possible）

**Files:**
- Modify: `apps/api/src/blog/dto/list-posts.query.ts`
- Modify: `apps/api/src/blog/posts.controller.ts`
- Modify: `apps/api/src/main.ts:11-12`
- Create: `apps/api/src/blog/posts.controller.spec.ts`

- [ ] **Step 1: DTO 加 sort**

`apps/api/src/blog/dto/list-posts.query.ts`：import 加 `IsIn`，加字段：

```ts
import { Type } from 'class-transformer';
import { IsBooleanString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListPostsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number;

  @IsOptional()
  @IsBooleanString()
  mine?: string; // '1' / 'true'

  @IsOptional()
  @IsIn(['latest', 'hot'])
  sort?: 'latest' | 'hot';
}
```

- [ ] **Step 2: 写 controller 失败测试**

`apps/api/src/blog/posts.controller.spec.ts`：

```ts
import { Test } from '@nestjs/testing';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { LikesService } from './likes.service';
import { ViewCountService } from './view-count.service';

const postsMock = { list: jest.fn() };
const likesMock = {};
const viewMock = { record: jest.fn() };

describe('PostsController', () => {
  let controller: PostsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [PostsController],
      providers: [
        { provide: PostsService, useValue: postsMock },
        { provide: LikesService, useValue: likesMock },
        { provide: ViewCountService, useValue: viewMock },
      ],
    }).compile();
    controller = moduleRef.get(PostsController);
  });

  it('list passes sort through to the service', () => {
    postsMock.list.mockReturnValue({ items: [], total: 0, page: 1, pageSize: 10 });
    controller.list(undefined, { sort: 'hot' } as never);
    expect(postsMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ sort: 'hot', mine: false }),
    );
  });

  it('view derives an anonymous viewer key from ip+ua and records', async () => {
    const req = { ip: '1.2.3.4', headers: { 'user-agent': 'UA' } } as never;
    await controller.view(undefined, 'post-1', req);
    expect(viewMock.record).toHaveBeenCalledTimes(1);
    const [postId, key] = viewMock.record.mock.calls[0];
    expect(postId).toBe('post-1');
    expect(key.startsWith('a:')).toBe(true);
  });

  it('view uses the userId key when authenticated', async () => {
    const req = { ip: '1.2.3.4', headers: { 'user-agent': 'UA' } } as never;
    await controller.view({ userId: 'u9' }, 'post-1', req);
    const [, key] = viewMock.record.mock.calls[0];
    expect(key).toBe('u:u9');
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @blog/api test posts.controller`
Expected: FAIL（`controller.view` 不存在 / 未注入 ViewCountService）

- [ ] **Step 4: 实现 controller 改动**

`apps/api/src/blog/posts.controller.ts`：import 加 `Req`、`ViewCountService`、`viewerKeyFor`、express `Request` 类型；构造函数注入 `ViewCountService`；`list` 透传 `sort`；新增 `view` 端点。

import 区与构造函数：

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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PostsService } from './posts.service';
import { LikesService } from './likes.service';
import { ViewCountService } from './view-count.service';
import { viewerKeyFor } from './viewer-key';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { ListPostsQuery } from './dto/list-posts.query';

type Viewer = { userId: string } | undefined;

@Controller('posts')
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly likes: LikesService,
    private readonly views: ViewCountService,
  ) {}
```

把 `list` 改为透传 sort：

```ts
  @Get()
  @UseGuards(OptionalJwtGuard)
  list(@CurrentUser() user: Viewer, @Query() q: ListPostsQuery) {
    const mine = q.mine === '1' || q.mine === 'true';
    return this.posts.list({
      page: q.page ?? 1,
      pageSize: q.pageSize ?? 10,
      mine,
      userId: user?.userId,
      sort: q.sort ?? 'latest',
    });
  }
```

在 `like` 端点附近新增（放在 class 内、`getBySlug` 之后即可）：

```ts
  @Post(':id/view')
  @HttpCode(204)
  @UseGuards(OptionalJwtGuard)
  async view(
    @CurrentUser() user: Viewer,
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<void> {
    const key = viewerKeyFor(
      user?.userId,
      req.ip,
      req.headers['user-agent'],
    );
    await this.views.record(id, key);
  }
```

- [ ] **Step 5: main.ts 开启 trust proxy**

`apps/api/src/main.ts`：把 app 创建为 `NestExpressApplication` 并设置 trust proxy，使 `req.ip` 取 `X-Forwarded-For` 首跳。

import 顶部加：

```ts
import type { NestExpressApplication } from '@nestjs/platform-express';
```

改创建与设置：

```ts
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.set('trust proxy', true);
  const config = app.get(ConfigService);
```

- [ ] **Step 6: 跑测试 + typecheck**

Run: `pnpm --filter @blog/api test posts.controller && pnpm --filter @blog/api typecheck`
Expected: PASS（3 个 controller 用例过）

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/blog/dto/list-posts.query.ts apps/api/src/blog/posts.controller.ts apps/api/src/blog/posts.controller.spec.ts apps/api/src/main.ts
git commit -m "feat(api): add sort param and POST :id/view endpoint

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 前端 — viewCount 展示 + ViewPing + fetchPosts

**Files:**
- Modify: `apps/web/src/lib/posts.ts`
- Create: `apps/web/src/components/ViewPing.tsx`
- Modify: `apps/web/src/app/posts/[slug]/page.tsx`
- Modify: `apps/web/src/components/PostCard.tsx:35-40`
- Modify: `apps/web/src/components/HeadlinePost.tsx:48-51`

测试约定：`apps/web` 无测试运行器；门禁为 `pnpm --filter @blog/web typecheck` + `lint` + `build`。

- [ ] **Step 1: lib/posts.ts 加 fetchPosts**

在 `apps/web/src/lib/posts.ts` 末尾追加（公共列表读取，无需认证；首页用它做服务端首屏与客户端切换）：

```ts
/** 已发布文章列表，支持 latest/hot 排序。公共读取，SSR 与 client 均可调用。 */
export async function fetchPosts(
  sort: "latest" | "hot" = "latest",
  page = 1,
  pageSize = 10,
): Promise<Paginated<PostSummary>> {
  const qs = `?sort=${sort}&page=${page}&pageSize=${pageSize}`;
  const res = await fetch(`${BASE}/posts${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`list failed: ${res.status}`);
  return res.json() as Promise<Paginated<PostSummary>>;
}
```

（`fetchPublishedPosts` 保留不动，避免破坏其它调用方。）

- [ ] **Step 2: 创建 ViewPing**

`apps/web/src/components/ViewPing.tsx`：

```tsx
"use client";

import { useEffect } from "react";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Fires one best-effort view ping from the reader's browser on mount, so the
 * server sees the real reader IP/UA (the detail page itself is server-rendered).
 * Server-side Redis NX dedup makes a duplicate ping (e.g. React strict mode) harmless.
 */
export function ViewPing({ postId }: { postId: string }) {
  useEffect(() => {
    fetch(`${BASE}/posts/${postId}/view`, {
      method: "POST",
      credentials: "include",
      keepalive: true,
    }).catch(() => undefined);
  }, [postId]);
  return null;
}
```

- [ ] **Step 3: 详情页渲染 ViewPing + 显示 viewCount**

`apps/web/src/app/posts/[slug]/page.tsx`：import 加 `ViewPing`，在 `<main>` 内顶部渲染，并在作者/标签那行后补浏览量。

import：
```tsx
import { ViewPing } from "@/components/ViewPing";
```

在 `<main ...>` 紧接的第一个子元素加 `<ViewPing postId={post.id} />`，并把元信息行改为含浏览量：

```tsx
    <main className="mx-auto max-w-3xl px-6 py-16">
      <ViewPing postId={post.id} />
      <h1 className="text-4xl" style={{ fontFamily: "var(--font-display)" }}>{post.title}</h1>
      <p className="mt-2 italic" style={{ color: "var(--text-2)" }}>
        {post.author.nickname} · {(post.tags[0] ?? "未分类")} · {post.viewCount} views
      </p>
```

- [ ] **Step 4: PostCard 显示 viewCount**

`apps/web/src/components/PostCard.tsx` 的 `meta` 块加浏览量：

```tsx
  const meta = (
    <div className={TINY} style={{ color: "var(--text-2)" }}>
      {(post.tags[0] ?? "Field Notes")} · {fmtDate(post.publishedAt)} ·{" "}
      {post.likeCount} likes · {post.viewCount} views
    </div>
  );
```

- [ ] **Step 5: HeadlinePost 显示 viewCount**

`apps/web/src/components/HeadlinePost.tsx` 的元信息行加浏览量：

```tsx
          <div className={`mt-4 ${TINY}`} style={{ color: "var(--text-2)" }}>
            {(post.tags[0] ?? "Field Notes")} · {fmtDate(post.publishedAt)} ·{" "}
            {post.likeCount} likes · {post.viewCount} views
          </div>
```

- [ ] **Step 6: 验证**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint`
Expected: PASS（0 error；既有 Avatar.tsx `<img>` warning 可忽略）

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/posts.ts apps/web/src/components/ViewPing.tsx apps/web/src/app/posts/[slug]/page.tsx apps/web/src/components/PostCard.tsx apps/web/src/components/HeadlinePost.tsx
git commit -m "feat(web): show view counts and ping views on the detail page

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 前端 — PostList 客户端组件 + 首页接线

**Files:**
- Create: `apps/web/src/components/PostList.tsx`
- Modify: `apps/web/src/app/page.tsx`

把首页「文章列表区」（headline + 索引行 + 空状态）整体搬进客户端组件 `PostList`，顶部加最新/最热切换。Hero/翻书编排区（`HeroZone`/`ChapterStage`/`Marquee`）留在 page.tsx 不动。

- [ ] **Step 1: 创建 PostList**

`apps/web/src/components/PostList.tsx`：

```tsx
"use client";

import { startTransition, useState } from "react";
import type { Paginated, PostSummary } from "@blog/shared";
import { PostCard } from "@/components/PostCard";
import { HeadlinePost } from "@/components/HeadlinePost";
import { ScrollReveal } from "@/components/ScrollReveal";
import { fetchPosts } from "@/lib/posts";
import {
  Butterfly2,
  Foliage2,
  Bird1,
  Flower2,
  Butterfly4,
  Foliage3,
} from "@/components/illustrations";

const LIST_PLATES = [Butterfly2, Foliage2, Bird1, Flower2, Butterfly4, Foliage3];

type Tab = "latest" | "hot";
const TAB = "font-sans text-[10px] uppercase tracking-[0.25em]";

export function PostList({
  initial,
}: {
  initial: Paginated<PostSummary>;
}) {
  const [tab, setTab] = useState<Tab>("latest");
  // 缓存两个 tab 的结果，避免重复请求；latest 用服务端首屏数据。
  const [cache, setCache] = useState<Record<Tab, PostSummary[] | null>>({
    latest: initial.items,
    hot: null,
  });
  const [loading, setLoading] = useState(false);

  function switchTab(next: Tab) {
    if (next === tab) return;
    setTab(next);
    if (cache[next]) return;
    setLoading(true);
    fetchPosts(next)
      .then((res) =>
        startTransition(() => setCache((c) => ({ ...c, [next]: res.items }))),
      )
      .catch(() => undefined)
      .finally(() => startTransition(() => setLoading(false)));
  }

  const items = cache[tab] ?? [];
  const [headline, ...rest] = items;

  return (
    <>
      <div className="mt-12 flex items-center gap-4 border-b pb-3" style={{ borderColor: "var(--border)" }}>
        {(["latest", "hot"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={TAB}
            style={{ color: tab === t ? "var(--text)" : "var(--text-3)" }}
            aria-pressed={tab === t}
          >
            {t === "latest" ? "最新" : "最热"}
          </button>
        ))}
        {loading && (
          <span className={TAB} style={{ color: "var(--text-3)" }}>
            …
          </span>
        )}
      </div>

      {items.length === 0 && !loading && (
        <p className="mt-16" style={{ color: "var(--text-3)" }}>
          还没有发布的文章。
        </p>
      )}

      {headline && <HeadlinePost post={headline} />}

      {rest.length > 0 && (
        <ScrollReveal key={`${tab}-${items.length}`}>
          <section className="mt-16">
            {rest.map((post, i) => {
              const withPlate = i % 2 === 0;
              const Plate = withPlate
                ? LIST_PLATES[Math.floor(i / 2) % LIST_PLATES.length]
                : undefined;
              return (
                <PostCard key={post.id} post={post} index={i + 2} illustration={Plate} />
              );
            })}
          </section>
        </ScrollReveal>
      )}
    </>
  );
}
```

- [ ] **Step 2: 首页接线**

`apps/web/src/app/page.tsx`：服务端拉 `latest` 首屏数据，列表区替换为 `<PostList initial={...} />`。移除现已搬进 PostList 的 imports（`PostCard`、`HeadlinePost`、`ScrollReveal`、`LIST_PLATES` 用到的插图、headline 拆分逻辑），保留 hero 区用到的（`HeroZone`、`ChapterStage`、`Marquee`、`Masthead`、`RevealText`、`Bird1`/`Flower2` 等 hero 内联用的插图）。

把文件改为：

```tsx
import { fetchPosts } from "@/lib/posts";
import { Masthead } from "@/components/Masthead";
import { RevealText } from "@/components/RevealText";
import { HeroZone } from "@/components/HeroZone";
import { ChapterStage } from "@/components/ChapterStage";
import { Marquee } from "@/components/Marquee";
import { PostList } from "@/components/PostList";
import { Bird1, Flower2 } from "@/components/illustrations";

const PAGE = "flex min-h-screen flex-col justify-center";
const KICKER = "font-sans text-[10px] uppercase tracking-[0.25em]";

export default async function Home() {
  const initial = await fetchPosts("latest");

  return (
    <main className="mx-auto w-full max-w-5xl px-6 pb-24">
      <HeroZone>
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

        <PostList initial={initial} />
      </HeroZone>
    </main>
  );
}
```

注意：原首页用 `fetchPublishedPosts()`，这里换成 `fetchPosts("latest")`（同样命中 `GET /posts`，但显式带 sort）。`Masthead issue={initial.total}` 保留期号=已发布总数。

- [ ] **Step 3: 验证（含 build，因首页是共享入口）**

Run: `pnpm --filter @blog/web typecheck && pnpm --filter @blog/web lint && pnpm --filter @blog/web build`
Expected: 三者均成功；首页路由编译通过。

- [ ] **Step 4: 手动验证**

起 `pnpm dev`（需 API + DB + Redis 在跑）。首页：默认「最新」与原顺序一致；点「最热」就地切换、不重跑 hero 动画、再点「最新」秒回（缓存）。打开一篇文章 → 刷新或换浏览器/无痕 → `viewCount` 增长；同一窗口内重复刷新 12h 内不再增长。卡片/头条/详情页均显示 views。
Expected: 全部符合。

- [ ] **Step 5: 全量 verify**

Run: `pnpm verify`
Expected: lint + typecheck + test 全绿。

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/PostList.tsx apps/web/src/app/page.tsx
git commit -m "feat(web): add home latest/hot sort toggle via client PostList

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review 结论

**1. Spec 覆盖：**
- 数据模型（viewCount 列 + 共享类型 + mapper）→ Task 1 ✅
- 浏览计数客户端触发（端点 + ViewPing + trust proxy）→ Task 5（端点 + trust proxy）+ Task 6（ViewPing）✅
- 去重 + fail-open + viewerKey → Task 2（key）+ Task 3（service）✅
- 热度公式常量 + Postgres 实时排序 → Task 4 ✅
- sort DTO/controller 透传 → Task 5 ✅
- viewCount 展示（卡片/头条/详情）→ Task 6 ✅
- 首页最新/最热切换、不重跑 hero → Task 7 ✅
- 测试（dedup/viewerKey/sort 分支单测）→ Task 2/3/4/5 ✅；公式数值手验 → Task 7 Step 4 ✅

**2. Placeholder 扫描：** 无 TBD/TODO；每个改码步骤均含完整代码。

**3. 类型一致性：**
- `viewerKeyFor(userId?, ip?, ua?)`（Task 2）↔ controller 调用（Task 5）一致。
- `ViewCountService.record(postId, viewerKey)`（Task 3）↔ controller 调用（Task 5）、↔ spec mock（Task 3）一致。
- `list({ ..., sort? })`（Task 4）↔ controller 透传（Task 5）↔ service spec（Task 4）一致。
- `hotScoreSql()` 返回 `Prisma.Sql`，权重以参数注入 → Task 4 测试断言 `sql.values` 含 `[10,4,1,1.5]` 一致。
- `PostSummary.viewCount`（Task 1）↔ mapper（Task 1）↔ 前端展示（Task 6）↔ `fetchPosts`/`PostList`（Task 6/7）一致。
- `fetchPosts(sort, page, pageSize)`（Task 6）↔ `PostList`/page.tsx 调用（Task 7）一致。

**已知执行依赖：** Task 1 Step 5 需本地 Postgres 在跑以生成 migration；Task 7 手验需 API+DB+Redis。subagent 若无法连库，在该步报告 BLOCKED 而非伪造。
