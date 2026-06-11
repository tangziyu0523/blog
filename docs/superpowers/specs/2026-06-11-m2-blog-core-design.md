# M2 blog-core — 设计文档

> 日期：2026-06-11｜作者：tangziyu（brainstorm with Claude）｜状态：已评审，待写实施计划
> 范围：博客核心 P0 垂直切片——文章 CRUD、Tiptap 编辑器、点赞、文章列表 + 基础详情页、对接 M1 认证
> 参考：`docs/prd.md` §3.2/§3.3、`.claude/skills/nextjs/SKILL.md`、M1 既有代码

## 1. 目标与非目标

### 目标
- 博主能登录 → 写 Markdown 文章 → 存草稿 → 发布。
- 读者能看文章列表、读单篇文章（SSR + 代码高亮）、点赞/取消。
- 前端对接 M1 cookie 认证：会话上下文 + 登录/登出，编辑器与点赞按登录态门控。

### 非目标（本切片明确不做，留后续切片）
草稿自动保存、TOC、阅读进度条、阅读时长埋点、全文检索（FTS）、标签筛选 UI、
语义检索、评论、图片粘贴上传、注册页、个人资料编辑、OAuth 绑定合并 UI。

## 2. 关键决策（brainstorm 结论）

| 决策 | 选择 | 理由 |
|------|------|------|
| 正文存储格式 | **Markdown 字符串**（真相源） | Tiptap 配 markdown 序列化；SSR/Shiki、FTS、AI 总结都友好；与 PRD「Markdown 编辑器」一致 |
| 详情页范围 | **基础 SSR**（Markdown+Shiki + 点赞按钮） | 闭合 CRUD 环；TOC/进度/埋点留后 |
| 点赞并发 | **`Like` 复合主键去重 + 原子增减**，纯 DB | 唯一约束防重，`increment/decrement` 防丢更新，无行锁（「乐观锁」语义） |
| 前端认证 | **AuthContext(`GET /me`) + 登录/登出** | 后端已全备；门控编辑器与点赞即可闭环；不做注册页 |
| 编辑器草稿机制 | **显式 Save/Publish，无自动保存**（方案 A） | 最小状态闭合环；自动保存留后 |
| tags | **`String[]`**，不建 Tag 表 | 本切片不做标签筛选/FTS |
| 删除 | **硬删除**（级联 likes） | 不加软删除列 |

## 3. 数据模型（Prisma）

```prisma
model Post {
  id          String     @id @default(cuid())
  slug        String     @unique          // 从 title 生成，冲突加短后缀
  title       String
  summary     String?                      // 手填，AI 总结留后（铁律10 需标注）
  contentMd   String                       // Markdown 真相源
  tags        String[]                     // ≤5，Postgres text[]
  status      PostStatus @default(DRAFT)
  likeCount   Int        @default(0)       // 反范式计数，原子增减
  authorId    String
  author      User       @relation(fields: [authorId], references: [id])
  publishedAt DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt
  likes       Like[]

  @@index([status, publishedAt])
  @@index([authorId])
}

enum PostStatus {
  DRAFT
  PUBLISHED
}

model Like {
  userId    String
  postId    String
  createdAt DateTime @default(now())
  user      User @relation(fields: [userId], references: [id])
  post      Post @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@id([userId, postId])                   // 复合主键 = 去重
}
```

`User` 增加反向关系：`posts Post[]`、`likes Like[]`。
迁移走 `prisma migrate`，沿用 M1 的离线 baseline 模式（如 `0_init`），migration 文件进 git（铁律 3）。

## 4. API（NestJS）

新增 `BlogModule`，内含 `PostsService` + `LikesService` + `PostsController`（含点赞路由）。
成功返回**裸数据**（与 auth/users 约定一致），错误经全局过滤器输出 `{code,message,traceId}`。

### 4.1 文章路由 `@Controller('posts')`

| 路由 | 守卫 | 行为 |
|------|------|------|
| `POST /posts` | JwtAuth | 从 `{title, contentMd, tags?, summary?}` 建草稿，生成唯一 slug，返回 `PostDetail` |
| `GET /posts` | public | 已发布列表，分页 `?page&pageSize`；authed + `?mine=1` → 自己的（含草稿）。返回 `{items: PostSummary[], total, page, pageSize}`。（不做 tag 过滤——见非目标） |
| `GET /posts/:slug` | public | 已发布详情；作者可看自己的草稿。404 → `POST_NOT_FOUND`。返回 `PostDetail` |
| `PATCH /posts/:id` | JwtAuth + owner | 改 title/contentMd/tags/summary/status；置 `PUBLISHED` 时盖 `publishedAt`；非作者 → `FORBIDDEN`(403) |
| `DELETE /posts/:id` | JwtAuth + owner | 硬删除（级联 likes） |

### 4.2 点赞路由 `@Controller('posts/:id')`

| 路由 | 守卫 | 行为 |
|------|------|------|
| `POST /posts/:id/like` | JwtAuth | 幂等**切换**，返回 `{ liked: boolean, likeCount: number }` |

**切换逻辑**（单个 Prisma `$transaction`）：
1. 尝试 `like.create({ userId, postId })`。
   - 成功 → `post.update({ likeCount: { increment: 1 } })` → `{ liked: true }`。
   - 唯一约束冲突（Prisma `P2002`）→ 取消赞：`like.delete(...)` + `{ decrement: 1 }` → `{ liked: false }`。
2. 原子 `increment/decrement` 防丢更新；复合主键去重；无行锁。
3. P2002 的 catch 是**有意**的（约束 → 取消赞分支），代码注释说明，非裸吞异常（铁律 9）。

### 4.3 校验与错误

- DTO 用 class-validator：`CreatePostDto`、`UpdatePostDto`。约束：title 1–200 字；contentMd 非空；`tags` ≤5、每个 ≤30 字；summary ≤150 字。
- 新增 `ErrorCode`（进 `packages/shared`）：`POST_NOT_FOUND`、`FORBIDDEN`、`SLUG_TAKEN`。
- 所有异常走 `AppError`，禁裸 catch 空块。

### 4.4 Slug 生成

`slugify(title)` + 唯一性检查；冲突追加 `-{4位 nanoid}`。
非 ASCII 标题（中文）若 slugify 后为空，回退为 nanoid slug，保证 URL 合法。不引入拼音/转写依赖。

## 5. 共享类型（`packages/shared`）

新增（禁 `any`，前后端唯一来源，铁律 1）：
- `PostStatus`（与 Prisma enum 对应的字面量联合）
- `PostAuthor`（`{ id, nickname, avatarUrl }`）
- `PostSummary`（列表项：id, slug, title, summary, tags, likeCount, publishedAt, author: PostAuthor）
- `PostDetail`（详情：PostSummary 全字段 + contentMd + status + createdAt/updatedAt + viewerLiked?: boolean）
- `LikeResult`（`{ liked, likeCount }`）
- `Paginated<T>`（`{ items, total, page, pageSize }`）
- 上述新 `ErrorCode` 常量项

## 6. Web（Next 16 App Router）

> ⚠️ 实施前置：`apps/web/AGENTS.md` 警告此版 Next（16.2.9）与训练数据有出入；
> 写任何 web 代码前必须读 `node_modules/next/dist/docs/` 对应指南，App Router / Server Component API 以文档为准。

### 6.1 基础设施（一次性，替换脚手架）
- `layout.tsx`：用 `next/font/google` 接入四款字体（Playfair Display / Lora / Inter / JetBrains Mono）为 CSS 变量；`<body>` 背景 `#FDFAF5`、正文 Lora。**移除所有 dark-mode class**（SKILL.md = 仅浅色）。删除脚手架 `page.tsx` 内容。
- `lib/api.ts`：类型化 fetch 封装——`credentials: 'include'`、base URL 取 `NEXT_PUBLIC_API_URL`、返回共享类型、遇 `{code,message,traceId}` 抛出。API 调用的唯一出口。
- `AuthContext`（client）：挂载时调 `GET /me`；暴露 `{ user, refresh, logout }`。`logout` → `POST /auth/logout` 后清状态。

### 6.2 路由

| 路由 | 类型 | 说明 |
|------|------|------|
| `/` | Server Component | 文章**列表**——SSR `GET /posts`（已发布）。卡片按 SKILL.md：Playfair 标题、Lora 斜体分类标注（`系统编程 · 8 min read`）、右上角插图取自 `@/components/illustrations` |
| `/posts/[slug]` | Server Component | **详情**——SSR `GET /posts/:slug`；Markdown→HTML + **Shiki** 高亮；`✦ Naturalis Historia ✦` 分隔线；客户端 `<LikeButton>` island |
| `/editor/new`、`/editor/[id]` | Client Component | **Tiptap** 编辑器（StarterKit + markdown 序列化）；*Save Draft* / *Publish* 按钮；无会话则跳 `/login` |
| `/login` | Client Component | 邮箱密码表单（`POST /auth/login`）+「Continue with GitHub」链接（→ `/auth/github`）；成功后 `AuthContext.refresh()` 再跳转。无注册页 |

### 6.3 组件 / island
- `<LikeButton postId initialLiked initialCount>`——client；调 `POST /posts/:id/like`；乐观翻转，用响应对账；未登录 → 跳 `/login`。
- `<PostCard>`、`<MarkdownRenderer>`（server，Shiki）、`<MarkdownEditor>`（Tiptap 包装）。

### 6.4 新增 web 依赖（确切版本在计划阶段读 Next 16 文档后锁定）
- `@tiptap/react` + `@tiptap/starter-kit` + markdown 扩展（如 `tiptap-markdown`）
- `shiki`
- SSR markdown 解析器（`remark` / `markdown-it`），仅当 Tiptap 序列化器双向往返保真度不足时引入

### 6.5 设计决策
- 列表落在 `/`（即博客首页，替换脚手架）。
- Shiki 在 SSR 渲染期执行（server component），换取最佳 LCP。
- 编辑器 markdown 双向优先用 Tiptap 序列化器；保真不足才加独立 SSR 解析器——**计划阶段做一次 spike 验证**。

## 7. 错误处理（铁律 9）

所有失败经 `AppError` → 全局过滤器 → `{code, message, traceId}`。
新增码 `POST_NOT_FOUND` / `FORBIDDEN` / `SLUG_TAKEN`。无裸 catch；like 切换的 P2002 catch 为有意的取消赞分支，注释说明。
Web `lib/api.ts` 透出 `code`，UI 据此分支（如未登录点赞 → `/login`）。

## 8. 测试（铁律 6，每个 P0 带测试）

- **单测**
  - `PostsService`：slug 生成 + 冲突后缀、中文标题 nanoid 回退、所有权校验、发布盖 `publishedAt`、草稿对 public 不可见。
  - `LikesService`：切换幂等（赞→取消→赞）、计数不为负、重复去重。
- **e2e**（复用 M1 harness）：完整生命周期——作者登录 → 建草稿 → 发布 → public 列表出现（草稿隐藏）→ 按 slug 取详情 → 第二用户赞/取消（计数对账）→ 非作者 PATCH/DELETE → 403 → 未登录点赞 → 401。
- **Web**：暂无前端测试栈；本切片 web 验证限于 `lint` + `typecheck`（与现有 `pnpm verify` 一致），不在本切片搭前端测试栈。

## 9. 可观测性

复用 pino 结构化日志，无新增基础设施（铁律 7）。

## 10. 实施顺序（reviewable 增量）

本切片体量大但内聚。计划将**后端优先**排序，每步 `pnpm verify` 全绿：
1. shared 类型 + 新 ErrorCode
2. Prisma schema + 迁移
3. PostsService（+ 单测）
4. LikesService（+ 单测）
5. PostsController + DTO + BlogModule
6. e2e
7. 前端基础设施（字体/布局/lib/api/AuthContext）
8. 列表 `/` + 详情 `/posts/[slug]` + Shiki
9. 登录页 + 编辑器 + LikeButton + 门控

完成后走 `finishing-a-development-branch`（合并/PR）。

## 11. 铁律对照检查

- 铁律 1（无 `any`、共享类型唯一来源）：第 5 节集中放 `packages/shared`。
- 铁律 3（DB 只走 migration）：第 3 节。
- 铁律 4（输入校验、参数化）：第 4.3 节 class-validator；Prisma 参数化。
- 铁律 6（P0 带测试）：第 8 节。
- 铁律 7（不引新基建）：仅 Postgres/Redis，无新组件。
- 铁律 9（统一错误结构）：第 7 节。
- 铁律 10（AI 内容标注）：summary 本切片手填，AI 生成留后并将标注。
