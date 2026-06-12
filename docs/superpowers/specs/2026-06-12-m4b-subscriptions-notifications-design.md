# M4b — 订阅与通知（Subscriptions & Notifications）设计

> 日期：2026-06-12 ｜ 作者：tangziyu ｜ 状态：已确认，待写实现计划
> 上游：`docs/prd.md` §3.4（订阅与通知）｜ 前置：M4a 评论核心（已合并）｜ 前端规范：`.claude/skills/nextjs/SKILL.md`

## 0. 背景与切分

"M4 social" 的第二切片。M4a（评论核心）已合并，其 spec 明确留了接口："M4b 才把评论事件接入通知管道"。本切片实现：关注作者 + 站内通知中心 + SSE 实时推送。第三切片 M4c（划线评论）独立。

**范围（已与用户确认）：**
- 关注：**仅作者**（不含标签）。
- 通知触发：① 顶层评论 → 文章作者；② 回复/引用 → 被回复评论的作者；③ 关注的作者发布新文章 → 其关注者。
- 渠道：站内通知中心 + SSE 实时推送。
- **明确不做（留作后续 seam）**：邮件渠道、标签订阅、点赞通知、BullMQ 扇出 + Redis pub/sub（多实例 SSE）。

**架构决策（已确认）：** 方案 A —— 同步、进程内、直接注入。不引入 BullMQ/独立 worker（遵守铁律 7 单体优先）。唯一的扇出路径（关注者发布）在个人博客规模下用 `createMany` 同步处理即可；BullMQ + Redis pub/sub 作为规模上来后的明确 seam。

## 1. 目标与验收标准

- 登录用户可关注/取关任意作者（幂等切换，禁止自关注）。文章页作者处显示关注按钮 + 关注数。
- 三类事件正确产生站内通知，且不自我通知、不重复通知（一条评论对单个接收者最多一条通知）。
- 通知中心：未读红点/计数、分类（互动/订阅）、列表（游标分页）、标记已读 / 全部已读。
- SSE：登录用户连接 `/notifications/stream`，新通知产生时实时收到**完整 NotificationView**，前端即时插入并 +1 未读；断线自动重连。
- 通知产生（含 SSE 推送）失败绝不阻断触发动作（评论/发布）本身。
- 统一错误结构 `{code,message,traceId}`；写接口参数校验 + 登录门控。
- 服务层单测 + API e2e（含 SSE 流断言）全绿（`pnpm verify` + e2e）。

## 2. 既有约定（必须复用，勿造平行实现）

- **幂等切换模式**：`apps/api/src/blog/likes.service.ts` / M4a `comment-likes.service.ts` —— 事务内 `createMany({skipDuplicates})`/`deleteMany` + 计数。关注切换照搬。
- **游标分页**：M4a `CommentsService.list` 的 `take+1` 过取 + `cursor:{id},skip:1` 模式。
- **统一错误**：`packages/shared` 的 `ErrorCode` + `apps/api/src/common/app-error.ts` 的 `AppError`。
- **Cookie 鉴权**：access token 在 httpOnly cookie `access_token`，`JwtAuthGuard`（jwt strategy）从 `req.cookies[ACCESS_COOKIE]` 提取。**SSE 因此天然可用 cookie 鉴权**——`EventSource(url, { withCredentials: true })` 跨源带 cookie，与现有 `api()` 的 `credentials: include` 同机制（CORS 已允许）。
- **前端 fetch 客户端**：`apps/web/src/lib/api.ts` 的 `api<T>`；乐观切换参考 `LikeButton.tsx`；登录态用 `auth-context` 的 `useAuth()`。
- **前端视觉**：Naturalist Journal 单色极简（CSS 变量 `--text-1/2/3`、`--border`、`--surface`、`--font-display/body`，斜体小字做次要信息）。
- **Next.js 注意**：`apps/web/AGENTS.md` —— 本仓库 Next.js 16 有破坏性变更，写前端前查 `node_modules/next/dist/docs/`。

## 3. 数据模型（Prisma，单次 migration）

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
  userId    String           // 接收者
  user      User             @relation("Recipient", fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  actorId   String?          // 触发者；系统通知为 null（暂未使用）
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
  POST_COMMENT   // 互动：有人评论了我的文章（顶层评论）
  COMMENT_REPLY  // 互动：有人回复/引用了我的评论
  NEW_POST       // 订阅：我关注的作者发布了新文章
}
```

`User` 增加反向关系：`following Follow[] @relation("Following")`、`followers Follow[] @relation("Followers")`、`notifications Notification[] @relation("Recipient")`、`actedNotifications Notification[] @relation("Actor")`。`Post` 增加 `notifications Notification[]`；`Comment` 增加 `notifications Notification[]`。

**分类映射**（`category` 由 `type` 派生，不入库）：互动 = `POST_COMMENT`/`COMMENT_REPLY`；订阅 = `NEW_POST`。

## 4. 通知产生规则（`NotificationsService`，被 Comments/Posts 直接注入调用）

- **顶层评论**（`parentId == null`）→ 给 `post.authorId` 发 `POST_COMMENT`，除非评论者 == 文章作者。
- **回复**（`parentId != null`）→ 给"被回复评论"的作者发 `COMMENT_REPLY`，除非该作者 == 回复者。被回复评论 = `quotedId` 指向者（M4a 中回复回复会把 `quotedId` 设为真正目标），否则 `parentId` 指向的顶层评论作者。**回复不再额外通知文章作者**（降噪，与两级模型一致；已与用户确认）。
- **发布**：文章 `status` 从非 `PUBLISHED` 变为 `PUBLISHED` 时（且此前不是 `PUBLISHED`）→ 对所有 `Follow.authorId == post.authorId` 的关注者 `createMany` 一批 `NEW_POST`。仅在"进入 PUBLISHED 的转变"触发（草稿创建、已发布文章的普通更新都不触发）。
- 每次 `emit` 写入通知行后，若接收者当前有 SSE 连接，推送该 `NotificationView`。
- **健壮性**：通知产生 + SSE 推送整体包在 try/catch，失败只记 pino 日志，**绝不抛出阻断评论创建 / 文章发布**。评论 1:1 通知在评论创建之后产生；发布扇出在发布提交之后产生。

## 5. API（新 `notifications` 模块）

模块内文件按职责拆分：`FollowsService`（关注切换/状态/关注者查询）、`NotificationsService`（emit + 列表/未读数/标记已读 + 三个高层规则方法 `notifyPostComment`/`notifyCommentReply`/`notifyNewPost`）、`NotificationStreamService`（SSE 连接管理）、`FollowsController`、`NotificationsController`。`NotificationsModule` 导出 `NotificationsService`（供 `CommentsModule`/`BlogModule` 注入）。无循环依赖：Comments/Blog → Notifications，Notifications 只依赖 Prisma + 自身 service。

| 方法 & 路径 | 说明 | 鉴权 |
|---|---|---|
| `POST /users/:id/follow` | 幂等关注切换 → `{ following, followerCount }`；自关注报 `CANNOT_FOLLOW_SELF` | 需登录 |
| `GET /users/:id/follow` | 当前 viewer 对该作者的 `{ following, followerCount }` | 公开（带 token 填 following） |
| `GET /notifications?cursor=` | 游标分页 `NotificationView[]`（newest-first），含 actor/post/comment 关联 | 需登录 |
| `GET /notifications/unread-count` | `{ count }` | 需登录 |
| `POST /notifications/:id/read` | 标记单条已读（仅本人；他人报 `FORBIDDEN`，不存在报 `NOTIFICATION_NOT_FOUND`） | 需登录 |
| `POST /notifications/read-all` | 当前用户全部未读置已读 | 需登录 |
| `GET /notifications/stream` | `@Sse()`，每条新通知推一个 `MessageEvent`（data = `NotificationView`） | 需登录（cookie） |

关注切换镜像点赞：事务内 `createMany({skipDuplicates})`/`deleteMany`，`followerCount` 由 `Follow` 计数（`count` 查询；作者维度的关注者数）。

**新错误码**（加入 `packages/shared` 的 `ErrorCode`）：`CANNOT_FOLLOW_SELF`(400)、`NOTIFICATION_NOT_FOUND`(404)。`USER_NOT_FOUND`(404) 若不存在则一并新增。复用既有 `FORBIDDEN`。

## 6. 共享类型（`packages/shared`）

```ts
export type NotificationType = 'POST_COMMENT' | 'COMMENT_REPLY' | 'NEW_POST';
export type NotificationCategory = 'interaction' | 'subscription';

export interface NotificationView {
  id: string;
  type: NotificationType;
  category: NotificationCategory;     // 由 type 派生
  actor: { id: string; nickname: string; avatarUrl: string | null } | null;
  post: { slug: string; title: string } | null;
  commentId: string | null;          // 回复类通知用于跳转/定位
  read: boolean;
  createdAt: string;                  // ISO
}

export interface NotificationListResult { items: NotificationView[]; nextCursor: string | null; }
export interface UnreadCountResult { count: number; }
export interface FollowResult { following: boolean; followerCount: number; }
```

通知文案**由前端按 `type` 组装**（控制在 web 层，便于改文案）：如 `POST_COMMENT` → "{actor} 评论了你的文章《{post.title}》"，`COMMENT_REPLY` → "{actor} 回复了你的评论"，`NEW_POST` → "{actor} 发布了新文章《{post.title}》"。服务端只给结构化字段。

## 7. SSE 投递

- `NotificationStreamService` 持有 `Map<string, Subject<MessageEvent>>`（key = userId）。
- `@Sse('notifications/stream')` handler：取/建当前用户的 Subject，返回其 `asObservable()`；连接关闭时 `complete()` 并从 Map 移除（用 RxJS `finalize` 或连接关闭钩子）。同一用户多标签页：value 用数组或每连接独立 Subject —— **实现取每连接独立 Subject**（一个 userId 对应一组连接），`emit` 时向该用户的所有连接推送。
- `NotificationsService.emit` 写库成功后调用 `stream.push(userId, view)`；未连接则 no-op。
- 推送内容 = 完整 `NotificationView`（已确认）。前端收到后 prepend + 未读 +1，无需回查。
- **单实例**（与 docker-compose 部署一致）。多实例需 Redis pub/sub 跨实例广播 —— 明确 seam，本切片不做。

## 8. 前端 UI（`apps/web`）

- **关注按钮**：文章页作者处 `FollowButton`（`{following ? '已关注' : '关注'}` + 关注数），乐观切换镜像 `LikeButton.tsx`（含 `busy` guard、`ApiClientError` 的 TOKEN_INVALID/EXPIRED → `/login`）；未登录点击跳登录。
- **通知铃铛**：全局头部 `NotificationBell`（仅登录显示）——未读红点/计数；点击展开面板列出最近通知 + "全部已读"。
- **实时**：登录后 `NotificationBell` 用 `new EventSource(`${API}/notifications/stream`, { withCredentials: true })` 订阅；收到事件 prepend 列表 + 未读 +1；`onerror` 时浏览器原生自动重连（必要时手动重建）。组件卸载/登出时 `close()`。
- 通知行：actor 昵称 + 按 type 组装的文案 + 相对时间 + 跳转链接（post slug，回复类带 `#comment-{commentId}` 锚点定位，best-effort）；未读行高亮。
- 视觉遵循 Naturalist Journal。

## 9. 测试

**服务层单测**
- 关注切换幂等（重复关注不重复计数、并发取关不二次减）；自关注报 `CANNOT_FOLLOW_SELF`。
- 通知规则：顶层评论通知文章作者、自评不通知；回复通知被回复者、自回复不通知、回复不通知文章作者；发布仅在"进入 PUBLISHED 转变"扇出、对全部关注者 `createMany`。
- 标记已读权限（仅本人）；未读计数。
- 通知产生异常被吞、不影响触发动作（mock NotificationsService 抛错，断言评论/发布仍成功）。

**API e2e**
- 关注 A → A 发布 → 关注者收到 `NEW_POST`（列表 + 未读数）。
- 评论他人文章 → 文章作者收到 `POST_COMMENT`；回复他人评论 → 被回复者收到 `COMMENT_REPLY`。
- 标记单条/全部已读；越权标记他人通知报 403。
- SSE：建立 `/notifications/stream` 连接 → 触发一条通知 → 断言收到一个 data 为该 `NotificationView` 的事件（用 supertest 或原生 http 读流，超时兜底）。

**M4a 既有测试触点**：`CommentsService`/`PostsService` 新增 `NotificationsService` 依赖 —— 既有 `comments.service.spec.ts`、posts 相关 spec、以及 e2e 的 `createTestApp` 需为这些 service 提供 `NotificationsService`（单测给 no-op mock；e2e 走真实模块）。

## 10. 明确不做（seam）

邮件渠道（SMTP/provider + 模板 + 退订）、标签订阅、点赞通知、BullMQ 异步扇出 + 死信、Redis pub/sub 多实例 SSE。这些都在本设计中预留了接入点，后续独立切片再做。
