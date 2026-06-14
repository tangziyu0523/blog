# M5a 排序与浏览量 设计

日期：2026-06-15
状态：已确认，待实现

## 背景

给个人博客加浏览量统计与「最新/最热」排序。范围：

1. 浏览量统计：文章访问时计数，显示在卡片和详情页。
2. 首页文章列表顶部加「最新 / 最热」切换。
3. 热度 = 浏览量 + 点赞数 + 评论数加权 + 时间衰减，避免老文章霸榜。

**不做**：在线人数、推荐、同风格用户推荐。

### 现状（M2/M4 基础，无需重建）

- `Post` 已用反范式计数列 `likeCount`、`commentCount`（`Int`，在事务里增减；见 `likes.service.ts`、`comments.service.ts`）。**尚无 `viewCount`**——新增一列完全沿用此模式。
- Redis 已接入并使用（字符串操作 `get/set/incr/expire/del`，用于登录限流、OAuth state、refresh token），**无任何 ZSET 使用**。应用为**单实例**（SSE 为进程内扇出）。
- `PostsService.list` 过滤 `status:'PUBLISHED'`、按 `publishedAt desc` 排序、用 Prisma `findMany`。搜索（`search` 模块）已用 `$queryRaw` 做排序，原始 SQL 是既有模式。
- `PostSummary` 含 `likeCount`，无 `viewCount`。
- **详情页 `apps/web/src/app/posts/[slug]/page.tsx` 是服务端组件**（`fetchPostBySlug` 在 Next 服务器上执行）。
- 后端测试为 **mock Prisma 的单元测试**（`jest`），无实时测试库；spec 文件均 mock prisma。

## 已确认决策

1. **浏览防刷去重**：Redis 去重键，匿名按 IP+UA 哈希，窗口 12h，Redis 故障 fail-open。
2. **热度公式**：HN 式重力衰减，`赞10 / 评4 / 览1`，`gravity 1.5`，age 以天为单位。
3. **「最热」排序存储**：Postgres 查询时实时计算（`$queryRaw`），不引入 Redis ZSET / 定时任务（避免新基建，遵循 CLAUDE.md 铁律 7 与 YAGNI）。
4. **浏览计数触发点**：必须由浏览器端触发（详情页是服务端组件，若在 `GET /posts/:slug` 内计数，拿到的是 Web 服务器的 IP/UA，IP+UA 去重会把所有匿名读者塌缩成一个 IP）。
5. **首页切换实现**：文章列表抽成客户端组件，原地刷新，不重跑 hero 动画。

## 设计

### 1. 数据模型

- `Post` 新增 `viewCount Int @default(0)`，走 Prisma migration（migration 文件进 git，禁止手改库）。
- 无需新索引：热度实时算、已发布文章量级小（几十到几百），`@@index([status, publishedAt])` 已覆盖 `WHERE status` 过滤；`ORDER BY` 计算列在该规模下 seq scan + sort 毫秒级。
- `packages/shared/src/post.ts` 的 `PostSummary` 新增 `viewCount: number`（`PostDetail` 继承）。前后端共用此类型，`post.mapper.ts` 的 `toSummary` 补 `viewCount: p.viewCount`。

### 2. 浏览计数（客户端触发）

**端点**：`POST /posts/:id/view`，挂 `OptionalJwtGuard`（拿可选 `userId`），返回 `204`。

**前端**：详情页加极小客户端组件 `ViewPing`（`apps/web/src/components/ViewPing.tsx`），`useEffect` 挂载时 fire-and-forget 调一次 `POST /posts/:id/view`。服务端 Redis NX 去重，故 React strict 模式下双调无害；失败静默忽略（计数非关键路径）。在详情页 `posts/[slug]/page.tsx` 渲染 `<ViewPing postId={post.id} />`。

**服务**：`ViewCountService.record(postId, viewerKey)`（新文件 `apps/api/src/blog/view-count.service.ts`，纳入 `BlogModule`）：

- `viewerKey`：登录用 `userId`；匿名用 `sha256(ip + '|' + ua)`（Node `crypto`）。IP 取 `X-Forwarded-For` 首跳，需在 `apps/api/src/main.ts` 开启 `trust proxy`（`app.getHttpAdapter().getInstance().set('trust proxy', true)`，Express 适配器）。`viewerKey` 推导抽成纯函数便于单测。
- 去重 + 计数：
  ```ts
  const ok = await this.redis.set(`view:${postId}:${viewerKey}`, '1', 'EX', 43200, 'NX');
  if (ok !== 'OK') return; // 窗口内已计过
  await this.prisma.post.updateMany({
    where: { id: postId, status: 'PUBLISHED' },
    data: { viewCount: { increment: 1 } },
  }); // updateMany 不抛错；草稿/不存在 → count 0，不计
  ```
- **Redis 异常 try/catch 跳过计数（fail-open）**，绝不阻塞或抛错给请求。
- 窗口常量 `VIEW_DEDUP_TTL_SECONDS = 43200`（12h）。

### 3. 热度排序（Postgres 实时计算）

- 公式常量集中定义在一处（如 `apps/api/src/blog/hotness.ts`）：`W_LIKE=10`、`W_COMMENT=4`、`W_VIEW=1`、`GRAVITY=1.5`。
- 公式：
  ```
  ageDays = EXTRACT(EPOCH FROM (now() - "publishedAt")) / 86400
  score   = (10*"likeCount" + 4*"commentCount" + 1*"viewCount") / power(ageDays + 2, 1.5)
  ```
- `PostsService.list` 按 `sort` 分支：
  - `latest`（默认）：现有 Prisma `findMany`（`where status PUBLISHED`，`orderBy publishedAt desc`），**零行为变化**。
  - `hot`：`$queryRaw` 选出 `WHERE status='PUBLISHED'` 的 `id`，`ORDER BY score DESC`，`LIMIT/OFFSET` 分页；再 `prisma.post.findMany({ where:{ id:{ in: ids } }, include:{ author:true } })` 并按 `ids` 顺序在应用层重排（与 search retriever 同套路，避免在 SQL 里手拼 author）。
- `total`：两种排序都等于已发布文章数（`prisma.post.count({ where:{ status:'PUBLISHED' } })`）。
- 公式常量以参数化方式注入 `$queryRaw`（不拼接用户输入；SQL 注入面为零，权重是代码常量）。

### 4. API

- `apps/api/src/blog/dto/list-posts.query.ts` 新增：
  ```ts
  @IsOptional()
  @IsIn(['latest', 'hot'])
  sort?: 'latest' | 'hot';
  ```
- `PostsController.list` 透传 `sort`（缺省 `'latest'`）到 `PostsService.list`。
- `PostsController` 新增 `@Post(':id/view') @HttpCode(204) @UseGuards(OptionalJwtGuard)`，调用 `ViewCountService.record`，从 `@CurrentUser()`（可选）与 `req`（ip/ua）推导 `viewerKey`。

### 5. 前端

- **浏览量展示**：`viewCount` 显示在 `PostCard`、`HeadlinePost`、详情页，沿用现有斜体小字调性（如 `· 123 views`）。
- **首页切换**：
  - 首页（服务端组件）继续服务端拉取 `latest` 首屏数据（保 SSR/SEO），把文章列表区（headline + rest）抽成客户端组件 `<PostList initialItems initialTotal />`（`apps/web/src/components/PostList.tsx`）。
  - `PostList` 顶部「最新 / 最热」两段式切换按钮（报纸调性）。默认 `latest` 用 initial 数据；切到 `hot` 时 `fetch('/posts?sort=hot')` 就地替换列表，缓存两个 tab 的结果避免重复请求。
  - **不触碰 hero / 翻书滚动编排区**，切换不重跑动画。
  - `lib/posts.ts` 加 `fetchPosts(sort, page, pageSize)` helper（公共 `fetch`，无需认证）。

### 6. 测试（适配 mock-Prisma 单测）

- `ViewCountService` 单测（mock redis + prisma）：
  - 新访客 → `set NX` 返回 `OK` → `updateMany` 被调用一次（计数 +1）。
  - 窗口内重复 → `set NX` 返回 `null` → 不调 `updateMany`。
  - 草稿/不存在 → `updateMany` count 0，无副作用（不抛错）。
  - **Redis 抛错 → fail-open**：record 不抛错、不调 `updateMany`。
- `viewerKey` 推导纯函数单测：登录走 `userId`；匿名走 `sha256(ip+'|'+ua)` 且对相同输入稳定、不同输入不同。
- `PostsService.list` 排序分支单测：`sort:'hot'` 走 `$queryRaw` 路径并按返回 id 顺序重排；`sort:'latest'`（及缺省）走 `findMany`。断言 `hot` 生成的 SQL 片段含权重/重力常量（字符串断言，把公式钉死防回归）。
- 公式数值正确性无实时库覆盖：实现时做一次**文档化的种子手验**——构造不同互动量/发布时间的若干文章，确认 `?sort=hot` 返回顺序符合公式预期（记录在 PR/实现说明中）。

## 工程约束

- 数据库改动只走 Prisma migration，migration 文件进 git。
- 公共类型放 `packages/shared`，前后端不各写一份。
- TypeScript strict，禁止 `any`；统一错误结构不变。
- 任务结束前 `pnpm verify`（lint + typecheck + test）必须全绿——Stop hook 守门。
- 不引入新基础设施组件（无 Redis ZSET 之外的新依赖、无定时任务框架）。
- 提交规范 Conventional Commits，一个提交一件事。

## 非目标（YAGNI）

- 在线人数 / 实时在线统计。
- 个性化推荐、协同过滤、同风格用户推荐。
- 浏览明细表 / 独立访客分析（仅维护反范式 `viewCount`）。
- Redis ZSET 热度榜与其重算定时任务。
