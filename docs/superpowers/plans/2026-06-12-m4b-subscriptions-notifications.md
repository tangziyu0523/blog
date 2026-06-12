# M4b 订阅与通知 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 关注作者 + 站内通知中心 + SSE 实时推送：评论/回复/被关注作者发文三类事件产生通知，登录用户实时收到完整 NotificationView。

**Architecture:** 同步、进程内、直接注入（方案 A，无 BullMQ/Redis-pubsub）。新增 NestJS `notifications` 模块（FollowsService + NotificationsService + NotificationStreamService + 两个 controller），被 `CommentsService`/`PostsService` 直接注入调用；通知产生失败被吞、不阻断触发动作。SSE 用 `@Sse()` + 进程内 `Map<userId, Set<Subject>>`，cookie 鉴权（access token 在 httpOnly cookie，现有 JwtAuthGuard 直接可用）。

**Tech Stack:** NestJS + Prisma(PostgreSQL) + rxjs(`@Sse`) + class-validator；Next.js(App Router) + React 客户端组件 + 原生 `EventSource`；`packages/shared`（node:test）。

**设计依据：** `docs/superpowers/specs/2026-06-12-m4b-subscriptions-notifications-design.md`

**与 spec 的务实细化（同效，更简单）：**
- 通知生成合并为单一方法 `notifyForNewComment(comment)`（按 `parentId` 是否为 null 分流 POST_COMMENT / COMMENT_REPLY），而非两个方法 —— 保证"一条评论对单接收者 ≤1 通知"。
- `NEW_POST` 扇出用**逐个 `emit` 循环**而非 `createMany`：每条返回行可直接构建 NotificationView 推 SSE，规模小时足够；`createMany`/BullMQ 是规模 seam。
- SSE 消息类型用本地 `interface SseMessage { data: NotificationView }`（结构上满足 Nest `@Sse`），避免 `MessageEvent` 全局/导入歧义。

---

## 文件结构

**`packages/shared/`**
- `src/errors.ts`(改) — 加 `USER_NOT_FOUND` / `CANNOT_FOLLOW_SELF` / `NOTIFICATION_NOT_FOUND`
- `src/notification.ts`(新) — `NotificationType`/`NotificationCategory`/`NotificationView`/`NotificationListResult`/`UnreadCountResult`/`FollowResult`
- `src/notification.test.ts`(新) ｜ `src/index.ts`(改) 导出

**`apps/api/`**
- `prisma/schema.prisma`(改) — `Follow`/`Notification`/`NotificationType` + User/Post/Comment 反向关系
- `src/notifications/notification-stream.service.ts`(新, +spec) — SSE 连接管理
- `src/notifications/follows.service.ts`(新, +spec) — 关注切换/状态/关注者
- `src/notifications/notification.mapper.ts`(新) — `NOTIF_INCLUDE` + `toNotificationView` + `categoryOf`
- `src/notifications/notifications.service.ts`(新, +spec) — emit/list/unread/markRead/markAllRead + 规则方法
- `src/notifications/follows.controller.ts` / `notifications.controller.ts`(新)
- `src/notifications/dto/list-notifications.query.ts`(新)
- `src/notifications/notifications.module.ts`(新) ｜ `src/app.module.ts`(改)
- `src/comments/comments.service.ts`(改, 注入+调用) ｜ `comments.module.ts`(改) ｜ `comments.service.spec.ts`(改, 加 mock)
- `src/blog/posts.service.ts`(改, 注入+调用) ｜ `blog.module.ts`(改) ｜ `posts.service.spec.ts`(改, 加 mock)
- `test/setup.ts`(改, resetDb) ｜ `test/notifications.e2e-spec.ts`(新)

**`apps/web/`**
- `src/lib/notifications.ts`(新) — API 客户端
- `src/components/FollowButton.tsx` / `NotificationBell.tsx`(新)
- `src/app/layout.tsx`(改, 挂 NotificationBell) ｜ `src/app/posts/[slug]/page.tsx`(改, 挂 FollowButton)

---

## Task 1: Shared — 错误码 + 通知类型

**Files:** Modify `packages/shared/src/errors.ts`, `src/index.ts`; Create `src/notification.ts`, `src/notification.test.ts`.

- [ ] **Step 1: 失败测试** `packages/shared/src/notification.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ErrorCode } from './errors.ts';
import type { NotificationView, FollowResult } from './notification.ts';

test('m4b error codes exist', () => {
  assert.equal(ErrorCode.CANNOT_FOLLOW_SELF, 'CANNOT_FOLLOW_SELF');
  assert.equal(ErrorCode.NOTIFICATION_NOT_FOUND, 'NOTIFICATION_NOT_FOUND');
  assert.equal(ErrorCode.USER_NOT_FOUND, 'USER_NOT_FOUND');
});

test('NotificationView shape compiles', () => {
  const v: NotificationView = {
    id: 'n1', type: 'POST_COMMENT', category: 'interaction',
    actor: { id: 'u1', nickname: 'N', avatarUrl: null },
    post: { slug: 's', title: 't' }, commentId: 'c1', read: false, createdAt: 'x',
  };
  const f: FollowResult = { following: true, followerCount: 1 };
  assert.equal(v.category, 'interaction');
  assert.equal(f.following, true);
});
```

- [ ] **Step 2: 确认失败** — `pnpm --filter @blog/shared test` → FAIL（缺 notification.ts + 错误码）。

- [ ] **Step 3: 加错误码** — `packages/shared/src/errors.ts`，在 `COMMENT_NOT_FOUND: 'COMMENT_NOT_FOUND',` 之后加：
```ts
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  CANNOT_FOLLOW_SELF: 'CANNOT_FOLLOW_SELF',
  NOTIFICATION_NOT_FOUND: 'NOTIFICATION_NOT_FOUND',
```

- [ ] **Step 4: 类型** `packages/shared/src/notification.ts`:
```ts
export type NotificationType = 'POST_COMMENT' | 'COMMENT_REPLY' | 'NEW_POST';
export type NotificationCategory = 'interaction' | 'subscription';

export interface NotificationView {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  actor: { id: string; nickname: string; avatarUrl: string | null } | null;
  post: { slug: string; title: string } | null;
  commentId: string | null;
  read: boolean;
  createdAt: string; // ISO
}

export interface NotificationListResult {
  items: NotificationView[];
  nextCursor: string | null;
}

export interface UnreadCountResult {
  count: number;
}

export interface FollowResult {
  following: boolean;
  followerCount: number;
}
```

- [ ] **Step 5: 导出** — `packages/shared/src/index.ts` 末尾加 `export * from './notification.ts';`

- [ ] **Step 6: 通过 + 构建** — `pnpm --filter @blog/shared test` → PASS；`pnpm --filter @blog/shared build` → clean。

- [ ] **Step 7: 提交**
```bash
git add packages/shared/src/errors.ts packages/shared/src/notification.ts packages/shared/src/notification.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): notification types + follow/notification error codes"
```

---

## Task 2: Prisma schema + migration + resetDb

**Files:** Modify `apps/api/prisma/schema.prisma`, `apps/api/test/setup.ts`.

- [ ] **Step 1: 改 schema** — `apps/api/prisma/schema.prisma`

`User` 模型内（在 `commentLikes CommentLike[]` 后）加：
```prisma
  following          Follow[]       @relation("Following")
  followers          Follow[]       @relation("Followers")
  notifications      Notification[] @relation("Recipient")
  actedNotifications Notification[] @relation("Actor")
```

`Post` 模型内（在 `comments Comment[]` 后）加：
```prisma
  notifications Notification[]
```

`Comment` 模型内（在 `likes CommentLike[]` 后）加：
```prisma
  notifications Notification[]
```

文件末尾追加：
```prisma
model Follow {
  followerId String
  authorId   String
  createdAt  DateTime @default(now())
  follower   User     @relation("Following", fields: [followerId], references: [id], onDelete: Cascade)
  author     User     @relation("Followers", fields: [authorId], references: [id], onDelete: Cascade)

  @@id([followerId, authorId])
  @@index([authorId])
}

model Notification {
  id        String           @id @default(cuid())
  userId    String
  user      User             @relation("Recipient", fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  actorId   String?
  actor     User?            @relation("Actor", fields: [actorId], references: [id], onDelete: SetNull)
  postId    String?
  post      Post?            @relation(fields: [postId], references: [id], onDelete: Cascade)
  commentId String?
  comment   Comment?         @relation(fields: [commentId], references: [id], onDelete: Cascade)
  readAt    DateTime?
  createdAt DateTime         @default(now())

  @@index([userId, createdAt])
  @@index([userId, readAt])
}

enum NotificationType {
  POST_COMMENT
  COMMENT_REPLY
  NEW_POST
}
```

- [ ] **Step 2: migration** — `pnpm --filter @blog/api exec prisma migrate dev --name m4b_subscriptions_notifications`
Expected: 新 migration 目录 + client 重生成，无报错。注意 search_vector 已在 schema 声明为 `Unsupported`，migration **不应**再 DROP 它；若生成的 SQL 含 `search_vector` 改动，停止并报告（参考 `docs/plans/m4a-progress.md` 的 search_vector 处理）。

- [ ] **Step 3: resetDb** — `apps/api/test/setup.ts` 的 `resetDb`，在最前面（`await prisma.commentLike.deleteMany();` 之前）插入：
```ts
  await prisma.notification.deleteMany();
  await prisma.follow.deleteMany();
```
最终顺序：notification → follow → commentLike → comment → like → post → user → redis.flushdb()。

- [ ] **Step 4: 验证** — `pnpm --filter @blog/api typecheck` → PASS。

- [ ] **Step 5: 提交**
```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/test/setup.ts
git commit -m "feat(api): Follow & Notification schema, migration, resetDb cleanup"
```

---

## Task 3: NotificationStreamService（SSE 连接管理）

**Files:** Create `apps/api/src/notifications/notification-stream.service.ts`, `notification-stream.service.spec.ts`.

- [ ] **Step 1: 失败测试** `apps/api/src/notifications/notification-stream.service.spec.ts`:
```ts
import { NotificationStreamService } from './notification-stream.service';
import type { NotificationView } from '@blog/shared';

const view: NotificationView = {
  id: 'n1', type: 'POST_COMMENT', category: 'interaction',
  actor: null, post: null, commentId: null, read: false, createdAt: 'x',
};

describe('NotificationStreamService', () => {
  it('delivers pushed views to a connected subscriber', () => {
    const svc = new NotificationStreamService();
    const got: NotificationView[] = [];
    const sub = svc.connect('u1').subscribe((m) => got.push(m.data));
    svc.push('u1', view);
    expect(got).toEqual([view]);
    sub.unsubscribe();
  });

  it('does not deliver to other users', () => {
    const svc = new NotificationStreamService();
    const got: NotificationView[] = [];
    const sub = svc.connect('u1').subscribe((m) => got.push(m.data));
    svc.push('u2', view);
    expect(got).toEqual([]);
    sub.unsubscribe();
  });

  it('push to an unconnected user is a no-op', () => {
    const svc = new NotificationStreamService();
    expect(() => svc.push('nobody', view)).not.toThrow();
  });
});
```

- [ ] **Step 2: 确认失败** — `pnpm --filter @blog/api test -- notification-stream` → FAIL（模块不存在）。

- [ ] **Step 3: 实现** `apps/api/src/notifications/notification-stream.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';
import { finalize } from 'rxjs/operators';
import type { NotificationView } from '@blog/shared';

export interface SseMessage {
  data: NotificationView;
}

/** In-process per-user SSE fan-out. Single-instance; Redis pub/sub is the multi-instance seam. */
@Injectable()
export class NotificationStreamService {
  private readonly channels = new Map<string, Set<Subject<SseMessage>>>();

  connect(userId: string): Observable<SseMessage> {
    const subject = new Subject<SseMessage>();
    const set = this.channels.get(userId) ?? new Set<Subject<SseMessage>>();
    set.add(subject);
    this.channels.set(userId, set);
    return subject.asObservable().pipe(
      finalize(() => {
        set.delete(subject);
        if (set.size === 0) this.channels.delete(userId);
      }),
    );
  }

  push(userId: string, view: NotificationView): void {
    const set = this.channels.get(userId);
    if (!set) return;
    for (const subject of set) subject.next({ data: view });
  }
}
```

- [ ] **Step 4: 通过** — `pnpm --filter @blog/api test -- notification-stream` → PASS（3）。

- [ ] **Step 5: lint** — `pnpm --filter @blog/api exec eslint --fix "src/notifications/**/*.ts"` 然后 `eslint "src/notifications/**/*.ts"` → 0 errors。

- [ ] **Step 6: 提交**
```bash
git add apps/api/src/notifications/notification-stream.service.ts apps/api/src/notifications/notification-stream.service.spec.ts
git commit -m "feat(api): NotificationStreamService in-process SSE fan-out"
```

---

## Task 4: FollowsService（关注切换/状态/关注者）

**Files:** Create `apps/api/src/notifications/follows.service.ts`, `follows.service.spec.ts`.

- [ ] **Step 1: 失败测试** `apps/api/src/notifications/follows.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { FollowsService } from './follows.service';
import { PrismaService } from '../prisma/prisma.service';

const tx = { follow: { createMany: jest.fn(), deleteMany: jest.fn(), count: jest.fn() } };
const prismaMock = {
  $transaction: jest.fn(),
  user: { findUnique: jest.fn() },
  follow: { count: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
};

describe('FollowsService', () => {
  let service: FollowsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    prismaMock.$transaction.mockImplementation((cb: any) => cb(tx));
    const ref = await Test.createTestingModule({
      providers: [FollowsService, { provide: PrismaService, useValue: prismaMock }],
    }).compile();
    service = ref.get(FollowsService);
  });

  it('follows when not yet following', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'a' });
    tx.follow.createMany.mockResolvedValue({ count: 1 });
    tx.follow.count.mockResolvedValue(1);
    const r = await service.toggle('u1', 'a');
    expect(r).toEqual({ following: true, followerCount: 1 });
  });

  it('unfollows when already following', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: 'a' });
    tx.follow.createMany.mockResolvedValue({ count: 0 });
    tx.follow.deleteMany.mockResolvedValue({ count: 1 });
    tx.follow.count.mockResolvedValue(0);
    const r = await service.toggle('u1', 'a');
    expect(r).toEqual({ following: false, followerCount: 0 });
  });

  it('rejects self-follow', async () => {
    await expect(service.toggle('u1', 'u1')).rejects.toMatchObject({ code: 'CANNOT_FOLLOW_SELF' });
  });

  it('rejects following a missing author', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    await expect(service.toggle('u1', 'ghost')).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
  });

  it('listFollowerIds returns author follower ids', async () => {
    prismaMock.follow.findMany.mockResolvedValue([{ followerId: 'x' }, { followerId: 'y' }]);
    expect(await service.listFollowerIds('a')).toEqual(['x', 'y']);
  });
});
```

- [ ] **Step 2: 确认失败** — `pnpm --filter @blog/api test -- follows.service` → FAIL。

- [ ] **Step 3: 实现** `apps/api/src/notifications/follows.service.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type { FollowResult } from '@blog/shared';

@Injectable()
export class FollowsService {
  constructor(private readonly prisma: PrismaService) {}

  async toggle(followerId: string, authorId: string): Promise<FollowResult> {
    if (followerId === authorId) {
      throw new AppError(ErrorCode.CANNOT_FOLLOW_SELF, 400, 'Cannot follow yourself');
    }
    const author = await this.prisma.user.findUnique({
      where: { id: authorId },
      select: { id: true },
    });
    if (!author) throw new AppError(ErrorCode.USER_NOT_FOUND, 404, 'User not found');

    return this.prisma.$transaction(async (tx): Promise<FollowResult> => {
      const inserted = await tx.follow.createMany({
        data: [{ followerId, authorId }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) {
        await tx.follow.deleteMany({ where: { followerId, authorId } });
      }
      const followerCount = await tx.follow.count({ where: { authorId } });
      return { following: inserted.count === 1, followerCount };
    });
  }

  async status(viewerId: string | undefined, authorId: string): Promise<FollowResult> {
    const followerCount = await this.prisma.follow.count({ where: { authorId } });
    if (!viewerId) return { following: false, followerCount };
    const row = await this.prisma.follow.findUnique({
      where: { followerId_authorId: { followerId: viewerId, authorId } },
    });
    return { following: row !== null, followerCount };
  }

  async listFollowerIds(authorId: string): Promise<string[]> {
    const rows = await this.prisma.follow.findMany({
      where: { authorId },
      select: { followerId: true },
    });
    return rows.map((r) => r.followerId);
  }
}
```

- [ ] **Step 4: 通过** — `pnpm --filter @blog/api test -- follows.service` → PASS（5）。

- [ ] **Step 5: lint** — `eslint --fix` + `eslint "src/notifications/**/*.ts"` → 0 errors。

- [ ] **Step 6: 提交**
```bash
git add apps/api/src/notifications/follows.service.ts apps/api/src/notifications/follows.service.spec.ts
git commit -m "feat(api): FollowsService idempotent follow toggle + status + followers"
```

---

## Task 5: notification.mapper + NotificationsService

**Files:** Create `apps/api/src/notifications/notification.mapper.ts`, `notifications.service.ts`, `notifications.service.spec.ts`.

- [ ] **Step 1: mapper** `apps/api/src/notifications/notification.mapper.ts`:
```ts
import type { Notification, User, Post, Comment, Prisma } from '@prisma/client';
import type { NotificationView, NotificationCategory, NotificationType } from '@blog/shared';

type Actor = Pick<User, 'id' | 'nickname' | 'avatarUrl'>;

export type NotificationRow = Notification & {
  actor: Actor | null;
  post: Pick<Post, 'slug' | 'title'> | null;
  comment: Pick<Comment, 'id'> | null;
};

export const NOTIF_INCLUDE = {
  actor: { select: { id: true, nickname: true, avatarUrl: true } },
  post: { select: { slug: true, title: true } },
  comment: { select: { id: true } },
} satisfies Prisma.NotificationInclude;

export function categoryOf(type: NotificationType): NotificationCategory {
  return type === 'NEW_POST' ? 'subscription' : 'interaction';
}

export function toNotificationView(n: NotificationRow): NotificationView {
  return {
    id: n.id,
    type: n.type as NotificationType,
    category: categoryOf(n.type as NotificationType),
    actor: n.actor
      ? { id: n.actor.id, nickname: n.actor.nickname, avatarUrl: n.actor.avatarUrl }
      : null,
    post: n.post ? { slug: n.post.slug, title: n.post.title } : null,
    commentId: n.commentId ?? null,
    read: n.readAt !== null,
    createdAt: n.createdAt.toISOString(),
  };
}
```

- [ ] **Step 2: 失败测试** `apps/api/src/notifications/notifications.service.spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { FollowsService } from './follows.service';
import { NotificationStreamService } from './notification-stream.service';
import { PrismaService } from '../prisma/prisma.service';

const prismaMock = {
  notification: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), count: jest.fn(), findMany: jest.fn() },
  post: { findUnique: jest.fn() },
  comment: { findUnique: jest.fn() },
};
const streamMock = { push: jest.fn() };
const followsMock = { listFollowerIds: jest.fn() };

function notifRow(over: Record<string, unknown> = {}) {
  return {
    id: 'n1', userId: 'recipient', type: 'POST_COMMENT', actorId: 'actor',
    postId: 'p1', commentId: 'c1', readAt: null, createdAt: new Date('2026-06-12T00:00:00Z'),
    actor: { id: 'actor', nickname: 'A', avatarUrl: null },
    post: { slug: 's', title: 't' }, comment: { id: 'c1' }, ...over,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  beforeEach(async () => {
    jest.resetAllMocks();
    const ref = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: FollowsService, useValue: followsMock },
        { provide: NotificationStreamService, useValue: streamMock },
      ],
    }).compile();
    service = ref.get(NotificationsService);
  });

  it('emit creates a row and pushes the view to the recipient', async () => {
    prismaMock.notification.create.mockResolvedValue(notifRow());
    const view = await service.emit('recipient', 'POST_COMMENT', { actorId: 'actor', postId: 'p1', commentId: 'c1' });
    expect(view.id).toBe('n1');
    expect(view.category).toBe('interaction');
    expect(streamMock.push).toHaveBeenCalledWith('recipient', view);
  });

  it('top-level comment notifies the post author', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ authorId: 'postAuthor' });
    prismaMock.notification.create.mockResolvedValue(notifRow({ userId: 'postAuthor' }));
    await service.notifyForNewComment({ id: 'c1', postId: 'p1', authorId: 'commenter', parentId: null, quotedId: null });
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'postAuthor', type: 'POST_COMMENT' }) }),
    );
  });

  it('does not notify when commenting on your own post', async () => {
    prismaMock.post.findUnique.mockResolvedValue({ authorId: 'me' });
    await service.notifyForNewComment({ id: 'c1', postId: 'p1', authorId: 'me', parentId: null, quotedId: null });
    expect(prismaMock.notification.create).not.toHaveBeenCalled();
  });

  it('reply notifies the replied-to comment author (quoted target), not the post author', async () => {
    prismaMock.comment.findUnique.mockResolvedValue({ authorId: 'replied' });
    prismaMock.notification.create.mockResolvedValue(notifRow({ userId: 'replied', type: 'COMMENT_REPLY' }));
    await service.notifyForNewComment({ id: 'c2', postId: 'p1', authorId: 'replier', parentId: 'top1', quotedId: 'r1' });
    expect(prismaMock.comment.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1' } }));
    expect(prismaMock.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'replied', type: 'COMMENT_REPLY' }) }),
    );
    expect(prismaMock.post.findUnique).not.toHaveBeenCalled();
  });

  it('notifyNewPost fans out to all followers', async () => {
    followsMock.listFollowerIds.mockResolvedValue(['f1', 'f2']);
    prismaMock.notification.create.mockResolvedValue(notifRow({ type: 'NEW_POST' }));
    await service.notifyNewPost({ id: 'p1', authorId: 'author' });
    expect(prismaMock.notification.create).toHaveBeenCalledTimes(2);
  });

  it('notification failure is swallowed (does not throw)', async () => {
    prismaMock.post.findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      service.notifyForNewComment({ id: 'c1', postId: 'p1', authorId: 'x', parentId: null, quotedId: null }),
    ).resolves.toBeUndefined();
  });

  it('markRead rejects marking another user notification', async () => {
    prismaMock.notification.findUnique.mockResolvedValue({ id: 'n1', userId: 'owner', readAt: null });
    await expect(service.markRead('intruder', 'n1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
```

- [ ] **Step 3: 确认失败** — `pnpm --filter @blog/api test -- notifications.service` → FAIL。

- [ ] **Step 4: 实现** `apps/api/src/notifications/notifications.service.ts`:
```ts
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/app-error';
import { ErrorCode } from '@blog/shared';
import type { NotificationView, NotificationListResult, NotificationType } from '@blog/shared';
import { FollowsService } from './follows.service';
import { NotificationStreamService } from './notification-stream.service';
import { NOTIF_INCLUDE, toNotificationView } from './notification.mapper';

interface NewComment {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  quotedId: string | null;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly follows: FollowsService,
    private readonly stream: NotificationStreamService,
  ) {}

  async emit(
    userId: string,
    type: NotificationType,
    refs: { actorId?: string; postId?: string; commentId?: string },
  ): Promise<NotificationView> {
    const row = await this.prisma.notification.create({
      data: {
        userId,
        type,
        actorId: refs.actorId ?? null,
        postId: refs.postId ?? null,
        commentId: refs.commentId ?? null,
      },
      include: NOTIF_INCLUDE,
    });
    const view = toNotificationView(row);
    this.stream.push(userId, view);
    return view;
  }

  /** Generate the right notification for a freshly-created comment. Never throws. */
  async notifyForNewComment(comment: NewComment): Promise<void> {
    try {
      if (comment.parentId === null) {
        const post = await this.prisma.post.findUnique({
          where: { id: comment.postId },
          select: { authorId: true },
        });
        if (post && post.authorId !== comment.authorId) {
          await this.emit(post.authorId, 'POST_COMMENT', {
            actorId: comment.authorId,
            postId: comment.postId,
            commentId: comment.id,
          });
        }
      } else {
        const targetId = comment.quotedId ?? comment.parentId;
        const target = await this.prisma.comment.findUnique({
          where: { id: targetId },
          select: { authorId: true },
        });
        if (target && target.authorId !== comment.authorId) {
          await this.emit(target.authorId, 'COMMENT_REPLY', {
            actorId: comment.authorId,
            postId: comment.postId,
            commentId: comment.id,
          });
        }
      }
    } catch (err) {
      this.logger.error(`notifyForNewComment failed for comment ${comment.id}`, err as Error);
    }
  }

  /** Fan out NEW_POST to the author's followers. Never throws. */
  async notifyNewPost(post: { id: string; authorId: string }): Promise<void> {
    try {
      const followerIds = await this.follows.listFollowerIds(post.authorId);
      for (const followerId of followerIds) {
        await this.emit(followerId, 'NEW_POST', { actorId: post.authorId, postId: post.id });
      }
    } catch (err) {
      this.logger.error(`notifyNewPost failed for post ${post.id}`, err as Error);
    }
  }

  async list(userId: string, cursor?: string, take = 20): Promise<NotificationListResult> {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: NOTIF_INCLUDE,
    });
    const hasMore = rows.length > take;
    const page = hasMore ? rows.slice(0, take) : rows;
    return {
      items: page.map(toNotificationView),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(userId: string, id: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({
      where: { id },
      select: { userId: true, readAt: true },
    });
    if (!n) throw new AppError(ErrorCode.NOTIFICATION_NOT_FOUND, 404, 'Notification not found');
    if (n.userId !== userId) throw new AppError(ErrorCode.FORBIDDEN, 403, 'Not your notification');
    if (n.readAt === null) {
      await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
    }
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
```

- [ ] **Step 5: 通过** — `pnpm --filter @blog/api test -- notifications.service` → PASS（7）。

- [ ] **Step 6: lint** — `eslint --fix` + `eslint "src/notifications/**/*.ts"` → 0 errors。

- [ ] **Step 7: 提交**
```bash
git add apps/api/src/notifications/notification.mapper.ts apps/api/src/notifications/notifications.service.ts apps/api/src/notifications/notifications.service.spec.ts
git commit -m "feat(api): NotificationsService emit/list/read + comment & new-post rules"
```

---

## Task 6: Controllers + DTO + module + app 接线

**Files:** Create `apps/api/src/notifications/dto/list-notifications.query.ts`, `follows.controller.ts`, `notifications.controller.ts`, `notifications.module.ts`; Modify `apps/api/src/app.module.ts`.

- [ ] **Step 1: DTO** `apps/api/src/notifications/dto/list-notifications.query.ts`:
```ts
import { IsOptional, IsString } from 'class-validator';

export class ListNotificationsQuery {
  @IsOptional()
  @IsString()
  cursor?: string;
}
```

- [ ] **Step 2: FollowsController** `apps/api/src/notifications/follows.controller.ts`:
```ts
import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FollowsService } from './follows.service';

type Viewer = { userId: string } | undefined;

@Controller('users')
export class FollowsController {
  constructor(private readonly follows: FollowsService) {}

  @Post(':id/follow')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  toggle(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.follows.toggle(user.userId, id);
  }

  @Get(':id/follow')
  @UseGuards(OptionalJwtGuard)
  status(@CurrentUser() user: Viewer, @Param('id') id: string) {
    return this.follows.status(user?.userId, id);
  }
}
```

- [ ] **Step 3: NotificationsController** `apps/api/src/notifications/notifications.controller.ts`:
```ts
import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService, type SseMessage } from './notification-stream.service';
import { ListNotificationsQuery } from './dto/list-notifications.query';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly stream: NotificationStreamService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: { userId: string }, @Query() q: ListNotificationsQuery) {
    return this.notifications.list(user.userId, q.cursor);
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  async unreadCount(@CurrentUser() user: { userId: string }) {
    return { count: await this.notifications.unreadCount(user.userId) };
  }

  @Post(':id/read')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async markRead(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    await this.notifications.markRead(user.userId, id);
  }

  @Post('read-all')
  @HttpCode(204)
  @UseGuards(JwtAuthGuard)
  async markAllRead(@CurrentUser() user: { userId: string }) {
    await this.notifications.markAllRead(user.userId);
  }

  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  stream(@CurrentUser() user: { userId: string }): Observable<SseMessage> {
    return this.stream.connect(user.userId);
  }
}
```
NOTE: route order — `@Get('unread-count')` is declared before any `:id` GET; there is no `GET :id` here so no conflict. `@Sse('stream')` path is `/notifications/stream`.

- [ ] **Step 4: Module** `apps/api/src/notifications/notifications.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { FollowsService } from './follows.service';
import { NotificationsService } from './notifications.service';
import { NotificationStreamService } from './notification-stream.service';
import { FollowsController } from './follows.controller';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [PrismaModule],
  controllers: [FollowsController, NotificationsController],
  providers: [FollowsService, NotificationsService, NotificationStreamService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 5: app.module** — `apps/api/src/app.module.ts`：import `import { NotificationsModule } from './notifications/notifications.module';`，在 `imports` 数组（`CommentsModule,` 后）加 `NotificationsModule,`。

- [ ] **Step 6: 验证** — `pnpm --filter @blog/api typecheck` → PASS；`pnpm --filter @blog/api build` → clean；`eslint --fix`+`eslint "src/notifications/**/*.ts"` → 0 errors。

- [ ] **Step 7: 提交**
```bash
git add apps/api/src/notifications/dto apps/api/src/notifications/follows.controller.ts apps/api/src/notifications/notifications.controller.ts apps/api/src/notifications/notifications.module.ts apps/api/src/app.module.ts
git commit -m "feat(api): follows + notifications controllers, SSE stream, module wiring"
```

---

## Task 7: 接入 CommentsService（评论 → 通知）

**Files:** Modify `apps/api/src/comments/comments.service.ts`, `comments.module.ts`, `comments.service.spec.ts`.

- [ ] **Step 1: 更新单测** — `apps/api/src/comments/comments.service.spec.ts`

在顶部 mock 区加（与既有 `prismaMock` 同级）：
```ts
const notificationsMock = { notifyForNewComment: jest.fn() };
```
两个 `Test.createTestingModule` 的 `providers` 里都加一项（在 `{ provide: PrismaService, ... }` 之后）：
```ts
        { provide: require('../notifications/notifications.service').NotificationsService, useValue: notificationsMock },
```
（或在文件顶部 `import { NotificationsService } from '../notifications/notifications.service';` 后用 `{ provide: NotificationsService, useValue: notificationsMock }`——优先用顶部 import 形式。）
并在 create 的 `beforeEach` 里 `jest.resetAllMocks()` 已存在，保持。新增一条断言测试：
```ts
  it('emits a new-comment notification after creating', async () => {
    tx.post.findUnique.mockResolvedValue({ id: 'p1' });
    tx.comment.create.mockResolvedValue(authorRow());
    tx.post.update.mockResolvedValue({});
    await service.create('u1', 'p1', { contentMd: 'hi' });
    expect(notificationsMock.notifyForNewComment).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c-new', postId: 'p1', authorId: 'u1', parentId: null }),
    );
  });
```

- [ ] **Step 2: 确认失败** — `pnpm --filter @blog/api test -- comments.service` → FAIL（DI 缺失 / 未调用）。

- [ ] **Step 3: 注入并调用** — `apps/api/src/comments/comments.service.ts`

加 import：`import { NotificationsService } from '../notifications/notifications.service';`
构造函数改为：
```ts
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}
```
`create` 方法：把事务返回值改为同时带出创建行，并在事务后发通知。将事务块与返回改成：
```ts
    const { view, created } = await this.prisma.$transaction(
      async (tx): Promise<{ view: CommentView; created: CommentRow }> => {
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
            parentId = parent.id;
          } else {
            parentId = parent.parentId;
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

        const created = await tx.comment.create({
          data: { postId, authorId: userId, parentId, quotedId, contentMd: input.contentMd },
          include: COMMENT_INCLUDE,
        });
        await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
        return { view: toCommentView(created, false, 0, []), created };
      },
    );

    await this.notifications.notifyForNewComment({
      id: created.id,
      postId: created.postId,
      authorId: created.authorId,
      parentId: created.parentId,
      quotedId: created.quotedId,
    });
    return view;
```
需要 `CommentRow` 类型：在文件顶部的 mapper import 里补上 `type CommentRow`：`import { COMMENT_INCLUDE, toCommentView, type CommentRow } from './comment.mapper';`

- [ ] **Step 4: 模块** — `apps/api/src/comments/comments.module.ts`：import `import { NotificationsModule } from '../notifications/notifications.module';`，`imports: [PrismaModule, NotificationsModule]`。

- [ ] **Step 5: 通过** — `pnpm --filter @blog/api test -- comments.service` → 所有 create/update/remove 测试 PASS（含新增的通知断言）。

- [ ] **Step 6: typecheck + lint** — `pnpm --filter @blog/api typecheck` → PASS；`eslint --fix`+`eslint "src/comments/**/*.ts"` → 0 errors。

- [ ] **Step 7: 提交**
```bash
git add apps/api/src/comments/comments.service.ts apps/api/src/comments/comments.module.ts apps/api/src/comments/comments.service.spec.ts
git commit -m "feat(api): emit comment notifications from CommentsService.create"
```

---

## Task 8: 接入 PostsService（发布 → NEW_POST 扇出）

**Files:** Modify `apps/api/src/blog/posts.service.ts`, `blog.module.ts`, `posts.service.spec.ts`.

- [ ] **Step 1: 更新单测** — `apps/api/src/blog/posts.service.spec.ts`

此文件按方法分多个 `describe`，每个都有自己的 `Test.createTestingModule`。因为 `PostsService` 现在多了一个构造依赖，**每一个** `createTestingModule` 的 `providers` 都必须加 `NotificationsService` mock，否则该 describe 的 service 构造会失败。

文件顶部加：
```ts
import { NotificationsService } from '../notifications/notifications.service';
```
在现有 `prismaMock` 常量附近加：
```ts
const notificationsMock = { notifyNewPost: jest.fn() };
```
在**每个** `providers: [ PostsService, { provide: PrismaService, useValue: prismaMock } ]` 数组里追加一项：
```ts
        { provide: NotificationsService, useValue: notificationsMock },
```
在覆盖 update 的 describe（含发布转变的测试）里新增一条断言（`like.findUnique` 供 `viewerLiked` 用，返回 null 即可）：
```ts
  it('fans out NEW_POST when a draft transitions to PUBLISHED', async () => {
    prismaMock.post.findUnique.mockResolvedValue({
      id: 'p1', authorId: 'u1', status: 'DRAFT', publishedAt: null,
      title: 'T', contentMd: '# h', tags: [],
    });
    prismaMock.post.update.mockResolvedValue({
      id: 'p1', slug: 's', title: 'T', summary: null, contentMd: '# h', tags: [],
      status: 'PUBLISHED', likeCount: 0, commentCount: 0, authorId: 'u1',
      publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), author,
    });
    prismaMock.like.findUnique.mockResolvedValue(null);
    await service.update('p1', 'u1', { status: 'PUBLISHED' });
    expect(notificationsMock.notifyNewPost).toHaveBeenCalledWith({ id: 'p1', authorId: 'u1' });
  });
```
NOTE: mirror the file's existing `update` mock shape if fields differ; the key assertion is `notifyNewPost` called with `{ id, authorId }`. Also add a companion check that a no-op update (already PUBLISHED) does NOT call `notifyNewPost`, if the file already has an "update published post" test — assert `notificationsMock.notifyNewPost` not called there.

- [ ] **Step 2: 确认失败** — `pnpm --filter @blog/api test -- posts.service` → FAIL。

- [ ] **Step 3: 注入并调用** — `apps/api/src/blog/posts.service.ts`

加 import：`import { NotificationsService } from '../notifications/notifications.service';`
构造函数加参数（在现有依赖之后）：
```ts
    private readonly notifications: NotificationsService,
```
（若构造函数当前只有 `private readonly prisma: PrismaService`，改为两参数列表。）
在 `update` 方法中，于计算 publish 转变处提取布尔，并在 `prisma.post.update` 之后调用扇出。具体：在 `const data: Prisma.PostUpdateInput = {};` 之后加：
```ts
    const isPublishing =
      input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
```
并把原有的 `if (input.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {` 改用该布尔：`if (isPublishing) {`。
在 `const post = await this.prisma.post.update({...});` 之后、`const viewerLiked` 之前加：
```ts
    if (isPublishing) {
      await this.notifications.notifyNewPost({ id: post.id, authorId: post.authorId });
    }
```

- [ ] **Step 4: 模块** — `apps/api/src/blog/blog.module.ts`：import `import { NotificationsModule } from '../notifications/notifications.module';`，把它加入 `imports`（与 `PrismaModule` 并列）。

- [ ] **Step 5: 通过** — `pnpm --filter @blog/api test -- posts.service` → PASS。

- [ ] **Step 6: typecheck + lint** — `pnpm --filter @blog/api typecheck` → PASS；`eslint --fix`+`eslint "src/blog/**/*.ts"` → 0 errors。

- [ ] **Step 7: 提交**
```bash
git add apps/api/src/blog/posts.service.ts apps/api/src/blog/blog.module.ts apps/api/src/blog/posts.service.spec.ts
git commit -m "feat(api): fan out NEW_POST notifications on publish transition"
```

---

## Task 9: e2e（关注 + 通知 + SSE）

**Files:** Create `apps/api/test/notifications.e2e-spec.ts`.

- [ ] **Step 1: 写 e2e** `apps/api/test/notifications.e2e-spec.ts`:
```ts
import http from 'node:http';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { createTestApp, resetDb } from './setup';

type Agent = ReturnType<typeof request.agent>;

const author = { email: 'author@test.com', password: 'password123', nickname: 'Author' };
const reader = { email: 'reader@test.com', password: 'password123', nickname: 'Reader' };

async function newAgent(app: INestApplication, creds: typeof author): Promise<Agent> {
  const agent = request.agent(app.getHttpServer());
  await agent.post('/auth/register').send(creds).expect(201);
  return agent;
}

async function userId(agent: Agent): Promise<string> {
  const me = await agent.get('/me').expect(200);
  return me.body.id as string;
}

async function publishedPost(agent: Agent): Promise<string> {
  const created = await agent
    .post('/posts')
    .send({ title: 'Topic', contentMd: '# Hi', tags: ['t'] })
    .expect(201);
  await agent.patch(`/posts/${created.body.id}`).send({ status: 'PUBLISHED' }).expect(200);
  return created.body.id as string;
}

describe('Subscriptions & notifications (e2e)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await createTestApp({ disableThrottle: true });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('follow toggles and rejects self-follow', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const aId = await userId(a);

    const f1 = await r.post(`/users/${aId}/follow`).expect(200);
    expect(f1.body).toEqual({ following: true, followerCount: 1 });
    const f2 = await r.post(`/users/${aId}/follow`).expect(200);
    expect(f2.body).toEqual({ following: false, followerCount: 0 });

    await a.post(`/users/${aId}/follow`).expect(400); // self-follow
  });

  it('followed author publishing notifies the follower (NEW_POST)', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const aId = await userId(a);
    await r.post(`/users/${aId}/follow`).expect(200);

    await publishedPost(a);

    const list = await r.get('/notifications').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].type).toBe('NEW_POST');
    const unread = await r.get('/notifications/unread-count').expect(200);
    expect(unread.body.count).toBe(1);
  });

  it('commenting on a post notifies the post author; replying notifies the comment author', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const postId = await publishedPost(a);

    // reader comments on author's post -> author gets POST_COMMENT
    const top = await r.post(`/posts/${postId}/comments`).send({ contentMd: 'nice' }).expect(201);
    const authorNotifs = await a.get('/notifications').expect(200);
    expect(authorNotifs.body.items[0].type).toBe('POST_COMMENT');

    // author replies to reader's comment -> reader gets COMMENT_REPLY
    await a.post(`/posts/${postId}/comments`).send({ contentMd: 'thanks', parentId: top.body.id }).expect(201);
    const readerNotifs = await r.get('/notifications').expect(200);
    expect(readerNotifs.body.items[0].type).toBe('COMMENT_REPLY');
  });

  it('does not notify yourself for your own comment', async () => {
    const a = await newAgent(app, author);
    const postId = await publishedPost(a);
    await a.post(`/posts/${postId}/comments`).send({ contentMd: 'self' }).expect(201);
    const list = await a.get('/notifications').expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('mark read (single + all); cannot mark another user notification', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const aId = await userId(a);
    await r.post(`/users/${aId}/follow`).expect(200);
    await publishedPost(a);

    const list = await r.get('/notifications').expect(200);
    const nId = list.body.items[0].id as string;

    await a.post(`/notifications/${nId}/read`).expect(403); // not author's notification
    await r.post(`/notifications/${nId}/read`).expect(204);
    const unread = await r.get('/notifications/unread-count').expect(200);
    expect(unread.body.count).toBe(0);

    await r.post('/notifications/read-all').expect(204);
  });
});

describe('Notifications SSE (e2e)', () => {
  let app: INestApplication;
  let port: number;
  beforeAll(async () => {
    app = await createTestApp({ disableThrottle: true });
    await app.listen(0);
    port = (app.getHttpServer().address() as { port: number }).port;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(app);
  });

  it('streams a NEW_POST notification to a connected follower', async () => {
    const a = await newAgent(app, author);
    const r = await newAgent(app, reader);
    const aId = await userId(a);
    await r.post(`/users/${aId}/follow`).expect(200);

    // grab reader's access_token cookie to authenticate the raw SSE request
    const reg = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: reader.email, password: reader.password })
      .expect(200);
    const cookies = (reg.headers['set-cookie'] as unknown as string[]) ?? [];
    const accessCookie = cookies.map((c) => c.split(';')[0]).find((c) => c.startsWith('access_token='));
    expect(accessCookie).toBeDefined();

    const received = new Promise<string>((resolve, reject) => {
      const req = http.get(
        { host: '127.0.0.1', port, path: '/notifications/stream', headers: { Cookie: accessCookie as string } },
        (res) => {
          res.setEncoding('utf8');
          let buf = '';
          res.on('data', (chunk: string) => {
            buf += chunk;
            if (buf.includes('NEW_POST')) {
              req.destroy();
              resolve(buf);
            }
          });
        },
      );
      req.on('error', (e) => {
        // destroy() after resolve triggers ECONNRESET — ignore once resolved
        if (!String(e).includes('ECONNRESET')) reject(e);
      });
      setTimeout(() => {
        req.destroy();
        reject(new Error('SSE timeout: no event received'));
      }, 4000);
    });

    // give the stream a moment to register, then trigger
    await new Promise((r2) => setTimeout(r2, 200));
    await publishedPost(a);

    const payload = await received;
    expect(payload).toContain('NEW_POST');
  });
});
```
NOTE: the SSE describe `app.listen(0)` opens a real port so a raw `http.get` can read the stream (supertest can't assert a never-ending stream). `disableThrottle` keeps both suites deterministic. If `/me` route differs, use whatever endpoint returns the current user id (check `apps/api/src/users` / auth controller).

- [ ] **Step 2: 跑 e2e** — `pnpm --filter @blog/api test:e2e -- notifications`
Expected: 两个 describe 全 PASS。若 SSE 用例偶发超时，确认 stream describe 用的是独立 `app.listen(0)` 实例且触发前有 200ms 注册延时。

- [ ] **Step 3: 全量 e2e 不回归** — `pnpm --filter @blog/api test:e2e`
Expected: 全部 suites PASS。

- [ ] **Step 4: lint** — `eslint --fix`+`eslint "test/notifications.e2e-spec.ts"` → 0 errors（warnings 允许）。

- [ ] **Step 5: 提交**
```bash
git add apps/api/test/notifications.e2e-spec.ts
git commit -m "test(api): notifications e2e — follow, three triggers, mark-read, SSE stream"
```

---

## Task 10: Web API 客户端

**Files:** Create `apps/web/src/lib/notifications.ts`.

- [ ] **Step 1: 实现** `apps/web/src/lib/notifications.ts`:
```ts
import { api } from "./api";
import type { FollowResult, NotificationListResult, UnreadCountResult } from "@blog/shared";

export function toggleFollow(userId: string): Promise<FollowResult> {
  return api<FollowResult>(`/users/${userId}/follow`, { method: "POST" });
}

export function getFollow(userId: string): Promise<FollowResult> {
  return api<FollowResult>(`/users/${userId}/follow`);
}

export function listNotifications(cursor?: string): Promise<NotificationListResult> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return api<NotificationListResult>(`/notifications${qs}`);
}

export function fetchUnreadCount(): Promise<UnreadCountResult> {
  return api<UnreadCountResult>(`/notifications/unread-count`);
}

export function markNotificationRead(id: string): Promise<void> {
  return api<void>(`/notifications/${id}/read`, { method: "POST" });
}

export function markAllNotificationsRead(): Promise<void> {
  return api<void>(`/notifications/read-all`, { method: "POST" });
}

/** Base URL for the SSE EventSource (EventSource can't go through fetch's `api`). */
export const NOTIFICATIONS_STREAM_URL = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/notifications/stream`;
```

- [ ] **Step 2: 验证** — `pnpm --filter @blog/web typecheck` → PASS（如失败先 `pnpm --filter @blog/shared build`）；`pnpm --filter @blog/web lint` → 0 errors。

- [ ] **Step 3: 提交**
```bash
git add apps/web/src/lib/notifications.ts
git commit -m "feat(web): notifications + follow API client"
```

---

## Task 11: FollowButton + 挂到文章页

**Files:** Create `apps/web/src/components/FollowButton.tsx`; Modify `apps/web/src/app/posts/[slug]/page.tsx`.

> 写前端前读 `apps/web/AGENTS.md`（Next.js 16 破坏性变更）。`apps/web` 无测试 runner → typecheck + lint + `next build` 收口。

- [ ] **Step 1: FollowButton** `apps/web/src/components/FollowButton.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ApiClientError } from "@/lib/api";
import { getFollow, toggleFollow } from "@/lib/notifications";

export function FollowButton({ authorId }: { authorId: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [following, setFollowing] = useState(false);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getFollow(authorId)
      .then((r) => {
        if (!active) return;
        setFollowing(r.following);
        setCount(r.followerCount);
        setReady(true);
      })
      .catch(() => active && setReady(true));
    return () => {
      active = false;
    };
  }, [authorId]);

  // Don't show a follow button on your own posts.
  if (user?.id === authorId) return null;

  async function toggle() {
    if (!user) return router.push("/login");
    if (busy) return;
    setBusy(true);
    const pf = following;
    const pc = count;
    setFollowing(!pf);
    setCount(pc + (pf ? -1 : 1));
    try {
      const r = await toggleFollow(authorId);
      setFollowing(r.following);
      setCount(r.followerCount);
    } catch (e) {
      setFollowing(pf);
      setCount(pc);
      if (e instanceof ApiClientError && (e.code === "TOKEN_INVALID" || e.code === "TOKEN_EXPIRED")) {
        router.push("/login");
        return;
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy || !ready}
      className="rounded-full border px-4 py-1 text-sm disabled:opacity-50"
      style={{ borderColor: "var(--border)", color: following ? "var(--text-3)" : "var(--text-1)" }}
    >
      {following ? "已关注" : "关注"} · {count}
    </button>
  );
}
```

- [ ] **Step 2: 挂载** — `apps/web/src/app/posts/[slug]/page.tsx`

顶部加 `import { FollowButton } from "@/components/FollowButton";`。
在渲染作者的那行（`{post.author.nickname} · ...`）所在元素之后插入：
```tsx
      <div className="mt-2"><FollowButton authorId={post.author.id} /></div>
```

- [ ] **Step 3: 验证** — `pnpm --filter @blog/web typecheck` → PASS；`pnpm --filter @blog/web lint` → 0 errors。

- [ ] **Step 4: 提交**
```bash
git add apps/web/src/components/FollowButton.tsx "apps/web/src/app/posts/[slug]/page.tsx"
git commit -m "feat(web): FollowButton on post page"
```

---

## Task 12: NotificationBell + 头部挂载 + SSE

**Files:** Create `apps/web/src/components/NotificationBell.tsx`; Modify `apps/web/src/app/layout.tsx`.

- [ ] **Step 1: NotificationBell** `apps/web/src/components/NotificationBell.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NotificationView } from "@blog/shared";
import { useAuth } from "@/lib/auth-context";
import {
  NOTIFICATIONS_STREAM_URL,
  fetchUnreadCount,
  listNotifications,
  markAllNotificationsRead,
} from "@/lib/notifications";

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

export function NotificationBell() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      setItems([]);
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
    // EventSource auto-reconnects on transient errors; nothing to do here.
    return () => {
      active = false;
      es.close();
    };
  }, [user]);

  if (!user) return null;

  async function markAll() {
    await markAllNotificationsRead();
    setUnread(0);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} style={{ color: "var(--text-2)" }} aria-label="通知">
        🔔{unread > 0 ? ` ${unread}` : ""}
      </button>
      {open && (
        <div
          className="absolute right-0 mt-2 w-80 rounded-md border p-3 z-10"
          style={{ borderColor: "var(--border)", background: "var(--surface)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>通知</span>
            <button onClick={markAll} className="text-xs" style={{ color: "var(--text-2)" }}>全部已读</button>
          </div>
          <div className="mt-2 max-h-96 overflow-auto">
            {items.length === 0 ? (
              <p className="text-xs italic" style={{ color: "var(--text-3)" }}>暂无通知</p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={hrefOf(n)}
                  onClick={() => setOpen(false)}
                  className="block py-2 text-sm"
                  style={{ color: n.read ? "var(--text-3)" : "var(--text-1)" }}
                >
                  {messageOf(n)}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 挂头部** — `apps/web/src/app/layout.tsx`

顶部加 `import { NotificationBell } from "@/components/NotificationBell";`。
把右侧的搜索链接所在区域改为同时含铃铛——将：
```tsx
            <Link href="/search" style={{ color: "var(--text-2)" }}>
              搜索
            </Link>
```
替换为：
```tsx
            <div className="flex items-center gap-4">
              <Link href="/search" style={{ color: "var(--text-2)" }}>
                搜索
              </Link>
              <NotificationBell />
            </div>
```

- [ ] **Step 3: 验证** — `pnpm --filter @blog/web typecheck` → PASS；`pnpm --filter @blog/web lint` → 0 errors。

- [ ] **Step 4: next build（渲染冒烟）** — `pnpm --filter @blog/web build` → 成功（layout 含 NotificationBell、post 页含 FollowButton）。

- [ ] **Step 5: 手动验证（dev）** — `pnpm dev`，两个浏览器会话（或隐身窗）登录两个账号：
  - 账号 B 关注账号 A（文章页关注按钮 → 已关注 + 计数 +1）。
  - A 发布新文章 → B 的铃铛实时 +1（SSE），面板出现"A 发布了新文章…"。
  - B 评论 A 的文章 → A 实时收到"B 评论了你的文章…"。
  - A 回复 B 的评论 → B 实时收到"B…回复了你的评论"（A 不应因这条回复再收到通知）。
  - "全部已读" → 红点清零。

- [ ] **Step 6: 提交**
```bash
git add apps/web/src/components/NotificationBell.tsx apps/web/src/app/layout.tsx
git commit -m "feat(web): NotificationBell with SSE live updates in header"
```

---

## Task 13: 全量校验

- [ ] **Step 1: shared 重建** — `pnpm --filter @blog/shared build` → clean。
- [ ] **Step 2: verify 门禁** — `pnpm verify` → lint + typecheck + 单测全绿。
- [ ] **Step 3: 全量 e2e** — `pnpm --filter @blog/api test:e2e` → 全 PASS。
- [ ] **Step 4: 收尾提交（若有零散改动）**
```bash
git add -A && git commit -m "chore(m4b): finalize subscriptions & notifications" || echo "nothing to commit"
```

---

## Self-Review 记录

**Spec 覆盖：**
- 关注作者（幂等切换、禁自关注、关注数）→ Task 4 + Task 6（controller）+ Task 11（UI）+ e2e Task 9。
- 三类通知触发（顶层评论→文章作者、回复→被回复者、发布→关注者）→ Task 5（规则）+ Task 7/8（接入）+ e2e Task 9。
- 不自我通知、回复不通知文章作者、≤1 通知/接收者 → Task 5 单测 + e2e。
- 通知中心（未读数、列表游标分页、标记已读/全部已读、分类派生）→ Task 5 + Task 6 + Task 12（UI）。
- SSE 实时推送完整 NotificationView → Task 3 + Task 6（@Sse）+ Task 12（EventSource）+ e2e Task 9 SSE。
- 通知失败不阻断触发动作 → Task 5（规则方法 try/catch swallow）+ 单测断言。
- cookie 鉴权 SSE、统一错误、登录门控、参数校验 → Task 6 + 新错误码 Task 1。
- 测试三件套（单测 Task 3/4/5/7/8 + e2e Task 9 含 SSE）。

**与 spec 偏差**已在文首列明（单一 notifyForNewComment、emit 循环替代 createMany、SseMessage 本地接口）。

**类型一致性：** `NotificationView`/`FollowResult`/`NotificationListResult`/`UnreadCountResult` 在 shared 定义，service/mapper/controller/web 全程同名引用；`emit(userId, type, refs)`、`notifyForNewComment(NewComment)`、`notifyNewPost({id,authorId})`、`toggle(followerId,authorId)`、`status(viewerId?,authorId)`、`listFollowerIds(authorId)` 签名跨任务一致；`SseMessage { data: NotificationView }` 在 stream service 定义并被 controller 引用。

**无占位符：** 每个 code step 均含完整代码 + 确切命令/预期；唯 Task 8 的 posts.service.spec 因需匹配既有 mock 形态留了"镜像既有风格"指引（已给出所需 mock 返回值与断言）。
```
