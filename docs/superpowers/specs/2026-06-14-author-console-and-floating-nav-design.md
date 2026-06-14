# 作者控制台 + 悬浮导航 设计

日期：2026-06-14
状态：已确认，待实现

## 背景

诉求：作为个人博客的站主，登录后能发布文章、编辑修改自己发的文章。

排查现有代码后确认：**核心发布/编辑能力已经写好且带测试**，本次不是从零开始，而是补齐前端入口与管理界面，并新增一个「滚动后仍可达」的悬浮导航。

### 已存在（无需改动）

后端 `apps/api`（含 `.spec` 测试）：

- 认证：注册 / 登录 / JWT / refresh / GitHub OAuth + Guards
- 文章：
  - `POST /posts`（需登录，`CreatePostDto` 已接收 `title/contentMd/tags/summary`）
  - `PATCH /posts/:id`（带归属校验，仅作者本人可改；`UpdatePostDto` 含 `status`）
  - `DELETE /posts/:id`（204，带归属校验）
  - `GET /posts/:slug`（草稿仅作者本人可见）
  - `GET /posts?mine=1`（列出本人文章，按 `updatedAt` 倒序，含草稿）
  - `POST /posts/:id/like`
- 草稿/发布状态机：`DRAFT` / `PUBLISHED`，首次发布记 `publishedAt` 并发通知；状态切换不重置 `publishedAt`
- `PostSummary` 已含 `status` 字段（`packages/shared/src/post.ts`）
- 前端 `api()` 客户端走 `credentials: "include"`，认证 cookie 自动携带；204 返回 `void`

前端 `apps/web`：

- `/login`、`/register`、`/settings`
- `/editor/new`、`/editor/[slug]`（均有 `useRequireAuth` 守卫）
- `MarkdownEditor`（Tiptap）：「存草稿」+「发布」流程已通

### 缺口（本次要做）

1. 编辑器不发 `tags` / `summary`（后端接收，前端没传）。
2. 无删除入口（后端 `DELETE` 有，前端从未调用）。
3. 无「我的文章 / 草稿」管理页（`?mine=1` 没有任何页面用它）。
4. 顶栏不吸顶 —— 它在 `SmoothScroll` 内容流顶部，往下滚后整条栏（搜索 / 通知 / 用户菜单 / 登录）随 Masthead 一起滚走，所有入口消失。

## 范围

纯 `apps/web` 改动，**后端零改动**。四块，按序推进：

1. 编辑器补 `tags` + `summary`
2. 删除文章入口
3. 「我的文章」管理页
4. 悬浮小球导航（竖向图标堆叠）

## 设计

### 1. 编辑器：标签 + 摘要

`apps/web/src/components/MarkdownEditor.tsx` 现仅发 `title + contentMd`。新增：

- **摘要**：标题下方单行输入，`maxLength 150`，对应 `summary`；为空则不放进 body。
- **标签**：chip 输入，最多 5 个、每个 ≤30 字，对应 `tags`；为空则不放进 body。

创建时把 `tags/summary` 直接放进 `POST /posts` 的 body（`CreatePostDto` 已接收），不必等发布那步 PATCH。样式沿用现有 `border` / `var(--border)` 调性。

校验与后端 DTO 对齐（标签条数/长度、摘要长度），前端先挡一道，后端仍是权威校验。

### 2. 删除文章

- 在 `apps/web/src/lib/posts.ts` 新增 `deletePost(id: string): Promise<void>`，走 `api<void>("/posts/:id", { method: "DELETE" })`（cookie 自动带，204→void）。
- 删除入口出现在**管理页每一行** + **编辑页**。
- **行内二次确认**：点「删除」就地变为「确定 / 取消」，不用浏览器原生 `confirm`，贴合极简风。确认后调用 `deletePost`，成功则从列表移除（管理页）或跳回 `/me/posts`（编辑页）。

### 3. 「我的文章」管理页 `/me/posts`

- 新建路由 `apps/web/src/app/me/posts/page.tsx`，Client 组件 + `useRequireAuth` 守卫。
- 数据：`api<Paginated<PostSummary>>("/posts?mine=1&page=&pageSize=")`，后端按 `updatedAt` 倒序、含草稿。
- 每行展示：
  - 标题
  - 状态标注：`草稿` / `已发布`，用 Lora 斜体小字、不上色（遵循 `nextjs` 设计规范的分类标注约定）
  - 日期、点赞数
  - 操作：**编辑**（→ `/editor/[slug]`）、**查看**（仅已发布，→ `/posts/[slug]`）、**删除**（行内二次确认）
- 分页：首屏一页 + 「加载更多」，当 `total` 超出已加载条数时显示。
- 空状态文案；白卡 / 发丝线分隔，符合 Naturalist 规范。

### 4. 悬浮小球导航（竖向图标堆叠）

新组件 `apps/web/src/components/FloatingNav.tsx`。

**挂载位置**：layout 里作为 `SmoothScroll` 的**兄弟**、仍在 `AuthProvider` 内 —— 绕开 ScrollSmoother 对 `#smooth-content` 做 transform 导致内部 `position: fixed` 失效的坑：

```tsx
<AuthProvider>
  <SmoothScroll>…header + children…</SmoothScroll>
  <FloatingNav />   {/* 固定视口右下角 */}
</AuthProvider>
```

**小球**：右下角约 52px 圆形，白底 + `var(--border)` 发丝边 + 轻阴影；内置一枚 1px 线条 SVG 图标（与发丝线/单色系统统一，不用 emoji 也不复用博物学插图——小尺寸更清晰）；打开时图标变 `×`。

**出现时机**：顶栏滚出视口后才显形。用 `IntersectionObserver` 观察 `header`（IO 对 transform 后的渲染位置仍准确，home 的 ScrollSmoother 路线与内页原生滚动都可靠）。需要给 layout 的 `<header>` 加可定位标识（`id` 或 ref 经 DOM 查询）。

**展开交互**：

- 点小球，在其上方竖直弹出一列圆形图标按钮，自下而上轻微 stagger；`prefers-reduced-motion` 下瞬显、无动画。
- 鼠标**悬停时在图标左侧显示文字标签**。
- 点击外部 / 按 Esc 收起（复用 `UserMenu` 的 outside-click 思路）。
- 无障碍：小球按钮 `aria-expanded` + `aria-label`；每项为可键盘聚焦的 link/button 且带 `aria-label`。

**菜单项**（镜像顶栏 + 新入口）：

- 已登录：`搜索` · `通知`（带未读红点；用轻量 `useUnreadCount` hook 拉取未读数显示红点，点击滚回页面顶部让顶栏铃铛接管展开——不重构 `NotificationBell`）· `写文章`(→`/editor/new`) · `我的文章`(→`/me/posts`) · `设置`(→`/settings`) · `退出登录`（仅悬停出标签，误触风险低）
- 未登录：`搜索` · `登录`(→`/login`)

## 工程约束

- 纯 `apps/web`，后端不改、Prisma 不动。
- 任务结束前 `pnpm verify`（lint + typecheck + test）必须全绿——Stop hook 守门，不绕过。
- `apps/web` 目前无测试运行器（仅 `lint` + `typecheck` 脚本，整个 web 零单测）。**本次不引入新测试基建**，跟随 web 现有约定：门禁 = `pnpm verify` 全绿（对 web 实为 lint + typecheck）+ 手动跑一遍验证。纯逻辑（可见性判断、删除确认状态、tags/summary 入 body 的组装、菜单项列表）抽成独立纯函数/hook，靠 strict typecheck 兜底。
- TypeScript strict，禁止 `any`；公共类型继续用 `@blog/shared`。
- 提交规范 Conventional Commits，一个提交一件事，按 1→4 顺序推进。

## 默认决策（已与站主确认）

- 管理页路由：`/me/posts`
- 小球菜单保留「退出登录」（悬停才出标签）
- 图标用自绘 1px 线条 SVG，不复用博物学插图
- 不引入前端测试运行器，门禁为 typecheck + lint + 手动验证
- 小球「通知」项只显未读红点、点击滚回顶部，不重构 `NotificationBell`

## 非目标（YAGNI）

- 不做富文本之外的内容类型（图片库、附件管理等）。
- 不做多作者 / 角色权限（个人博客单作者）。
- 不做定时发布、版本历史、回收站。
- 不实现 `docs/future/ink-interaction-spec.md` 的水墨交互层。
