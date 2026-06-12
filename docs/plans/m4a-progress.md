# M4a 评论核心 — 进度（Phase A 完成）

> 更新：2026-06-12 ｜ 分支：`feat/m4a-comments`
> 设计：`docs/superpowers/specs/2026-06-12-m4a-comments-core-design.md`
> 计划：`docs/superpowers/plans/2026-06-12-m4a-comments-core.md`

## 状态总览

- **Phase A（后端 Task 1–9）：✅ 完成并验证**
- **Phase B（前端 Task 10–12）：⬜ 未开始**

执行方式：subagent-driven（每个 task 派实现 agent + 评审）。

## 验证门禁（Phase A 结束时）

- `pnpm verify`（lint + typecheck + 单测）：**8/8 任务通过**（40 warnings，0 errors；warning 为既有 e2e `getHttpServer()` any 风格，不阻断）。
- 全量 e2e：`pnpm --filter @blog/api test:e2e` → **9 suites / 35 tests 通过**（comments 8/8）。
- 工作树干净，9 个提交已落在分支上。

## Phase A 提交（`3e97b44..de6b178`）

| SHA | 内容 |
|-----|------|
| `633d9fa` | feat(shared): comment 类型 + `COMMENT_NOT_FOUND` 错误码 |
| `e36af7a` | feat(shared): `renderCommentMarkdown`（转义一切的白名单渲染 + XSS 单测） |
| `1d60a1f` | feat(api): Comment/CommentLike schema + migration + resetDb |
| `8d66112` | feat(api): `CommentsService.create`（两级强制） |
| `1f1a88e` | feat(api): `CommentsService.list` / `listReplies`（游标分页） |
| `2278dd0` | feat(api): 评论编辑 + 软删除墓碑 + 权限矩阵 |
| `7d95a0f` | feat(api): `CommentLikesService` 幂等点赞 |
| `bfffeeb` | feat(api): controller + DTO + module 接线 + create 限流 |
| `de6b178` | test(api): comments e2e（线程/点赞/编辑/删除/限流） |

## 已构建内容

- **shared**：`Comment*` 类型、`renderCommentMarkdown`（escape-everything；针对 `<script>`/`<img onerror>`/`javascript:` 链接有单测）。
- **schema**：`Comment`（`parentId`/`quotedId` 两级）、`CommentLike`、`Post.commentCount` + 一次 migration。
- **API（`comments` 模块）**：create（回复回复→重挂顶层 + 引用目标）、list/listReplies（游标分页、内嵌前 3 条回复、批量 `viewerLiked`）、edit、软删除墓碑、评论点赞幂等切换——全部事务化，镜像既有 `LikesService` 计数模式。Controller 用 JWT/optional-JWT guard，create 上 `@Throttle(10/min)`。
- **测试**：14 单测（create / 编辑删除权限矩阵 / 点赞幂等）+ 8 e2e。

## Phase A 期间发现并修复的关键问题（恢复工作前必读）

1. **search_vector 漂移（P0 风险）**：Task 3 的 `prisma migrate dev` 把 M3 的 FTS 生成列 `search_vector` 当作漂移 DROP 掉了（因为它没在 `schema.prisma` 声明）。已正确修复：
   - 在 `schema.prisma` 的 `Post` 上声明 `searchVector Unsupported("tsvector")? @map("search_vector")` + 两个 GIN 索引（`@@index(... type: Gin ...)`），Prisma 不再视其为漂移。
   - migration 文件重写为干净的"仅评论表"意图（不再 DROP/重建 search_vector）。
   - 用 `prisma migrate resolve --applied` 重新基线化 checksum（实现者改了已应用的 migration 文件导致 checksum 失配）。
   - **search 已验证完好（search e2e 7/7）。** 残留唯一漂移：`ALTER COLUMN search_vector DROP DEFAULT` —— 这是 Prisma 对 GENERATED 列的已知限制，是无害的幻影 default，永不应用。
2. **限流测试隔离**：全局 `ThrottlerGuard`（APP_GUARD）无法用 `overrideGuard` 关掉。已在 `test/setup.ts` 加 `createTestApp({ disableThrottle })`，通过 override `ThrottlerStorage` 返回零命中来关限流；429 断言放在独立的限流 app 实例里跑。
3. **门禁修复**：移除多余的类型断言/未用 import；修了一个 supertest agent 类型（`request.SuperAgentTest` → `ReturnType<typeof request.agent>`），它在 e2e 运行时能过但严格 `tsc` 报错。

> 设计决策记录：XSS 渲染评审者建议加 `on*=` 属性剥离器被**正确否决**——转义即边界，黑名单剥离会破坏正常文本（如评论里写 `onload=`）。

## Phase B 待办（Task 10–12，前端 `apps/web`）

- **Task 10**：`apps/web/src/lib/comments.ts`（API 客户端：list/listReplies/create/edit/delete/like）。
- **Task 11**：组件 `CommentBody` / `CommentComposer` / `CommentThread` / `CommentSection` + 挂到 `app/posts/[slug]/page.tsx`。
  - ⚠️ `apps/web` **无测试 runner**，本任务以 typecheck + lint + 手动浏览器验证收口。
  - ⚠️ 写前端前先读 `apps/web/AGENTS.md`：本仓库 Next.js 16 有破坏性变更，需要时查 `node_modules/next/dist/docs/`。
  - 视觉遵循 Naturalist Journal（`.claude/skills/nextjs/SKILL.md`）。
- **Task 12**：`pnpm --filter @blog/shared build` + `pnpm verify` + 全量 e2e 收口。

恢复后：继续 subagent-driven 执行 Task 10–12，完成后走 `superpowers:finishing-a-development-branch`（合并/PR）。
