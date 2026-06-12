# M4a — 评论核心（Comments Core）设计

> 日期：2026-06-12 ｜ 作者：tangziyu ｜ 状态：已确认，待写实现计划
> 上游：`docs/prd.md` §3.3（互动 - 评论）｜ 前端规范：`.claude/skills/nextjs/SKILL.md`

## 0. 背景与范围切分

"M4 social" 涵盖四个相对独立的子系统，PRD 本身将它们分散在 P0/P1。按依赖关系拆为 3 个 spec，各自独立 spec → plan → 实现：

- **M4a 评论核心（本文）**：楼中楼（两级）+ 评论点赞 + 编辑/删除 + Markdown 子集 + XSS。
- **M4b 订阅与通知**：关注作者/标签 + 通知中心 + WebSocket 实时 + 邮件扇出（BullMQ）。消费评论与关注事件。
- **M4c 划线评论**：选中文本锚定（偏移 + 前后文指纹）+ 正文高亮渲染 + 侧栏。建立在 M4a 之上。

本文只覆盖 **M4a**。M4a 不产生任何通知；M4b 才把"评论被回复"事件接入通知管道。

## 1. 目标与验收标准

- 登录用户可在文章下发表顶层评论、回复评论、回复某条回复（带 @提及 + 引文）。
- 评论支持 Markdown 子集（粗体 / 行内代码 / 链接），全量 XSS 过滤，恶意 HTML 永不进入 DOM。
- 评论可点赞/取消（幂等切换），计数不漂移。
- 评论作者可编辑自己的评论（标注"已编辑"）；评论作者本人或**文章作者**可删除评论。
- 删除为软删除墓碑，保留楼层结构，回复与引文不丢锚点。
- `Post.commentCount` 只统计可见评论，与真实数据一致。
- 写接口全部需登录 + 参数校验 + 每用户限流；统一错误结构 `{code,message,traceId}`。
- 服务层单测 + API e2e + 前端渲染 XSS 单测全绿（`pnpm verify`）。

## 2. 既有约定（必须复用，勿造平行实现）

- **点赞模式**：`apps/api/src/blog/likes.service.ts` 已确立——事务内 `createMany({skipDuplicates})` / `deleteMany` + 行上去归一化计数器，竞态安全、计数不漂移。评论点赞**完全照搬**此模式，不引入 Redis 计数。
- **Markdown 渲染哲学**：`apps/web/src/components/MarkdownRenderer.tsx` 与 `apps/web/src/lib/sanitize-highlight.ts`——**转义一切，只输出已知安全结构**，从不把用户原始 HTML 注入 DOM。评论渲染沿用此"白名单构造"思路，不引入 DOMPurify 等重型依赖。
- **错误结构**：`packages/shared`（`ApiError` / `ApiResponse` / `ErrorCode`）+ `apps/api/src/common/app-error.ts` 的 `AppError`。
- **登录门控**：后端复用现有 JWT guard；前端复用 `apps/web/src/lib/use-require-auth.ts`。
- **前端视觉**：Naturalist Journal 单色极简——Lora 正文、`#E8E0D4` 边框、Lora 斜体小字做次要信息。
- **Next.js 注意**：`apps/web/AGENTS.md` 声明此版本 Next.js 有破坏性变更，写前端前先读 `node_modules/next/dist/docs/` 对应指南。

## 3. 数据模型（Prisma，单次 migration）

```prisma
model Comment {
  id        String        @id @default(cuid())
  postId    String
  post      Post          @relation(fields: [postId], references: [id], onDelete: Cascade)
  authorId  String
  author    User          @relation(fields: [authorId], references: [id])
  parentId  String?       // null = 顶层；非 null = 回复（恰好一级，服务层强制）
  parent    Comment?      @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[]     @relation("CommentReplies")
  quotedId  String?       // 可选：被引用的评论（@提及 + 引文）
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

`Post` 增加 `commentCount Int @default(0)`（只计 VISIBLE）。`User` 增加 `comments Comment[]` / `commentLikes CommentLike[]` 反向关系。

**两级约束**：`parentId` 只能指向顶层评论（其 `parentId` 必为 null）。回复某条回复时，服务层把 `parentId` 改写为该回复所属的顶层评论，`quotedId` 指向真正被回复的目标。删除顶层评论用墓碑而非真删，所以 `onDelete: Cascade` 在 `parent` 关系上只在硬删时兜底，正常路径不触发。

## 4. API（NestJS 新 `comments` 模块）

DTO 一律 class-validator 校验；`contentMd` 非空、长度上限（建议 2000 字符，超出报 `COMMENT_TOO_LONG`）。

| 方法 & 路径 | 说明 | 鉴权 |
|---|---|---|
| `POST /posts/:postId/comments` | 创建顶层或回复（body：`contentMd`、`parentId?`、`quotedId?`） | 需登录 |
| `GET /posts/:postId/comments` | 游标分页顶层评论（**newest-first**），每条内嵌前 3 条回复（**oldest-first**）+ `replyCount` + 当前用户 `liked` 标记 | 公开（带 token 则填 `liked`） |
| `GET /comments/:id/replies` | 游标分页某顶层评论的回复（oldest-first），"加载更多回复" | 公开 |
| `PATCH /comments/:id` | 编辑自己的评论 → 置 `editedAt` | 需登录 + 本人 |
| `DELETE /comments/:id` | 软删除墓碑：置 `status=DELETED`、清空 `contentMd`、`commentCount` 减一 | 需登录 + 评论作者**或**文章作者 |
| `POST /comments/:id/like` | 幂等点赞切换，事务内改计数 | 需登录 |

**计数完整性**：所有改动行 + 计数的操作放在同一 `prisma.$transaction` 内，照搬 `LikesService` 的 `createMany/deleteMany` count 驱动增减，绝不二次增减。创建可见评论时 `Post.commentCount` +1；软删除时 -1。

**限流**：每用户评论创建做简单速率限制（per-user 计数窗口，例如 10 条 / 分钟），超出报 `RATE_LIMITED`。读接口不限流。

**新错误码**（加入 `packages/shared` 的 `ErrorCode`）：`COMMENT_NOT_FOUND`(404)、`COMMENT_TOO_LONG`(400)、`COMMENT_FORBIDDEN`(403)、`RATE_LIMITED`(429)。

## 5. 渲染与 XSS（web）

- 存储原始 `contentMd`，**读时渲染**（与文章 `contentMd` 一致）。
- 新增客户端安全的 `renderCommentMarkdown`：先转义所有 HTML 特殊字符，再对子集做白名单变换——
  - `**粗体**` → `<strong>`
  - `` `行内代码` `` → `<code>`
  - `[文本](url)` → `<a>`，仅允许 `http(s)://` 协议，强制 `rel="noopener noreferrer nofollow"` + `target="_blank"`；非法协议（`javascript:` 等）降级为纯文本。
  - 换行 → `<br>`。
- 任何用户原始 HTML 永不进入 DOM。墓碑评论渲染为淡色 *[已删除]*，隐藏点赞/回复操作。
- 引文（quoted）渲染为评论顶部的一段折叠引用块（被引用者昵称 + 截断片段），点击可定位原评论。

## 6. 前端 UI（`apps/web`）

文章页（`apps/web/src/app/posts/[slug]`）下新增客户端组件 `CommentSection`：

- **Composer**：未登录点击触发 `use-require-auth` 引导登录；Markdown 子集提示。
- **线程列表**：顶层评论卡片（作者昵称/头像、Lora 斜体相对时间、"已编辑"标注、`renderCommentMarkdown` 正文、点赞数+按钮）。
- **回复区**：每个顶层下展示前 3 条回复（oldest-first），带引文块；"查看全部 N 条回复"调 `GET /comments/:id/replies` 加载更多。
- **操作**：点赞切换；本人评论显示编辑/删除；文章作者对任意评论显示删除。权限由当前用户 id 与文章 authorId 在前端判定（后端仍是唯一权威）。
- **分页**："加载更多评论"游标翻页顶层。
- 视觉遵循 Naturalist Journal：白卡 `#FFFFFF`、边框 `#E8E0D4`、次要信息 Lora 斜体小字、不使用彩色标签。

## 7. 测试（铁律 6）

**服务层单测**
- 两级约束：回复一条回复时 `parentId` 被改写为顶层、`quotedId` 指向目标。
- 墓碑删除：删顶层后回复仍可读、`commentCount` 正确减一、内容被清空。
- 点赞幂等：重复点赞不重复计数、并发取消不二次减。
- 权限矩阵：评论作者可编辑/删；文章作者可删任意；他人不可编辑、不可删。

**API e2e**
- 创建/列表/回复/编辑/删除/点赞 happy path。
- 鉴权失败（未登录写）、校验失败（超长、空内容）、越权（删他人评论）、限流触发。

**前端单测**
- `renderCommentMarkdown` XSS：`<script>`、`<img onerror=...>`、`javascript:` 链接、`<a onclick=...>` 注入全部保持转义/降级，DOM 不含可执行内容。
- 子集正确性：粗体/行内代码/合法链接正确渲染且带安全 `rel`。

## 8. 明确不做（留给后续切分）

- 划线/选区锚定与正文高亮 → **M4c**。
- 关注、通知中心、WebSocket、邮件扇出 → **M4b**；M4a 不发任何通知，只在数据层为 M4b 留好"回复"事件来源。
- 评论的富文本（图片、@用户自动补全的真实用户检索）、举报、置顶——本切分不做。
```
