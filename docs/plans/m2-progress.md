# M2 blog-core — 执行进度

> 更新：2026-06-11｜分支：`feat/m2-design-system`（M2 全部工作都在此分支，非 main）
> 计划：[../superpowers/plans/2026-06-11-m2-blog-core.md](../superpowers/plans/2026-06-11-m2-blog-core.md)
> 设计：[../superpowers/specs/2026-06-11-m2-blog-core-design.md](../superpowers/specs/2026-06-11-m2-blog-core-design.md)
> Next16 侦察：[../superpowers/notes/next16-recon.md](../superpowers/notes/next16-recon.md)
>
> 状态：**全部 15 个 Task 完成（15/15）。最终门全绿：`pnpm verify` 8/8、e2e 20/20（7 套件）。剩：收尾分支（合并/PR，待用户定夺）。**
> 执行方式：subagent-driven-development —— 每个 Task 派 implementer 子代理，再过 spec-review + code-quality-review 两道审查。
>
> ⚠️ **唯一未自动验证项**：Tiptap markdown **往返保真**（编辑器里写 → 存 → 重新打开是否一致）。e2e 是直接打 API 建文章，没走 Tiptap UI；spike 已确认 `tiptap-markdown@0.9` peer 是 `@tiptap/core ^3.0.1`（即 v3 版），build/typecheck 通过。建议 `pnpm dev` 后手动写一篇验证一次。

## 已完成

### Phase A — 后端（Task 1–7，全绿）
- **Task 1** shared 类型 + 错误码（`POST_NOT_FOUND`/`FORBIDDEN`/`SLUG_TAKEN`、`PostSummary`/`PostDetail`/`LikeResult`/`Paginated`）— `9291efd`
- **Task 2** Prisma `Post`/`Like`/`PostStatus` + 迁移 `20260611015809_add_blog_core` + `resetDb` 改 like→post→user — `6480176`
- **Task 3** slug 工具 + `PostsService.create`；slug 重试循环加上界（`SLUG_TAKEN`）— `60f715b` + `b1e80bc`
- **Task 4** `PostsService` list/getBySlug/update/remove；抽 `viewerLiked` 私有方法、注释发布语义、补作者看自己草稿测试 — `fc011ba` + `e6151fb`
- **Task 5** `LikesService.toggle` —— ⚠️ 关键修正：原先 catch P2002 在事务内续写会触发「事务已中止」，已改为 `createMany({skipDuplicates}) + deleteMany`（不抛异常、并发安全）— `00778b7` + `cd5b98d`
- **Task 6** DTO + `PostsController` + `OptionalJwtGuard` + `BlogModule`；like 路由的存在性检查已移进事务内（消除 TOCTOU）、tag DTO 补 `@MinLength(1,{each})` — `d1e2045` + `d3172ad`
- **Task 7** e2e（5 例：草稿/发布/列表/详情、点赞切换、所有权 403、匿名 401、缺失 404）+ `jest-e2e.json` 加 `maxWorkers:1`（共享库串行）— `e7b9dd1` + 格式化 `7e04497`

**后端门：`pnpm verify` 8/8（0 error）；e2e 全套 20/20，两次跑确定性通过。**

### Phase B — 前端（Task 8–14，每步 build/typecheck/lint 全绿）
- **Task 8** web 依赖（`@tiptap/* ^3.26`、`tiptap-markdown ^0.9`、`shiki ^4.2`）+ `NEXT_PUBLIC_API_URL=http://localhost:3001` — `0fa875d`；Next16 侦察文档 — `03d6a61`
- **Task 9** 设计系统地基：`layout.tsx`（4 字体 via next/font/google、`lang=zh`）+ `globals.css`（米白 light-only 调色板，**无暗色模式**）— `520ad80`
- **Task 10** `lib/api.ts`（带 `credentials:include`、`ApiClientError`、FormData/非 JSON/204 加固）+ `lib/auth-context.tsx`（`AuthProvider`/`useAuth`，挂载查 `GET /me`）+ layout 接入 AuthProvider — `314c943` + `69c98b8`
- **Task 11** 列表页：`lib/posts.ts`（`fetchPublishedPosts`/`fetchPostBySlug`）+ `PostCard` + `app/page.tsx`（SSR，`/` dynamic）。**运行时冒烟通过**：起 prod server，`GET localhost:3000/` → 200，渲染空态 — `6294056`
- **Task 12+13** 详情页 + 点赞岛：`MarkdownRenderer`（Shiki，**fence 感知 tokenizer**，代码块内空行不再被切碎）+ `app/posts/[slug]/page.tsx`（`params` 是 Promise，已 await；`notFound()`）+ `LikeButton`（乐观切换，**回滚到点击前状态**，401→`/login`）— `17ec0d2`/`4755722` + 修正 `a3672ba`/`37d6b36`
- **Task 14** 登录页 `app/login/page.tsx`（邮箱密码 → `/auth/login` → `refresh()` → `/`；GitHub 用纯 `<a href>` 到 `${API}/auth/github`）；加防重复提交 guard + 可访问 `<label>` — `b6b84d8` + `e1bd7b7`

## ✅ Task 15 完成（Tiptap 编辑器 + 最终门）

- spike 结论：用 **Tiptap**（`tiptap-markdown@0.9` 是 v3 版，peer `@tiptap/core ^3.0.1`），非 textarea fallback。
- 文件：`lib/use-require-auth.ts`、`components/MarkdownEditor.tsx`（Tiptap + Markdown，存草稿/发布）、`app/editor/new/page.tsx`、`app/editor/[slug]/page.tsx`（按 **slug** 取数、按 **id** PATCH）。— `b7c4968`
- 审查修正：编辑页 fetch 失败不再白屏（404→回首页，其他→提示）；新建+发布若 PATCH 失败，落到草稿编辑器可恢复（不留隐形孤儿）；提交前校验标题/正文非空。— `8911389`
- 最终门：`pnpm verify` 8/8；`DATABASE_URL=…/blog_test … test:e2e` → 20/20。

### 收尾（待用户定夺）
走 `superpowers:finishing-a-development-branch`：把 `feat/m2-design-system` 合并到 `main` 或开 PR。合并/PR 是对外/不可逆动作，等用户确认再做。

---

## （历史）Task 15 原始恢复指令

见 plan 的 Task 15。要做的文件：
- `apps/web/src/lib/use-require-auth.ts` —— client 钩子，`!loading && !user` → `router.replace('/login')`
- `apps/web/src/components/MarkdownEditor.tsx` —— Tiptap（StarterKit + Markdown）+ Save Draft / Publish 两按钮
- `apps/web/src/app/editor/new/page.tsx`、`apps/web/src/app/editor/[slug]/page.tsx`

### 恢复执行的精确指令
1. **先做 Tiptap markdown round-trip spike**（plan Task 15 Step 1）：
   `tiptap-markdown@0.9` 是给 Tiptap **v2** 写的，本仓库是 **v3.26**。先验证 `editor.storage.markdown.getMarkdown()` 设入再读出是否保真。
   - **若保真** → 用 Tiptap（StarterKit + `tiptap-markdown` 的 `Markdown` 扩展，`immediatelyRender:false`）。
   - **若不保真/不兼容** → 退回**纯 `<textarea>` markdown 字段**（plan 已批准的 fallback），保持 `MarkdownEditor` 的 props 接口不变（`{postId?, initialTitle?, initialMarkdown?}`）。
2. **编辑路由用 slug，不用 id**（已与用户确认）：
   - 路由是 `app/editor/[slug]/page.tsx`，client 组件，`use(params)` 解 Promise 取 slug，`useRequireAuth()` 门控，`api<PostDetail>('/posts/'+slug)` 取（作者可读自己草稿，因 `getBySlug` 放行 owner 的 DRAFT）。
   - 取到的 `PostDetail` 含 `id`，传 `postId={post.id}` 给编辑器 —— **PATCH 用 id**（`PATCH /posts/:id`），**取数用 slug**（`GET /posts/:slug`），二者刻意不同。
   - 保存/发布后导航：草稿 → `/editor/${post.slug}`；发布 → `/posts/${post.slug}`。
   - ⚠️ plan 原稿 Task 15 写的是 `editor/[id]` 且用 `GET /posts/:slug` 取 —— 那是 bug，按上面的 slug 方案落地。
3. **每步 build + typecheck + lint**（前端用 `pnpm --filter @blog/web build|typecheck|lint`，build 是关键门，会跑 Next16 类型校验）。
4. **最终门**（plan 末尾）：
   - 根目录 `pnpm verify` 必须 8/8 全绿。
   - 全套 e2e：`DATABASE_URL=postgresql://blog:blog@localhost:5432/blog_test pnpm --filter @blog/api test:e2e`（应 20/20）。
   - 然后走 `superpowers:finishing-a-development-branch`（合并/PR）。
5. **建议跑一次端到端真机验证**：编辑器存在后即可产出已发布文章，再看列表页出卡片、详情页 Shiki 高亮、点赞切换。

## 关键环境事实（勿忘）
- **API 端口 3001**（`env.validation.ts` 的 `PORT` 默认 3001）；web dev 在 3000。`apps/web/.env.example` 已指向 3001。
- 容器（postgres/redis/minio）需起着；e2e 用独立库 `blog_test`，`jest-e2e.json` 已设 `maxWorkers:1`（共享库必须串行，否则 resetDb 撞 FK）。
- **`node_modules/next/dist/docs/` 不存在**（AGENTS.md 的指引过期）；Next16 真实 API 看安装的 `.d.ts` 与生成的 `apps/web/.next/types/`，要点已在 next16-recon.md：**dynamic `params` 是 Promise（要 await / client 用 `use()`）**、`typedRoutes:false`、字体经典 API、`notFound/redirect/useRouter` 来自 `next/navigation`。
- **web build 在无外网时报 Google Fonts 拉取失败警告**，非致命（fallback 字体）；真正生产构建需联网或自托管字体。
- 任务追踪：TaskCreate 任务 #1–#15，#1–#14 completed，#15 pending。
- 审查纪律：M1 历史里子代理漏跑 lint 攒了 40 个错；每个后端 Task 必跑 `pnpm --filter @blog/api lint`。
